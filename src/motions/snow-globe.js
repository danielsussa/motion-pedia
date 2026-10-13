import { TAU, clamp, ease, lerp, rng, rgba, mixHex, seg, smoothstep } from '../lib/anim.js';
import { asset } from '../lib/assets.js';

// Globo de neve: alguém sacode, a neve sobe num redemoinho e cai devagar, assentando no chão, no
// telhado e nos pinheiros da miniatura. Cada floco tem um ponto de repouso numa superfície da cena e
// uma hora de pouso; a trajetória é função de t (sobe no tranco, gira no vórtice que desenrola até o
// pouso, cai a velocidade constante). Começa e termina com a neve assentada nos mesmos pontos → loop.
// Interior (água + miniatura) e vidro/base são pintados no setup; por frame só os flocos e 3 drawImage.

const SHAKE = [0.45, 1.85]; // janela da sacudida (s)
const KICK = 0.6;

// relevo do chão de neve (unidades do raio, y para baixo, origem no centro do globo)
const groundY = (x) => 0.43 - 0.11 * (1 - x * x) + 0.018 * Math.sin(3.1 * x + 0.6);

function treeSpec(x, hgt) {
  const base = groundY(x) + 0.01;
  const tiers = [];
  const n = 3;
  for (let k = 0; k < n; k++) {
    const y1 = base - 0.08 * hgt - k * hgt * 0.27; // base do andar
    const y0 = y1 - hgt * 0.42; // ponta
    const half = hgt * (0.3 - k * 0.065);
    tiers.push({ x, y0, y1, half });
  }
  return { x, base, hgt, tiers };
}

function sceneSpec(kind) {
  if (kind === 'pinheiros') {
    return { cabin: null, trees: [treeSpec(-0.48, 0.42), treeSpec(-0.17, 0.62), treeSpec(0.12, 0.5), treeSpec(0.42, 0.66), treeSpec(0.66, 0.34)] };
  }
  if (kind === 'logo') return { cabin: null, trees: [], logo: true };
  return {
    cabin: { x: -0.1, w: 0.42, hgt: 0.22 },
    trees: [treeSpec(-0.56, 0.4), treeSpec(0.3, 0.6), treeSpec(0.55, 0.38)],
  };
}

// superfícies onde a neve assenta: [ [x0,y0,x1,y1, peso], ... ]
function surfaces(spec) {
  const S = [];
  for (let i = 0; i < 24; i++) {
    const x0 = -0.86 + (1.72 * i) / 24, x1 = -0.86 + (1.72 * (i + 1)) / 24;
    S.push([x0, groundY(x0) - 0.004, x1, groundY(x1) - 0.004, 2.6]);
  }
  if (spec.cabin) {
    const { x, w } = spec.cabin;
    const r = roof(spec.cabin);
    S.push([r.l, r.e - 0.028, x, r.apex - 0.03, 1.6]);
    S.push([x, r.apex - 0.03, r.r, r.e - 0.028, 1.6]);
    S.push([x + w * 0.22, r.apex + 0.03, x + w * 0.36, r.apex + 0.03, 0.15]);
  }
  for (const tr of spec.trees) {
    for (const t of tr.tiers) {
      S.push([t.x - t.half * 0.95, t.y1 - 0.012, t.x - t.half * 0.2, t.y1 - 0.02 - (t.y1 - t.y0) * 0.35, 0.9]);
      S.push([t.x + t.half * 0.2, t.y1 - 0.02 - (t.y1 - t.y0) * 0.35, t.x + t.half * 0.95, t.y1 - 0.012, 0.9]);
    }
  }
  return S;
}

const roof = ({ x, w, hgt }) => {
  const top = groundY(x) - hgt;
  return { l: x - w * 0.62, r: x + w * 0.62, e: top + 0.02, apex: top - 0.2 };
};

