import { seg, ease, clamp, lerp, rng, smoothstep } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { drawCover } from '../lib/image.js';
import { createNoise } from '../lib/noise.js';

// Pintura impressionista (à la Hertzmann): a foto vira pinceladas em camadas, do pincel grosso ao fino.
// No setup a foto é lida numa grade (~360 células no lado menor) com um desfoque por camada; cada
// pincelada nasce numa célula, pega a cor da referência daquela camada e segue perpendicular ao gradiente
// de luminância (ao longo das bordas; onde a imagem é lisa, um campo de ruído dá a direção), parando
// quando a cor sob o pincel muda demais. As camadas finas só pintam onde a referência delas difere da
// anterior (detalhe). A ordem de pintura mistura ruído espacial e acaso, e cada traço se desenha ao
// longo do próprio comprimento. Para o render não redesenhar milhares de traços, o setup pinta tudo
// uma vez num canvas acumulado e guarda checkpoints; o render desenha o checkpoint e só os traços depois
// dele. Antes da tinta, um esboço a carvão (bordas da foto) aparece sobre a tela crua; no topo, trama
// de tela e vinheta pré-pintadas.

const LAYERS = [
  { r: 0.038, spacing: 1.35, steps: [4, 7], stop: 0.16, dur: 0.5, win: [0.75, 3.5], keep: 1, thr: 0 },
  { r: 0.02, spacing: 1.35, steps: [4, 8], stop: 0.1, dur: 0.4, win: [2.7, 5.6], keep: 0.8, thr: 0.025 },
  { r: 0.0105, spacing: 1.35, steps: [3, 7], stop: 0.08, dur: 0.32, win: [4.7, 7.5], keep: 0.1, thr: 0.03 },
  { r: 0.0052, spacing: 1.35, steps: [3, 6], stop: 0.07, dur: 0.26, win: [6.4, 8.7], keep: 0.02, thr: 0.035 },
];

// perfil da largura ao longo do traço (u = 0..1): ataque curto, corpo, ponta afinando
const prof = (u) => (0.6 + 0.4 * smoothstep(0, 0.16, u)) * (1 - 0.62 * smoothstep(0.55, 1, u));

// caminho Catmull-Rom reamostrado → amostras [x, y, tx, ty] + comprimento acumulado
function buildStroke(pts) {
  const n = pts.length / 2;
  const P = (i) => [pts[clamp(i, 0, n - 1) * 2], pts[clamp(i, 0, n - 1) * 2 + 1]];
  const per = 4;
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push(
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      );
    }
  }
  out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  const m = out.length / 2;
  const S = new Float32Array(m * 4);
  const cum = new Float32Array(m);
  for (let k = 0; k < m; k++) {
    const a = Math.max(0, k - 1), b = Math.min(m - 1, k + 1);
    const tx = out[b * 2] - out[a * 2], ty = out[b * 2 + 1] - out[a * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    S[k * 4] = out[k * 2];
    S[k * 4 + 1] = out[k * 2 + 1];
    S[k * 4 + 2] = tx / tl;
    S[k * 4 + 3] = ty / tl;
    if (k > 0) cum[k] = cum[k - 1] + Math.hypot(out[k * 2] - out[k * 2 - 2], out[k * 2 + 1] - out[k * 2 - 1]);
  }
  return { S, cum, len: cum[m - 1] || 1 };
}

