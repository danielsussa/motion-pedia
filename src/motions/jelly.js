import { TAU, clamp, rng, rgba, mixHex } from '../lib/anim.js';
import { bake } from '../lib/bake.js';
import { verlet } from '../lib/physics.js';

// Gelatina caindo, quicando e tremendo até assentar. Corpo mole = anel de pontos Verlet (physics.js)
// com molas de vizinhança + "shape matching": a cada sub-passo acha o melhor encaixe rígido (centro +
// rotação) da forma de repouso e puxa cada ponto para o seu alvo com uma mola amortecida (força em
// px/s²). O squash no impacto e o wobble saem da própria física. Tudo assado no setup (bake, 60 fps,
// 4 sub-passos) e interpolado no render.

const N = 40; // pontos no contorno
const FPS = 60;
const SUB = 4;

// forma de repouso: base quase reta (superelipse) e topo em cúpula. Ângulo 0 = direita, sentido horário na tela.
function restShape(r) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (TAU * i) / N;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const bottom = s > 0;
    const nx = bottom ? 4.5 : 2.4;
    const ny = bottom ? 4.5 : 2.1;
    const x = r * Math.sign(c) * Math.abs(c) ** (2 / nx) * (bottom ? 1 : 0.96);
    const y = (bottom ? r * 0.5 : r * 0.92) * Math.sign(s) * Math.abs(s) ** (2 / ny);
    pts.push([x, y]);
  }
  // centraliza no centroide
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= N; cy /= N;
  return pts.map(([x, y]) => [x - cx, y - cy]);
}

