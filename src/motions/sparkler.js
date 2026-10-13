import { TAU, rgba, mixHex, seg, ease } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Estrelinha escrevendo no ar. A palavra vira um caminho de caneta a partir de uma fonte de traço
// simples feita à mão (maiúsculas, dígitos e pontuação básica, em unidades: altura 10, linha de base
// em y = 10). O caminho é reamostrado, suavizado e ganha um tremor de mão; cada amostra guarda o
// instante em que a ponta passou por ela. O render desenha o rastro por faixas de idade (quente → brasa
// → brilho residual) e as faíscas em fórmula fechada: um emissor discreto (k/RATE s) sorteia direção,
// velocidade e vida por índice; algumas se ramificam na estrela típica da estrelinha.

// —— fonte de traço ————————————————————————————————————————————————————————————————————————————————
const A = (cx, cy, rx, ry, a0, a1) => {
  const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 10));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
};
const L = (...v) => {
  const out = [];
  for (let i = 0; i < v.length; i += 2) out.push([v[i], v[i + 1]]);
  return out;
};
const J = (...parts) => parts.flat();

const GLYPHS = {
  A: [6, [L(0, 10, 3, 0, 6, 10), L(1.1, 6.6, 4.9, 6.6)]],
  B: [5.6, [L(0, 10, 0, 0), J(L(0, 0, 2.8, 0), A(2.8, 2.45, 2.5, 2.45, -90, 90), L(0, 4.9, 3.1, 4.9), A(3.1, 7.45, 2.6, 2.55, -90, 90), L(0, 10))]],
  C: [6, [A(3.3, 5, 3.3, 5, -45, -315)]],
  D: [5.8, [L(0, 0, 0, 10), J(L(0, 0, 1.8, 0), A(1.8, 5, 4, 5, -90, 90), L(0, 10))]],
  E: [5, [L(5, 0, 0, 0, 0, 10, 5, 10), L(0, 5, 4, 5)]],
  F: [5, [L(5, 0, 0, 0, 0, 10), L(0, 5, 4, 5)]],
  G: [6.4, [J(A(3.3, 5, 3.3, 5, -45, -360), L(3.6, 5))]],
  H: [5.4, [L(0, 0, 0, 10), L(5.4, 0, 5.4, 10), L(0, 5, 5.4, 5)]],
  I: [0, [L(0, 0, 0, 10)]],
  J: [4.4, [J(L(4.4, 0, 4.4, 7), A(2.2, 7, 2.2, 3, 0, 180))]],
  K: [5.2, [L(0, 0, 0, 10), L(5.2, 0, 0, 6.2), L(1.7, 4.6, 5.2, 10)]],
  L: [4.6, [L(0, 0, 0, 10, 4.6, 10)]],
  M: [7, [L(0, 10, 0, 0, 3.5, 7, 7, 0, 7, 10)]],
  N: [5.6, [L(0, 10, 0, 0, 5.6, 10, 5.6, 0)]],
  O: [6.8, [A(3.4, 5, 3.4, 5, -90, -450)]],
  P: [5.2, [J(L(0, 10, 0, 0, 2.6, 0), A(2.6, 2.75, 2.6, 2.75, -90, 90), L(0, 5.5))]],
  Q: [6.8, [A(3.4, 5, 3.4, 5, -90, -450), L(4, 7.2, 6.8, 10.4)]],
  R: [5.4, [J(L(0, 10, 0, 0, 2.6, 0), A(2.6, 2.75, 2.6, 2.75, -90, 90), L(0, 5.5)), L(2.6, 5.5, 5.4, 10)]],
  S: [5.4, [J(A(2.7, 2.5, 2.6, 2.5, -20, -270), A(2.7, 7.5, 2.7, 2.5, -90, 160))]],
  T: [6, [L(0, 0, 6, 0), L(3, 0, 3, 10)]],
  U: [5.6, [J(L(0, 0, 0, 6.8), A(2.8, 6.8, 2.8, 3.2, 180, 0), L(5.6, 0))]],
  V: [6, [L(0, 0, 3, 10, 6, 0)]],
  W: [8.4, [L(0, 0, 2.1, 10, 4.2, 2, 6.3, 10, 8.4, 0)]],
  X: [5.6, [L(0, 0, 5.6, 10), L(5.6, 0, 0, 10)]],
  Y: [6, [L(0, 0, 3, 5, 6, 0), L(3, 5, 3, 10)]],
  Z: [5.6, [L(0, 0, 5.6, 0, 0, 10, 5.6, 10)]],
  0: [5.6, [A(2.8, 5, 2.8, 5, -90, -450)]],
  1: [2.6, [L(0, 2.2, 2.6, 0, 2.6, 10)]],
  2: [5.4, [J(A(2.6, 2.7, 2.6, 2.7, -165, 35), L(0, 10, 5.4, 10))]],
  3: [5.2, [J(A(2.5, 2.5, 2.5, 2.5, -155, 90), A(2.5, 7.5, 2.7, 2.5, -90, 155))]],
  4: [5.6, [L(4.2, 10, 4.2, 0, 0, 7, 5.6, 7)]],
  5: [5.4, [J(L(5, 0, 0.8, 0, 0.4, 4.6), A(2.6, 6.9, 2.8, 3.1, -128, 155))]],
  6: [5.6, [J(A(3.2, 4.6, 3.2, 4.6, -55, -180), A(2.8, 7.2, 2.8, 2.8, 180, 540))]],
  7: [5.4, [L(0, 0, 5.4, 0, 1.8, 10)]],
  8: [5.4, [J(A(2.7, 2.45, 2.3, 2.45, 90, -270), A(2.7, 7.45, 2.7, 2.55, -90, 270))]],
  9: [5.4, [J(A(2.7, 2.9, 2.7, 2.9, 0, -360), L(5.4, 2.9, 4.8, 10))]],
  '!': [0, [L(0, 0, 0, 7), L(0, 9.6, 0, 10)]],
  '?': [5, [J(A(2.5, 2.5, 2.5, 2.5, -170, 70), L(2.5, 6.8)), L(2.5, 9.6, 2.5, 10)]],
  '.': [0, [L(0, 9.6, 0, 10)]],
  ',': [0.6, [L(0.6, 9.3, 0, 11.4)]],
  '-': [3.6, [L(0, 5.6, 3.6, 5.6)]],
  "'": [0, [L(0, 0, 0, 2.6)]],
  '+': [5, [L(0, 5.5, 5, 5.5), L(2.5, 3, 2.5, 8)]],
  '&': [6, [L(6, 10, 1, 3.2, 1.6, 0.6, 3.2, 0, 4.3, 1.4, 3.8, 3.2, 0.4, 6.4, 0.6, 9.2, 2.6, 10, 4.6, 8.6, 6, 6)]],
  '♥': [6.4, [L(3.2, 10, 0.4, 5.6, 0, 3.2, 0.9, 0.8, 3.2, 1.2, 3.2, 3.2), L(3.2, 3.2, 3.2, 1.2, 5.5, 0.8, 6.4, 3.2, 6, 5.6, 3.2, 10)]],
};
const GAP = 2.4; // espaço entre letras
const SPACE = 4.2;