export default {
  id: 'snow-globe',
  title: 'Snow Globe',
  description: 'Globo de neve sacudido: a neve sobe num redemoinho e cai devagar, assentando sobre a miniatura.',
  category: 'particulas',
  tags: ['partículas', 'simulação', 'loop', 'alpha'],
  duration: 10,
  poster: 0.24,

  params: {
    scene: { type: 'select', label: 'Miniatura', options: ['cabana', 'pinheiros', 'logo'], default: 'cabana' },
    logo: { type: 'image', label: 'Logo (miniatura = logo)', default: '/samples/logo.svg' },
    bg: { type: 'color', label: 'Fundo', default: '#ebe5da' },
    water: { type: 'color', label: 'Interior', default: '#1f2f48' },
    ink: { type: 'color', label: 'Miniatura / base', default: '#1a2230' },
    accent: { type: 'color', label: 'Destaque (janela)', default: '#ffb65c' },
    count: { type: 'range', label: 'Flocos', min: 80, max: 700, step: 1, default: 340 },
    shake: { type: 'range', label: 'Força da sacudida', min: 0.3, max: 1.6, step: 0.05, default: 1 },
    size: { type: 'range', label: 'Tamanho', min: 0.6, max: 1.3, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, px, p, duration }) {
    const m = Math.min(w, h);
    const R = m * 0.34 * p.size;
    const spec = sceneSpec(p.scene);
    const rand = rng(p.seed * 7 + 1);
    const surf = surfaces(spec);
    const total = surf.reduce((a, s) => a + s[4] * Math.hypot(s[2] - s[0], s[3] - s[1]), 0);
    const pick = () => {
      let r = rand() * total;
      for (const s of surf) {
        r -= s[4] * Math.hypot(s[2] - s[0], s[3] - s[1]);
        if (r <= 0) return s;
      }
      return surf[0];
    };
    const flakes = [];
    const land0 = KICK + 2.2, land1 = duration - 0.9;
    for (let i = 0; i < p.count; i++) {
      const s = pick();
      const k = rand();
      const z = rand() * 2 - 1;
      // pousos mais densos no começo da queda
      const L = lerp(land0, land1, Math.pow(rand(), 1.15));
      flakes.push({
        rx: lerp(s[0], s[2], k),
        ry: lerp(s[1], s[3], k),
        L,
        H: 0.45 + rand() * 0.75, // quanto sobe
        th: (0.9 + rand() * 1.6) * (rand() < 0.75 ? 1 : -1), // vórtice (rad)
        ax: 0.04 + rand() * 0.09,
        om: 0.8 + rand() * 1.6,
        ph: rand() * TAU,
        up: 0.45 + rand() * 0.5,
        r: (0.0045 + 0.0085 * Math.pow(rand(), 2.2)) * (1 + 0.35 * z),
        big: z > 0.35 ? 1 : 0,
        a: 0.55 + 0.45 * (z + 1) / 2,
      });
    }
    const S = Math.min(1, px || 1);
    return {
      R,
      flakes,
      inner: paintInterior(R, S, p, spec),
      glass: paintGlass(R, S, p),
      base: paintBase(R, S, p),
    };
  },

  render(ctx, t, { w, h, p, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const { R } = state;
    const cx = w / 2;
    const cy = h / 2 - R * 0.2;

    // sacudida: vai-e-vem com envelope, levanta um pouco
    const env = smoothstep(SHAKE[0], SHAKE[0] + 0.25, t) * (1 - smoothstep(SHAKE[1] - 0.55, SHAKE[1], t));
    const osc = (tt) => Math.sin(TAU * 2.4 * (tt - SHAKE[0]));
    const gx = R * 0.16 * p.shake * osc(t) * env;
    const gy = -R * 0.07 * p.shake * env * (0.6 + 0.4 * Math.abs(osc(t)));
    const rot = (gx / R) * 0.35;
    // o líquido atrasa em relação ao vidro
    const lag = -R * 0.12 * p.shake * osc(t - 0.12) * env;

    // sombra no chão
    const by = cy + R * 1.2;
    const lift = -gy / R;
    ctx.fillStyle = rgba(p.ink, p.transparent ? 0.22 : 0.16 * (1 - lift * 2));
    ctx.beginPath();
    ctx.ellipse(cx + gx * 0.4, by + R * 0.03, R * 0.92 * (1 - lift), R * 0.07, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(cx + gx, cy + gy);
    ctx.rotate(rot);

    const ins = state.inner;
    ctx.drawImage(ins.c, -ins.half, -ins.half, ins.half * 2, ins.half * 2);

    // flocos
    const small = new Path2D(), big = new Path2D(), faint = new Path2D();
    for (const f of state.flakes) {
      let x = f.rx, y = f.ry;
      if (t > KICK && t < f.L) {
        const tau = t - KICK;
        const rem = (f.L - t) / (f.L - KICK); // 1 → 0
        const k = ease.outCubic(seg(t, KICK, KICK + f.up + 0.3));
        // ar: acima do repouso, caindo a velocidade constante, balançando
        let ax = f.rx + f.ax * Math.sin(f.ph + f.om * tau) * Math.min(1, rem * 3);
        let ay = f.ry - f.H * rem;
        // vórtice em torno do centro, desenrolando até o pouso
        const th = f.th * rem * rem;
        const c = Math.cos(th), s = Math.sin(th);
        const qx = ax * c - (ay - 0.05) * s;
        const qy = ax * s + (ay - 0.05) * c + 0.05;
        ax = lerp(f.rx, qx, k);
        ay = lerp(f.ry, qy, k);
        ax += (lag / R) * k * (1 - rem * 0.3);
        // dentro do vidro e acima do chão
        const d = Math.hypot(ax, ay);
        if (d > 0.9) {
          ax *= 0.9 / d;
          ay *= 0.9 / d;
        }
        ay = Math.min(ay, groundY(ax) - 0.004);
        x = ax;
        y = ay;
      }
      const rr = f.r * R;
      const P = f.a < 0.7 ? faint : f.big ? big : small;
      P.moveTo(x * R + rr, y * R);
      P.arc(x * R, y * R, rr, 0, TAU);
    }
    ctx.fillStyle = rgba('#ffffff', 0.55);
    ctx.fill(faint);
    ctx.fillStyle = rgba('#ffffff', 0.85);
    ctx.fill(small);
    ctx.fillStyle = '#ffffff';
    ctx.fill(big);

    const gl = state.glass;
    ctx.drawImage(gl.c, -gl.half, -gl.half, gl.half * 2, gl.half * 2);
    const bs = state.base;
    ctx.drawImage(bs.c, -bs.halfW, bs.y0, bs.halfW * 2, bs.hh);
    ctx.restore();
  },
};

function makeCanvas(wl, hl, S) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(wl * S));
  c.height = Math.max(1, Math.ceil(hl * S));
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  return { c, ctx };
}