function simulate({ w, h, p, duration }) {
  const m = Math.min(w, h);
  const n = p.count;
  const rand = rng(p.seed * 31 + 7);
  const r = Math.min(m * 0.24 * p.size, (w * 0.86) / n / 2.3);
  const G = floorY(w, h, m);
  const freq = 7 - 3.6 * p.softness; // Hz do wobble
  const K = (TAU * freq) ** 2;
  const C = 2 * 0.16 * TAU * freq;
  const rest = restShape(r);
  // gravidade escolhida pela velocidade de impacto (igual em qualquer formato), não pela distância
  const vImp = m * 2.4 * Math.sqrt(p.drop);
  const g = (vImp * vImp) / (2 * (G + r * 0.3));

  const world = verlet({
    gravity: [0, g],
    damping: 0.9995,
    iterations: 2,
    bounds: { x0: 0, x1: w, y0: -1e9, y1: G, bounce: 0, friction: 0.8 },
  });
  const bodies = [];
  const gap = Math.min(r * 2.5, (w * 0.86) / n);
  for (let j = 0; j < n; j++) {
    const order = n === 1 ? 0 : [1, 0, 2][j] ?? j;
    const cx = w / 2 + (j - (n - 1) / 2) * gap;
    const bottomOff = Math.max(...rest.map((q) => q[1]));
    const cy = -bottomOff - r * 0.3 - order * r * 0.9;
    const tilt = (rand() - 0.5) * 0.5 + (j % 2 ? -0.12 : 0.12);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const vx = n === 1 ? (rand() - 0.5) * m * 0.08 : 0;
    const pts = rest.map(([qx, qy]) => {
      const x = cx + qx * ct - qy * st;
      const y = cy + qx * st + qy * ct;
      const pt = world.point(x, y);
      pt.px = x - vx / (FPS * SUB);
      return pt;
    });
    for (let i = 0; i < N; i++) {
      world.link(pts[i], pts[(i + 1) % N], { stiffness: 0.5 });
      world.link(pts[i], pts[(i + 2) % N], { stiffness: 0.35 });
    }
    bodies.push({ pts, goal: new Float32Array(N * 2), vc: [0, 0], c: [0, 0], push: 0 });
  }
  const bodyOf = new Map();
  bodies.forEach((b, j) => b.pts.forEach((pt, i) => bodyOf.set(pt, [b, i])));
  const dt = 1 / (FPS * SUB);

  const force = (pt) => {
    const [b, i] = bodyOf.get(pt);
    const vx = (pt.x - pt.px) / dt;
    const vy = (pt.y - pt.py) / dt;
    return [K * (b.goal[i * 2] - pt.x) - C * (vx - b.vc[0]) + b.push, K * (b.goal[i * 2 + 1] - pt.y) - C * (vy - b.vc[1])];
  };

  return {
    r,
    G,
    rest,
    baked: bake({
      duration,
      fps: FPS,
      init: () => world,
      step: () => {
        for (let s = 0; s < SUB; s++) {
          for (const b of bodies) {
            let cx = 0, cy = 0, vx = 0, vy = 0;
            for (const pt of b.pts) { cx += pt.x; cy += pt.y; vx += pt.x - pt.px; vy += pt.y - pt.py; }
            cx /= N; cy /= N;
            b.vc[0] = vx / N / dt;
            b.vc[1] = vy / N / dt;
            b.c[0] = cx;
            b.c[1] = cy;
            let sn = 0, cs = 0;
            for (let i = 0; i < N; i++) {
              const dx = b.pts[i].x - cx, dy = b.pts[i].y - cy;
              const [qx, qy] = rest[i];
              sn += qx * dy - qy * dx;
              cs += qx * dx + qy * dy;
            }
            const an = Math.atan2(sn, cs);
            const c = Math.cos(an), sa = Math.sin(an);
            for (let i = 0; i < N; i++) {
              const [qx, qy] = rest[i];
              b.goal[i * 2] = cx + qx * c - qy * sa;
              b.goal[i * 2 + 1] = cy + qx * sa + qy * c;
            }
          }
          // empurrão entre gelatinas vizinhas (sem colisão ponto a ponto)
          for (const b of bodies) b.push = 0;
          for (let j = 0; j < bodies.length; j++) {
            for (let k = j + 1; k < bodies.length; k++) {
              const A = bodies[j], B = bodies[k];
              const dx = B.c[0] - A.c[0];
              const ov = r * 2.2 - Math.abs(dx);
              if (ov > 0 && Math.abs(B.c[1] - A.c[1]) < r * 1.6) {
                const f = K * 0.6 * ov * Math.sign(dx || 1);
                A.push -= f;
                B.push += f;
              }
            }
          }
          world.step(dt, force);
        }
      },
      snapshot: () => {
        const a = new Float32Array(bodies.length * N * 2);
        let k = 0;
        for (const b of bodies) for (const pt of b.pts) { a[k++] = pt.x; a[k++] = pt.y; }
        return a;
      },
    }),
  };
}

const floorY = (w, h, m) => h / 2 + m * 0.2;

// cache de módulo: a simulação só depende de tamanho e parâmetros de física
const cache = new Map();

