import { TAU, rng, rgba, clamp, ease } from '../lib/anim.js';

// Bolhas de sabão: cada bolha vive K vezes por loop (vida = duração/K) com sorteio por (bolha, vida),
// então a idade é (t + fase) mod vida e o loop fecha sozinho. A película é um sprite pré-renderizado
// (gradiente cônico iridescente × perfil radial de alpha: centro quase invisível, borda forte) que gira
// devagar; os reflexos ficam num sprite separado, sem girar (a luz vem sempre do mesmo lado).
// O estouro: anel que se abre, fiapos da película e gotículas caindo.

const hash = (a, b) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const SPR = 256;
const POP = 0.42; // duração do estouro (s)

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function filmSprite(c1, c2, c3, rot) {
  const c = canvas(SPR, SPR);
  const g = c.getContext('2d');
  const r = SPR / 2;
  const cg = g.createConicGradient(rot, r, r);
  const stops = [c1, c3, c2, c1, c2, c3, c1];
  stops.forEach((col, i) => cg.addColorStop(i / (stops.length - 1), col));
  g.fillStyle = cg;
  g.fillRect(0, 0, SPR, SPR);
  // película escorre: parte de baixo mais grossa → tom mais quente
  g.globalCompositeOperation = 'source-atop';
  const lg = g.createLinearGradient(0, 0, 0, SPR);
  lg.addColorStop(0, rgba(c2, 0.25));
  lg.addColorStop(0.55, rgba(c2, 0));
  lg.addColorStop(1, rgba(c3, 0.35));
  g.fillStyle = lg;
  g.fillRect(0, 0, SPR, SPR);
  // perfil de alpha: só a borda aparece de verdade
  g.globalCompositeOperation = 'destination-in';
  const rg = g.createRadialGradient(r, r, 0, r, r, r);
  rg.addColorStop(0, 'rgba(0,0,0,0.07)');
  rg.addColorStop(0.55, 'rgba(0,0,0,0.12)');
  rg.addColorStop(0.82, 'rgba(0,0,0,0.32)');
  rg.addColorStop(0.94, 'rgba(0,0,0,0.75)');
  rg.addColorStop(0.975, 'rgba(0,0,0,0.95)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, SPR, SPR);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(r, r, r * 0.965, 0, TAU);
  g.stroke();
  return c;
}

function glintSprite() {
  const c = canvas(SPR, SPR);
  const g = c.getContext('2d');
  const r = SPR / 2;
  g.translate(r, r);
  // reflexo principal (janela) no alto à esquerda
  g.save();
  g.translate(-r * 0.4, -r * 0.42);
  g.rotate(-Math.PI / 4);
  g.scale(1, 0.48);
  let rg = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
  rg.addColorStop(0, 'rgba(255,255,255,0.95)');
  rg.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0, 0, r * 0.3, 0, TAU);
  g.fill();
  g.restore();
  // pontinho
  rg = g.createRadialGradient(-r * 0.12, -r * 0.62, 0, -r * 0.12, -r * 0.62, r * 0.07);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(-r, -r, SPR, SPR);
  // reflexo secundário embaixo à direita (crescente)
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineCap = 'round';
  g.lineWidth = r * 0.05;
  g.beginPath();
  g.arc(0, 0, r * 0.84, 0.25, 1.15);
  g.stroke();
  g.lineWidth = r * 0.025;
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(0, 0, r * 0.84, 0.45, 0.95);
  g.stroke();
  return c;
}

