import { TAU, rng, rgba, mixHex, fract } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';

// Chama em shader: fbm de simplex subindo, moldado por um perfil (fogueira = parábola, parede = faixa)
// e mapeado numa rampa de cor. Loop perfeito por crossfade de dois campos defasados em uma duração:
//   n(t) = mix(F(t), F(t − D), t/D) / √(k² + (1−k)²)   (a divisão repõe o contraste no meio do crossfade)
// O shader roda em meia resolução (é tudo suave) e sai com alpha pré-multiplicado → serve como overlay.
// Estilo "pixel" quantiza a grade e a rampa (cara de Doom fire). Brasas em Canvas 2D por cima.

const FRAG = `
uniform float u_dur;
uniform float u_height;
uniform float u_width;
uniform float u_base;
uniform float u_wall;
uniform float u_turb;
uniform float u_speed;
uniform float u_seed;
uniform float u_pix;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
${GLSL_NOISE}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + vec3(1.7, -3.1, 0.0); a *= 0.5; }
  return s;
}
float field(vec2 q, float tt){
  return fbm(vec3(q.x * 4.6, q.y * 2.4 - tt * u_speed, tt * 0.25 + u_seed));
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  if (u_pix > 0.0) fc = (floor(fc / u_pix) + 0.5) * u_pix;
  float S = min(u_res.x, u_res.y);
  vec2 q = (fc - vec2(u_res.x * 0.5, 0.0)) / S;
  float k = clamp(u_time / u_dur, 0.0, 1.0);
  float n = mix(field(q, u_time), field(q, u_time - u_dur), k) / sqrt(k * k + (1.0 - k) * (1.0 - k));
  float yn = (q.y - u_base) / u_height;
  float heat;
  if (u_wall > 0.5) {
    heat = 1.0 - yn + n * u_turb * (0.35 + yn);
  } else {
    float xd = q.x + n * 0.13 * u_turb * (0.1 + yn);
    float W = u_width * (1.0 - 0.5 * clamp(yn, 0.0, 1.0));
    float wn = xd / W;
    heat = 1.0 - yn + n * u_turb * (0.45 + 1.1 * yn) - wn * wn * 0.8;
    heat *= smoothstep(-0.1, 0.04, yn + 0.12 * (1.0 - wn * wn));
  }
  heat -= smoothstep(0.85, 1.45, yn) * 1.2; // nada de bolhas soltas lá em cima
  heat = clamp(heat, 0.0, 1.2);
  if (u_pix > 0.0) heat = floor(heat * 14.0) / 14.0;
  vec3 col = mix(u_c1 * 0.25, u_c1, smoothstep(0.08, 0.38, heat));
  col = mix(col, u_c2, smoothstep(0.38, 0.68, heat));
  col = mix(col, u_c3, smoothstep(0.68, 1.0, heat));
  float a = smoothstep(0.02, 0.16, heat);
  outColor = vec4(col * a, a);
}`;

