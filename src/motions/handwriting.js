import { clamp, seg, ease, rng, hexToRgb } from '../lib/anim.js';
import { skeleton, FONT, RASTER } from '../lib/skeleton.js';

// ---------------------------------------------------------------------------------------------

const DUR = 7;
const W0 = 0.55; // começo da escrita
const W1 = 5.6; // fim da escrita
const OUT = 6.45; // apaga

export default {
  id: 'handwriting',
  title: 'Handwriting',
  description: 'A sentence handwritten stroke by stroke, with the pen (or chalk) tip following the line.',
  category: 'tipografia',
  tags: ['typography', 'intro', 'alpha'],
  duration: DUR,
  poster: 4.2,

  params: {
    text: { type: 'text', label: 'Text', default: 'thank you for being here' },
    tool: { type: 'select', label: 'Tool', options: ['caneta', 'caneta tinteiro', 'giz'], default: 'caneta' },
    size: { type: 'range', label: 'Size', min: 0.06, max: 0.3, step: 0.005, default: 0.15 },
    weight: { type: 'range', label: 'Thickness', min: 0.4, max: 2, step: 0.05, default: 1 },
    showPen: { type: 'boolean', label: 'Show pen', default: true },
    ink: { type: 'color', label: 'Ink', default: '#1d2433' },
    accent: { type: 'color', label: 'Pen', default: '#ff5a36' },
    bg: { type: 'color', label: 'Background', default: '#f3eee4' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p, px }) {
    const m = Math.min(w, h);
    const chalk = p.tool === 'giz';
    // Giz com as cores padrão do papel: troca para lousa (mesmo motion, sem o usuário ter que mexer em 2 cores).
    const bgC = chalk && p.bg.toLowerCase() === '#f3eee4' ? '#1f2a26' : p.bg;
    const inkC = chalk && p.ink.toLowerCase() === '#1d2433' ? '#f2efe6' : p.ink;
    const meas = document.createElement('canvas').getContext('2d');
    let fs = m * p.size * (h > w ? 1.15 : 1);
    const maxW = w * 0.84;
    const words = (p.text || '').trim().split(/\s+/).filter(Boolean);
    const wrap = (s) => {
      meas.font = FONT(s);
      const lines = [];
      let cur = '';
      for (const wd of words) {
        const nx = cur ? `${cur} ${wd}` : wd;
        if (cur && meas.measureText(nx).width > maxW) {
          lines.push(cur);
          cur = wd;
        } else cur = nx;
      }
      if (cur) lines.push(cur);
      return lines;
    };
    let lines = wrap(fs);
    for (let k = 0; k < 12; k++) {
      meas.font = FONT(fs);
      const wide = Math.max(0, ...lines.map((l) => meas.measureText(l).width));
      const tall = lines.length * fs * 1.15;
      if (wide <= maxW && tall <= h * 0.8) break;
      fs *= 0.9;
      lines = wrap(fs);
    }

    // Monta os traços em coordenadas lógicas, linha a linha (centralizadas).
    const lh = fs * 1.18;
    const y0 = h / 2 - ((lines.length - 1) * lh) / 2 + fs * 0.28;
    const strokes = [];
    let thick = 0;
    lines.forEach((line, li) => {
      const sk = skeleton(line);
      const k = fs / RASTER;
      const x0 = w / 2 - (sk.tw * k) / 2 - sk.pad * k;
      const yb = y0 + li * lh - sk.base * k;
      thick += sk.thick * k;
      for (const s of sk.strokes) strokes.push({ pts: s.map(([x, y]) => [x0 + x * k, yb + y * k]), line: li });
    });
    thick /= Math.max(1, lines.length);

    // Tempo de cada traço (proporcional ao comprimento) + subida da caneta entre traços.
    let total = 0;
    let prev = null;
    for (const s of strokes) {
      let L = 0;
      s.cum = [0];
      for (let i = 1; i < s.pts.length; i++) {
        L += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]);
        s.cum.push(L);
      }
      s.len = L;
      const jump = prev ? Math.hypot(s.pts[0][0] - prev[0], s.pts[0][1] - prev[1]) : 0;
      s.lift = prev ? 0.35 + Math.min(2.5, jump / fs) * 0.55 + (s.line !== strokes[strokes.indexOf(s) - 1]?.line ? 1.2 : 0) : 0;
      s.cost = Math.pow(L / fs, 0.85) + 0.12;
      total += s.lift + s.cost;
      prev = s.pts[s.pts.length - 1];
    }
    const unit = (W1 - W0) / Math.max(1e-6, total);
    let tt = W0;
    for (const s of strokes) {
      s.l0 = tt;
      tt += s.lift * unit;
      s.t0 = tt;
      tt += s.cost * unit;
      s.t1 = tt;
    }

    // Fundo pintado uma vez.
    let bg = null;
    if (!p.transparent) {
      bg = document.createElement('canvas');
      bg.width = Math.round(w * px);
      bg.height = Math.round(h * px);
      const g = bg.getContext('2d');
      g.scale(px, px);
      g.fillStyle = bgC;
      g.fillRect(0, 0, w, h);
      const R = rng(11);
      const [r, gg, b] = hexToRgb(bgC);
      const lum = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
      if (chalk) {
        // Lousa: manchas de giz apagado.
        for (let i = 0; i < 14; i++) {
          const x = R() * w;
          const y = R() * h;
          const rr = m * (0.15 + R() * 0.35);
          const rg = g.createRadialGradient(x, y, 0, x, y, rr);
          rg.addColorStop(0, `rgba(255,255,255,${0.025 + R() * 0.03})`);
          rg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = rg;
          g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
      }
      // Fibra do papel / poeira: pontinhos em dois lotes.
      for (const [col, n] of [[lum > 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.035)', 2600], ['rgba(255,255,255,0.05)', 1200]]) {
        g.fillStyle = col;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const s = m * (0.0015 + R() * 0.003);
          g.rect(R() * w, R() * h, s, s);
        }
        g.fill();
      }
      const vg = g.createRadialGradient(w / 2, h / 2, m * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${lum > 0.5 ? 0.12 : 0.4})`);
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
    }

    // Textura do giz: ruído em alpha, usado como pattern do traço.
    let grain = null;
    if (chalk) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d');
      const id = g.createImageData(96, 96);
      const R = rng(5);
      const ink = hexToRgb(inkC);
      for (let i = 0; i < 96 * 96; i++) {
        const v = R();
        id.data[i * 4] = ink[0];
        id.data[i * 4 + 1] = ink[1];
        id.data[i * 4 + 2] = ink[2];
        id.data[i * 4 + 3] = v < 0.18 ? 0 : 150 + v * 105;
      }
      g.putImageData(id, 0, 0);
      grain = c;
    }

    return { strokes, fs, thick, bg, grain, chalk, inkC };
  },

  render(ctx, t, { w, h, p, px, state }) {
    const { strokes, fs, thick, bg, chalk } = state;
    if (bg) ctx.drawImage(bg, 0, 0, w, h);
    if (!strokes.length) return;
    const nib = p.tool === 'caneta tinteiro';
    const lw = Math.max(0.6, thick * p.weight * (nib ? 0.55 : chalk ? 1.25 : 0.8));
    const fade = 1 - ease.inOutCubic(seg(t, OUT, DUR - 0.08));
    if (fade <= 0) return;

    // Posição da ponta em t e quanto de cada traço já foi escrito.
    const prog = (s) => {
      const k = seg(t, s.t0, s.t1);
      // Cada traço acelera e freia de leve (mão), sem parar no meio.
      return 0.55 * k + 0.45 * ease.inOutSine(k);
    };
    const at = (s, d) => {
      const c = s.cum;
      let lo = 0;
      let hi = c.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (c[mid] <= d) lo = mid;
        else hi = mid;
      }
      const a = s.pts[lo];
      const b = s.pts[hi];
      const u = c[hi] > c[lo] ? (d - c[lo]) / (c[hi] - c[lo]) : 0;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, lo];
    };

    // Tinta. Caneta tinteiro: pena chata (soma de Minkowski do traço com o segmento da pena),
    // tudo num path só com a mesma orientação em cada quadrilátero (sem buracos no nonzero).
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const nx = Math.cos(-0.75) * lw * 1.7;
    const ny = Math.sin(-0.75) * lw * 1.7;
    const path = new Path2D();
    const quads = nib ? new Path2D() : null;
    let tip = null;
    let active = null;
    for (const s of strokes) {
      if (t < s.t0) break;
      const k = prog(s);
      const d = k * s.len;
      const [ex, ey, last] = at(s, d);
      path.moveTo(s.pts[0][0], s.pts[0][1]);
      for (let i = 1; i <= last; i++) path.lineTo(s.pts[i][0], s.pts[i][1]);
      path.lineTo(ex, ey);
      if (quads) {
        // Pena afinando nas pontas do traço (esconde os bicos onde um traço nasce de outro).
        const T = lw * 3;
        const taper = (dd) => 0.3 + 0.7 * ease.inOutSine(clamp(Math.min(dd, s.len - dd) / T));
        let ax = s.pts[0][0];
        let ay = s.pts[0][1];
        let ka = taper(0);
        const N = last + 1;
        for (let i = 1; i <= N; i++) {
          const bx = i <= last ? s.pts[i][0] : ex;
          const by = i <= last ? s.pts[i][1] : ey;
          const kb = taper(i <= last ? s.cum[i] : d);
          const cross = (bx - ax) * ny - (by - ay) * nx;
          const anx = nx * ka, any = ny * ka, bnx = nx * kb, bny = ny * kb;
          if (cross >= 0) {
            quads.moveTo(ax - anx, ay - any);
            quads.lineTo(bx - bnx, by - bny);
            quads.lineTo(bx + bnx, by + bny);
            quads.lineTo(ax + anx, ay + any);
          } else {
            quads.moveTo(ax - anx, ay - any);
            quads.lineTo(ax + anx, ay + any);
            quads.lineTo(bx + bnx, by + bny);
            quads.lineTo(bx - bnx, by - bny);
          }
          quads.closePath();
          ax = bx;
          ay = by;
          ka = kb;
        }
      }
      if (k < 1) {
        tip = [ex, ey];
        active = s;
      }
      tip = tip || [ex, ey];
      if (k >= 1) tip = [ex, ey];
    }
    const style = chalk && state.grain ? ctx.createPattern(state.grain, 'repeat') : state.inkC;
    if (chalk && style.setTransform) style.setTransform(new DOMMatrix().scale(fs / 260 / px));
    ctx.strokeStyle = style;
    ctx.fillStyle = style;
    ctx.lineWidth = lw;
    ctx.stroke(path);
    if (quads) ctx.fill(quads, 'nonzero');
    ctx.restore();

    // Ponta: entra antes da escrita, segue o traço, levanta entre traços e sai no fim.
    if (!p.showPen) return;
    let px0;
    let py0;
    let lift = 0;
    const first = strokes[0];
    const lastS = strokes[strokes.length - 1];
    const home = [w * 0.86, h * 1.08];
    if (t < first.t0) {
      const k = ease.outCubic(seg(t, 0, first.t0));
      px0 = home[0] + (first.pts[0][0] - home[0]) * k;
      py0 = home[1] + (first.pts[0][1] - home[1]) * k;
      lift = 1 - k;
    } else if (t > lastS.t1) {
      const k = ease.inCubic(seg(t, lastS.t1, lastS.t1 + 0.8));
      const e = lastS.pts[lastS.pts.length - 1];
      px0 = e[0] + (home[0] - e[0]) * k;
      py0 = e[1] + (home[1] - e[1]) * k;
      lift = Math.min(1, k * 3);
    } else {
      // Dentro de um traço ou levantada entre dois.
      let i = 0;
      while (i < strokes.length - 1 && t >= strokes[i + 1].l0) i++;
      const s = strokes[i];
      if (t <= s.t1) {
        [px0, py0] = at(s, prog(s) * s.len);
      } else {
        const nxt = strokes[i + 1];
        const a = s.pts[s.pts.length - 1];
        const b = nxt.pts[0];
        const k = ease.inOutSine(seg(t, s.t1, nxt.t0));
        px0 = a[0] + (b[0] - a[0]) * k;
        py0 = a[1] + (b[1] - a[1]) * k;
        lift = Math.sin(Math.PI * k) * clamp(Math.hypot(b[0] - a[0], b[1] - a[1]) / fs, 0.3, 1);
      }
    }
    void active;
    drawTool(ctx, px0, py0, lift, fs, chalk, p, px);
  },
};

// Caneta (ou giz) com a ponta em (x, y); `lift` 0..1 sobe a ferramenta e afasta a sombra.
function drawTool(ctx, x, y, lift, fs, chalk, p, px) {
  const L = fs * (chalk ? 1.1 : 2.6);
  const ang = 0.95; // corpo para baixo-direita (mão direita)
  const up = lift * fs * 0.18;
  ctx.save();
  // Sombra (mesma silhueta, deslocada).
  ctx.translate(x + fs * 0.05 + up * 1.4, y + fs * 0.07 + up * 1.8);
  ctx.rotate(ang);
  ctx.fillStyle = `rgba(0,0,0,${0.16 - lift * 0.06})`;
  toolShape(ctx, L, fs, chalk, true);
  ctx.restore();

  ctx.save();
  ctx.translate(x - up * 0.3, y - up);
  ctx.rotate(ang);
  toolShape(ctx, L, fs, chalk, false, p);
  ctx.restore();
  void px;
}

function toolShape(ctx, L, fs, chalk, shadow, p) {
  if (chalk) {
    const r = fs * 0.085;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(r * 1.2, -r);
    ctx.lineTo(L, -r);
    ctx.arc(L, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(r * 1.2, r);
    ctx.lineTo(0, r * 0.55);
    ctx.closePath();
    if (!shadow) {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#ece9e2');
      g.addColorStop(1, '#b9b4aa');
      ctx.fillStyle = g;
    }
    ctx.fill();
    return;
  }
  const r = fs * 0.075; // raio do corpo
  // Silhueta: pena (triângulo), anel, corpo e tampa.
  const nibL = fs * 0.32;
  if (shadow) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(nibL, -r * 0.7);
    ctx.lineTo(L, -r);
    ctx.arc(L, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(nibL, r * 0.7);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // Pena metálica.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(nibL, -r * 0.62);
  ctx.lineTo(nibL, r * 0.62);
  ctx.closePath();
  const gn = ctx.createLinearGradient(0, -r, 0, r);
  gn.addColorStop(0, '#e8e2d4');
  gn.addColorStop(0.5, '#b8ae97');
  gn.addColorStop(1, '#6e6656');
  ctx.fillStyle = gn;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,36,30,0.6)';
  ctx.lineWidth = Math.max(0.5, fs * 0.006);
  ctx.beginPath();
  ctx.moveTo(fs * 0.03, 0);
  ctx.lineTo(nibL * 0.8, 0);
  ctx.stroke();
  // Seção (escura) e corpo (cor de destaque).
  const sec = fs * 0.5;
  const body = (x0, x1, r0, r1, c0, c1, c2) => {
    ctx.beginPath();
    ctx.moveTo(x0, -r0);
    ctx.lineTo(x1, -r1);
    ctx.lineTo(x1, r1);
    ctx.lineTo(x0, r0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -r1, 0, r1);
    g.addColorStop(0, c0);
    g.addColorStop(0.35, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fill();
  };
  body(nibL * 0.92, sec, r * 0.66, r * 0.8, '#4a4f5c', '#2a2e38', '#14161c');
  const [a, b, c] = hexToRgb(p.accent);
  const shade = (k) => `rgb(${(a * k) | 0},${(b * k) | 0},${(c * k) | 0})`;
  const lite = `rgb(${Math.min(255, a + 70)},${Math.min(255, b + 70)},${Math.min(255, c + 70)})`;
  body(sec, L, r * 0.95, r, lite, shade(1), shade(0.55));
  ctx.beginPath();
  ctx.arc(L, 0, r, -Math.PI / 2, Math.PI / 2);
  ctx.fillStyle = shade(0.7);
  ctx.fill();
  // Anel metálico.
  body(sec, sec + fs * 0.05, r * 0.98, r * 0.98, '#f2ede0', '#c9bf9f', '#7d7461');
}