export default {
  id: 'jelly',
  title: 'Jelly',
  description: 'Gelatina caindo e quicando no chão: achata no impacto, treme com wobble e assenta.',
  category: 'particulas',
  tags: ['simulação', 'forma', 'alpha'],
  duration: 4,
  poster: 0.78,

  params: {
    color: { type: 'color', label: 'Gelatina', default: '#ff3b5c' },
    bg: { type: 'color', label: 'Fundo', default: '#f1ebe1' },
    ink: { type: 'color', label: 'Chão / sombra', default: '#2a2026' },
    count: { type: 'range', label: 'Quantidade', min: 1, max: 3, step: 1, default: 1 },
    softness: { type: 'range', label: 'Moleza', min: 0, max: 1, step: 0.01, default: 0.55 },
    drop: { type: 'range', label: 'Altura da queda', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    size: { type: 'range', label: 'Tamanho', min: 0.5, max: 1.4, step: 0.05, default: 1 },
    cherry: { type: 'boolean', label: 'Cereja', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, p, duration }) {
    const key = [w, h, p.count, p.softness, p.drop, p.size, p.seed, duration].join('|');
    let sim = cache.get(key);
    if (!sim) {
      sim = simulate({ w, h, p, duration });
      if (cache.size > 8) cache.clear();
      cache.set(key, sim);
    }
    // inversa de Aqq (Σ q qᵀ) para o ajuste afim (bolhas/brilho acompanham a deformação)
    let a = 0, b = 0, d = 0;
    for (const [x, y] of sim.rest) { a += x * x; b += x * y; d += y * y; }
    const det = a * d - b * b;
    const inv = [d / det, -b / det, -b / det, a / det];
    const rand = rng(p.seed + 101);
    const bubbles = Array.from({ length: 6 }, () => [(rand() - 0.5) * 0.9, -0.55 + rand() * 0.6, 0.02 + rand() * 0.035]);
    return { ...sim, inv, bubbles };
  },

  render(ctx, t, { w, h, p, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const m = Math.min(w, h);
    const { baked, r, G, rest, inv } = state;
    const fi = baked.index(t);
    const i0 = Math.floor(fi);
    const i1 = Math.min(baked.frames.length - 1, i0 + 1);
    const f = fi - i0;
    const A = baked.frames[i0], B = baked.frames[i1];
    const nb = A.length / (N * 2);

    // chão
    ctx.fillStyle = rgba(p.ink, 0.14);
    const gw = Math.min(w * 0.9, r * 2.6 * nb + r * 2.5);
    ctx.fillRect(w / 2 - gw / 2, G, gw, Math.max(1, m * 0.0018));

    const P = new Float32Array(N * 2);
    for (let j = 0; j < nb; j++) {
      const off = j * N * 2;
      let cx = 0, cy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < N * 2; k++) P[k] = A[off + k] + (B[off + k] - A[off + k]) * f;
      for (let i = 0; i < N; i++) {
        const x = P[i * 2], y = P[i * 2 + 1];
        cx += x; cy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      cx /= N; cy /= N;
      if (y1 < -r * 0.2) continue; // ainda fora da tela

      // ajuste afim M = Apq · Aqq⁻¹
      let p00 = 0, p01 = 0, p10 = 0, p11 = 0;
      for (let i = 0; i < N; i++) {
        const dx = P[i * 2] - cx, dy = P[i * 2 + 1] - cy;
        const [qx, qy] = rest[i];
        p00 += dx * qx; p01 += dx * qy; p10 += dy * qx; p11 += dy * qy;
      }
      const M00 = p00 * inv[0] + p01 * inv[2], M01 = p00 * inv[1] + p01 * inv[3];
      const M10 = p10 * inv[0] + p11 * inv[2], M11 = p10 * inv[1] + p11 * inv[3];
      const map = (qx, qy) => [cx + M00 * qx + M01 * qy, cy + M10 * qx + M11 * qy];

      const col = nb === 1 ? p.color : [p.color, hexMix(p.color, '#ffffff', 0.16), hexMix(p.color, '#000000', 0.16)][(j + (nb === 2 ? 1 : 0)) % 3];

      // sombra: encolhe com a altura
      const hn = clamp((G - y1) / (m * 0.5));
      ctx.fillStyle = rgba(p.ink, 0.2 * (1 - 0.8 * hn));
      ctx.beginPath();
      ctx.ellipse(cx, G + m * 0.004, (x1 - x0) * 0.55 * (1 - 0.4 * hn), r * 0.09 * (1 - 0.5 * hn), 0, 0, TAU);
      ctx.fill();

      // corpo
      const body = smoothPath(P, 1, cx, cy, 0);
      const gr = ctx.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, mixHex(col, '#ffffff', 0.22));
      gr.addColorStop(0.55, col);
      gr.addColorStop(1, mixHex(col, '#000000', 0.32));
      ctx.fillStyle = gr;
      ctx.fill(body);

      ctx.save();
      ctx.clip(body);
      // núcleo mais claro (translucidez), deslocado para cima
      ctx.fillStyle = rgba('#ffffff', 0.13);
      ctx.fill(smoothPath(P, 0.72, cx, cy, -r * 0.12));
      ctx.fillStyle = rgba('#ffffff', 0.08);
      ctx.fill(smoothPath(P, 0.5, cx, cy, -r * 0.2));
      // borda de baixo mais densa
      ctx.strokeStyle = rgba('#000000', 0.12);
      ctx.lineWidth = r * 0.12;
      ctx.stroke(body);
      // bolhas presas
      ctx.fillStyle = rgba('#ffffff', 0.32);
      ctx.beginPath();
      for (const [bx, by, br] of state.bubbles) {
        const [X, Y] = map(bx * r, by * r);
        ctx.moveTo(X + br * r, Y);
        ctx.arc(X, Y, br * r, 0, TAU);
      }
      ctx.fill();
      ctx.restore();

      // brilho especular: traço no ombro superior esquerdo (pontos do próprio contorno, recuados)
      ctx.strokeStyle = rgba('#ffffff', 0.75);
      ctx.lineCap = 'round';
      ctx.lineWidth = r * 0.075;
      ctx.beginPath();
      const ia = Math.round(N * 0.6), ib = Math.round(N * 0.7);
      for (let i = ia; i <= ib; i++) {
        const x = cx + (P[i * 2] - cx) * 0.8, y = cy + (P[i * 2 + 1] - cy) * 0.78;
        if (i === ia) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.75);
      {
        const i = Math.round(N * 0.735);
        const x = cx + (P[i * 2] - cx) * 0.8, y = cy + (P[i * 2 + 1] - cy) * 0.78;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.04, 0, TAU);
        ctx.fill();
      }

      if (p.cherry) drawCherry(ctx, P, r, col, p.ink, j);
    }
  },
};

