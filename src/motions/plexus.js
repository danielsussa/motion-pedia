import { TAU, rng, rgba, mixHex, clamp } from '../lib/anim.js';

// Plexus: pontos num volume 3D à deriva (senos com frequências inteiras de progress → loop perfeito),
// ligados por linhas cuja opacidade cai com a distância. Linhas agrupadas em faixas de opacidade
// (um stroke por faixa), triângulos discretos onde três pontos estão bem próximos.

const BANDS = 7;

export default {
  id: 'plexus',
  title: 'Plexus',
  description: 'Points drifting in a 3D volume, linked by lines that light up by distance, in a seamless loop.',
  category: 'particulas',
  tags: ['particles', 'loop', 'background', '3d'],
  duration: 12,

  params: {
    color: { type: 'color', label: 'Lines', default: '#7f9cff' },
    dot: { type: 'color', label: 'Dot color', default: '#e8eeff' },
    accent: { type: 'color', label: 'Accent', default: '#4ff0c8' },
    bg: { type: 'color', label: 'Background', default: '#06080f' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    count: { type: 'range', label: 'Points', min: 30, max: 220, step: 1, default: 110 },
    link: { type: 'range', label: 'Link distance', min: 0.4, max: 1.8, step: 0.01, default: 1 },
    depth: { type: 'range', label: 'Depth', min: 0, max: 1, step: 0.01, default: 0.7 },
    drift: { type: 'range', label: 'Drift', min: 0, max: 2, step: 0.01, default: 1 },
    triangles: { type: 'boolean', label: 'Triangles', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  setup({ w, h, p }) {
    const rand = rng(p.seed);
    const R = (a, b) => a + (b - a) * rand();
    const S = Math.min(w, h);
    // densidade constante: mais pontos em telas mais "largas" que o quadrado
    const n = Math.round(p.count * Math.sqrt((w * h) / (S * S)));
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({
        x: R(-0.56, 0.56) * w,
        y: R(-0.56, 0.56) * h,
        z: R(-0.5, 0.5) * S,
        ax: R(0.03, 0.09) * S, fx: 1 + Math.floor(rand() * 2), px: rand() * TAU,
        ay: R(0.03, 0.09) * S, fy: 1 + Math.floor(rand() * 2), py: rand() * TAU,
        az: R(0.03, 0.08) * S, fz: 1 + Math.floor(rand() * 2), pz: rand() * TAU,
        accent: rand() < 0.08,
        size: R(0.7, 1.3),
      });
    }
    const N = pts.length;
    return { pts, X: new Float32Array(N), Y: new Float32Array(N), Z: new Float32Array(N), SX: new Float32Array(N), SY: new Float32Array(N), SC: new Float32Array(N) };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const S = Math.min(w, h);
    if (!p.transparent) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, mixHex(p.bg, p.color, 0.1));
      g.addColorStop(1, p.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const { pts, X, Y, Z, SX, SY, SC } = state;
    const N = pts.length;
    const dr = p.drift;
    // balanço lento da câmera (fecha o loop)
    const ry = 0.32 * Math.sin(TAU * u) * p.depth;
    const rx = 0.12 * Math.sin(TAU * u * 2 + 1) * p.depth;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    const fov = S * 1.5;

    for (let i = 0; i < N; i++) {
      const o = pts[i];
      let x = o.x + Math.sin(TAU * o.fx * u + o.px) * o.ax * dr;
      let y = o.y + Math.sin(TAU * o.fy * u + o.py) * o.ay * dr;
      let z = (o.z + Math.sin(TAU * o.fz * u + o.pz) * o.az * dr) * p.depth;
      X[i] = x; Y[i] = y; Z[i] = z;
      // rotação de câmera
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y1 = y * cx - z1 * sx;
      const z2 = y * sx + z1 * cx;
      const s = fov / (fov + z2);
      SX[i] = w / 2 + x1 * s;
      SY[i] = h / 2 + y1 * s;
      SC[i] = s;
    }

    const thr = S * 0.27 * p.link;
    const thr2 = thr * thr;
    const bands = Array.from({ length: BANDS }, () => new Path2D());
    const tris = new Path2D();
    const near = p.triangles ? Array.from({ length: N }, () => []) : null;
    const triThr2 = thr2 * 0.42;

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = X[i] - X[j];
        if (dx > thr || dx < -thr) continue;
        const dy = Y[i] - Y[j];
        if (dy > thr || dy < -thr) continue;
        const dz = Z[i] - Z[j];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= thr2) continue;
        const k = 1 - Math.sqrt(d2) / thr; // 0..1
        // pontos mais perto da câmera ganham mais opacidade
        const depthK = clamp((SC[i] + SC[j]) * 0.5 - 0.35, 0.25, 1);
        const b = Math.min(BANDS - 1, Math.floor(Math.sqrt(k) * depthK * BANDS));
        bands[b].moveTo(SX[i], SY[i]);
        bands[b].lineTo(SX[j], SY[j]);
        if (near && d2 < triThr2) near[i].push(j);
      }
    }
    if (near) {
      for (let i = 0; i < N; i++) {
        const a = near[i];
        for (let m = 0; m < a.length; m++) {
          for (let q = m + 1; q < a.length; q++) {
            const j = a[m], k = a[q];
            const lo = Math.min(j, k), hi = Math.max(j, k);
            if (!near[lo].includes(hi)) continue;
            tris.moveTo(SX[i], SY[i]);
            tris.lineTo(SX[j], SY[j]);
            tris.lineTo(SX[k], SY[k]);
            tris.closePath();
          }
        }
      }
      ctx.fillStyle = rgba(p.color, 0.045);
      ctx.fill(tris);
    }

    const lw = S * 0.0017;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = lw;
    for (let b = 0; b < BANDS; b++) {
      const k = (b + 0.5) / BANDS;
      ctx.globalAlpha = 0.06 + k * k * 0.85;
      ctx.stroke(bands[b]);
    }
    ctx.globalAlpha = 1;

    // pontos: halo + núcleo, agrupados (normais / destaque)
    for (const acc of [false, true]) {
      const halo = new Path2D();
      const core = new Path2D();
      for (let i = 0; i < N; i++) {
        if (pts[i].accent !== acc) continue;
        const r = S * 0.0032 * pts[i].size * SC[i] * (acc ? 1.5 : 1);
        core.moveTo(SX[i] + r, SY[i]);
        core.arc(SX[i], SY[i], r, 0, TAU);
        halo.moveTo(SX[i] + r * 3.2, SY[i]);
        halo.arc(SX[i], SY[i], r * 3.2, 0, TAU);
      }
      const c = acc ? p.accent : p.dot;
      ctx.fillStyle = rgba(c, acc ? 0.16 : 0.08);
      ctx.fill(halo);
      ctx.fillStyle = c;
      ctx.fill(core);
    }
  },
};
