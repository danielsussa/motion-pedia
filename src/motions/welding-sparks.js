import { TAU, rgba, mixHex, clamp, ease } from '../lib/anim.js';

// Solda: um arco que pisca joga faíscas em leque. Cada faísca é um índice k do emissor (RATE/s) e tudo
// sai em fórmula fechada: lançamento balístico sem arrasto, impacto no chão resolvido pela equação do
// 2º grau e até 3 quiques com restituição (cada quique reinicia a parábola). O índice é tomado mod
// (RATE·duração), então o loop fecha. A cor esfria com a idade (branco → amarelo → laranja → brasa) e
// as faíscas são desenhadas em lotes por faixa de idade, como riscos de motion blur.
// A luz do arco pisca em degraus de 1/24 s (hash do degrau) e acende um halo e uma poça no chão.

const hash = (a, b) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

function softSprite(color, k = 4.5) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (let i = 0; i <= 10; i++) {
    const x = i / 10;
    rg.addColorStop(x, rgba(color, Math.exp(-x * x * k) * (1 - x)));
  }
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return c;
}

function coreSprite(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.1, 'rgba(255,255,255,0.95)');
  rg.addColorStop(0.22, rgba(color, 0.55));
  rg.addColorStop(0.5, rgba(color, 0.12));
  rg.addColorStop(1, rgba(color, 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return c;
}

const RATE = 400; // faíscas por segundo (máximo)
const MAXLIFE = 2.2;
const LV = 6;
const AGES = [0.07, 0.18, 0.36, 0.65, 1.05]; // faixas de idade (s) → cor
const FPS_FLICK = 24;

// solda em rajadas: liga/desliga ao longo do loop (frações da duração)
const BURSTS = [
  [0.0, 0.3],
  [0.36, 0.62],
  [0.68, 0.94],
];
function arcOn(u) {
  // u = fração do loop; volta 0..1 com rampas curtas (sobe rápido, cai um pouco mais devagar)
  u = ((u % 1) + 1) % 1;
  let v = 0;
  for (const [a, b] of BURSTS) {
    const up = clamp((u - a) / 0.012);
    const down = 1 - clamp((u - b) / 0.02);
    v = Math.max(v, Math.min(up, down));
  }
  return v;
}

export default {
  id: 'welding-sparks',
  title: 'Welding Sparks',
  description: 'A fan of welding sparks that fall, bounce and skid across the floor as they cool, under the flickering arc light.',
  category: 'particulas',
  tags: ['particles', 'simulation', 'loop', 'alpha', 'overlay'],
  duration: 10,
  poster: 1.6,

  params: {
    spark: { type: 'color', label: 'Sparks', default: '#ffb347' },
    arc: { type: 'color', label: 'Arc light', default: '#a9d8ff' },
    bg: { type: 'color', label: 'Background', default: '#0b0c0f' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    amount: { type: 'range', label: 'Count', min: 0.1, max: 1, step: 0.01, default: 0.7 },
    spread: { type: 'range', label: 'Fan spread', min: 0.2, max: 1, step: 0.01, default: 0.6 },
    angle: { type: 'range', label: 'Direction (degrees)', min: -180, max: 0, step: 1, default: -15 },
    bounce: { type: 'range', label: 'Bounce', min: 0, max: 0.8, step: 0.01, default: 0.42 },
    flicker: { type: 'range', label: 'Light flicker', min: 0, max: 1, step: 0.01, default: 0.7 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, px, p }) {
    const m = Math.min(w, h);
    const S = {
      halo: softSprite(p.arc, 4),
      warm: softSprite(p.spark, 5),
      core: coreSprite(p.arc),
      bg: null,
    };
    if (!p.transparent) {
      // chão: piso escuro com leve gradiente (pintado uma vez)
      const c = document.createElement('canvas');
      const k = Math.min(1, px || 1);
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      const g = c.getContext('2d');
      g.scale(k, k);
      g.fillStyle = p.bg;
      g.fillRect(0, 0, w, h);
      const fy = h * 0.5 + m * 0.25;
      const lg = g.createLinearGradient(0, fy, 0, h);
      lg.addColorStop(0, rgba('#ffffff', 0.05));
      lg.addColorStop(1, rgba('#ffffff', 0.0));
      g.fillStyle = lg;
      g.fillRect(0, fy, w, h - fy);
      g.fillStyle = rgba('#ffffff', 0.08);
      g.fillRect(0, fy, w, Math.max(1, m * 0.0015));
      S.bg = c;
    }
    return S;
  },

  render(ctx, t, { w, h, p, duration, state: S }) {
    const m = Math.min(w, h);
    if (!p.transparent) ctx.drawImage(S.bg, 0, 0, w, h);
    const floorY = h * 0.5 + m * 0.25;
    const ox = w * 0.5 - Math.cos((p.angle * Math.PI) / 180) * m * 0.22;
    const oy = floorY - m * 0.24;
    const g = m * 3.2; // gravidade (px/s²)
    const NT = Math.round(RATE * duration); // emissões por loop
    const seed = p.seed * 977;

    // luz do arco (piscando em degraus)
    const step = Math.floor(t * FPS_FLICK);
    const stepN = Math.round(duration * FPS_FLICK);
    const sIdx = ((step % stepN) + stepN) % stepN;
    const on = arcOn(t / duration);
    const fl = 1 - p.flicker * 0.55 * hash(sIdx, seed + 1) - p.flicker * 0.25 * (hash(sIdx, seed + 2) < 0.12 ? 1 : 0);
    const light = on * fl;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // —— luz ambiente na parede (fica atrás da bancada)
    if (light > 0.003) {
      const G = m * 1.0 * (0.85 + 0.15 * fl);
      ctx.globalAlpha = 0.28 * light;
      ctx.drawImage(S.halo, ox - G, oy - G, G * 2, G * 2);
      ctx.globalAlpha = 1;
    }
    // —— bancada: tampo de aço até o arco, frente escura descendo até o chão
    if (!p.transparent) {
      ctx.globalCompositeOperation = 'source-over';
      const bx = ox + m * 0.035, by = oy + m * 0.008;
      const fg = ctx.createLinearGradient(0, by, 0, floorY);
      fg.addColorStop(0, '#1c1e23');
      fg.addColorStop(1, '#101114');
      ctx.fillStyle = fg;
      ctx.fillRect(0, by, bx, floorY - by + 1);
      // luz do arco lambendo a frente (mesma cor, só alpha)
      const lg = ctx.createRadialGradient(ox, oy, 0, ox, oy, m * 0.55);
      lg.addColorStop(0, rgba(p.arc, 0.12 * light));
      lg.addColorStop(0.5, rgba(p.arc, 0.03 * light));
      lg.addColorStop(1, rgba(p.arc, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(Math.max(0, bx - m * 0.6), by, Math.min(bx, m * 0.6), floorY - by);
      // aresta do tampo e quina
      ctx.fillStyle = rgba(p.arc, 0.12 + 0.45 * light);
      ctx.fillRect(0, by, bx, Math.max(1, m * 0.002));
      ctx.fillStyle = rgba(p.arc, 0.05 + 0.15 * light);
      ctx.fillRect(bx - Math.max(1, m * 0.0015), by, Math.max(1, m * 0.0015), floorY - by);
      // cordão de solda incandescente (esfria para a esquerda)
      const cg = ctx.createLinearGradient(ox - m * 0.16, 0, ox, 0);
      cg.addColorStop(0, rgba(p.spark, 0));
      cg.addColorStop(0.75, rgba(p.spark, 0.55));
      cg.addColorStop(1, rgba('#fff3d6', 0.95));
      ctx.fillStyle = cg;
      ctx.fillRect(ox - m * 0.16, by - m * 0.006, m * 0.16, m * 0.006);
      ctx.globalCompositeOperation = 'lighter';
    }

    // —— poça de luz no chão (só abaixo da linha do chão)
    if (light > 0.003) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, floorY, w, h - floorY);
      ctx.clip();
      ctx.translate(ox + m * 0.1, floorY + m * 0.02);
      ctx.scale(1, 0.16);
      const F = m * 0.9;
      ctx.globalAlpha = 0.4 * light;
      ctx.drawImage(S.halo, -F, -F, F * 2, F * 2);
      ctx.restore();
    }

    // —— faíscas
    const k1 = Math.floor(t * RATE);
    const k0 = Math.ceil((t - MAXLIFE) * RATE);
    const paths = Array.from({ length: LV }, () => new Path2D());
    const embers = new Path2D();
    const baseA = (p.angle * Math.PI) / 180;
    const e = p.bounce;
    const pos = (x0, y0, vx, vy, a, floorY) => {
      // parábola com quiques no chão (até 3), devolve [x, y]
      let x = x0, y = y0, ux = vx, uy = vy, rem = a;
      for (let b = 0; b < 4; b++) {
        // tempo até o chão: y + uy·s + g s²/2 = floorY
        const A = 0.5 * g, B = uy, C = y - floorY;
        const disc = B * B - 4 * A * C;
        const s = disc > 0 ? (-B + Math.sqrt(disc)) / (2 * A) : Infinity;
        if (rem <= s || b === 3) {
          if (b === 3) {
            // escorrega
            const sl = Math.min(rem, 0.6);
            return [x + ux * (sl - (sl * sl) / 1.2), Math.min(floorY, y + uy * rem + 0.5 * g * rem * rem)];
          }
          return [x + ux * rem, y + uy * rem + 0.5 * g * rem * rem];
        }
        x += ux * s;
        y = floorY;
        const vyImp = uy + g * s;
        uy = -vyImp * e;
        ux *= 0.72;
        rem -= s;
        if (Math.abs(uy) < m * 0.05) {
          // morreu o quique: escorrega com atrito
          const sl = Math.min(rem, 0.5);
          return [x + ux * (sl - sl * sl), floorY];
        }
      }
      return [x, y];
    };

    for (let k = Math.max(k0, Math.ceil(-MAXLIFE * RATE)); k <= k1; k++) {
      const kk = ((k % NT) + NT) % NT;
      const te = k / RATE;
      const H = (n) => hash(kk + seed, n);
      if (H(1) > p.amount) continue;
      const ue = te / duration;
      if (H(2) > arcOn(ue)) continue;
      const a = t - te;
      const fine = H(6) < 0.55; // respingo curto e fino perto do arco
      const life = fine ? 0.12 + 0.3 * H(3) : MAXLIFE * (0.35 + 0.65 * H(3) ** 0.7);
      if (a > life || a < 0) continue;
      const spr = (H(4) - 0.5) * 2;
      const ang = baseA + spr * Math.abs(spr) * p.spread * 1.4;
      const spd = m * (fine ? 0.25 + 0.5 * H(5) : 0.55 + 1.15 * H(5) ** 1.5);
      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd;
      const fy = floorY + m * 0.09 * H(8) ** 1.5; // profundidade no chão
      const q = a / life;
      let lv = 0;
      while (lv < LV - 1 && a > AGES[lv]) lv++;
      if (q > 0.8) lv = Math.max(lv, LV - 1);
      const dt = 0.03;
      const [x1, y1] = pos(ox, oy, vx, vy, a, fy);
      const [xm, ym] = pos(ox, oy, vx, vy, Math.max(0, a - dt * 0.5), fy);
      const [x0, y0] = pos(ox, oy, vx, vy, Math.max(0, a - dt), fy);
      paths[lv].moveTo(x0, y0);
      paths[lv].lineTo(xm, ym);
      paths[lv].lineTo(x1, y1);
      // fim da vida no chão: brasa que fica um tempinho
      if (y1 >= fy - 1 && q > 0.55) {
        const r = Math.max(0.6, m * 0.0022 * (1 - q));
        embers.moveTo(x1 + r, y1);
        embers.arc(x1, y1, r, 0, TAU);
      }
    }

    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const hot = '#fffaf0';
    const lw = Math.max(0.6, m * 0.002);
    for (let lv = 0; lv < LV; lv++) {
      const q = lv / (LV - 1);
      const col = lv === 0 ? hot : lv === 1 ? mixHex(hot, p.spark, 0.35) : lv < 4 ? mixHex(p.spark, '#ff7a1a', (lv - 2) / 2) : mixHex(p.spark, '#a8240c', 0.4 + 0.6 * (lv - 4));
      // brilho largo + núcleo
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.18 * (1 - q * 0.7);
      ctx.lineWidth = lw * 3.4;
      ctx.stroke(paths[lv]);
      ctx.globalAlpha = 1 - q * 0.55;
      ctx.lineWidth = lw * (1.2 - q * 0.5);
      ctx.stroke(paths[lv]);
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = mixHex(p.spark, '#c0300e', 0.5);
    ctx.fill(embers);

    // —— núcleo do arco
    if (light > 0.003) {
      const C = m * 0.07 * (0.8 + 0.35 * fl);
      ctx.globalAlpha = Math.min(1, light * 1.1);
      ctx.drawImage(S.core, ox - C, oy - C, C * 2, C * 2);
      const W2 = m * 0.025 * fl;
      ctx.drawImage(S.core, ox - W2, oy - W2, W2 * 2, W2 * 2);
      // brasa quente sob o arco
      ctx.globalAlpha = 0.5 * light;
      const Wm = m * 0.06;
      ctx.drawImage(S.warm, ox - Wm, oy - Wm * 0.6, Wm * 2, Wm * 1.2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};
