import { TAU, clamp, ease, lerp, rgba, smoothstep } from '../lib/anim.js';

// Formas quicando com os princípios clássicos: antecipação (agacha antes de pular), stretch na
// subida e na descida (proporcional à velocidade), squash no impacto, follow-through (a forma
// "balança" e assenta) e rotação levemente atrasada em relação ao salto (overlapping action).
// O volume é preservado (sx ≈ 1/sy). Cada forma faz um ciclo inteiro por loop, com defasagem.

const SHAPES = ['square', 'circle', 'triangle', 'circle', 'square'];
const ROT = { square: Math.PI / 2, triangle: (TAU / 3), circle: TAU };

// ciclo em x ∈ [0,1): devolve altura normalizada (0..1), escala vertical e rotação (0..1 do giro)
function cycle(x, amt) {
  const a1 = 0.17; // fim da antecipação
  const a2 = 0.71; // pouso
  const squashA = 1 - 0.3 * amt; // agachada
  const stretchMax = 1 + 0.32 * amt;
  if (x < a1) {
    const d = ease.inOutSine(x / a1);
    return { y: 0, sy: lerp(1, squashA, d), rot: 0 };
  }
  if (x < a2) {
    const s = (x - a1) / (a2 - a1);
    const y = 4 * s * (1 - s);
    const v = Math.abs(1 - 2 * s); // velocidade vertical relativa
    let sy = 1 + (stretchMax - 1) * v ** 1.6;
    // solta a mola da agachada nos primeiros instantes do voo
    sy = lerp(squashA, sy, ease.outCubic(clamp(s / 0.1)));
    const rot = ease.inOutCubic(clamp((s - 0.12) / 0.8));
    return { y, sy, rot };
  }
  const tau = (x - a2) / (1 - a2);
  const hit = 0.1;
  const squashI = 1 - 0.42 * amt;
  if (tau < hit) return { y: 0, sy: lerp(stretchMax, squashI, ease.outCubic(tau / hit)), rot: 1 };
  const k = tau - hit;
  const wob = (1 - squashI) * Math.exp(-5.5 * k) * Math.cos(k * 24) * (1 - smoothstep(0.7, 1, tau));
  return { y: 0, sy: 1 - wob, rot: 1 };
}

function shapePath(ctx, kind, r) {
  ctx.beginPath();
  if (kind === 'circle') {
    ctx.arc(0, 0, r, 0, TAU);
  } else if (kind === 'square') {
    const s = r * 0.9;
    const c = r * 0.22;
    ctx.roundRect(-s, -s, 2 * s, 2 * s, c);
  } else {
    // triângulo equilátero com base plana; centro no centroide
    const R = r * 1.25;
    const pts = [0, 1, 2].map((i) => [R * Math.cos(-Math.PI / 2 + (i * TAU) / 3), R * Math.sin(-Math.PI / 2 + (i * TAU) / 3)]);
    // cantos arredondados com arcTo
    const cr = r * 0.16;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(pts[2], pts[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < 3; i++) {
      const pnt = pts[i];
      const nx = pts[(i + 1) % 3];
      ctx.arcTo(pnt[0], pnt[1], nx[0], nx[1], cr);
    }
    ctx.closePath();
  }
}
// distância do centro até a base apoiada no chão
const baseOf = (kind, r) => (kind === 'circle' ? r : kind === 'square' ? r * 0.9 : r * 1.25 * 0.5);

export default {
  id: 'squash-bounce',
  title: 'Squash & Bounce',
  description: 'Formas quicando com antecipação, squash & stretch e follow-through, com sombra no chão.',
  category: 'formas',
  tags: ['forma', 'loop', 'alpha'],
  duration: 2.4,
  poster: 0.95,

  params: {
    count: { type: 'range', label: 'Formas', min: 1, max: 5, step: 1, default: 3 },
    ink: { type: 'color', label: 'Cor', default: '#1d1c22' },
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    bg: { type: 'color', label: 'Fundo', default: '#efe9de' },
    squash: { type: 'range', label: 'Squash & stretch', min: 0, max: 1.5, step: 0.05, default: 1 },
    height: { type: 'range', label: 'Altura do pulo', min: 0.3, max: 1.6, step: 0.05, default: 1 },
    size: { type: 'range', label: 'Tamanho', min: 0.5, max: 1.8, step: 0.05, default: 1 },
    stagger: { type: 'range', label: 'Defasagem', min: 0, max: 0.3, step: 0.01, default: 0.09 },
    ground: { type: 'boolean', label: 'Linha do chão', default: true },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  render(ctx, t, { w, h, p, progress: u }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const m = Math.min(w, h);
    const n = p.count;
    const r = m * 0.074 * p.size;
    const H = m * 0.3 * p.height;
    const gap = Math.min(r * 4.2, (w * 0.84) / Math.max(1, n));
    const G = h / 2 + (H + 2 * r) / 2 - r * 0.2; // linha do chão

    if (p.ground) {
      ctx.fillStyle = rgba(p.ink, 0.16);
      const gw = Math.min(w * 0.86, gap * n + r * 4);
      ctx.fillRect(w / 2 - gw / 2, G, gw, Math.max(1, m * 0.0016));
    }

    for (let i = 0; i < n; i++) {
      const kind = n === 1 ? 'circle' : SHAPES[i % SHAPES.length];
      const accent = i === Math.floor((n - 1) / 2);
      const x0 = w / 2 + (i - (n - 1) / 2) * gap;
      const x = (((u - i * p.stagger) % 1) + 1) % 1;
      const c = cycle(x, p.squash);
      const sy = c.sy;
      const sx = 1 / Math.pow(sy, 0.85);
      const y = c.y * H;
      const hn = c.y; // 0 no chão, 1 no ápice
      const col = accent ? p.accent : p.ink;

      // sombra: encolhe e clareia com a altura
      ctx.fillStyle = rgba(p.ink, 0.26 * (1 - 0.7 * hn));
      ctx.beginPath();
      ctx.ellipse(x0, G, r * 1.05 * sx * (1 - 0.45 * hn), r * 0.16 * (1 - 0.35 * hn), 0, 0, TAU);
      ctx.fill();

      // forma: escala ancorada na base, rotação em torno do centro
      const b = baseOf(kind, r);
      ctx.save();
      ctx.translate(x0, G - y);
      ctx.scale(sx, sy);
      ctx.translate(0, -b);
      ctx.rotate((i % 2 ? -1 : 1) * ROT[kind] * c.rot);
      shapePath(ctx, kind, r);
      ctx.fillStyle = col;
      ctx.fill();
      // detalhe que denuncia a rotação do círculo
      if (kind === 'circle') {
        ctx.fillStyle = p.bg;
        if (p.transparent) ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(0, -r * 0.48, r * 0.17, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
  },
};
