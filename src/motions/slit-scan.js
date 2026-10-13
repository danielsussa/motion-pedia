import { TAU } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';
import { SOURCES, createSource } from '../lib/source.js';
import { shader } from '../lib/gl.js';

// Slit-scan: cada faixa da tela (coluna, linha ou anel) mostra o motion de origem num instante diferente,
// atrasado proporcionalmente à posição. Puro em t: a cada render, o source é renderizado nos N instantes
// t − atraso_j (N fatias, resolução reduzida) e as fatias são misturadas com máscaras em gradiente:
// pesos em "tenda" (crossfade entre instantes vizinhos, sem degraus) ou em caixa (fatias duras).
// Com a foto como origem, o efeito é calculado num shader: a foto gira/respira/ondula e cada pixel
// a vê no seu próprio instante.

const PHOTO = `
uniform sampler2D u_img;
uniform vec4 u_rect;   // retângulo cover da foto (px reais): x, y, w, h — origem no topo
uniform float u_T;
uniform float u_P;
uniform float u_delay;
uniform float u_mode;  // 0 colunas, 1 linhas, 2 radial
uniform float u_mirror;
uniform float u_slices;
uniform float u_smooth;
uniform float u_wave;
uniform float u_rot;

float delayAt(vec2 s) {
  float d = u_mode < 0.5 ? s.x : u_mode < 1.5 ? s.y : length((s - 0.5) * u_res) / (0.5 * length(u_res));
  if (u_mirror > 0.5) d = abs(2.0 * d - 1.0);
  d = clamp(d, 0.0, 1.0);
  if (u_smooth < 0.5) d = floor(d * u_slices + 0.5) / u_slices;
  return d;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 s = p / u_res;
  float tau = u_T - delayAt(s) * u_delay;
  float ph = TAU * tau / u_P;
  // movimento da foto no instante tau: giro + respiração + ondulação
  vec2 c = 0.5 * u_res;
  float a = u_rot * sin(ph);
  float z = 1.18 + 0.06 * sin(ph + 1.3);
  vec2 q = p - c;
  q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q / z;
  float m = min(u_res.x, u_res.y);
  q.x += u_wave * m * 0.03 * (sin(TAU * q.y / m * 1.3 + ph * 2.0) + 0.5 * sin(TAU * q.y / m * 3.1 - ph * 3.0));
  q.y += u_wave * m * 0.02 * sin(TAU * q.x / m * 1.1 + ph);
  q += c;
  vec2 uv = (q - u_rect.xy) / u_rect.zw;
  vec3 col = texture(u_img, vec2(uv.x, 1.0 - uv.y)).rgb;
  outColor = vec4(col, 1.0);
}`.replace(/TAU/g, '6.283185307');