function paintBg(w, h, px, p) {
  const c = canvas(w * px, h * px);
  const g = c.getContext('2d');
  g.scale(px, px);
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, p.bg2);
  lg.addColorStop(1, p.bg);
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
  const rg = g.createRadialGradient(w * 0.3, h * 0.12, 0, w * 0.3, h * 0.12, Math.hypot(w, h) * 0.6);
  rg.addColorStop(0, rgba(p.c2, 0.1));
  rg.addColorStop(1, rgba(p.c2, 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
  return c;
}

export default {
  id: 'bubbles',
  title: 'Bubbles',
  description: 'Bolhas de sabão iridescentes subindo e balançando, até estourar em fiapos e gotículas.',
  category: 'particulas',
  tags: ['partículas', 'loop', 'alpha', 'overlay'],
  duration: 12,
  poster: 4,

  params: {
    c1: { type: 'color', label: 'Iridescência 1', default: '#ff86d6' },
    c2: { type: 'color', label: 'Iridescência 2', default: '#72e4ff' },
    c3: { type: 'color', label: 'Iridescência 3', default: '#ffe7a0' },
    bg: { type: 'color', label: 'Fundo', default: '#0a1220' },
    bg2: { type: 'color', label: 'Fundo (alto)', default: '#1a2b45' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
    count: { type: 'range', label: 'Quantidade', min: 4, max: 50, step: 1, default: 18 },
    size: { type: 'range', label: 'Tamanho', min: 0.4, max: 2, step: 0.01, default: 1 },
    pops: { type: 'range', label: 'Estouros', min: 0, max: 1, step: 0.01, default: 0.75 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  setup({ w, h, px, p }) {
    const rand = rng(p.seed);
    const films = [0, 1.3, 2.6, 4].map((a) => filmSprite(p.c1, p.c2, p.c3, a));
    const glint = glintSprite();
    const bubbles = Array.from({ length: p.count }, (_, i) => {
      const z = rand();
      return {
        i,
        z,
        size: 0.03 + Math.pow(z, 1.6) * 0.085,
        phase: rand(),
        film: Math.floor(rand() * films.length),
        spin: (rand() < 0.5 ? -1 : 1) * (0.15 + rand() * 0.35),
      };
    });
    bubbles.sort((a, b) => a.z - b.z);
    return { films, glint, bubbles, bg: p.transparent ? null : paintBg(w, h, Math.min(1, px || 1), p) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const m = Math.min(w, h);
    if (!p.transparent) ctx.drawImage(state.bg, 0, 0, w, h);
    const K = 2; // vidas por loop
    const P = duration / K;
    const drops = new Path2D();
    const shreds = new Path2D();

    for (const b of state.bubbles) {
      const tt = t / P + b.phase;
      const life = ((Math.floor(tt) % K) + K) % K;
      const a = (tt - Math.floor(tt)) * P; // idade nesta vida
      const H = (k) => hash(b.i * 7 + 13, life * 31 + k);
      const r = b.size * m * p.size * (0.85 + 0.3 * H(1));
      const x0 = (0.06 + 0.88 * H(2)) * w;
      const popAge = P * (0.55 + 0.3 * H(3));
      const pops = H(4) < p.pops;
      const yPop = pops ? h * (0.08 + 0.62 * H(5)) : -r * 2.5;
      const y0 = h + r * 1.3;
      const v = (y0 - yPop) / popAge;
      const fl = H(6) * TAU;
      const swayA = r * 0.5 + m * 0.02;
      const sx = (ag) => x0 + Math.sin((ag / P) * TAU * 1.5 + fl) * swayA + (ag / P - 0.3) * m * 0.06 * (H(7) - 0.5);
      // sobe desacelerando um pouco (empuxo vs arrasto)
      const sy = (ag) => y0 - v * popAge * (0.75 * (ag / popAge) + 0.25 * ease.outCubic(clamp(ag / popAge)));

      if (a < popAge) {
        const x = sx(a), y = sy(a);
        if (y < -r * 1.2) continue;
        const wob = Math.sin(a * 5.3 + fl) * 0.035 + Math.sin(a * 8.1 + fl * 2) * 0.015;
        const grow = ease.outCubic(clamp(a / 0.6)); // nasce soprada
        const R = r * (0.6 + 0.4 * grow);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1 + wob, 1 - wob);
        ctx.globalAlpha = 0.7 + 0.3 * b.z;
        ctx.save();
        ctx.rotate(b.spin * a + fl);
        ctx.drawImage(state.films[b.film], -R, -R, R * 2, R * 2);
        ctx.restore();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(state.glint, -R, -R, R * 2, R * 2);
        ctx.restore();
      } else if (pops && a < popAge + POP) {
        const e = a - popAge;
        const k = e / POP;
        const x = sx(popAge), y = sy(popAge);
        // a película some num piscar (um pouco inflada)
        if (e < 0.07) {
          const q = e / 0.07;
          const R = r * (1 + 0.12 * q);
          ctx.globalAlpha = 0.8 * (1 - q) * (1 - q);
          ctx.drawImage(state.films[b.film], x - R, y - R, R * 2, R * 2);
          ctx.globalAlpha = 1;
        }
        // anel que se abre
        if (e < 0.09) {
          const q = e / 0.09;
          ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - q)})`;
          ctx.lineWidth = Math.max(0.5, r * 0.04 * (1 - q));
          ctx.beginPath();
          ctx.arc(x, y, r * (1 + 0.25 * ease.outCubic(q)), 0, TAU);
          ctx.stroke();
        }
        // fiapos da película
        if (e < 0.22) {
          const q = e / 0.22;
          const rr = r * (1 + 0.6 * ease.outCubic(q));
          for (let j = 0; j < 6; j++) {
            const a0 = H(10 + j) * TAU;
            const span = 0.35 * (1 - q) + 0.05;
            shreds.moveTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr + q * q * r * 0.4);
            shreds.arc(x, y + q * q * r * 0.4, rr, a0, a0 + span);
          }
        }
        // gotículas
        const n = k < 0.9 ? 9 : 0;
        for (let j = 0; j < n; j++) {
          const ang = ((j + H(20 + j) * 0.8) / n) * TAU;
          const sp = r * (0.5 + 1.1 * H(30 + j));
          const d = ease.outCubic(k);
          const gx = x + Math.cos(ang) * (r * 0.9 + sp * d);
          const gy = y + Math.sin(ang) * (r * 0.9 + sp * d) + e * e * m * 0.9;
          const gr = Math.max(0.6, r * (0.025 + 0.02 * H(40 + j)) * (1 - k));
          drops.moveTo(gx + gr, gy);
          drops.arc(gx, gy, gr, 0, TAU);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(p.c2, 0.45);
    ctx.lineWidth = Math.max(0.6, m * 0.0018);
    ctx.lineCap = 'round';
    ctx.stroke(shreds);
    ctx.fillStyle = 'rgba(235,245,255,0.6)';
    ctx.fill(drops);
  },
};
