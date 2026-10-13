import { TAU, rng, rgba, mixHex, clamp, hexToRgb } from '../lib/anim.js';

// mixHex devolve 'rgb(...)'; aqui precisamos de hex para passar a rgba()
const mixToHex = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

// Raios por deslocamento de ponto médio (gerados no setup, com galhos e sub-galhos). Cada raio tem um
// horário fixo: o "líder" desce em ~0,12 s (revelado pela altura normalizada de cada ponto), depois vem o
// clarão de retorno com 2 re-descargas que decaem. Brilho barato: 3 traços (largo/médio/núcleo) com
// alpha baixo em 'lighter' — nada de shadowBlur. Nuvens pré-renderizadas em ¼ de resolução no setup,
// com uma cópia "acesa" por raio (luz concentrada perto do ponto de onde ele sai).
// Raios caem entre 0,3 s e duração − 0,9 s: t = 0 e t = duração são céu calmo → loop perfeito.

const LEADER = 0.12;
const GLOW = [[28, 0.022], [15, 0.04], [8, 0.07], [3.5, 0.14]];

function displace(rand, ax, ay, bx, by, disp, levels) {
  let pts = [[ax, ay], [bx, by]];
  let d = disp;
  for (let l = 0; l < levels; l++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const o = (rand() * 2 - 1) * d;
      next.push([(x0 + x1) / 2 - (dy / len) * o, (y0 + y1) / 2 + (dx / len) * o], pts[i]);
    }
    pts = next;
    d *= 0.52;
  }
  return pts;
}

function cloudCanvas(blobs, w, h, color, light) {
  const k = 0.25;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d');
  g.scale(k, k);
  for (const b of blobs) {
    const a = light ? b.a * light(b.x, b.y) : b.a;
    if (a < 0.01) continue;
    const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    gr.addColorStop(0, rgba(color, a));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }
  return c;
}