// contorno suave pelos pontos médios; escala/desloca em torno do centro para camadas internas
function smoothPath(P, s, cx, cy, dy) {
  const path = new Path2D();
  const X = (i) => cx + (P[(i % N) * 2] - cx) * s;
  const Y = (i) => cy + dy + (P[(i % N) * 2 + 1] - cy) * s;
  path.moveTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
  for (let i = 1; i <= N; i++) path.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
  path.closePath();
  return path;
}

function drawCherry(ctx, P, r, col, ink, j) {
  const it = (N * 3) / 4; // ponto do topo
  const x = P[it * 2], y = P[it * 2 + 1];
  // normal local pela tangente dos vizinhos
  const tx = P[((it + 1) % N) * 2] - P[(it - 1) * 2];
  const ty = P[((it + 1) % N) * 2 + 1] - P[(it - 1) * 2 + 1];
  const l = Math.hypot(tx, ty) || 1;
  const nx = ty / l, ny = -tx / l; // para fora (contorno horário na tela)
  const cr = r * 0.17;
  const X = x + nx * cr * 0.82, Y = y + ny * cr * 0.82;
  const ang = Math.atan2(ny, nx) + Math.PI / 2;
  // cabinho
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.028;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const sx = X + nx * cr * 0.8, sy = Y + ny * cr * 0.8;
  ctx.moveTo(sx, sy);
  const side = j % 2 ? -1 : 1;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  ctx.quadraticCurveTo(sx + nx * cr * 1.4 + ca * cr * 0.2 * side, sy + ny * cr * 1.4 + sa * cr * 0.2 * side,
    sx + nx * cr * 1.9 + ca * cr * 0.9 * side, sy + ny * cr * 1.9 + sa * cr * 0.9 * side);
  ctx.stroke();
  // fruta
  const dark = mixHex(col, '#000000', 0.45);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(X, Y, cr, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.7);
  ctx.beginPath();
  ctx.ellipse(X - cr * 0.38, Y - cr * 0.38, cr * 0.22, cr * 0.14, -0.7, 0, TAU);
  ctx.fill();
}

const hexMix = (a, b, t) => '#' + mixHex(a, b, t).match(/\d+/g).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
