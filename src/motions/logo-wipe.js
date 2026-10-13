import { seg, ease, lerp } from '../lib/anim.js';
import { asset } from '../lib/assets.js';

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

// Ponto mais "interno" da máscara alfa do logo (transformada de distância chamfer) e o raio do
// maior círculo sólido em volta dele. Unidades: maior lado do logo = 1, origem no centro do logo.
function logoCore(img) {
  const N = 160;
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const sc = N / Math.max(iw, ih);
  const cw = Math.max(2, Math.round(iw * sc));
  const ch = Math.max(2, Math.round(ih * sc));
  const cv = document.createElement('canvas');
  cv.width = cw + 2;
  cv.height = ch + 2;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 1, 1, cw, ch);
  const W = cw + 2;
  const H = ch + 2;
  const a = g.getImageData(0, 0, W, H).data;
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = a[i * 4 + 3] > 230 ? 1e9 : 0;
  const D2 = Math.SQRT2;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      d[i] = Math.min(d[i], d[i - 1] + 1, d[i - W] + 1, d[i - W - 1] + D2, d[i - W + 1] + D2);
    }
  for (let y = H - 2; y > 0; y--)
    for (let x = W - 2; x > 0; x--) {
      const i = y * W + x;
      d[i] = Math.min(d[i], d[i + 1] + 1, d[i + W] + 1, d[i + W + 1] + D2, d[i + W - 1] + D2);
    }
  let best = -1, bx = W / 2, by = H / 2, bd = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const v = d[y * W + x];
      const score = v - 0.15 * Math.hypot(x - W / 2, y - H / 2);
      if (v > 0 && score > best) [best, bx, by, bd] = [score, x, y, v];
    }
  if (bd <= 0) return null;
  const u = 1 / Math.max(cw, ch);
  return { fx: (bx - 1 - cw / 2) * u, fy: (by - 1 - ch / 2) * u, r: Math.max(0, bd - 2) * u, aw: cw * u, ah: ch * u };
}

// Logo neutro (enquanto a imagem carrega ou se não carregar): quadrado arredondado.
const FALLBACK = { fx: 0, fy: 0, r: 0.5, aw: 1, ah: 1 };
function roundSquare(g, s) {
  const r = s * 0.24;
  g.beginPath();
  g.roundRect(-s / 2, -s / 2, s, s, r);
  g.fill();
}