function layoutLine(text) {
  const strokes = [];
  let x = 0;
  const chars = [...text];
  chars.forEach((ch, i) => {
    if (ch === ' ') {
      x += SPACE;
      return;
    }
    const g = GLYPHS[ch];
    if (!g) return;
    for (const s of g[1]) strokes.push(s.map(([a, b]) => [a + x, b]));
    x += g[0] + (i < chars.length - 1 ? GAP : 0);
  });
  return { strokes, width: Math.max(0, x) };
}

// —— caminho da caneta ——————————————————————————————————————————————————————————————————————————————
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const d = Math.hypot(bx - ax, by - ay);
    let s = step - carry;
    while (s <= d) {
      out.push([ax + ((bx - ax) * s) / d, ay + ((by - ay) * s) / d]);
      s += step;
    }
    carry = d - (s - step);
  }
  const last = pts[pts.length - 1];
  const e = out[out.length - 1];
  if (Math.hypot(last[0] - e[0], last[1] - e[1]) > step * 0.3) out.push(last);
  if (out.length === 1) out.push([last[0] + 0.001, last[1] + 0.25]); // ponto (".") vira um tracinho
  return out;
}
function smooth(pts, passes) {
  let a = pts;
  for (let k = 0; k < passes; k++) {
    const b = a.map((p) => p.slice());
    for (let i = 1; i < a.length - 1; i++) {
      b[i][0] = (a[i - 1][0] + 2 * a[i][0] + a[i + 1][0]) / 4;
      b[i][1] = (a[i - 1][1] + 2 * a[i][1] + a[i + 1][1]) / 4;
    }
    a = b;
  }
  return a;
}

