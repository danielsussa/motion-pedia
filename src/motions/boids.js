import { TAU, rng, rgba, mixHex, clamp, smoothstep } from '../lib/anim.js';
import { bake } from '../lib/bake.js';

// Revoada (boids de Reynolds: separação, alinhamento, coesão) pré-calculada com bake() no setup.
// Grade espacial para vizinhos. A simulação é gravada de −FADE até a duração: nos últimos FADE segundos
// o render faz crossfade com o trecho [−FADE, 0], então t = duração desenha exatamente o mesmo que t = 0.

const FADE = 1.5;
const FPS = 24; // passo da simulação (o render interpola entre frames)
const TRAIL = 7; // frames de rastro
const MAXN = 14; // vizinhos considerados (estorninhos reais olham ~7)

export default {
  id: 'boids',
  title: 'Flocking',
  description: 'Revoada simulada (separação, alinhamento e coesão) que persegue uma isca e foge de um predador, em loop.',
  category: 'particulas',
  tags: ['partículas', 'simulação', 'loop'],
  duration: 12,

  params: {
    color: { type: 'color', label: 'Pássaros', default: '#e9ecf2' },
    accent: { type: 'color', label: 'Destaque', default: '#ff6a3d' },
    bg: { type: 'color', label: 'Fundo', default: '#0b0e14' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
    count: { type: 'range', label: 'Pássaros', min: 40, max: 500, step: 10, default: 320 },
    speed: { type: 'range', label: 'Velocidade', min: 0.5, max: 1.8, step: 0.01, default: 1 },
    cohesion: { type: 'range', label: 'Coesão', min: 0, max: 2, step: 0.01, default: 1 },
    predator: { type: 'boolean', label: 'Predador', default: true },
    trails: { type: 'boolean', label: 'Rastros', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p, duration }) {
    const rand = rng(p.seed);
    const S = Math.min(w, h);
    const N = p.count;
    const vMax = S * 0.36 * p.speed;
    const vMin = vMax * 0.55;
    const R = S * 0.09; // percepção
    const Rs = S * 0.02; // separação
    const margin = S * 0.12;
    const D = duration;
    const t0 = -FADE - 2; // 2 s de aquecimento fora da tela do tempo

    // isca (para onde a revoada tende) e predador: curvas fechadas no período D
    const lure = (s) => {
      const u = s / D;
      return [w / 2 + w * 0.3 * Math.sin(TAU * u + 0.6), h / 2 + h * 0.26 * Math.sin(TAU * 2 * u)];
    };
    const pred = (s) => {
      const u = s / D;
      return [w / 2 + w * 0.36 * Math.cos(TAU * 2 * u + 2), h / 2 + h * 0.3 * Math.sin(TAU * 3 * u + 1)];
    };

    const cell = R;
    const gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    const head = new Int32Array(gw * gh);
    const next = new Int32Array(N);
    const accent = new Uint8Array(N);
    const scale = new Float32Array(N);
    const phase = new Float32Array(N);
    const pace = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      phase[i] = rand() * TAU;
      pace[i] = 0.85 + rand() * 0.3;
      accent[i] = rand() < 0.04 ? 1 : 0;
      scale[i] = 0.75 + rand() * 0.5;
    }

    const b = bake({
      duration: D + FADE + 2,
      fps: FPS,
      init: () => {
        const s = new Float32Array(N * 4);
        // começa em 3 bandos já alinhados
        for (let i = 0; i < N; i++) {
          const g = i % 3;
          const cx = w * (0.25 + 0.25 * g), cy = h * (0.35 + 0.15 * ((g * 7) % 3));
          const a = g * 2.1 + (rand() - 0.5) * 0.6;
          s[i * 4] = cx + (rand() - 0.5) * S * 0.25;
          s[i * 4 + 1] = cy + (rand() - 0.5) * S * 0.25;
          s[i * 4 + 2] = Math.cos(a) * vMin;
          s[i * 4 + 3] = Math.sin(a) * vMin;
        }
        return s;
      },
      step: (s, dt, i) => {
        const time = t0 + i * dt;
        head.fill(-1);
        for (let k = 0; k < N; k++) {
          const cx = clamp(Math.floor(s[k * 4] / cell) + 1, 0, gw - 1);
          const cy = clamp(Math.floor(s[k * 4 + 1] / cell) + 1, 0, gh - 1);
          const c = cy * gw + cx;
          next[k] = head[c];
          head[c] = k;
        }
        const [lx, ly] = lure(time);
        const [qx, qy] = pred(time);
        const out = new Float32Array(N * 4);
        for (let k = 0; k < N; k++) {
          const x = s[k * 4], y = s[k * 4 + 1];
          let vx = s[k * 4 + 2], vy = s[k * 4 + 3];
          let ax = 0, ay = 0, cxs = 0, cys = 0, avx = 0, avy = 0, sx = 0, sy = 0, n = 0;
          const gx = clamp(Math.floor(x / cell) + 1, 0, gw - 1);
          const gy = clamp(Math.floor(y / cell) + 1, 0, gh - 1);
          scan: for (let oy = -1; oy <= 1; oy++) {
            const yy = gy + oy;
            if (yy < 0 || yy >= gh) continue;
            for (let ox = -1; ox <= 1; ox++) {
              const xx = gx + ox;
              if (xx < 0 || xx >= gw) continue;
              for (let j = head[yy * gw + xx]; j !== -1; j = next[j]) {
                if (j === k) continue;
                const dx = s[j * 4] - x, dy = s[j * 4 + 1] - y;
                const d2 = dx * dx + dy * dy;
                if (d2 > R * R) continue;
                if (++n > MAXN) break scan;
                cxs += dx; cys += dy;
                avx += s[j * 4 + 2]; avy += s[j * 4 + 3];
                if (d2 < Rs * Rs && d2 > 1e-6) {
                  const d = Math.sqrt(d2);
                  const f = (Rs - d) / Rs / d;
                  sx -= dx * f; sy -= dy * f;
                }
              }
            }
          }
          if (n > MAXN) n = MAXN;
          if (n > 0) {
            ax += (cxs / n) * 1.1 * p.cohesion; // coesão (em direção ao centro local)
            ay += (cys / n) * 1.1 * p.cohesion;
            ax += (avx / n - vx) * 1.5; // alinhamento
            ay += (avy / n - vy) * 1.5;
          }
          ax += sx * vMax * 4; // separação
          ay += sy * vMax * 4;
          // vaguear individual (quebra a "rede cristalina" típica de boids)
          const wa = phase[k] + time * (1.1 + pace[k]);
          ax += Math.cos(wa) * vMax * 0.45;
          ay += Math.sin(wa * 1.3) * vMax * 0.45;
          // isca: atração fraca de longo alcance
          const ldx = lx - x, ldy = ly - y;
          const ld = Math.sqrt(ldx * ldx + ldy * ldy) + 1;
          ax += (ldx / ld) * vMax * 0.75;
          ay += (ldy / ld) * vMax * 0.75;
          // predador: fuga forte de curto alcance
          if (p.predator) {
            const pdx = x - qx, pdy = y - qy;
            const pd = Math.sqrt(pdx * pdx + pdy * pdy) + 1;
            const rr = S * 0.2;
            if (pd < rr) {
              const f = ((rr - pd) / rr) ** 2 * vMax * 9;
              ax += (pdx / pd) * f;
              ay += (pdy / pd) * f;
            }
          }
          // bordas macias
          if (x < margin) ax += ((margin - x) / margin) * vMax * 3;
          if (x > w - margin) ax -= ((x - (w - margin)) / margin) * vMax * 3;
          if (y < margin) ay += ((margin - y) / margin) * vMax * 3;
          if (y > h - margin) ay -= ((y - (h - margin)) / margin) * vMax * 3;

          vx += ax * dt;
          vy += ay * dt;
          const sp = Math.sqrt(vx * vx + vy * vy) || 1;
          const ns = clamp(sp, vMin * pace[k], vMax * pace[k]);
          vx = (vx / sp) * ns;
          vy = (vy / sp) * ns;
          out[k * 4] = x + vx * dt;
          out[k * 4 + 1] = y + vy * dt;
          out[k * 4 + 2] = vx;
          out[k * 4 + 3] = vy;
        }
        return out;
      },
      snapshot: (s) => s,
    });

    return { b, N, accent, scale, base: 2 * FPS, pred, S };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { b, N, accent, scale, base, pred } = state;
    const S = Math.min(w, h);
    if (!p.transparent) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, mixHex(p.bg, '#ffffff', 0.05));
      g.addColorStop(1, p.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const D = duration;
    // frames gravados: índice 0 = tempo (−FADE − 2); tempo s → índice (s + FADE + 2)·FPS
    const idxOf = (s) => (s + FADE) * FPS + base;
    const k = smoothstep(D - FADE, D, t);
    const layers = k <= 0 ? [[t, 1]] : k >= 1 ? [[t - D, 1]] : [[t, 1 - k], [t - D, k]];

    const len = S * 0.011;
    for (const [s, alpha] of layers) {
      const fi = clamp(idxOf(s), 0, b.frames.length - 1);
      const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, b.frames.length - 1), f = fi - i0;
      const A = b.frames[i0], B = b.frames[i1];

      if (p.trails) {
        const trail = [new Path2D(), new Path2D()];
        for (let n = 0; n < N; n++) {
          const P = trail[accent[n]];
          P.moveTo(A[n * 4] + (B[n * 4] - A[n * 4]) * f, A[n * 4 + 1] + (B[n * 4 + 1] - A[n * 4 + 1]) * f);
          for (let q = 1; q <= TRAIL; q++) {
            const F = b.frames[Math.max(0, i0 - q)];
            P.lineTo(F[n * 4], F[n * 4 + 1]);
          }
        }
        ctx.lineWidth = S * 0.0016;
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.16 * alpha;
        ctx.strokeStyle = p.color;
        ctx.stroke(trail[0]);
        ctx.globalAlpha = 0.35 * alpha;
        ctx.strokeStyle = p.accent;
        ctx.stroke(trail[1]);
      }

      const bodies = [new Path2D(), new Path2D()];
      for (let n = 0; n < N; n++) {
        const x = A[n * 4] + (B[n * 4] - A[n * 4]) * f;
        const y = A[n * 4 + 1] + (B[n * 4 + 1] - A[n * 4 + 1]) * f;
        let vx = A[n * 4 + 2] + (B[n * 4 + 2] - A[n * 4 + 2]) * f;
        let vy = A[n * 4 + 3] + (B[n * 4 + 3] - A[n * 4 + 3]) * f;
        const v = Math.hypot(vx, vy) || 1;
        vx /= v; vy /= v;
        const L = len * scale[n] * (accent[n] ? 1.25 : 1);
        const W = L * 0.42;
        const P = bodies[accent[n]];
        // seta fina com entalhe (silhueta de pássaro estilizada)
        P.moveTo(x + vx * L, y + vy * L);
        P.lineTo(x - vx * L * 0.7 - vy * W, y - vy * L * 0.7 + vx * W);
        P.lineTo(x - vx * L * 0.35, y - vy * L * 0.35);
        P.lineTo(x - vx * L * 0.7 + vy * W, y - vy * L * 0.7 - vx * W);
        P.closePath();
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fill(bodies[0]);
      ctx.fillStyle = p.accent;
      ctx.fill(bodies[1]);
    }
    ctx.globalAlpha = 1;

    // predador: anel discreto (mesma curva da simulação)
    if (p.predator) {
      const [qx, qy] = pred(t);
      const r = S * 0.012;
      ctx.strokeStyle = rgba(p.accent, 0.9);
      ctx.lineWidth = S * 0.0025;
      ctx.beginPath();
      ctx.arc(qx, qy, r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = rgba(p.accent, 0.12);
      ctx.beginPath();
      ctx.arc(qx, qy, r * 3.2, 0, TAU);
      ctx.fill();
    }
  },
};