export default {
  id: 'logo-wipe',
  title: 'Logo Wipe',
  description: 'O logo surge no centro, a câmera mergulha nele até a cor sólida tomar a tela e a próxima cena se abre por dentro de uma silhueta do logo.',
  category: 'transicoes',
  tags: ['transição', 'forma', 'alpha'],
  duration: 1.8,
  poster: 0.42,

  params: {
    logo: { type: 'image', label: 'Logo', default: '/samples/logo.svg' },
    style: { type: 'select', label: 'Estilo', options: ['cores do logo', 'silhueta'], default: 'cores do logo' },
    color: { type: 'color', label: 'Cor (silhueta)', default: '#111114' },
    accent: { type: 'color', label: 'Borda da abertura', default: '#ff4d2e' },
    rim: { type: 'range', label: 'Espessura da borda', min: 0, max: 1, step: 0.01, default: 0.5 },
    size: { type: 'range', label: 'Tamanho inicial', min: 0.15, max: 0.6, step: 0.01, default: 0.32 },
    hold: { type: 'range', label: 'Pausa no logo', min: 0, max: 1, step: 0.01, default: 0.35 },
    tilt: { type: 'range', label: 'Giro', min: -1, max: 1, step: 0.01, default: 0.2 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  setup({ w, h, p, px }) {
    const img = asset(p.logo);
    const core = img ? logoCore(img) : null;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * px));
      c.height = Math.max(1, Math.round(h * px));
      return c;
    };
    const layer = mk();
    const rimLayer = mk();
    return {
      img: core ? img : null,
      core: core || FALLBACK,
      layer,
      lctx: layer.getContext('2d'),
      rimLayer,
      rctx: rimLayer.getContext('2d'),
    };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    preview(ctx, t, env);
    const { img, core, layer, lctx, rimLayer, rctx } = state;
    const m = Math.min(w, h);
    const mid = duration / 2;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.hypot(w, h) / 2 + 2;
    // Lado maior do logo em que o círculo sólido em volta do foco cobre a tela.
    const cover = (R / core.r) * 1.03;
    const S0 = m * p.size;

    // Desenha o logo de lado s com o ponto (ax, ay) (unidades do logo) no centro da tela.
    const drawLogo = (g, s, ax, ay, rot) => {
      g.save();
      g.translate(cx, cy);
      if (rot) g.rotate(rot);
      g.translate(-ax * s, -ay * s);
      if (img) g.drawImage(img, (-core.aw / 2) * s, (-core.ah / 2) * s, core.aw * s, core.ah * s);
      else roundSquare(g, s);
      g.restore();
    };
    const sx = layer.width / w;
    const sy = layer.height / h;
    const begin = (g) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, layer.width, layer.height);
      g.setTransform(sx, 0, 0, sy, 0, 0);
    };
    const tint = (g, c) => {
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = c;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    };
    const flat = p.style === 'silhueta' || !img;

    if (t < mid) {
      // Entrada com mola, pausa e mergulho acelerado (exponencial no tamanho).
      const holdEnd = mid * (0.22 + 0.4 * p.hold);
      const pop = ease.outBack(seg(t, 0, mid * 0.26));
      const z = seg(t, holdEnd, mid) ** 2.2;
      const breathe = 1 + 0.05 * ease.inOutCubic(seg(t, mid * 0.2, holdEnd)); // leve aproximação na pausa
      const s = S0 * breathe * pop * Math.exp(Math.log(cover / (S0 * breathe)) * z);
      if (s <= 0.5) return;
      const rot = p.tilt * 0.35 * (1 - ease.outCubic(seg(t, 0, mid))) * (1 - z);
      const ax = lerp(0, core.fx, ease.inOutCubic(z ** 0.5));
      const ay = lerp(0, core.fy, ease.inOutCubic(z ** 0.5));
      if (!flat) {
        drawLogo(ctx, s, ax, ay, rot);
        return;
      }
      begin(lctx);
      lctx.fillStyle = p.color;
      drawLogo(lctx, s, ax, ay, rot);
      tint(lctx, p.color);
      ctx.drawImage(layer, 0, 0, w, h);
      return;
    }

    // Saída: a câmera continua avançando e uma silhueta do logo se abre no centro, revelando a cena B.
    const u = seg(t, mid, duration);
    const s = cover * Math.exp(Math.log(2.4) * ease.outCubic(u));
    const hd = m * 0.08;
    const hz = ease.inOutCubic(seg(t, mid + duration * 0.015, duration * 0.97)) ** 0.62;
    const hole = hd * ease.outCubic(seg(t, mid, mid + duration * 0.08)) * Math.exp(Math.log(cover / hd) * hz);
    if (hole >= cover) return;
    const hrot = p.tilt * 0.3 * (1 - ease.outCubic(u));

    begin(lctx);
    lctx.fillStyle = p.color;
    drawLogo(lctx, s, core.fx, core.fy, 0);
    if (flat) tint(lctx, p.color);
    if (hole > 0) {
      // Borda colorida: silhueta um pouco maior, pintada por máscara, por baixo do buraco.
      const rimPx = m * 0.045 * p.rim * (1 - ease.inCubic(hz));
      if (rimPx > 0.5) {
        const k = 1 + rimPx / Math.max(1, hole * core.r);
        begin(rctx);
        rctx.fillStyle = p.accent;
        drawLogo(rctx, hole * k, core.fx, core.fy, hrot);
        tint(rctx, p.accent);
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.drawImage(rimLayer, 0, 0);
        lctx.setTransform(sx, 0, 0, sy, 0, 0);
      }
      lctx.globalCompositeOperation = 'destination-out';
      lctx.fillStyle = '#000';
      drawLogo(lctx, hole, core.fx, core.fy, hrot);
      lctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(layer, 0, 0, w, h);
  },
};
