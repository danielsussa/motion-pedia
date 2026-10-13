import { TAU, seg, ease, clamp } from '../lib/anim.js';
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

// Raio de "cobertura" (r tal que a forma de tamanho r contém o círculo de raio 1) por forma.
const INNER = { 'círculo': 1, 'quadrado arredondado': 1, 'estrela': 0.5, 'losango': Math.SQRT1_2 };

// Contorno da forma de "raio" r centrada na origem (sub-path, sem beginPath).
function shapePath(ctx, shape, r, rot) {
  if (r <= 0) return;
  if (shape === 'círculo') {
    ctx.moveTo(r, 0);
    ctx.arc(0, 0, r, 0, TAU);
    return;
  }
  if (shape === 'estrela') {
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * INNER['estrela'] : r;
      if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    return;
  }
  if (shape === 'losango') {
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    return;
  }
  // quadrado arredondado (meio-lado r, raio de canto 0.32r), girado
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const k = r * 0.32;
  const pts = [];
  for (const [qx, qy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    // canto arredondado: arco de centro (qx(r-k), qy(r-k))
    const ccx = qx * (r - k);
    const ccy = qy * (r - k);
    const a0 = Math.atan2(qy, qx) - Math.PI / 4;
    for (let j = 0; j <= 6; j++) {
      const a = a0 + (j / 6) * (Math.PI / 2);
      pts.push([ccx + Math.cos(a) * k, ccy + Math.sin(a) * k]);
    }
  }
  pts.forEach(([x, y], i) => {
    const X = x * c - y * s;
    const Y = x * s + y * c;
    if (i) ctx.lineTo(X, Y);
    else ctx.moveTo(X, Y);
  });
  ctx.closePath();
}

// Ponto mais "interno" da máscara alfa do logo (transformada de distância chamfer).
function logoCore(img) {
  const N = 128;
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
  for (let i = 0; i < W * H; i++) d[i] = a[i * 4 + 3] > 200 ? 1e9 : 0;
  const D1 = 1;
  const D2 = Math.SQRT2;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      d[i] = Math.min(d[i], d[i - 1] + D1, d[i - W] + D1, d[i - W - 1] + D2, d[i - W + 1] + D2);
    }
  for (let y = H - 2; y > 0; y--)
    for (let x = W - 2; x > 0; x--) {
      const i = y * W + x;
      d[i] = Math.min(d[i], d[i + 1] + D1, d[i + W] + D1, d[i + W + 1] + D2, d[i + W - 1] + D2);
    }
  // maior distância, com leve preferência pelo centro da imagem
  let best = -1, bx = W / 2, by = H / 2, bd = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const v = d[y * W + x];
      const score = v - 0.15 * Math.hypot(x - W / 2, y - H / 2);
      if (v > 0 && score > best) [best, bx, by, bd] = [score, x, y, v];
    }
  if (bd <= 0) return null;
  // em unidades onde o logo tem maior lado = 1, centrado em (0,0)
  const u = 1 / Math.max(cw, ch);
  return {
    fx: (bx - 1 - cw / 2) * u,
    fy: (by - 1 - ch / 2) * u,
    r: Math.max(0, bd - 1.5) * u, // margem do chamfer/anti-alias
    aw: cw * u,
    ah: ch * u,
  };
}