export default {
  id: 'lightning',
  title: 'Lightning',
  description: 'Tempestade noturna: raios ramificados descem do céu com clarão na tela e nuvens iluminadas.',
  category: 'particulas',
  tags: ['partículas', 'loop', 'overlay', 'alpha'],
  duration: 6,
  poster: 1.0,

  params: {
    color: { type: 'color', label: 'Raio', default: '#f1f3ff' },
    glow: { type: 'color', label: 'Brilho', default: '#8e9dff' },
    bg: { type: 'color', label: 'Céu', default: '#0a0c16' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
    strikes: { type: 'range', label: 'Raios por loop', min: 1, max: 7, step: 1, default: 3 },
    branches: { type: 'range', label: 'Galhos', min: 0, max: 1, step: 0.01, default: 0.6 },
    flash: { type: 'range', label: 'Clarão', min: 0, max: 1, step: 0.01, default: 0.55 },
    thickness: { type: 'range', label: 'Espessura', min: 0.4, max: 2.5, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p, duration }) {
    const rand = rng(p.seed);
    const S = Math.min(w, h);
    const R = (a, b) => a + (b - a) * rand();

    // relevo do horizonte (soma de senos com fases da seed)
    const hills = Array.from({ length: 4 }, (_, i) => ({ f: (i + 1) * R(1.5, 2.5), a: S * 0.028 / (i + 1), ph: R(0, TAU) }));
    const groundY = (x) => h * 0.9 + hills.reduce((s, q) => s + Math.sin((x / w) * q.f * TAU * 0.5 + q.ph) * q.a, 0);

    // horários: espalhados, com jitter, entre 0,3 s e D − 0,9 s
    const n = p.strikes;
    const span = duration - 1.2;
    const strikes = [];
    let lastX = 0.5;
    for (let i = 0; i < n; i++) {
      const t0 = 0.3 + ((i + R(0.1, 0.9)) / n) * span;
      let fx = R(0.2, 0.8);
      if (Math.abs(fx - lastX) < 0.2) fx = fx > 0.5 ? fx - 0.3 : fx + 0.3;
      lastX = fx;
      const ax = fx * w, ay = -S * 0.05;
      const bx = clamp(ax + R(-0.22, 0.22) * S, w * 0.05, w * 0.95);
      const by = groundY(bx) + S * 0.03;
      const main = displace(rand, ax, ay, bx, by, Math.hypot(bx - ax, by - ay) * 0.16, 8);
      const top = ay, bottom = by;
      const sOf = (y) => clamp((y - top) / (bottom - top));
      const paths = [main.map(([x, y]) => [x, y, sOf(y)])];
      const levels = [0];
      // galhos: saem de pontos do canal principal e descem inclinados
      const nb = Math.round(p.branches * 9);
      const grow = (src, lvl, count) => {
        for (let b = 0; b < count; b++) {
          const k = Math.floor(R(0.08, 0.7) * (src.length - 2)) + 1;
          const [x0, y0] = src[k];
          const [x1, y1] = src[k + 1];
          const base = Math.atan2(y1 - y0, x1 - x0);
          const ang = base + (rand() < 0.5 ? -1 : 1) * R(0.35, 0.9);
          const remain = bottom - y0;
          const len = remain * R(0.18, 0.45) * (lvl === 1 ? 1 : 0.55);
          const ex = x0 + Math.cos(ang) * len, ey = y0 + Math.abs(Math.sin(ang)) * len;
          const pts = displace(rand, x0, y0, ex, ey, len * 0.22, lvl === 1 ? 6 : 5);
          paths.push(pts.map(([x, y]) => [x, y, sOf(y)]));
          levels.push(lvl);
          if (lvl === 1 && rand() < 0.6) grow(pts, 2, 1 + Math.floor(rand() * 2));
        }
      };
      grow(main, 1, nb);
      // caminhos completos em Path2D por nível (usados depois que o líder chega ao chão)
      const full = [new Path2D(), new Path2D(), new Path2D()];
      paths.forEach((pts, j) => {
        const P = full[levels[j]];
        P.moveTo(pts[0][0], pts[0][1]);
        for (let q = 1; q < pts.length; q++) P.lineTo(pts[q][0], pts[q][1]);
      });
      strikes.push({
        t0,
        x: ax,
        bx,
        paths,
        levels,
        full,
        power: R(0.75, 1),
        re: [R(0.09, 0.16), R(0.26, 0.4)], // re-descargas
      });
    }

    // nuvens: blobs no terço de cima
    const blobs = [];
    const nBlobs = 70;
    for (let i = 0; i < nBlobs; i++) {
      const y = R(-0.08, 0.42) * h * (h > w ? 0.75 : 1);
      blobs.push({ x: R(-0.1, 1.1) * w, y, r: S * R(0.12, 0.32), a: R(0.3, 0.65) * (1 - y / (h * 0.6)) });
    }
    const clouds = cloudCanvas(blobs, w, h, mixToHex(p.bg, p.glow, 0.14));
    for (const s of strikes) {
      s.lit = cloudCanvas(blobs, w, h, mixToHex(p.glow, p.bg, 0.35), (x, y) => {
        const d = Math.hypot(x - s.x, (y - S * 0.05) * 1.6) / (S * 0.8);
        return Math.exp(-d * d * 2.2);
      });
    }

    // silhueta do chão
    const ridge = new Path2D();
    for (let i = 0; i <= 64; i++) ridge[i ? 'lineTo' : 'moveTo']((i / 64) * w, groundY((i / 64) * w));
    const ground = new Path2D(ridge);
    ground.lineTo(w, h);
    ground.lineTo(0, h);
    ground.closePath();

    return { strikes, clouds, ground, ridge };
  },

  render(ctx, t, { w, h, p, state }) {
    const S = Math.min(w, h);

    // envelope de cada raio
    let flash = 0;
    const active = [];
    for (const s of state.strikes) {
      const a = t - s.t0;
      if (a < 0 || a > 1.4) continue;
      let reveal = 1, b;
      if (a < LEADER) {
        reveal = a / LEADER;
        b = 0.3 + 0.2 * reveal;
      } else {
        const e = a - LEADER;
        b = Math.exp(-e * 10);
        for (let r = 0; r < s.re.length; r++) {
          const er = e - s.re[r];
          if (er >= 0) b = Math.max(b, (0.85 - r * 0.2) * Math.exp(-er * 9));
        }
        b += 0.1 * Math.exp(-e * 4); // brasa residual do canal
        b *= s.power;
        flash = Math.max(flash, b);
      }
      if (b > 0.01) active.push({ s, a, reveal, b });
    }

    if (!p.transparent) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, mixHex(p.bg, '#000000', 0.3));
      g.addColorStop(1, mixHex(p.bg, p.glow, 0.1));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(state.clouds, 0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const { s, a, b } of active) {
        if (a < LEADER) continue;
        ctx.globalAlpha = Math.min(1, b);
        ctx.drawImage(s.lit, 0, 0, w, h);
      }
      ctx.restore();
    }
    if (flash > 0.01 && p.flash > 0) {
      ctx.fillStyle = mixHex(p.glow, p.color, 0.6);
      ctx.globalAlpha = Math.min(1, 0.2 * p.flash * flash);
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // raios
    const lw = S * 0.0032 * p.thickness;
    const LW = [1, 0.5, 0.3];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const { s, a, reveal, b } of active) {
      let paths = s.full;
      if (reveal < 1) {
        // líder descendo: só os pontos já alcançados
        paths = [new Path2D(), new Path2D(), new Path2D()];
        s.paths.forEach((pts, j) => {
          if (pts[0][2] > reveal) return;
          const P = paths[s.levels[j]];
          P.moveTo(pts[0][0], pts[0][1]);
          for (let q = 1; q < pts.length && pts[q][2] <= reveal; q++) P.lineTo(pts[q][0], pts[q][1]);
        });
      }
      const e = Math.max(0, a - LEADER);
      for (let L = 0; L < 3; L++) {
        const bl = L === 0 ? b : b * Math.exp(-e * (L === 1 ? 3 : 5));
        if (bl < 0.01) continue;
        const width = lw * LW[L];
        // halo em camadas: cada traço mais estreito soma por cima do anterior → queda suave
        for (const [k, al] of GLOW) {
          ctx.strokeStyle = rgba(p.glow, Math.min(1, al * bl));
          ctx.lineWidth = width * k;
          ctx.stroke(paths[L]);
        }
        ctx.strokeStyle = rgba(p.color, Math.min(1, bl));
        ctx.lineWidth = width * 1.2;
        ctx.stroke(paths[L]);
      }
      // clarão no ponto de impacto
      if (reveal >= 1 && b > 0.05) {
        const gy = s.paths[0][s.paths[0].length - 1][1] - S * 0.03;
        const R = S * 0.18;
        const gr = ctx.createRadialGradient(s.bx, gy, 0, s.bx, gy, R);
        gr.addColorStop(0, rgba(p.glow, 0.35 * b));
        gr.addColorStop(1, rgba(p.glow, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(s.bx - R, gy - R, R * 2, R * 2);
      }
    }
    ctx.restore();

    if (!p.transparent) {
      ctx.fillStyle = mixHex(p.bg, '#000000', 0.55);
      ctx.fill(state.ground);
      // borda do relevo acesa pelo clarão
      if (flash > 0.02) {
        ctx.strokeStyle = rgba(p.glow, 0.25 * flash);
        ctx.lineWidth = S * 0.002;
        ctx.stroke(state.ridge);
      }
    }
  },
};
