import { TAU, seg, ease, clamp, rgba } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Antes / depois: o shader desenha a foto original de um lado da alça e a foto tratada (curva em S,
// saturação, split-tone sombras/luzes e vinheta) do outro. A alça vai e volta com pausas entre posições
// (inOutCubic, velocidade zero nas paradas); começa e termina no meio parada, então o loop fecha.
// Etiquetas "ANTES"/"DEPOIS" em pílulas escuras somem quando a alça passa por cima delas.
const SANS = 'Inter, system-ui, sans-serif';

const FRAG = `
uniform sampler2D u_img;
uniform vec4 u_rect;    // retângulo cover normalizado (x, y, w, h), origem em cima à esquerda
uniform float u_split;  // posição da alça (0..1 no eixo do corte)
uniform float u_vert;   // 1 = corte vertical (alça anda em x); 0 = horizontal (anda em y)
uniform float u_aa;     // meia largura de antialias (em fração da tela)
uniform float u_con;
uniform float u_sat;
uniform vec3 u_sh;
uniform vec3 u_hi;
uniform float u_lift;
uniform float u_vig;
void main() {
  vec2 s = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y);
  vec2 uv = (s - u_rect.xy) / u_rect.zw;
  vec3 c = texture(u_img, vec2(uv.x, 1.0 - uv.y)).rgb;

  // tratada
  vec3 g = c;
  g = mix(g, g * g * (3.0 - 2.0 * g), u_con);
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, u_sat);
  g += u_sh * (1.0 - smoothstep(0.0, 0.55, l)) + u_hi * smoothstep(0.35, 1.0, l);
  g = u_lift + g * (1.0 - u_lift);
  vec2 q = s - 0.5;
  g *= 1.0 - u_vig * smoothstep(0.3, 0.85, length(q * vec2(1.0, 0.85)) * 1.15);
  g = clamp(g, 0.0, 1.0);

  float a = u_vert > 0.5 ? s.x : s.y;
  float k = smoothstep(u_split - u_aa, u_split + u_aa, a);
  outColor = vec4(mix(c, g, k), 1.0);
}`;

// looks do lado "depois": contraste (mistura com curva S), saturação, tinta nas sombras, nas luzes, lift, vinheta
const LOOKS = {
  cinema: { con: 0.6, sat: 1.25, sh: [-0.05, 0.015, 0.05], hi: [0.09, 0.025, -0.07], lift: 0.02, vig: 0.4 },
  vívido: { con: 0.45, sat: 1.65, sh: [0, 0, 0.01], hi: [0.03, 0.015, -0.02], lift: 0, vig: 0.3 },
  'p&b': { con: 0.75, sat: 0, sh: [0, 0, 0], hi: [0.02, 0.02, 0.02], lift: 0.03, vig: 0.45 },
  'filme quente': { con: 0.3, sat: 1.05, sh: [0.03, 0.01, -0.02], hi: [0.08, 0.03, -0.06], lift: 0.07, vig: 0.35 },
};

// paradas da alça em fração da duração (posição, chega em, sai em)
const STOPS = [
  [0.5, 0, 0.06],
  [0.2, 0.2, 0.3],
  [0.8, 0.48, 0.58],
  [0.36, 0.72, 0.8],
  [0.5, 0.92, 1],
];

function handleAt(u, amp) {
  let x = STOPS[0][0];
  for (let i = 1; i < STOPS.length; i++) {
    const [v, a] = STOPS[i];
    const b = STOPS[i - 1][2];
    const k = ease.inOutCubic(seg(u, b, a));
    x += (v - STOPS[i - 1][0]) * k;
  }
  return 0.5 + (x - 0.5) * amp;
}

function pill(ctx, text, x, y, align, size, alpha) {
  if (alpha <= 0.001) return;
  ctx.font = `600 ${size}px ${SANS}`;
  ctx.letterSpacing = `${size * 0.2}px`;
  const tw = ctx.measureText(text).width - size * 0.2;
  const padX = size * 1.1;
  const bw = tw + padX * 2;
  const bh = size * 2.5;
  const bx = align === 'left' ? x : x - bw;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(12,12,14,0.5)';
  ctx.beginPath();
  ctx.roundRect(bx, y, bw, bh, bh / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.stroke();
  ctx.fillStyle = '#f4f1ec';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, bx + padX, y + bh / 2 + size * 0.04);
  ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;
  return bw;
}

export default {
  id: 'before-after',
  title: 'Before / After',
  description: 'A handle slides back and forth over the photo, showing the original on one side and the graded version on the other.',
  category: 'imagem',
  tags: ['loop', 'ui', 'shader', 'overlay'],
  duration: 8,
  poster: 2.0,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/landscape.jpg' },
    look: { type: 'select', label: 'Look', options: Object.keys(LOOKS), default: 'cinema' },
    direction: { type: 'select', label: 'Split', options: ['vertical', 'horizontal'], default: 'vertical' },
    labelA: { type: 'text', label: 'Before label', default: 'Before' },
    labelB: { type: 'text', label: 'After label', default: 'After' },
    accent: { type: 'color', label: 'Handle accent', default: '#ff8a4c' },
    amplitude: { type: 'range', label: 'Sweep amplitude', min: 0.3, max: 1.2, step: 0.01, default: 1 },
    zoom: { type: 'range', label: 'Slow zoom', min: 0, max: 0.15, step: 0.01, default: 0.05 },
    focusY: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.45 },
  },

  render(ctx, t, env) {
    const { w, h, p, progress } = env;
    const m = Math.min(w, h);
    const vert = p.direction !== 'horizontal';
    const img = asset(p.image);
    const u = clamp(progress);
    const split = handleAt(u, p.amplitude);

    if (img) {
      const L = LOOKS[p.look] || LOOKS.cinema;
      const z = 1 + p.zoom * (0.5 - 0.5 * Math.cos(TAU * progress));
      const r = coverRect(img, w, h, { zoom: z, fx: 0.5, fy: p.focusY });
      shader(ctx, FRAG, {
        u_img: img,
        u_rect: [r.x / w, r.y / h, r.w / w, r.h / h],
        u_split: split,
        u_vert: vert,
        u_aa: 0.7 / ((vert ? w : h) * env.px),
        u_con: L.con, u_sat: L.sat, u_sh: L.sh, u_hi: L.hi, u_lift: L.lift, u_vig: L.vig,
      }, env);
    } else {
      ctx.fillStyle = '#1a1b1e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#24262a';
      if (vert) ctx.fillRect(w * split, 0, w * (1 - split), h);
      else ctx.fillRect(0, h * split, w, h * (1 - split));
    }

    // etiquetas: some quando a alça encosta
    const size = m * 0.021;
    const mg = m * 0.045;
    const bh = size * 2.5;
    const fadeW = m * 0.05;
    ctx.font = `600 ${size}px ${SANS}`;
    ctx.letterSpacing = `${size * 0.2}px`;
    const A = p.labelA.trim().toUpperCase();
    const B = p.labelB.trim().toUpperCase();
    const wA = ctx.measureText(A).width + size * 2;
    const wB = ctx.measureText(B).width + size * 2;
    ctx.letterSpacing = '0px';
    const sp = vert ? split * w : split * h;
    if (vert) {
      if (A) pill(ctx, A, mg, mg, 'left', size, clamp((sp - (mg + wA + m * 0.04)) / fadeW));
      if (B) pill(ctx, B, w - mg, mg, 'right', size, clamp((w - mg - wB - m * 0.04 - sp) / fadeW));
    } else {
      if (A) pill(ctx, A, mg, mg, 'left', size, clamp((sp - (mg + bh + m * 0.04)) / fadeW));
      if (B) pill(ctx, B, mg, h - mg - bh, 'left', size, clamp((h - mg - bh - m * 0.04 - sp) / fadeW));
    }

    // alça: linha com sombra suave (traços largos de alpha baixo) e botão redondo com setas
    const lw = Math.max(1.5, m * 0.0032);
    const R = m * 0.042;
    const cx = vert ? sp : w / 2;
    const cy = vert ? h / 2 : sp;
    ctx.save();
    ctx.lineCap = 'butt';
    for (const [ww, a] of [[lw * 7, 0.06], [lw * 3.5, 0.1]]) {
      ctx.strokeStyle = `rgba(0,0,0,${a})`;
      ctx.lineWidth = ww;
      ctx.beginPath();
      if (vert) { ctx.moveTo(sp, 0); ctx.lineTo(sp, h); } else { ctx.moveTo(0, sp); ctx.lineTo(w, sp); }
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    if (vert) {
      ctx.fillRect(sp - lw / 2, 0, lw, cy - R);
      ctx.fillRect(sp - lw / 2, cy + R, lw, h - cy - R);
    } else {
      ctx.fillRect(0, sp - lw / 2, cx - R, lw);
      ctx.fillRect(cx + R, sp - lw / 2, w - cx - R, lw);
    }
    // sombra do botão
    for (const [d, a] of [[R * 0.5, 0.05], [R * 0.3, 0.07], [R * 0.14, 0.1]]) {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.arc(cx, cy + R * 0.12, R + d, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(p.accent, 0.9);
    ctx.lineWidth = Math.max(1, R * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.8, 0, TAU);
    ctx.stroke();
    // setas
    ctx.translate(cx, cy);
    if (!vert) ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#1b1c20';
    const a = R * 0.26, gap = R * 0.17;
    ctx.beginPath();
    ctx.moveTo(-gap, -a); ctx.lineTo(-gap - a * 1.05, 0); ctx.lineTo(-gap, a); ctx.closePath();
    ctx.moveTo(gap, -a); ctx.lineTo(gap + a * 1.05, 0); ctx.lineTo(gap, a); ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
};