export default {
  id: 'iris',
  title: 'Iris Zoom',
  description: 'Uma forma nasce num ponto e cresce até virar a tela inteira; depois um buraco da mesma forma se abre revelando a próxima cena.',
  category: 'transicoes',
  tags: ['transição', 'forma', 'alpha'],
  duration: 1.6,
  poster: 0.6,

  params: {
    shape: { type: 'select', label: 'Forma', options: ['círculo', 'quadrado arredondado', 'estrela', 'losango', 'logo'], default: 'círculo' },
    logo: { type: 'image', label: 'Logo (forma "logo")', default: '/samples/logo.svg' },
    color: { type: 'color', label: 'Cor', default: '#ff4d2e' },
    fringe: { type: 'range', label: 'Franja RGB', min: 0, max: 1, step: 0.01, default: 0.6 },
    fringeA: { type: 'color', label: 'Franja 1', default: '#00e1ff' },
    fringeB: { type: 'color', label: 'Franja 2', default: '#ff2fb9' },
    cx: { type: 'range', label: 'Centro X', min: 0, max: 1, step: 0.01, default: 0.5 },
    cy: { type: 'range', label: 'Centro Y', min: 0, max: 1, step: 0.01, default: 0.5 },
    spin: { type: 'range', label: 'Giro', min: -1, max: 1, step: 0.01, default: 0.25 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  setup({ w, h, p, px }) {
    if (p.shape !== 'logo') return {};
    const img = asset(p.logo);
    if (!img) return {};
    const core = logoCore(img);
    if (!core) return {};
    const layer = document.createElement('canvas');
    layer.width = Math.max(1, Math.round(w * px));
    layer.height = Math.max(1, Math.round(h * px));
    return { img, core, layer, lctx: layer.getContext('2d') };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, px, state } = env;
    preview(ctx, t, env);

    const m = Math.min(w, h);
    const mid = duration / 2;
    const ox = w * p.cx;
    const oy = h * p.cy;
    // Distância ao canto mais distante: o que a forma precisa cobrir.
    const R = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy)) + 2;
    const logo = p.shape === 'logo' && state?.core;
    const shape = p.shape === 'logo' && !logo ? 'círculo' : p.shape;

    // "Tamanho" em px de tela: para formas, o raio externo; para o logo, o lado maior.
    const cover = logo ? (R / state.core.r) * 1.02 : (R / INNER[shape]) * 1.02;
    const dot = m * (logo ? 0.16 : 0.035);

    // Fase 1: ponto aparece (mola rápida) e explode em zoom exponencial até cobrir.
    // Fase 2: buraco da mesma forma abre do centro até descobrir tudo.
    const sizeAt = (tt) => {
      if (tt < mid) {
        const pop = ease.outBack(seg(tt, 0, mid * 0.3));
        const z = ease.inOutCubic(seg(tt, mid * 0.1, mid * 0.96)) ** 1.6;
        return dot * pop * Math.exp(Math.log(cover / dot) * z);
      }
      const hd = m * 0.02;
      const pop = ease.outCubic(seg(tt, mid, mid * 1.1));
      const z = ease.inOutCubic(seg(tt, mid * 1.02, duration * 0.96)) ** 0.7;
      return hd * pop * Math.exp(Math.log(cover / hd) * z);
    };
    const hole = t >= mid;
    const S = sizeAt(t);
    if (!hole && S <= 0) return;
    if (hole && S >= cover) return;

    // Franja proporcional à velocidade (some quando parado).
    const dt = 1 / 120;
    const t2 = hole ? Math.max(mid, t - dt) : Math.min(mid - 1e-4, t + dt);
    const vel = Math.abs(sizeAt(t2) - S) / dt / (m * 6); // ~0..1+
    const fr = m * 0.05 * p.fringe * clamp(vel);
    const rot = p.spin * Math.PI * (hole ? ease.outCubic(seg(t, mid, duration)) : -(1 - ease.outCubic(seg(t, 0, mid))));

    // tamanhos das camadas (franjas por fora na entrada, por dentro na saída)
    const sgn = hole ? -1 : 1;
    const layers = [
      { c: p.fringeB, s: S + sgn * fr * 2 },
      { c: p.fringeA, s: S + sgn * fr },
      { c: p.color, s: S },
    ].filter((l) => fr > 0.25 || l.c === p.color);

    if (logo) {
      const { img, core, layer, lctx } = state;
      // Foco: o ponto mais interno do logo fica sobre (ox, oy).
      const drawLogo = (g, s) => {
        if (s <= 0) return;
        g.save();
        g.translate(ox, oy);
        g.rotate(rot);
        g.translate(-core.fx * s, -core.fy * s);
        g.drawImage(img, (-core.aw / 2) * s, (-core.ah / 2) * s, core.aw * s, core.ah * s);
        g.restore();
      };
      const sx = layer.width / w;
      const sy = layer.height / h;
      // Cada camada: desenha no buffer, tinge e compõe sobre o canvas principal.
      const pass = (fill, a, b) => {
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = 'source-over';
        lctx.clearRect(0, 0, layer.width, layer.height);
        lctx.setTransform(sx, 0, 0, sy, 0, 0);
        if (a == null) {
          lctx.fillRect(0, 0, w, h);
        } else drawLogo(lctx, a);
        lctx.globalCompositeOperation = 'source-in';
        lctx.fillStyle = fill;
        lctx.fillRect(0, 0, w, h);
        if (b != null) {
          lctx.globalCompositeOperation = 'destination-out';
          drawLogo(lctx, b);
        }
        lctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(layer, 0, 0, w, h);
      };
      if (!hole) for (const l of layers) pass(l.c, l.s, null);
      else {
        // de fora para dentro: tela cheia menos o logo, depois anéis das franjas
        pass(p.color, null, S);
        let outer = S;
        for (const l of layers.slice(0, -1).reverse()) {
          pass(l.c, outer, l.s);
          outer = l.s;
        }
      }
      return;
    }

    ctx.save();
    ctx.translate(ox, oy);
    if (!hole) {
      for (const l of layers) {
        ctx.fillStyle = l.c;
        ctx.beginPath();
        shapePath(ctx, shape, l.s, rot);
        ctx.fill();
      }
    } else {
      // Tela menos a forma (evenodd), depois anéis da franja para dentro.
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.rect(-ox - 2, -oy - 2, w + 4, h + 4);
      shapePath(ctx, shape, Math.max(0, S), rot);
      ctx.fill('evenodd');
      let outer = S;
      for (const l of layers.slice(0, -1).reverse()) {
        ctx.fillStyle = l.c;
        ctx.beginPath();
        shapePath(ctx, shape, outer, rot);
        shapePath(ctx, shape, Math.max(0, l.s), rot);
        ctx.fill('evenodd');
        outer = l.s;
      }
    }
    ctx.restore();
  },
};