export default {
  id: 'slit-scan',
  title: 'Slit Scan',
  description: 'Cada coluna, linha ou anel da tela mostra outro instante de um motion de origem (ou da foto), o que deforma o tempo no espaço.',
  category: 'imagem',
  tags: ['imagem', 'loop', 'fundo'],
  duration: 8,
  poster: 3,

  params: {
    source: { type: 'select', label: 'Origem', options: [...SOURCES, 'foto'], default: 'dot-wave' },
    image: { type: 'image', label: 'Foto (origem = foto)', default: '/samples/landscape.jpg' },
    mode: { type: 'select', label: 'Fatias', options: ['colunas', 'linhas', 'radial'], default: 'colunas' },
    delay: { type: 'range', label: 'Atraso máximo (s)', min: 0.2, max: 6, step: 0.1, default: 3 },
    slices: { type: 'range', label: 'Fatias de tempo', min: 8, max: 48, step: 1, default: 28 },
    smooth: { type: 'boolean', label: 'Suavizar entre fatias', default: true },
    mirror: { type: 'boolean', label: 'Espelhar', default: false },
    wave: { type: 'range', label: 'Ondulação (foto)', min: 0, max: 2, step: 0.05, default: 1 },
    res: { type: 'range', label: 'Resolução da origem', min: 0.15, max: 0.6, step: 0.01, default: 0.3 },
    guides: { type: 'color', label: 'Cor das guias', default: '#ff4d2e' },
    showGuides: { type: 'boolean', label: 'Mostrar guias', default: false },
  },

  setup(env) {
    const { w, h, p, px } = env;
    if (p.source === 'foto') return { photo: true };
    const src = createSource(p.source, env, { scale: p.res });
    const W = src.canvas.width, H = src.canvas.height;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    };
    const acc = mk(), tmp = mk();
    const actx = acc.getContext('2d'), tctx = tmp.getContext('2d');
    // miniaturas (px pequeno): menos fatias — cada fatia é um render inteiro do motion de origem
    const n = px < 0.5 ? Math.min(10, Math.round(p.slices)) : Math.round(p.slices);
    // máscara de cada fatia j: gradiente cujos "nós" são as posições onde o atraso vale k/(n−1)
    const R = Math.hypot(W, H) / 2;
    const grad = () =>
      p.mode === 'colunas' ? tctx.createLinearGradient(0, 0, W, 0)
      : p.mode === 'linhas' ? tctx.createLinearGradient(0, 0, 0, H)
      : tctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R);
    // peso da fatia j em função do atraso normalizado d: "tenda" (crossfade) ou caixa com borda de ~1 px
    const axis = p.mode === 'colunas' ? W : p.mode === 'linhas' ? H : R;
    const eps = 0.6 / axis;
    const weight = (j, d) => {
      if (p.smooth) return Math.max(0, 1 - Math.abs(d * (n - 1) - j));
      const lo = (j - 0.5) / (n - 1), hi = (j + 0.5) / (n - 1);
      return Math.min(1, Math.max(0, Math.min((d - lo + eps) / (2 * eps), (hi + eps - d) / (2 * eps))));
    };
    const dOf = (s) => (p.mirror ? Math.abs(2 * s - 1) : s);
    const sOf = (d) => (p.mirror ? [0.5 - d / 2, 0.5 + d / 2] : [d]);
    const masks = [];
    for (let j = 0; j < n; j++) {
      // nós onde o peso (linear por partes) muda de inclinação → o gradiente reproduz o peso exatamente
      const kd = p.smooth ? [j - 1, j, j + 1].map((k) => k / (n - 1))
        : [(j - 0.5) / (n - 1) - eps, (j - 0.5) / (n - 1) + eps, (j + 0.5) / (n - 1) - eps, (j + 0.5) / (n - 1) + eps];
      const ss = new Set([0, 0.5, 1]);
      for (const d of kd) for (const s of sOf(d)) if (s >= 0 && s <= 1) ss.add(s);
      const g = grad();
      for (const s of [...ss].sort((u, v) => u - v)) g.addColorStop(s, `rgba(0,0,0,${weight(j, dOf(s)).toFixed(4)})`);
      // retângulos onde o peso é > 0 (só eles são processados)
      const ivs = p.smooth ? [[Math.max(0, (j - 1) / (n - 1)), Math.min(1, (j + 1) / (n - 1))]]
        : [[Math.max(0, (j - 0.5) / (n - 1) - eps), Math.min(1, (j + 0.5) / (n - 1) + eps)]];
      const [d0, d1] = ivs[0];
      const rects = [];
      const span = (a, b, L) => [Math.max(0, Math.floor(a * L) - 1), Math.min(L, Math.ceil(b * L) + 1)];
      const sIv = !p.mirror ? [[d0, d1]] : d0 <= 0 ? [[0.5 - d1 / 2, 0.5 + d1 / 2]] : [[0.5 - d1 / 2, 0.5 - d0 / 2], [0.5 + d0 / 2, 0.5 + d1 / 2]];
      for (const [a, b] of sIv) {
        if (p.mode === 'colunas') { const [x0, x1] = span(a, b, W); rects.push([x0, 0, x1 - x0, H]); }
        else if (p.mode === 'linhas') { const [y0, y1] = span(a, b, H); rects.push([0, y0, W, y1 - y0]); }
        else if (!rects.length) {
          const r = Math.ceil(Math.max(Math.abs(a), Math.abs(b), p.mirror ? 0.5 + d1 / 2 : 0) * R) + 1;
          const x0 = Math.max(0, Math.floor(W / 2 - r)), y0 = Math.max(0, Math.floor(H / 2 - r));
          rects.push([x0, y0, Math.min(W, Math.ceil(W / 2 + r)) - x0, Math.min(H, Math.ceil(H / 2 + r)) - y0]);
        }
      }
      masks.push({ g, rects });
    }
    return { photo: false, src, acc, actx, tmp, tctx, masks, n, W, H };
  },

  render(ctx, t, { w, h, p, px, progress, duration, state }) {
    const m = Math.min(w, h);
    if (state.photo) {
      const img = asset(p.image);
      ctx.fillStyle = '#0c0c10';
      ctx.fillRect(0, 0, w, h);
      if (!img) return;
      const r = coverRect(img, w, h);
      shader(ctx, PHOTO, {
        u_img: img,
        u_rect: [r.x * px, r.y * px, r.w * px, r.h * px],
        u_T: progress * duration,
        u_P: duration,
        u_delay: p.delay,
        u_mode: ['colunas', 'linhas', 'radial'].indexOf(p.mode),
        u_mirror: p.mirror,
        u_slices: Math.round(p.slices) - 1,
        u_smooth: p.smooth,
        u_wave: p.wave,
        u_rot: 0.2,
      }, { w, h, px });
    } else {
      const { src, acc, actx, tmp, tctx, masks, n, W, H } = state;
      const T = progress * src.duration;
      actx.globalCompositeOperation = 'copy';
      actx.fillStyle = '#000';
      actx.fillRect(0, 0, W, H);
      actx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < n; j++) {
        const c = src.frame(T - (j / (n - 1)) * p.delay);
        const { g, rects } = masks[j];
        tctx.fillStyle = g;
        for (const [x, y, rw, rh] of rects) {
          if (rw <= 0 || rh <= 0) continue;
          tctx.globalCompositeOperation = 'copy';
          tctx.drawImage(c, x, y, rw, rh, x, y, rw, rh);
          tctx.globalCompositeOperation = 'destination-in';
          tctx.fillRect(x, y, rw, rh);
          actx.drawImage(tmp, x, y, rw, rh, x, y, rw, rh);
        }
      }
      actx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(acc, 0, 0, w, h);
    }

    // guias: limites das fatias, bem discretas
    if (p.showGuides) {
      const n = state.n ?? Math.round(p.slices);
      ctx.save();
      ctx.strokeStyle = p.guides;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(1 / px, m * 0.0012);
      ctx.beginPath();
      const R = Math.hypot(w, h) / 2;
      for (let k = 0; k < n; k++) {
        const d = (k + 0.5) / (n - 1);
        if (d >= 1) break;
        for (const s of p.mirror ? [0.5 - d / 2, 0.5 + d / 2] : [d]) {
          if (p.mode === 'colunas') { ctx.moveTo(s * w, 0); ctx.lineTo(s * w, h); }
          else if (p.mode === 'linhas') { ctx.moveTo(0, s * h); ctx.lineTo(w, s * h); }
          else { ctx.moveTo(w / 2 + s * R, h / 2); ctx.arc(w / 2, h / 2, s * R, 0, TAU); }
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  },
};