function glowSprite(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.12, 'rgba(255,255,255,0.9)');
  rg.addColorStop(0.25, rgba(color, 0.5));
  rg.addColorStop(0.55, rgba(color, 0.12));
  rg.addColorStop(1, rgba(color, 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return c;
}

// halo largo com queda gaussiana (sem aro visível)
function softSprite(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (let i = 0; i <= 8; i++) {
    const x = i / 8;
    rg.addColorStop(x, rgba(color, Math.exp(-x * x * 4.5) * (1 - x)));
  }
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return c;
}

const hash = (a, b) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const T_IN = 0.35; // acende
const AGE_LEVELS = 12;
const RATE = 700; // emissões de faísca por segundo
const SPARK_LIFE = 0.4;

export default {
  id: 'sparkler',
  title: 'Sparkler',
  description: 'Uma estrelinha escreve a palavra no ar, deixando um rastro de luz que esfria e espalhando faíscas.',
  category: 'particulas',
  tags: ['partículas', 'tipografia', 'intro', 'alpha'],
  duration: 7,
  poster: 5.2,

  params: {
    text: { type: 'text', label: 'Texto', default: 'Brilhe' },
    trail: { type: 'color', label: 'Rastro', default: '#ffa23a' },
    spark: { type: 'color', label: 'Faíscas', default: '#ffe6a8' },
    bg: { type: 'color', label: 'Fundo', default: '#07080c' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
    persist: { type: 'range', label: 'Brilho que fica', min: 0, max: 1, step: 0.01, default: 0.6 },
    sparks: { type: 'range', label: 'Faíscas', min: 0, max: 1, step: 0.01, default: 0.7 },
    width: { type: 'range', label: 'Espessura', min: 0.4, max: 2.5, step: 0.01, default: 1 },
    stick: { type: 'boolean', label: 'Mostrar haste', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ w, h, p, duration }) {
    const raw = String(p.text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .trim() || ' ';

    // uma linha ou uma palavra por linha: fica com o arranjo que deixa a letra maior
    const fit = (lines) => {
      const L2 = lines.map(layoutLine);
      const wMax = Math.max(1, ...L2.map((l) => l.width));
      const hU = lines.length * 10 + (lines.length - 1) * 6;
      const unit = Math.min((w * 0.8) / wMax, (h * 0.5) / hU, (Math.min(w, h) * 0.26) / 10);
      return { L2, unit, hU };
    };
    const words = raw.split(/\s+/);
    let best = fit([raw]);
    if (words.length > 1) {
      const alt = fit(words);
      if (alt.unit > best.unit * 1.25) best = alt;
    }
    const { L2, unit, hU } = best;
    const shear = 0.14; // inclinação de mão
    const noise = createNoise(p.seed);
    const strokes = [];
    L2.forEach((line, li) => {
      const ox = w / 2 - (line.width * unit) / 2;
      const oy = h / 2 - (hU * unit) / 2 + li * 16 * unit;
      for (const s of line.strokes) {
        let pts = resample(s, 0.22);
        pts = smooth(pts, 3);
        strokes.push(
          pts.map(([x, y], i) => {
            const jx = noise.noise2(x * 0.18 + li * 9, y * 0.18) * 0.22;
            const jy = noise.noise2(x * 0.18 + 40, y * 0.18 - li * 9) * 0.22;
            return [ox + (x + jx + (10 - y) * shear - 0.7) * unit, oy + (y + jy) * unit];
          }),
        );
      }
    });

    // caminho completo: traços (desenhando) + saltos entre traços (caneta "levantada", 3× mais rápida)
    const X = [], Y = [], TAUs = [], ON = [];
    let tau = 0;
    const push = (x, y, on) => {
      if (X.length) {
        const d = Math.hypot(x - X[X.length - 1], y - Y[Y.length - 1]);
        tau += on ? d : d / 3;
      }
      X.push(x);
      Y.push(y);
      TAUs.push(tau);
      ON.push(on);
    };
    const jumpStep = unit * 0.5;
    strokes.forEach((s, si) => {
      if (si > 0) {
        const [ax, ay] = [X[X.length - 1], Y[Y.length - 1]];
        const [bx, by] = s[0];
        const d = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.ceil(d / jumpStep));
        // salto em arco leve, como a mão que sobe e volta
        for (let i = 1; i < n; i++) {
          const q = i / n;
          push(ax + (bx - ax) * q, ay + (by - ay) * q - Math.sin(Math.PI * q) * Math.min(d * 0.15, unit * 2), 0);
        }
      }
      s.forEach(([x, y], i) => push(x, y, i > 0 ? 1 : 0));
    });
    const total = tau || 1;
    const n = X.length;
    // instante em que a ponta passa por cada amostra (ease inOutSine no progresso geral)
    const tA = 0.55;
    const tB = Math.min(duration - 2, tA + 1.2 + total / (unit * 10) * 0.42);
    const TT = new Float32Array(n);
    for (let i = 0; i < n; i++) TT[i] = tA + ((tB - tA) * Math.acos(1 - (2 * TAUs[i]) / total)) / Math.PI;

    return {
      X: Float32Array.from(X),
      Y: Float32Array.from(Y),
      ON: Uint8Array.from(ON),
      TT,
      n,
      tA,
      tB,
      unit,
      glow: glowSprite(p.trail),
      ambient: softSprite(p.trail),
    };
  },

  render(ctx, t, { w, h, p, duration, state: S }) {
    const m = Math.min(w, h);
    const U = S.unit;
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    if (S.n < 2) return;

    // posição da ponta num instante qualquer (busca binária em TT)
    const head = (time) => {
      const { TT, X, Y, n } = S;
      let x, y;
      if (time <= TT[0]) (x = X[0]), (y = Y[0]);
      else if (time >= TT[n - 1]) (x = X[n - 1]), (y = Y[n - 1]);
      else {
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (TT[mid] <= time) lo = mid;
          else hi = mid;
        }
        const q = (time - TT[lo]) / (TT[hi] - TT[lo] || 1);
        x = X[lo] + (X[hi] - X[lo]) * q;
        y = Y[lo] + (Y[hi] - Y[lo]) * q;
      }
      // antes de começar: chega de baixo à esquerda; depois de terminar: afasta-se devagar
      const pre = 1 - ease.outCubic(seg(time, 0, S.tA));
      x -= pre * U * 3;
      y += pre * U * 4 + Math.sin(time * 3.1) * U * 0.06 * seg(time, S.tB, S.tB + 0.4);
      const after = Math.max(0, time - S.tB);
      x += after * U * 0.6;
      y -= after * U * 0.25;
      return [x, y];
    };

    const fadeOut = 1 - ease.inOutCubic(seg(t, duration - 1.3, duration - 0.15));
    const ignite = ease.outCubic(seg(t, 0, T_IN));
    const live = ignite * (1 - ease.inCubic(seg(t, duration - 1.6, duration - 0.5))); // faísca apaga
    const lw = U * 0.2 * p.width;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    // —— rastro por faixas de idade
    const { X, Y, ON, TT, n } = S;
    const paths = Array.from({ length: AGE_LEVELS }, () => new Path2D());
    const edges = [0.04, 0.09, 0.16, 0.26, 0.4, 0.6, 0.85, 1.2, 1.7, 2.4, 3.4, 1e9];
    let any = false;
    let prevLv = -1;
    for (let i = 1; i < n; i++) {
      if (!ON[i]) {
        prevLv = -1;
        continue;
      }
      const t1 = TT[i - 1];
      if (t1 > t) break;
      const age = t - Math.min(TT[i], t);
      let lv = 0;
      while (age > edges[lv]) lv++;
      let x1 = X[i], y1 = Y[i];
      if (TT[i] > t) {
        const q = (t - t1) / (TT[i] - t1 || 1);
        x1 = X[i - 1] + (x1 - X[i - 1]) * q;
        y1 = Y[i - 1] + (y1 - Y[i - 1]) * q;
      }
      // polilinhas contínuas por faixa (cap 'butt'): pontas redondas sobrepostas somariam brilho
      if (lv !== prevLv) paths[lv].moveTo(X[i - 1], Y[i - 1]);
      paths[lv].lineTo(x1, y1);
      prevLv = lv;
      any = true;
    }
    if (any) {
      const hot = '#fff8ea';
      for (let lv = AGE_LEVELS - 1; lv >= 0; lv--) {
        const age = lv === 0 ? 0.02 : (edges[lv - 1] + Math.min(edges[lv], 4.5)) / 2;
        const heat = Math.exp(-age / 0.22); // 1 = recém-traçado
        const glowLv = p.persist + (1 - p.persist) * Math.exp(-age / 0.9);
        const b = glowLv * fadeOut;
        if (b < 0.003) continue;
        const core = heat > 0.5 ? hot : mixHex(p.trail, hot, heat * 0.9 + 0.15 * glowLv);
        const path = paths[lv];
        ctx.strokeStyle = rgba(p.trail, 0.035 * b + 0.04 * heat * fadeOut);
        ctx.lineWidth = lw * (6 + 3 * heat);
        ctx.stroke(path);
        ctx.strokeStyle = rgba(p.trail, 0.2 * b + 0.15 * heat * fadeOut);
        ctx.lineWidth = lw * 2.8;
        ctx.stroke(path);
        ctx.globalAlpha = Math.min(1, 0.85 * b + 0.2 * heat);
        ctx.strokeStyle = core;
        ctx.lineWidth = lw * (1 + 0.3 * heat);
        ctx.stroke(path);
        ctx.globalAlpha = 1;
      }
    }

    // —— ponta
    const [hx, hy] = head(t);
    const flick = 0.85 + 0.15 * hash(Math.floor(t * 30), 7);
    if (live > 0.002) {
      // haste (fica por baixo do brilho, em source-over)
      if (p.stick) {
        ctx.globalCompositeOperation = 'source-over';
        const ang = 1.08; // rad abaixo da horizontal, para a direita
        const dx = Math.cos(ang), dy = Math.sin(ang);
        ctx.globalAlpha = Math.min(1, live * 1.2);
        ctx.strokeStyle = '#3b3631';
        ctx.lineWidth = U * 0.16;
        ctx.beginPath();
        ctx.moveTo(hx + dx * U * 0.15, hy + dy * U * 0.15);
        ctx.lineTo(hx + dx * U * 2.2, hy + dy * U * 2.2);
        ctx.stroke();
        ctx.strokeStyle = '#6d6a66';
        ctx.lineWidth = U * 0.05;
        ctx.beginPath();
        ctx.moveTo(hx + dx * U * 2.2, hy + dy * U * 2.2);
        ctx.lineTo(hx + dx * U * 9, hy + dy * U * 9);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'lighter';
      }
      // clarão ambiente + núcleo
      const G = U * 7 * flick;
      ctx.globalAlpha = 0.22 * live;
      ctx.drawImage(S.ambient, hx - G, hy - G, G * 2, G * 2);
      const g2 = U * 1.6 * flick;
      ctx.globalAlpha = live;
      ctx.drawImage(S.glow, hx - g2, hy - g2, g2 * 2, g2 * 2);
      ctx.globalAlpha = 1;
    }

    // —— faíscas
    if (p.sparks > 0 && live > 0.002) {
      const R = U * 10; // altura da letra
      const k0 = Math.ceil((t - SPARK_LIFE) * RATE);
      const k1 = Math.floor(t * RATE);
      const LV = 4;
      const sp = Array.from({ length: LV }, () => new Path2D());
      const drag = 3;
      const grav = R * 1.4;
      const pos = (ox, oy, vx, vy, a) => {
        const E = (1 - Math.exp(-drag * a)) / drag;
        return [ox + vx * E, oy + vy * E + 0.5 * grav * a * a];
      };
      for (let k = Math.max(0, k0); k <= k1; k++) {
        if (hash(k, 1) > p.sparks) continue;
        const te = k / RATE;
        const a = t - te;
        const life = SPARK_LIFE * (0.3 + 0.7 * hash(k, 2));
        if (a > life || a < 0) continue;
        const em = ease.outCubic(seg(te, 0, T_IN)) * (1 - ease.inCubic(seg(te, duration - 1.6, duration - 0.5)));
        if (hash(k, 9) > em) continue;
        const [ox, oy] = head(te);
        const ang = hash(k, 3) * TAU;
        const spd = R * (1.2 + 3.2 * hash(k, 4) ** 1.5);
        const vx = Math.cos(ang) * spd, vy = Math.sin(ang) * spd;
        const branch = hash(k, 5) < 0.35;
        const tb = life * (0.35 + 0.25 * hash(k, 6));
        const aa = branch ? Math.min(a, tb) : a;
        const [x1, y1] = pos(ox, oy, vx, vy, aa);
        const [x0, y0] = pos(ox, oy, vx, vy, Math.max(0, aa - 0.06));
        const lv = Math.min(LV - 1, Math.floor((a / life) * LV));
        if (!branch || a <= tb) {
          sp[lv].moveTo(x0, y0);
          sp[lv].lineTo(x1, y1);
        } else {
          // estrela: 3–4 ramos curtos a partir do ponto de quebra
          const ea = a - tb;
          const nb = 3 + (hash(k, 7) < 0.5 ? 1 : 0);
          const bl = life * 0.5;
          if (ea < bl) {
            const blv = Math.min(LV - 1, 1 + Math.floor((ea / bl) * (LV - 1)));
            for (let j = 0; j < nb; j++) {
              const ba = ang + ((j - (nb - 1) / 2) * 1.2) + (hash(k, 10 + j) - 0.5) * 0.8;
              const bs = R * (0.7 + 0.8 * hash(k, 20 + j));
              const bx = Math.cos(ba) * bs, by = Math.sin(ba) * bs;
              const [q1x, q1y] = pos(x1, y1, bx, by, ea);
              const [q0x, q0y] = pos(x1, y1, bx, by, Math.max(0, ea - 0.04));
              sp[blv].moveTo(q0x, q0y);
              sp[blv].lineTo(q1x, q1y);
            }
          }
        }
      }
      ctx.lineCap = 'round';
      const sw = Math.max(0.5, U * 0.05);
      for (let lv = 0; lv < LV; lv++) {
        const q = lv / (LV - 1);
        ctx.strokeStyle = lv === 0 ? '#fffaf0' : mixHex(p.spark, p.trail, q);
        ctx.globalAlpha = (1 - q * 0.65) * live;
        ctx.lineWidth = sw * (1.25 - q * 0.5);
        ctx.stroke(sp[lv]);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },
};
