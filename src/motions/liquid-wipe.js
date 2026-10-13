import { seg, ease } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, t, { w, h, p, duration }) {
  if (p.transparent) return;
  const isA = t < duration / 2;
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

const DIRS = { 'para cima': 0, 'para a direita': 1, 'para baixo': 2, 'para a esquerda': 3 };

export default {
  id: 'liquid-wipe',
  title: 'Liquid Wipe',
  description: 'Camadas de líquido sobem com a borda ondulando, inundam a tela e escorrem para fora revelando a próxima cena.',
  category: 'transicoes',
  tags: ['transição', 'forma', 'alpha'],
  duration: 1.8,
  poster: 0.6,

  params: {
    color1: { type: 'color', label: 'Cor principal', default: '#111114' },
    color2: { type: 'color', label: 'Cor 2', default: '#ff4d2e' },
    color3: { type: 'color', label: 'Cor 3', default: '#ffb199' },
    layers: { type: 'range', label: 'Camadas', min: 1, max: 3, step: 1, default: 2 },
    direction: { type: 'select', label: 'Direção', options: Object.keys(DIRS), default: 'para cima' },
    amp: { type: 'range', label: 'Ondulação', min: 0, max: 1, step: 0.01, default: 0.55 },
    waves: { type: 'range', label: 'Ondas', min: 0.5, max: 4, step: 0.1, default: 1.6 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    colorA: { type: 'color', label: 'Prévia A', default: '#e7e2d8' },
    colorB: { type: 'color', label: 'Prévia B', default: '#1a1c22' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  setup({ p }) {
    return { noise: createNoise(p.seed) };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    preview(ctx, t, env);
    const { noise } = state;
    const mid = duration / 2;
    const dir = DIRS[p.direction] ?? 0;
    // Referencial local: o líquido sempre "sobe" (de y=H para y=0), largura W.
    const W = dir % 2 ? h : w;
    const H = dir % 2 ? w : h;
    const m = Math.min(w, h);
    const A = m * 0.24 * p.amp; // amplitude máxima da borda
    const n = Math.round(p.layers);
    // a camada principal fica por cima
    const order = n === 1 ? [p.color1] : n === 2 ? [p.color2, p.color1] : [p.color3, p.color2, p.color1];

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.translate(-W / 2, -H / 2);

    const N = 72;
    // Borda: ruído suave + uma onda longa; a amplitude respira com a velocidade do avanço.
    const edge = (base, amp, phase, seedOff) => {
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * W;
        const u = (x / m) * p.waves;
        const v =
          noise.noise2(u * 0.9 + seedOff, phase) * 0.65 +
          noise.noise2(u * 2.1 - seedOff, phase * 1.3 + 7) * 0.25 +
          Math.sin(u * 2.4 + phase * 2 + seedOff) * 0.35;
        pts.push([x, base + v * amp]);
      }
      return pts;
    };
    const margin = A * 1.4 + 4;
    const travel = H + margin * 2;
    const stg = mid * 0.16; // atraso entre camadas
    const life = mid * 0.94 - stg * (n - 1);

    for (let k = 0; k < n; k++) {
      // entrada: camada de trás primeiro; saída: camada da frente primeiro
      const dIn = k * stg;
      const dOut = mid + (n - 1 - k) * stg;
      const eIn = seg(t, dIn, dIn + life);
      const eOut = seg(t, dOut, dOut + life);
      if (eIn <= 0 || eOut >= 1) continue;
      const topE = ease.inOutExpo(eIn);
      const botE = ease.inOutExpo(eOut);
      // envelope da onda: forte no meio do movimento, zero quando parado
      const envIn = Math.sin(Math.PI * Math.min(1, eIn)) ** 0.7;
      const envOut = Math.sin(Math.PI * Math.min(1, eOut)) ** 0.7;
      const phase = t * 1.6 + k * 0.9;
      const topBase = H + margin - travel * topE;
      const botBase = H + margin - travel * botE;
      const top = edge(topBase, A * envIn, phase, k * 3.1);
      const bot = edge(botBase, A * 0.8 * envOut, phase + 2.5, k * 3.1 + 11);

      ctx.fillStyle = order[k];
      ctx.beginPath();
      top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x - 2, y)));
      ctx.lineTo(W + 2, top[N][1]);
      if (eOut <= 0) {
        ctx.lineTo(W + 2, H + 2);
        ctx.lineTo(-2, H + 2);
      } else {
        ctx.lineTo(W + 2, bot[N][1]);
        for (let i = N; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
        ctx.lineTo(-2, bot[0][1]);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
};