// água + miniatura + chão de neve, recortados no círculo
function paintInterior(R, S, p, spec) {
  const half = R * 1.02;
  const { c, ctx } = makeCanvas(half * 2, half * 2, S);
  ctx.translate(half, half);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();
  const g = ctx.createRadialGradient(-R * 0.25, -R * 0.35, 0, 0, 0, R * 1.05);
  g.addColorStop(0, mixHex(p.water, '#ffffff', 0.14));
  g.addColorStop(1, mixHex(p.water, '#000000', 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  // brilho quente atrás da cabana
  if (spec.cabin) {
    const lg = ctx.createRadialGradient(spec.cabin.x * R, 0.1 * R, 0, spec.cabin.x * R, 0.1 * R, R * 0.8);
    lg.addColorStop(0, rgba(p.accent, 0.12));
    lg.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = lg;
    ctx.fillRect(-R, -R, 2 * R, 2 * R);
  }
  ctx.scale(R, R);
  const snow = '#f6f4ef';
  const shade = mixHex(snow, p.water, 0.18);
  const ink = p.ink;
  const inkL = mixHex(p.ink, p.water, 0.35);

  // pinheiros de trás (os mais altos primeiro)
  const drawTree = (tr, col) => {
    ctx.fillStyle = mixHex(col, '#000000', 0.2);
    ctx.fillRect(tr.x - 0.018, tr.tiers[0].y1 - 0.01, 0.036, tr.base - tr.tiers[0].y1 + 0.02);
    ctx.fillStyle = col;
    for (const t of tr.tiers) {
      ctx.beginPath();
      ctx.moveTo(t.x, t.y0);
      ctx.lineTo(t.x + t.half, t.y1);
      ctx.quadraticCurveTo(t.x, t.y1 + 0.03, t.x - t.half, t.y1);
      ctx.closePath();
      ctx.fill();
    }
    // neve nos galhos
    ctx.fillStyle = snow;
    for (const t of tr.tiers) {
      const hh = t.y1 - t.y0;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y0 - 0.004);
      ctx.lineTo(t.x + t.half * 0.36, t.y0 + hh * 0.36);
      ctx.quadraticCurveTo(t.x + t.half * 0.18, t.y0 + hh * 0.3, t.x, t.y0 + hh * 0.38);
      ctx.quadraticCurveTo(t.x - t.half * 0.18, t.y0 + hh * 0.3, t.x - t.half * 0.36, t.y0 + hh * 0.36);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(t.x - t.half * 0.98, t.y1 - 0.004);
      ctx.quadraticCurveTo(t.x - t.half * 0.5, t.y1 + 0.006, t.x - t.half * 0.35, t.y1 - 0.016);
      ctx.lineTo(t.x - t.half * 0.7, t.y1 - 0.016);
      ctx.closePath();
      ctx.moveTo(t.x + t.half * 0.98, t.y1 - 0.004);
      ctx.quadraticCurveTo(t.x + t.half * 0.5, t.y1 + 0.006, t.x + t.half * 0.35, t.y1 - 0.016);
      ctx.lineTo(t.x + t.half * 0.7, t.y1 - 0.016);
      ctx.closePath();
      ctx.fill();
    }
  };
  const trees = [...spec.trees].sort((a, b) => b.hgt - a.hgt);
  for (const tr of trees) drawTree(tr, tr.hgt > 0.45 ? inkL : mixHex(inkL, p.water, 0.3));

  if (spec.cabin) {
    const cb = spec.cabin;
    const r = roof(cb);
    const top = groundY(cb.x) - cb.hgt;
    // chaminé
    ctx.fillStyle = mixHex(ink, '#000000', 0.15);
    ctx.fillRect(cb.x + cb.w * 0.22, r.apex + 0.03, cb.w * 0.14, 0.14);
    // paredes
    ctx.fillStyle = ink;
    ctx.fillRect(cb.x - cb.w / 2, top, cb.w, cb.hgt + 0.06);
    // janela acesa + porta
    const wx = cb.x - cb.w * 0.3, wy = top + cb.hgt * 0.28;
    const glow = ctx.createRadialGradient(wx + 0.035, wy + 0.035, 0, wx + 0.035, wy + 0.035, 0.16);
    glow.addColorStop(0, rgba(p.accent, 0.45));
    glow.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(wx - 0.15, wy - 0.15, 0.37, 0.37);
    ctx.fillStyle = p.accent;
    ctx.fillRect(wx, wy, 0.075, 0.07);
    ctx.fillStyle = ink;
    ctx.fillRect(wx + 0.0345, wy, 0.006, 0.07);
    ctx.fillRect(wx, wy + 0.032, 0.075, 0.006);
    ctx.fillStyle = mixHex(p.accent, ink, 0.55);
    ctx.fillRect(cb.x + cb.w * 0.05, top + cb.hgt * 0.38, 0.07, cb.hgt * 0.7);
    // telhado
    ctx.fillStyle = mixHex(ink, '#000000', 0.3);
    ctx.beginPath();
    ctx.moveTo(r.l, r.e);
    ctx.lineTo(cb.x, r.apex);
    ctx.lineTo(r.r, r.e);
    ctx.closePath();
    ctx.fill();
    // neve no telhado e na chaminé
    ctx.strokeStyle = snow;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.042;
    ctx.beginPath();
    ctx.moveTo(r.l + 0.01, r.e - 0.012);
    ctx.lineTo(cb.x, r.apex - 0.012);
    ctx.lineTo(r.r - 0.01, r.e - 0.012);
    ctx.stroke();
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(cb.x + cb.w * 0.23, r.apex + 0.03);
    ctx.lineTo(cb.x + cb.w * 0.35, r.apex + 0.03);
    ctx.stroke();
  }

  if (spec.logo) {
    const img = asset(p.logo);
    if (img && img.width) {
      const hh = 0.62;
      const ww = Math.min(1.1, (hh * img.width) / img.height);
      const hr = (ww * img.height) / img.width;
      ctx.drawImage(img, -ww / 2, groundY(0) + 0.03 - hr, ww, hr);
    }
  }

  // chão de neve
  ctx.beginPath();
  ctx.moveTo(-1.1, 1.1);
  for (let i = 0; i <= 40; i++) {
    const x = -1 + (2 * i) / 40;
    ctx.lineTo(x, groundY(x));
  }
  ctx.lineTo(1.1, 1.1);
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, 0.3, 0, 1);
  sg.addColorStop(0, snow);
  sg.addColorStop(1, shade);
  ctx.fillStyle = sg;
  ctx.fill();

  // escurece a borda (espessura da água)
  ctx.setTransform(S, 0, 0, S, half * S, half * S);
  const v = ctx.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
  v.addColorStop(0, rgba(p.water, 0));
  v.addColorStop(1, rgba(hexMix(p.water, '#000000', 0.3), 0.55));
  ctx.fillStyle = v;
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  return { c, half };
}

