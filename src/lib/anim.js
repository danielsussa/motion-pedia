// Helpers compartilhados pelos motions: tempo, easing, aleatoriedade determinística e cor.

export const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Progresso 0..1 de t dentro da janela [a, b].
export const seg = (t, a, b) => clamp((t - a) / (b - a));

export const ease = {
  linear: (t) => t,
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inExpo: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
};

// PRNG com seed (mulberry32) — use sempre isso no lugar de Math.random para o motion ser reproduzível.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgba = (hex, a = 1) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
}

export const fract = (x) => x - Math.floor(x);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

Object.assign(ease, {
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuart: (t) => 1 - (1 - t) ** 4,
  inBack: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
});

// Progresso com easing dentro da janela [a, b].
export const win = (t, a, b, fn = ease.inOutCubic) => fn(seg(t, a, b));

// Mola analítica (pura em x ∈ 0..1): sobe com overshoot e assenta em 1.
export function spring(x, bounce = 0.3) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 - Math.exp(-7 * x) * Math.cos(x * Math.PI * (1 + bounce * 6));
}
export const springWin = (t, a, b, bounce) => spring(seg(t, a, b), bounce);

// Atraso do item i de n, espalhando os inícios por `spread` segundos.
export const stagger = (i, n, spread) => (n > 1 ? (i / (n - 1)) * spread : 0);

// Keyframes: [[t, valor], ...] — valor numérico ou objeto de números. Easing por segmento: [t, v, easeFn].
export function keys(t, frames, fn = ease.inOutCubic) {
  const mixv = (a, b, k) =>
    typeof a === 'number' ? lerp(a, b, k) : Object.fromEntries(Object.keys(a).map((key) => [key, lerp(a[key], b[key], k)]));
  const first = frames[0][1];
  if (t <= frames[0][0]) return typeof first === 'number' ? first : { ...first };
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1, f] = frames[i];
    const [t0, v0] = frames[i - 1];
    if (t <= t1) return mixv(v0, v1, (f ?? fn)(seg(t, t0, t1)));
  }
  const last = frames[frames.length - 1][1];
  return typeof last === 'number' ? last : { ...last };
}