// amostras visíveis até a fração f (a última interpolada) → buffer compartilhado
const VIS = new Float32Array(4 * 64);
function visible(s, f) {
  const { S, cum, len } = s;
  const L = len * f;
  const m = cum.length;
  let k = 0;
  for (; k < m && cum[k] <= L; k++) {
    VIS[k * 4] = S[k * 4]; VIS[k * 4 + 1] = S[k * 4 + 1]; VIS[k * 4 + 2] = S[k * 4 + 2]; VIS[k * 4 + 3] = cum[k] / len;
  }
  if (k < m && k > 0) {
    const a = (L - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    VIS[k * 4] = S[k * 4 - 4] + (S[k * 4] - S[k * 4 - 4]) * a;
    VIS[k * 4 + 1] = S[k * 4 - 3] + (S[k * 4 + 1] - S[k * 4 - 3]) * a;
    VIS[k * 4 + 2] = S[k * 4 + 2];
    VIS[k * 4 + 3] = L / len;
    k++;
  }
  return k;
}

function drawStroke(g, s, f) {
  const k = visible(s, f);
  if (k < 2) return;
  const r = s.r;
  // corpo: polígono com largura variável (VIS[i*4+2] guarda só tx; ty vem das amostras)
  const S = s.S;
  g.globalAlpha = 0.94;
  g.fillStyle = s.col;
  g.beginPath();
  for (let i = 0; i < k; i++) {
    const j = Math.min(i, S.length / 4 - 1) * 4;
    const wd = r * prof(VIS[i * 4 + 3]);
    g.lineTo(VIS[i * 4] - S[j + 3] * wd, VIS[i * 4 + 1] + S[j + 2] * wd);
  }
  {
    // ponta: semicírculo com a largura local
    const j = Math.min(k - 1, S.length / 4 - 1) * 4;
    const at = Math.atan2(S[j + 3], S[j + 2]);
    g.arc(VIS[(k - 1) * 4], VIS[(k - 1) * 4 + 1], r * prof(VIS[(k - 1) * 4 + 3]), at + Math.PI / 2, at - Math.PI / 2, true);
  }
  for (let i = k - 1; i >= 0; i--) {
    const j = Math.min(i, S.length / 4 - 1) * 4;
    const wd = r * prof(VIS[i * 4 + 3]);
    g.lineTo(VIS[i * 4] + S[j + 3] * wd, VIS[i * 4 + 1] - S[j + 2] * wd);
  }
  {
    const a0 = Math.atan2(S[3], S[2]);
    g.arc(VIS[0], VIS[1], r * prof(0), a0 - Math.PI / 2, a0 - Math.PI * 1.5, true);
  }
  g.closePath();
  g.fill();
  // cerdas: fios claros e escuros seguindo o corpo
  g.lineWidth = r * 0.22;
  for (const [off, col, a] of s.bristles) {
    g.globalAlpha = a;
    g.strokeStyle = col;
    g.beginPath();
    for (let i = 0; i < k; i++) {
      const j = Math.min(i, S.length / 4 - 1) * 4;
      const o = off * r * prof(VIS[i * 4 + 3]);
      const x = VIS[i * 4] - S[j + 3] * o, y = VIS[i * 4 + 1] + S[j + 2] * o;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
}

function makeCanvas(W, H) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, W);
  c.height = Math.max(1, H);
  return c;
}

export default {
  id: 'paint-strokes',
  title: 'Pinceladas',
  description: 'A foto se pinta sozinha em pinceladas impressionistas que seguem as formas, do pincel grosso ao fino.',
  category: 'imagem',
  tags: ['intro', 'simulação'],
  duration: 10,
  poster: 9.2,

  params: {
    image: { type: 'image', label: 'Foto', default: '/samples/portrait.jpg' },
    brush: { type: 'range', label: 'Tamanho do pincel', min: 0.6, max: 1.8, step: 0.05, default: 1 },
    detail: { type: 'range', label: 'Camadas de detalhe', min: 1, max: 4, step: 1, default: 4 },
    vivid: { type: 'range', label: 'Saturação', min: 0.6, max: 1.8, step: 0.05, default: 1.1 },
    canvasColor: { type: 'color', label: 'Tela crua', default: '#ebe4d6' },
    sketch: { type: 'boolean', label: 'Esboço a carvão', default: true },
    texture: { type: 'range', label: 'Trama da tela', min: 0, max: 1, step: 0.05, default: 0.5 },
    focusY: { type: 'range', label: 'Foco vertical', min: 0, max: 1, step: 0.01, default: 0.32 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ w, h, p, px }) {
    const sc = Math.max(px, 0.25);
    const m = Math.min(w, h);
    const W = Math.ceil(w * sc), H = Math.ceil(h * sc);
    const R = rng(p.seed * 7919 + 1);

    // trama de tela + vinheta (sobreposição de topo, pré-pintada)
    const over = makeCanvas(W, H);
    {
      const T = 96;
      const tile = makeCanvas(T, T);
      const tg = tile.getContext('2d');
      const id = tg.createImageData(T, T);
      const RT = rng(5);
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          // fios em xadrez (urdidura/trama) + irregularidade
          const wx = Math.sin((x / 3) * Math.PI), wy = Math.sin((y / 3) * Math.PI);
          const weave = ((Math.floor(x / 3) + Math.floor(y / 3)) & 1 ? wx : wy) * 0.6;
          const v = weave + (RT() - 0.5) * 0.9;
          const i = (y * T + x) * 4;
          id.data[i] = id.data[i + 1] = id.data[i + 2] = v > 0 ? 255 : 30;
          id.data[i + 3] = Math.min(255, Math.abs(v) * 70);
        }
      }
      tg.putImageData(id, 0, 0);
      const og = over.getContext('2d');
      const tsc = Math.max(1, Math.round(sc * 1.6)); // a trama acompanha a escala (miniatura: mais fina)
      const pat = og.createPattern(tile, 'repeat');
      pat.setTransform(new DOMMatrix().scale(tsc * 0.6));
      og.globalAlpha = p.texture;
      og.fillStyle = pat;
      og.fillRect(0, 0, W, H);
      og.globalAlpha = 1;
      const vg = og.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, 'rgba(20,14,8,0)');
      vg.addColorStop(1, 'rgba(20,14,8,0.32)');
      og.fillStyle = vg;
      og.fillRect(0, 0, W, H);
    }

    const img = asset(p.image);
    if (!img) return { ready: false, over, W, H };

    // referência em grade (cover), uma versão desfocada por camada
    const G = 360 / m; // células por unidade lógica
    const gw = Math.max(8, Math.round(w * G)), gh = Math.max(8, Math.round(h * G));
    const base = makeCanvas(gw, gh);
    const bg = base.getContext('2d', { willReadFrequently: true });
    bg.filter = `saturate(${p.vivid}) contrast(1.06)`;
    drawCover(bg, img, gw, gh, { fy: p.focusY });
    bg.filter = 'none';
    const nL = clamp(Math.round(p.detail), 1, 4);
    const layers = LAYERS.slice(0, nL).map((L) => ({ ...L, r: L.r * p.brush }));
    // a miniatura não mostra o detalhe mais fino: corta a última camada
    if (sc < 0.5 && layers.length === 4) layers.pop();
    const refs = layers.map((L) => {
      const c = makeCanvas(gw, gh);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(base, 0, 0);
      g.filter = `blur(${Math.max(0.5, L.r * m * G * 0.35)}px)`;
      g.drawImage(base, 0, 0);
      const d = g.getImageData(0, 0, gw, gh).data;
      const lum = new Float32Array(gw * gh);
      for (let i = 0; i < gw * gh; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
      return { d, lum };
    });

    const noise = createNoise(p.seed);
    const at = (x, y) => {
      const gx = clamp(Math.round(x * G), 0, gw - 1), gy = clamp(Math.round(y * G), 0, gh - 1);
      return gy * gw + gx;
    };
    // gradiente (Sobel) da luminância de uma camada num ponto lógico
    const grad = (lum, x, y) => {
      const gx = clamp(Math.round(x * G), 1, gw - 2), gy = clamp(Math.round(y * G), 1, gh - 2);
      const i = gy * gw + gx;
      const a = lum[i - gw - 1], b = lum[i - gw], c = lum[i - gw + 1];
      const d = lum[i - 1], f = lum[i + 1];
      const g = lum[i + gw - 1], hh = lum[i + gw], k = lum[i + gw + 1];
      return [(c + 2 * f + k - a - 2 * d - g), (g + 2 * hh + k - a - 2 * b - c)];
    };
    // direção do traço: perpendicular ao gradiente onde há borda; ruído suave onde é liso
    const dirAt = (lum, x, y, px0, py0) => {
      const [gx, gy] = grad(lum, x, y);
      const mag = Math.hypot(gx, gy);
      const na = noise.noise2(x / m * 1.6, y / m * 1.6) * Math.PI * 1.2 + 0.6;
      let nx = Math.cos(na), ny = Math.sin(na);
      let ex = -gy / (mag || 1), ey = gx / (mag || 1);
      if (ex * nx + ey * ny < 0) { ex = -ex; ey = -ey; }
      const k = smoothstep(0.04, 0.35, mag);
      let dx = lerp(nx, ex, k), dy = lerp(ny, ey, k);
      if (px0 !== undefined && dx * px0 + dy * py0 < 0) { dx = -dx; dy = -dy; }
      const l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    };

    // pinceladas
    const strokes = [];
    layers.forEach((L, li) => {
      const ref = refs[li];
      const prev = li > 0 ? refs[li - 1] : null;
      const r = L.r * m;
      const sp = r * L.spacing;
      const cols = Math.ceil(w / sp) + 1, rows = Math.ceil(h / sp) + 1;
      const list = [];
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const x = (gx + R() - 0.25) * sp - sp * 0.25, y = (gy + R() - 0.25) * sp - sp * 0.25;
          const i = at(x, y);
          const cr = ref.d[i * 4], cg = ref.d[i * 4 + 1], cb = ref.d[i * 4 + 2];
          const roll = R();
          if (prev) {
            // detalhe: a referência desta camada difere da anterior em volta do ponto
            let diff = 0;
            for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
              const j = at(x + ox, y + oy);
              diff += Math.abs(ref.d[j * 4] - prev.d[j * 4]) + Math.abs(ref.d[j * 4 + 1] - prev.d[j * 4 + 1]) + Math.abs(ref.d[j * 4 + 2] - prev.d[j * 4 + 2]);
            }
            diff /= 5 * 3 * 255;
            if (diff < L.thr && roll > L.keep) continue;
          }
          // traça o caminho
          const nSteps = L.steps[0] + Math.floor(R() * (L.steps[1] - L.steps[0] + 1));
          const stepLen = r * 1.15;
          const pts = [x, y];
          let cx = x, cy = y, dx, dy;
          [dx, dy] = dirAt(ref.lum, cx, cy);
          for (let s = 0; s < nSteps; s++) {
            const nxp = cx + dx * stepLen, nyp = cy + dy * stepLen;
            const j = at(nxp, nyp), jh = at((cx + nxp) / 2, (cy + nyp) / 2);
            const cd = Math.max(
              Math.abs(ref.d[j * 4] - cr) + Math.abs(ref.d[j * 4 + 1] - cg) + Math.abs(ref.d[j * 4 + 2] - cb),
              Math.abs(ref.d[jh * 4] - cr) + Math.abs(ref.d[jh * 4 + 1] - cg) + Math.abs(ref.d[jh * 4 + 2] - cb),
            ) / (3 * 255);
            if (cd > (s >= 2 ? L.stop : L.stop * 1.6)) break;
            cx = nxp; cy = nyp;
            pts.push(cx, cy);
            const nd = dirAt(ref.lum, cx, cy, dx, dy);
            // curvatura limitada (pincel não dobra em ângulo)
            dx = lerp(dx, nd[0], 0.6); dy = lerp(dy, nd[1], 0.6);
            const l = Math.hypot(dx, dy) || 1;
            dx /= l; dy /= l;
          }
          if (pts.length < 4) pts.push(x + dx * stepLen * 0.6, y + dy * stepLen * 0.6);
          const geo = buildStroke(pts);
          // cor com leve variação de valor; cerdas mais clara e mais escura
          const v = 1 + (R() - 0.5) * 0.08;
          const c3 = [cr * v, cg * v, cb * v].map((c) => Math.round(clamp(c, 0, 255)));
          const hi = c3.map((c) => Math.round(c + (255 - c) * 0.3));
          const lo = c3.map((c) => Math.round(c * 0.72));
          // ordem: manchas de ruído + acaso
          const key = clamp(0.5 + noise.noise2(x / m * 2.2 + li * 9, y / m * 2.2) * 0.42) * 0.62 + R() * 0.38;
          list.push({
            ...geo, r: r * (0.85 + R() * 0.3),
            col: `rgb(${c3})`,
            bristles: [[0.35 + R() * 0.3, `rgb(${hi})`, 0.3], [-0.2 - R() * 0.4, `rgb(${lo})`, 0.24], [(R() - 0.5) * 0.5, `rgb(${hi})`, 0.18]],
            t0: L.win[0] + key * (L.win[1] - L.win[0] - L.dur), dur: L.dur * (0.8 + R() * 0.4),
          });
        }
      }
      strokes.push(...list);
    });
    strokes.sort((a, b) => a.t0 - b.t0);

    // esboço a carvão: bordas da segunda referência como alpha
    const sketchC = makeCanvas(gw, gh);
    if (p.sketch) {
      const lum = refs[Math.min(1, refs.length - 1)].lum;
      const sg = sketchC.getContext('2d');
      const id = sg.createImageData(gw, gh);
      for (let y = 1; y < gh - 1; y++) {
        for (let x = 1; x < gw - 1; x++) {
          const i = y * gw + x;
          const gx = lum[i + 1] - lum[i - 1], gy = lum[i + gw] - lum[i - gw];
          const a = smoothstep(0.035, 0.16, Math.hypot(gx, gy)) * 0.55 + (1 - lum[i]) * 0.07;
          id.data[i * 4] = 52; id.data[i * 4 + 1] = 44; id.data[i * 4 + 2] = 38;
          id.data[i * 4 + 3] = Math.min(255, a * 255);
        }
      }
      sg.putImageData(id, 0, 0);
    }

    // pinta tudo uma vez e guarda checkpoints (canvas acumulado em px reais)
    const acc = makeCanvas(W, H);
    const ag = acc.getContext('2d');
    ag.scale(sc, sc);
    ag.fillStyle = p.canvasColor;
    ag.fillRect(0, 0, w, h);
    if (p.sketch) ag.drawImage(sketchC, 0, 0, w, h);
    ag.lineCap = 'butt';
    ag.lineJoin = 'round';
    const N = strokes.length;
    const K = clamp(Math.round(N / 420), 4, 16);
    const chunk = Math.ceil(N / K);
    const checkpoints = [];
    let tEnd = 0;
    for (let i = 0; i < N; i++) {
      if (i % chunk === 0) {
        const c = makeCanvas(W, H);
        c.getContext('2d').drawImage(acc, 0, 0);
        checkpoints.push({ idx: i, time: i === 0 ? -Infinity : tEnd, canvas: c });
      }
      drawStroke(ag, strokes[i], 1);
      tEnd = Math.max(tEnd, strokes[i].t0 + strokes[i].dur);
    }
    checkpoints.push({ idx: N, time: tEnd, canvas: acc });

    return { ready: true, over, W, H, strokes, checkpoints, sketchC, end: tEnd };
  },

  render(ctx, t, { w, h, p, duration, state: s }) {
    if (!s.ready) {
      ctx.fillStyle = p.canvasColor;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(s.over, 0, 0, w, h);
      return;
    }
    ctx.fillStyle = p.canvasColor;
    ctx.fillRect(0, 0, w, h);
    // câmera: aproximação lenta, centro
    const z = 1.06 - 0.06 * ease.inOutSine(seg(t, 0, duration));
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(z, z);
    ctx.translate(-w / 2, -h / 2);

    // checkpoint mais recente já completo
    let cp = s.checkpoints[0];
    for (const c of s.checkpoints) if (c.time <= t) cp = c;
    if (cp.idx === 0) {
      // tela crua + esboço surgindo
      if (p.sketch) {
        ctx.globalAlpha = ease.outCubic(seg(t, 0.05, 0.9));
        ctx.drawImage(s.sketchC, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.drawImage(cp.canvas, 0, 0, w, h);
    }
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    const st = s.strokes;
    for (let i = cp.idx; i < st.length; i++) {
      const k = st[i];
      if (k.t0 >= t) break;
      const f = ease.outCubic(clamp((t - k.t0) / k.dur));
      if (f > 0.002) drawStroke(ctx, k, f);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.drawImage(s.over, 0, 0, w, h);
  },
};
