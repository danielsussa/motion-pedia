import { seg, ease } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

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

// Braços em espiral logarítmica, duas famílias alternadas (cor 1 / cor 2). s = coordenada "de braço":
// cada unidade de s é um braço; o par repete a cada 2. A cobertura de cada braço é o pulso [o, o+d)
// integrado numa janela b (desfoque de giro analítico, exato): com d = 1 os pares fecham a tela.
const FRAG = `
uniform vec2 u_c;       // centro (px reais, origem embaixo)
uniform float u_R;      // raio até o canto mais longe (px reais)
uniform float u_arms;   // número de braços (par)
uniform float u_twist;  // torção da espiral
uniform float u_rot;    // giro em unidades de braço
uniform float u_blur;   // desfoque de giro em unidades de braço
uniform float u_u;      // progresso da fase (0..1)
uniform float u_phase;  // 0 = fechando, 1 = abrindo
uniform float u_lead;   // quanto o centro vai na frente
uniform float u_zoom;   // fase dos anéis de zoom
uniform float u_streak; // intensidade das estrias radiais
uniform vec3 u_c1;
uniform vec3 u_c2;
float h1(float i, float n) { i = mod(i, n); return fract(sin(i * 127.1 + 31.7) * 43758.5453); }
// ruído de valor periódico no ângulo (f células por volta): estrias radiais baratas
float anoise(float x, float f) {
  float i = floor(x * f), k = fract(x * f);
  k = k * k * (3.0 - 2.0 * k);
  return mix(h1(i, f), h1(i + 1.0, f), k) * 2.0 - 1.0;
}
float G(float x, float o, float d) {
  float y = x - o;
  return floor(y * 0.5) * d + min(mod(y, 2.0), d);
}
float cover(float s, float b, float o, float d) {
  return (G(s + 0.5 * b, o, d) - G(s - 0.5 * b, o, d)) / b;
}
void main() {
  vec2 q = gl_FragCoord.xy - u_c;
  float r = max(length(q), 0.5);
  float a = atan(q.y, q.x);
  float rn = r / u_R;
  float s = u_arms * a / 6.28318530718 + u_twist * log(rn) - u_rot;
  float pix = sqrt(pow(u_arms / 6.28318530718, 2.0) + u_twist * u_twist) / r;
  float b = max(max(u_blur, pix * 1.2), 1e-4);
  float d;
  float o1 = 0.0;
  if (u_phase < 0.5) {
    d = clamp(u_u * (1.0 + u_lead) - u_lead * rn, 0.0, 1.0);
  } else {
    d = clamp((1.0 - u_u) * (1.0 + u_lead) - u_lead * (1.0 - rn), 0.0, 1.0);
    o1 = 1.0 - d;
  }
  float a1 = 0.0, a2 = 0.0;
  if (d > 0.0) {
    a1 = clamp(cover(s, b, o1, d), 0.0, 1.0);
    a2 = clamp(cover(s, b, o1 + 1.0, d), 0.0, 1.0);
  }
  float A = d >= 1.0 ? 1.0 : min(1.0, a1 + a2);
  if (A <= 0.0) { outColor = vec4(0.0); return; }
  // cor média do que a janela de desfoque cobre (com d = 1, metade de cada)
  vec3 col = (u_c1 * a1 + u_c2 * a2) / max(a1 + a2, 1e-4);
  // estrias radiais (blur de zoom) e anéis que correm para fora
  float an = a / 6.28318530718 + 0.5;
  float st = anoise(an, 37.0) * 0.6 + anoise(an, 113.0) * 0.4;
  float ring = 0.5 + 0.5 * sin(log(rn + 0.02) * 9.0 - u_zoom);
  float sh = 1.0 + u_streak * (0.22 * st - 0.12 * ring) - 0.28 * u_streak * (1.0 - smoothstep(0.0, 0.35, rn));
  outColor = vec4(clamp(col * sh, 0.0, 1.0) * A, A);
}
`;

const RES = 0.5;

// Giro acumulado (voltas): acelera até o meio e desacelera depois, sem parar no corte.
function spin(t, mid, dur) {
  if (t < mid) return 0.5 * ease.inCubic(seg(t, 0, mid)) + 0.25 * seg(t, 0, mid);
  return 0.75 + 0.5 * ease.outCubic(seg(t, mid, dur)) + 0.25 * seg(t, mid, dur);
}

export default {
  id: 'spin-zoom',
  title: 'Spin Zoom',
  description: 'Spiral arms spin ever faster with spin and zoom blur, close the frame from the center, then keep spinning to open the next scene.',
  category: 'transicoes',
  tags: ['transition', 'shape', 'shader', 'overlay', 'alpha'],
  duration: 1.4,
  poster: 0.4,

  params: {
    color1: { type: 'color', label: 'Color 1', default: '#ff4d2e' },
    color2: { type: 'color', label: 'Color 2', default: '#141418' },
    arms: { type: 'range', label: 'Arms', min: 2, max: 16, step: 2, default: 6 },
    twist: { type: 'range', label: 'Twist', min: -3, max: 3, step: 0.05, default: 1.2 },
    turns: { type: 'range', label: 'Turns', min: 0.25, max: 2, step: 0.05, default: 0.8 },
    blur: { type: 'range', label: 'Spin blur', min: 0, max: 1, step: 0.01, default: 0.6 },
    streaks: { type: 'range', label: 'Zoom streaks', min: 0, max: 1, step: 0.01, default: 0.6 },
    direction: { type: 'select', label: 'Direction', options: ['horário', 'anti-horário'], default: 'horário' },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  render(ctx, t, env) {
    const { w, h, p, px, duration } = env;
    preview(ctx, t, env);
    const mid = duration / 2;
    const closing = t < mid;
    const u = closing ? seg(t, mid * 0.04, mid * 0.94) : seg(t, mid + duration * 0.03, duration * 0.97);
    if (closing && u <= 0) return;
    if (!closing && u >= 1) return;
    const arms = Math.max(2, Math.round(p.arms / 2) * 2);
    // na tela o eixo y desce: "horário" na tela = ângulo GL crescente com y para cima invertido
    const dirS = p.direction === 'anti-horário' ? -1 : 1;
    const turns = p.turns * 2;
    const rot = (tt) => dirS * arms * turns * spin(tt, mid, duration);
    const e = 1 / 240;
    const vel = Math.abs(rot(Math.min(duration, t + e)) - rot(Math.max(0, t - e))) / (2 * e);
    const blur = Math.min(0.7, vel * 0.012 * p.blur);
    const R = Math.hypot(w, h) / 2 + 2;
    const easeU = 0.5 * ease.inOutCubic(u) + 0.5 * (closing ? ease.inCubic(u) : ease.outCubic(u));
    shader(
      ctx,
      FRAG,
      {
        u_c: [(w / 2) * px * RES, (h / 2) * px * RES],
        u_R: R * px * RES,
        u_arms: arms,
        u_twist: p.twist,
        u_rot: rot(t),
        u_blur: blur,
        u_u: easeU,
        u_phase: closing ? 0 : 1,
        u_lead: 0.6,
        u_zoom: (closing ? 1 : -1) * 18 * ease.inOutSine(u) + (closing ? 0 : 18),
        u_streak: p.streaks,
        u_c1: p.color1,
        u_c2: p.color2,
      },
      // meia resolução: as bordas já são borradas pelo giro (pixel do shader = 2 px reais)
      { w, h, px: px * RES },
    );
  },
};