// reflexos do vidro (por cima dos flocos)
function paintGlass(R, S, p) {
  const half = R * 1.04;
  const { c, ctx } = makeCanvas(half * 2, half * 2, S);
  ctx.translate(half, half);
  ctx.lineCap = 'round';
  // contorno
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.lineWidth = R * 0.012;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.995, 0, TAU);
  ctx.stroke();
  // reflexo grande (janela) em cima à esquerda
  ctx.strokeStyle = rgba('#ffffff', 0.22);
  ctx.lineWidth = R * 0.07;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.86, Math.PI * 1.08, Math.PI * 1.42);
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.5);
  ctx.lineWidth = R * 0.026;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.86, Math.PI * 1.12, Math.PI * 1.3);
  ctx.stroke();
  ctx.fillStyle = rgba('#ffffff', 0.7);
  ctx.beginPath();
  ctx.ellipse(-R * 0.32, -R * 0.75, R * 0.05, R * 0.028, -0.45, 0, TAU);
  ctx.fill();
  // reflexo fraco embaixo à direita
  ctx.strokeStyle = rgba('#ffffff', 0.14);
  ctx.lineWidth = R * 0.03;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.9, Math.PI * 0.05, Math.PI * 0.3);
  ctx.stroke();
  return { c, half };
}

