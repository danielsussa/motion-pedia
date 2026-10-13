import { TAU, rng, smoothstep } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Flow field com rastro, sem estado entre frames: cada partícula vive exatamente 1/k do loop e renasce
// k vezes por loop. No setup, o caminho de cada "vida" é integrado no campo (que também evolui em loop)
// e guardado; o render só desenha a janela [cabeça − rastro, cabeça] do caminho. Em u=0 e u=1 tudo coincide.
// Desenho em lotes: (cor × nível de opacidade × trecho do rastro) → poucas chamadas de stroke().

const ALPHA_LEVELS = 6;
const TRAIL_PARTS = [0.18, 0.45, 1];

export default {
  id: 'flow-field',
  title: 'Flow Field',
  description: 'Thousands of fine lines streaming through a noise field, leaving trails that fade away.',
  category: 'fundos',
  tags: ['background', 'loop', 'particles', 'pattern'],
  duration: 10,

  params: {
    bg: { type: 'color', label: 'Background', default: '#08090c' },
    c1: { type: 'color', label: 'Lines', default: '#cfd6e6' },
    c2: { type: 'color', label: 'Accent', default: '#3df0c2' },
    mix: { type: 'range', label: '% accent', min: 0, max: 1, step: 0.01, default: 0.22 },
    count: { type: 'range', label: 'Particles', min: 200, max: 4000, step: 50, default: 1800 },
    trail: { type: 'range', label: 'Trail', min: 0.05, max: 0.8, step: 0.01, default: 0.5 },
    scale: { type: 'range', label: 'Field scale', min: 0.4, max: 4, step: 0.05, default: 1.4 },
    chaos: { type: 'range', label: 'Turbulence', min: 0.2, max: 2.5, step: 0.05, default: 1.1 },
    weight: { type: 'range', label: 'Thickness', min: 0.4, max: 4, step: 0.1, default: 1.3 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 21 },
  },

  setup({ w, h, p }) {
    const rand = rng(p.seed);
    const noise = createNoise(p.seed);
    const m = Math.min(w, h);
    const K = 2; // vidas por loop
    const S = 90; // passos por vida
    const s = p.scale / m;
    const stepLen = m * 0.0045;
    const margin = m * 0.15;

    // campo de velocidade = rotacional de um potencial ψ (ruído em loop): sem divergência, então as
    // linhas giram em redemoinhos em vez de convergir em "penas". Pré-amostrado numa grade
    // (espaço × TS fatias de tempo) e interpolado — bem mais barato que ruído por passo.
    const TS = 24;
    const cell = m / 36;
    const gx0 = -margin - 2 * cell;
    const gy0 = -margin - 2 * cell;
    const GC = Math.ceil((w + 2 * margin + 4 * cell) / cell) + 1;
    const GR = Math.ceil((h + 2 * margin + 4 * cell) / cell) + 1;
    const psi = new Float32Array(GC * GR);
    const vel = new Float32Array(TS * GC * GR * 2);
    const amp = p.chaos;
    const drift = rand() * TAU;
    const dX = Math.cos(drift) * 0.35;
    const dY = Math.sin(drift) * 0.35;
    for (let ts = 0; ts < TS; ts++) {
      const zc = 0.3 * Math.cos((TAU * ts) / TS);
      const zs = 0.4 * Math.sin((TAU * ts) / TS) + 9.7;
      for (let j = 0; j < GR; j++) {
        for (let i = 0; i < GC; i++) {
          // loop: duas oitavas percorrendo o eixo z em cos/sen do ângulo do loop (contraste constante,
          // ao contrário do crossfade do loop2, que embaralha o campo no meio do loop)
          const x = (gx0 + i * cell - w / 2) * s;
          const y = (gy0 + j * cell - h / 2) * s;
          psi[j * GC + i] = noise.noise3(x, y, zc) + 0.3 * noise.noise3(x * 1.45 + 17.3, y * 1.45 - 4.1, zs);
        }
      }
      const base = ts * GC * GR * 2;
      for (let j = 0; j < GR; j++) {
        for (let i = 0; i < GC; i++) {
          const dpx = psi[j * GC + Math.min(i + 1, GC - 1)] - psi[j * GC + Math.max(i - 1, 0)];
          const dpy = psi[Math.min(j + 1, GR - 1) * GC + i] - psi[Math.max(j - 1, 0) * GC + i];
          // escala: ψ varia ~1 por 1/s px → derivada normalizada ~ ordem 1
          const k = (0.5 / (cell * s)) * amp;
          vel[base + (j * GC + i) * 2] = dpy * k + dX;
          vel[base + (j * GC + i) * 2 + 1] = -dpx * k + dY;
        }
      }
    }
    const sample = (x, y, uu, out) => {
      let fx = (x - gx0) / cell;
      let fy = (y - gy0) / cell;
      fx = Math.max(0, Math.min(GC - 1.001, fx));
      fy = Math.max(0, Math.min(GR - 1.001, fy));
      const i = fx | 0, j = fy | 0, ax = fx - i, ay = fy - j;
      const ft = uu * TS;
      const t0 = Math.floor(ft) % TS, t1 = (t0 + 1) % TS, at = ft - Math.floor(ft);
      let vx = 0, vy = 0;
      for (const [tt, wt] of [[t0, 1 - at], [t1, at]]) {
        const b = tt * GC * GR * 2;
        const i00 = b + (j * GC + i) * 2, i10 = i00 + 2, i01 = i00 + GC * 2, i11 = i01 + 2;
        vx += wt * ((vel[i00] * (1 - ax) + vel[i10] * ax) * (1 - ay) + (vel[i01] * (1 - ax) + vel[i11] * ax) * ay);
        vy += wt * ((vel[i00 + 1] * (1 - ax) + vel[i10 + 1] * ax) * (1 - ay) + (vel[i01 + 1] * (1 - ax) + vel[i11 + 1] * ax) * ay);
      }
      out[0] = vx;
      out[1] = vy;
    };

    const N = p.count;
    const paths = new Float32Array(N * K * S * 2);
    const phase = new Float32Array(N);
    const tone = new Uint8Array(N);
    const v = [0, 0];
    for (let i = 0; i < N; i++) {
      phase[i] = rand();
      tone[i] = rand() < p.mix ? 1 : 0;
      for (let c = 0; c < K; c++) {
        // instante (em progress) em que essa vida começa
        const u0 = (((c - phase[i]) / K) % 1 + 1) % 1;
        let x = -margin + rand() * (w + 2 * margin);
        let y = -margin + rand() * (h + 2 * margin);
        const o = (i * K + c) * S * 2;
        for (let k = 0; k < S; k++) {
          paths[o + k * 2] = x;
          paths[o + k * 2 + 1] = y;
          sample(x, y, (u0 + k / (S - 1) / K) % 1, v);
          const sp = Math.hypot(v[0], v[1]) + 1e-6;
          // velocidade real nas regiões calmas (sem tremido), limitada nas rápidas
          const mag = Math.min(1, sp) * stepLen;
          x += (v[0] / sp) * mag;
          y += (v[1] / sp) * mag;
        }
      }
    }
    return { paths, phase, tone, K, S, N };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const { paths, phase, tone, K, S, N } = state;
    const m = Math.min(w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const T = Math.max(2, p.trail * S);
    const nP = TRAIL_PARTS.length;
    const buckets = Array.from({ length: 2 * ALPHA_LEVELS * nP }, () => new Path2D());

    for (let i = 0; i < N; i++) {
      const a = u * K + phase[i];
      const fl = Math.floor(a);
      const c = ((fl % K) + K) % K;
      const age = a - fl; // 0..1 dentro da vida
      const life = smoothstep(0, 0.12, age) * (1 - smoothstep(0.8, 1, age));
      const lvl = Math.round(life * ALPHA_LEVELS);
      if (lvl <= 0) continue;
      const head = age * (S - 1);
      const tail = Math.max(0, head - T);
      const o = (i * K + c) * S * 2;
      const hi = Math.floor(head);
      const hf = head - hi;
      // ponta interpolada (movimento suave entre passos)
      const hx = hi < S - 1 ? paths[o + hi * 2] + (paths[o + hi * 2 + 2] - paths[o + hi * 2]) * hf : paths[o + hi * 2];
      const hy = hi < S - 1 ? paths[o + hi * 2 + 1] + (paths[o + hi * 2 + 3] - paths[o + hi * 2 + 1]) * hf : paths[o + hi * 2 + 1];
      // divide o rastro em trechos (cauda mais apagada)
      const base = (tone[i] * ALPHA_LEVELS + (lvl - 1)) * nP;
      for (let q = 0; q < nP; q++) {
        const a0 = tail + ((head - tail) * q) / nP;
        const a1 = tail + ((head - tail) * (q + 1)) / nP;
        const path = buckets[base + q];
        const k0 = Math.floor(a0);
        path.moveTo(paths[o + k0 * 2], paths[o + k0 * 2 + 1]);
        for (let k = k0 + 1; k <= Math.floor(a1); k++) path.lineTo(paths[o + k * 2], paths[o + k * 2 + 1]);
        if (q === nP - 1) path.lineTo(hx, hy);
      }
    }

    ctx.lineWidth = (p.weight * m) / 1080;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let tn = 0; tn < 2; tn++) {
      ctx.strokeStyle = tn ? p.c2 : p.c1;
      for (let l = 0; l < ALPHA_LEVELS; l++) {
        for (let q = 0; q < nP; q++) {
          ctx.globalAlpha = ((l + 1) / ALPHA_LEVELS) * TRAIL_PARTS[q] * (tn ? 1 : 0.85);
          ctx.stroke(buckets[(tn * ALPHA_LEVELS + l) * nP + q]);
        }
      }
    }
    ctx.globalAlpha = 1;

    const g = ctx.createRadialGradient(w / 2, h / 2, m * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
};
