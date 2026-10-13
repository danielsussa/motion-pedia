import { TAU, clamp, lerp, seg, ease, rng, spring, rgba } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Letras-balão de papel metalizado. No setup, cada letra vira um sprite: alpha = máscara (quinas
// arredondadas), vermelho = máscara desfocada (≈ distância até a borda). Por quadro, os sprites são
// desenhados num campo de meia resolução com o balanço de cada letra, e o shader transforma o campo em
// altura (aba lisa na borda + domo inflado), tira a normal por diferenças e reflete um estúdio falso
// (céu claro, horizonte escuro, duas softboxes) tingido pela cor do metal. A luz fica parada na tela,
// então o reflexo corre pela letra quando ela balança — é o que vende o "metalizado".
const FRAG = `
uniform sampler2D u_f;
uniform vec3 u_tint;
uniform float u_W;
uniform float u_step;
uniform float u_shine;
float hgt(vec2 uv) {
  vec4 c = texture(u_f, uv);
  float b = c.r;
  // aba plana (b < 0.56) e domo depois da costura
  float dome = sqrt(smoothstep(0.56, 1.0, b));
  return (0.12 + 0.88 * dome) * smoothstep(0.0, 0.6, c.a);
}
vec3 env(vec3 r) {
  float y = r.y;
  vec3 c = mix(u_tint * 0.18, u_tint * 1.05, smoothstep(-0.55, 0.75, y));
  c = mix(c, u_tint * 0.12, exp(-pow((y + 0.08) * 6.0, 2.0)) * 0.85);      // horizonte escuro
  c += vec3(1.0) * 0.85 * exp(-pow((r.x + 0.42) * 5.0, 2.0)) * smoothstep(0.05, 0.45, y);  // softbox esquerda
  c += vec3(1.0) * 0.55 * exp(-pow((r.x - 0.5) * 9.0, 2.0)) * smoothstep(0.2, 0.6, y) * smoothstep(0.95, 0.6, y);
  c += u_tint * 0.35 * smoothstep(-0.4, -0.9, y);                         // rebote do chão
  return c;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec4 c = texture(u_f, uv);
  if (c.a < 0.004) { outColor = vec4(0.0); return; }
  vec2 e = vec2(u_step) / u_res;
  float hx = hgt(uv + vec2(e.x, 0.0)) - hgt(uv - vec2(e.x, 0.0));
  float hy = hgt(uv + vec2(0.0, e.y)) - hgt(uv - vec2(0.0, e.y));
  float k = u_W / (2.0 * u_step);
  vec3 n = normalize(vec3(-hx * k, -hy * k, 1.0));
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  r = normalize(vec3(r.x, r.y + 0.35, r.z));        // câmera um pouco abaixo: mais céu no reflexo
  vec3 col = env(r);
  // costura: fio escuro onde a aba vira domo
  float b = c.r;
  col *= 1.0 - 0.45 * exp(-pow((b - 0.565) * 40.0, 2.0));
  // borda externa da aba um pouco mais escura (espessura do metal)
  col *= 0.7 + 0.3 * smoothstep(0.5, 0.55, b);
  // brilho especular duro
  vec3 L = normalize(vec3(-0.5, 0.65, 0.6));
  float sp = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 48.0);
  col += vec3(1.0) * sp * u_shine;
  float a = smoothstep(0.08, 0.6, c.a);
  outColor = vec4(col * a, a);
}`;

const Q = 0.5;

export default {
  id: 'balloon-type',
  title: 'Balloon Type',
  description: 'Letters inflated like foil balloons, with seamed edges and studio reflections, that rise, sway and float away.',
  category: 'tipografia',
  tags: ['typography', 'intro', '3d', 'shader', 'alpha'],
  duration: 7,
  poster: 3.2,

  params: {
    text: { type: 'text', label: 'Text', default: 'PARTY' },
    size: { type: 'range', label: 'Size', min: 0.15, max: 0.6, step: 0.01, default: 0.4 },
    foil: { type: 'color', label: 'Foil', default: '#e6b85c' },
    sway: { type: 'range', label: 'Sway', min: 0, max: 2, step: 0.05, default: 1 },
    shine: { type: 'range', label: 'Shine', min: 0, max: 1.5, step: 0.05, default: 0.8 },
    strings: { type: 'boolean', label: 'Strings', default: true },
    bg: { type: 'color', label: 'Background', default: '#15141a' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p, px }) {
    const s = px * Q;
    const m = Math.min(w, h);
    const chars = [...(p.text.trim() || ' ')];
    const font = (z) => `900 ${z}px Inter, system-ui, sans-serif`;
    const mc = document.createElement('canvas').getContext('2d');
    let fs = m * p.size;
    mc.font = font(fs);
    const gap = fs * 0.02;
    const widths = () => chars.map((ch) => mc.measureText(ch).width);
    let ws = widths();
    let total = ws.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
    if (total > w * 0.88) {
      fs *= (w * 0.88) / total;
      mc.font = font(fs);
      ws = widths();
      total = ws.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
    }
    const capH = fs * 0.727;
    const pad = fs * 0.12;
    const R = rng(p.seed * 131 + 7);
    const letters = [];
    let x = w / 2 - total / 2;
    for (let i = 0; i < chars.length; i++) {
      const cw = ws[i];
      const cx = x + cw / 2;
      x += cw + gap;
      if (chars[i] === ' ') continue;
      // sprite: caixa da letra + folga, em px do campo
      const bw = cw + pad * 2;
      const ext = fs * 0.22; // acentos e cedilha
      const bh = capH + (pad + ext) * 2;
      const SW = Math.max(2, Math.ceil(bw * s));
      const SH = Math.max(2, Math.ceil(bh * s));
      const c = document.createElement('canvas');
      c.width = SW;
      c.height = SH;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.scale(s, s);
      g.font = font(fs);
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#fff';
      // máscara arredondada: desfoca e corta em 0,5
      g.filter = `blur(${fs * 0.035 * s}px)`;
      g.fillText(chars[i], bw / 2, pad + ext + capH);
      g.filter = 'none';
      const md = g.getImageData(0, 0, SW, SH);
      const A = new Uint8ClampedArray(SW * SH);
      for (let k = 0; k < SW * SH; k++) {
        const v = md.data[k * 4 + 3] / 255;
        A[k] = clamp((v - 0.5) * 6 + 0.5) * 255; // corte suave (antialias de ~1/6)
      }
      // "distância": máscara desfocada com raio ~ meia haste
      for (let k = 0; k < SW * SH; k++) {
        md.data[k * 4] = md.data[k * 4 + 1] = md.data[k * 4 + 2] = 255;
        md.data[k * 4 + 3] = A[k];
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, SW, SH);
      g.putImageData(md, 0, 0);
      const t2 = document.createElement('canvas');
      t2.width = SW;
      t2.height = SH;
      const g2 = t2.getContext('2d', { willReadFrequently: true });
      g2.filter = `blur(${fs * 0.07 * s}px)`;
      g2.drawImage(c, 0, 0);
      const bd = g2.getImageData(0, 0, SW, SH).data;
      const out = g.createImageData(SW, SH);
      for (let k = 0; k < SW * SH; k++) {
        const b = bd[k * 4 + 3];
        out.data[k * 4] = b;
        out.data[k * 4 + 1] = b;
        out.data[k * 4 + 2] = b;
        out.data[k * 4 + 3] = A[k];
      }
      g.putImageData(out, 0, 0);
      letters.push({
        c, cx, bw, bh, i,
        ph: R(), ph2: R(), amp: 0.7 + 0.6 * R(),
        tin: 0.15 + i * 0.12 + R() * 0.1,
        tout: 5.6 + i * 0.07 + R() * 0.25,
      });
    }
    const FW = Math.max(2, Math.round(w * s));
    const FH = Math.max(2, Math.round(h * s));
    const field = document.createElement('canvas');
    field.width = FW;
    field.height = FH;
    return { letters, fs, capH, s, field, FW, FH, W: fs * 0.11 * px };
  },

  render(ctx, t, { w, h, p, px, progress, state }) {
    const { letters, fs, capH, s, field, FW, FH } = state;
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const cy = h / 2 + (h > w ? -h * 0.04 : 0);

    // pose de cada letra: entra de baixo com mola, balança, sai para cima
    const poses = letters.map((L) => {
      const inK = spring(seg(t, L.tin, L.tin + 1.5), 0.2);
      const outK = ease.inCubic(seg(t, L.tout, L.tout + 1.1));
      const sw = p.sway * L.amp;
      const rot = sw * (0.055 * Math.sin(TAU * (2 * progress + L.ph)) + 0.025 * Math.sin(TAU * (3 * progress + L.ph2)))
        + (1 - inK) * 0.25 * (L.ph - 0.5);
      const bob = sw * fs * 0.035 * Math.sin(TAU * (2 * progress + L.ph2));
      const y = cy + bob + (1 - inK) * (h * 0.5 + capH) - outK * (h * 0.5 + capH * 1.6);
      const x = L.cx + sw * fs * 0.02 * Math.sin(TAU * (1 * progress + L.ph));
      const sc = lerp(0.55, 1, clamp(inK * 1.3));
      return { x, y, rot, sc, vis: inK > 0.001 && outK < 0.999 };
    });

    // fitas: da base de cada letra até fora da tela, com curva que segue o balanço atrasado
    if (p.strings) {
      ctx.lineWidth = Math.max(1, fs * 0.006);
      ctx.strokeStyle = rgba(p.foil, 0.55);
      ctx.beginPath();
      letters.forEach((L, k) => {
        const q = poses[k];
        if (!q.vis) return;
        const bx = q.x - Math.sin(q.rot) * capH * 0.5 * q.sc;
        const by = q.y + Math.cos(q.rot) * capH * 0.5 * q.sc;
        const lagRot = p.sway * L.amp * 0.05 * Math.sin(TAU * (2 * progress + L.ph) - 1.2);
        const len = h * 1.2;
        ctx.moveTo(bx, by);
        ctx.bezierCurveTo(bx - lagRot * len * 0.4, by + len * 0.3, bx + lagRot * len * 0.9, by + len * 0.6, bx + lagRot * len * 0.3, by + len);
      });
      ctx.stroke();
    }

    // campo
    const f = field.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.clearRect(0, 0, FW, FH);
    letters.forEach((L, k) => {
      const q = poses[k];
      if (!q.vis) return;
      f.setTransform(s, 0, 0, s, 0, 0);
      f.translate(q.x, q.y);
      f.rotate(q.rot);
      f.scale(q.sc, q.sc);
      f.drawImage(L.c, -L.bw / 2, -L.bh / 2, L.bw, L.bh);
    });
    f.setTransform(1, 0, 0, 1, 0, 0);

    shader(ctx, FRAG, {
      u_f: field,
      u_tint: p.foil,
      u_W: state.W,
      u_step: Math.max(1, 1.5 / Q),
      u_shine: p.shine,
    }, { w, h, px });
  },
};