// base de madeira escura com filete
function paintBase(R, S, p) {
  const halfW = R * 0.95;
  const y0 = R * 0.66;
  const hh = R * 0.56;
  const { c, ctx } = makeCanvas(halfW * 2, hh, S);
  ctx.translate(halfW, -y0);
  const top = R * 0.72, bot = R * 1.18;
  const col = p.ink;
  const g = ctx.createLinearGradient(-halfW, 0, halfW, 0);
  g.addColorStop(0, mixHex(col, '#ffffff', 0.12));
  g.addColorStop(0.35, mixHex(col, '#ffffff', 0.04));
  g.addColorStop(1, mixHex(col, '#000000', 0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-R * 0.66, top);
  ctx.lineTo(R * 0.66, top);
  ctx.quadraticCurveTo(R * 0.7, R * 0.95, R * 0.9, bot - R * 0.03);
  ctx.quadraticCurveTo(R * 0.92, bot, R * 0.86, bot);
  ctx.lineTo(-R * 0.86, bot);
  ctx.quadraticCurveTo(-R * 0.92, bot, -R * 0.9, bot - R * 0.03);
  ctx.quadraticCurveTo(-R * 0.7, R * 0.95, -R * 0.66, top);
  ctx.closePath();
  ctx.fill();
  // aro do topo
  ctx.fillStyle = mixHex(col, '#000000', 0.35);
  ctx.beginPath();
  ctx.ellipse(0, top, R * 0.66, R * 0.045, 0, 0, TAU);
  ctx.fill();
  // filete
  ctx.fillStyle = rgba(p.accent, 0.85);
  ctx.fillRect(-R * 0.78, R * 1.04, R * 1.56, R * 0.014);
  return { c, halfW, y0, hh };
}

const hexMix = (a, b, t) => '#' + mixHex(a, b, t).match(/\d+/g).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