export default {
  id: 'fire',
  title: 'Fire',
  description: 'Procedural shader fire — a campfire or a wall of flames — with loose embers rising, in a seamless loop.',
  category: 'particulas',
  tags: ['particles', 'loop', 'shader', 'overlay', 'alpha'],
  duration: 6,

  params: {
    shape: { type: 'select', label: 'Shape', options: ['fogueira', 'parede'], default: 'fogueira' },
    c1: { type: 'color', label: 'Ember', default: '#e0321b' },
    c2: { type: 'color', label: 'Flame', default: '#ff9a2e' },
    c3: { type: 'color', label: 'Core', default: '#fff1c4' },
    bg: { type: 'color', label: 'Background', default: '#0d0a0a' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    height: { type: 'range', label: 'Height', min: 0.2, max: 1, step: 0.01, default: 0.55 },
    turbulence: { type: 'range', label: 'Turbulence', min: 0.2, max: 1.5, step: 0.01, default: 0.85 },
    embers: { type: 'range', label: 'Embers', min: 0, max: 200, step: 1, default: 70 },
    pixel: { type: 'boolean', label: 'Pixel style (Doom)', default: false },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  setup({ p }) {
    const rand = rng(p.seed);
    const embers = Array.from({ length: p.embers }, () => ({
      laps: 1 + Math.floor(rand() * 3),
      r: rand(),
      x: rand() * 2 - 1,
      rise: 0.55 + rand() * 0.9, // altura alcançada (× altura da chama)
      sw: 1 + Math.floor(rand() * 3),
      swP: rand() * TAU,
      swA: 0.02 + rand() * 0.05,
      fl: 3 + Math.floor(rand() * 6),
      size: 0.5 + rand() * rand() * 1.4,
    }));
    return { embers };
  },

  render(ctx, t, env) {
    const { w, h, p, px, duration } = env;
    const S = Math.min(w, h);
    const u = t / duration;
    const wall = p.shape === 'parede';
    const base = wall ? 0 : 0.07; // em unidades de S
    const H = p.height * (wall ? 0.75 : 1);
    const width = 0.17 + 0.12 * p.height;
    const cx = w / 2;
    const by = h - base * S;
    const flick = 0.85 + 0.08 * Math.sin(TAU * 7 * u) + 0.07 * Math.sin(TAU * 13 * u + 1.3);

    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      // luz da chama no ambiente (mesma cor, só alpha)
      const gy = by - H * S * 0.3;
      const R = Math.max(w, h) * (wall ? 0.9 : 0.75);
      const g = ctx.createRadialGradient(cx, gy, 0, cx, gy, R);
      g.addColorStop(0, rgba(p.c2, 0.22 * flick));
      g.addColorStop(0.35, rgba(p.c1, 0.09 * flick));
      g.addColorStop(1, rgba(p.c1, 0));
      ctx.fillStyle = g;
      if (wall) {
        ctx.save();
        ctx.translate(cx, h);
        ctx.scale(w / Math.max(S, 1) * 0.9, 1);
        ctx.translate(-cx, -h);
        ctx.fillRect(-w * 4, 0, w * 9, h);
        ctx.restore();
      } else ctx.fillRect(0, 0, w, h);
    }

    // chama (meia resolução; no estilo pixel, sem suavização no upscale)
    const pixel = p.pixel;
    const scale = 0.5;
    const pix = pixel ? Math.max(2, Math.round(S * px * scale * 0.009)) : 0;
    const prevSmooth = ctx.imageSmoothingEnabled;
    if (pixel) ctx.imageSmoothingEnabled = false;
    shader(ctx, FRAG, {
      u_time: t,
      u_dur: duration,
      u_height: H,
      u_width: width,
      u_base: base,
      u_wall: wall,
      u_turb: p.turbulence,
      u_speed: 1.1,
      u_seed: p.seed * 3.17,
      u_pix: pix,
      u_c1: p.c1,
      u_c2: p.c2,
      u_c3: p.c3,
    }, { w, h, px: px * scale });
    ctx.imageSmoothingEnabled = prevSmooth;

    // fogueira: lenha cruzada na base (silhueta com a borda de cima acesa) esconde o pé da chama
    if (!wall) {
      const L = width * S * 1.05;
      const th = S * 0.042;
      const logCol = mixHex(p.bg, '#3a2216', 0.45);
      for (const [ang, dy] of [[-0.2, 0.0], [0.2, 0.006]]) {
        ctx.save();
        ctx.translate(cx, by + S * (0.012 + dy));
        ctx.rotate(ang);
        ctx.fillStyle = logCol;
        ctx.beginPath();
        ctx.roundRect(-L, -th / 2, L * 2, th, th / 2);
        ctx.fill();
        const lit = ctx.createLinearGradient(-L, 0, L, 0);
        lit.addColorStop(0, rgba(p.c1, 0));
        lit.addColorStop(0.5, rgba(p.c2, 0.75 * flick));
        lit.addColorStop(1, rgba(p.c1, 0));
        ctx.strokeStyle = lit;
        ctx.lineWidth = th * 0.22;
        ctx.beginPath();
        ctx.moveTo(-L * 0.9, -th * 0.38);
        ctx.lineTo(L * 0.9, -th * 0.38);
        ctx.stroke();
        ctx.restore();
      }
    }

    // brasas: sobem da base, balançam, cintilam e encolhem até sumir
    const glow = new Path2D();
    const core = new Path2D();
    const spread = wall ? w / 2 : width * S * 0.9;
    for (const e of env.state.embers) {
      const s = fract(u * e.laps + e.r);
      const k = Math.floor(u * e.laps + e.r) % e.laps;
      const xh = fract(e.x * 0.5 + 0.5 + k * 0.618); // muda a cada passagem, fecha o loop
      const life = Math.sin(Math.PI * s);
      const fl = 0.6 + 0.4 * Math.sin(TAU * e.fl * (u * e.laps) + e.swP);
      const r = S * 0.0032 * e.size * life * fl;
      if (r < 0.2) continue;
      const y = by - s * H * S * e.rise * 1.35 - S * 0.04;
      const x = cx + (xh * 2 - 1) * spread * (1 - s * 0.4) + Math.sin(TAU * e.sw * (u * e.laps) + e.swP) * e.swA * S * (0.3 + s);
      core.moveTo(x + r, y);
      core.arc(x, y, r, 0, TAU);
      glow.moveTo(x + r * 3.2, y);
      glow.arc(x, y, r * 3.2, 0, TAU);
    }
    ctx.save();
    ctx.globalCompositeOperation = p.transparent ? 'source-over' : 'lighter';
    ctx.fillStyle = rgba(p.c2, 0.16);
    ctx.fill(glow);
    ctx.fillStyle = mixHex(p.c2, p.c3, 0.5);
    ctx.fill(core);
    ctx.restore();
  },
};
