import { TAU, seg, ease, rgba, rng, clamp } from '../lib/anim.js';

// Marcações no texto: ==marca-texto==  __sublinhado__  ((círculo)).
const MARKS = [
  { re: /^==(.+)==$/, kind: 'hl' },
  { re: /^__(.+)__$/, kind: 'ul' },
  { re: /^\(\((.+)\)\)$/, kind: 'ci' },
];

function parse(text) {
  // Divide em trechos marcados/normais. Cada palavra é uma lista de pedaços ({text, kind}); pontuação
  // colada a uma marca (ex.: "==isso==,") continua na mesma palavra.
  const parts = String(text || '').split(/(==[^=]+==|__[^_]+__|\(\([^)]+\)\))/);
  const words = [];
  const used = {};
  let glue = false; // o próximo pedaço cola na última palavra?
  for (const part of parts) {
    if (!part) continue;
    let kind = null;
    let body = part;
    for (const m of MARKS) {
      const r = part.match(m.re);
      if (r) {
        kind = m.kind;
        body = r[1];
      }
    }
    if (kind && used[kind]) kind = null; // só a primeira de cada tipo
    if (kind) used[kind] = true;
    const toks = body.split(/(\s+)/);
    toks.forEach((tk, i) => {
      if (!tk) return;
      if (/^\s+$/.test(tk)) {
        glue = false;
        return;
      }
      if (glue && words.length && (i === 0 || !kind)) words[words.length - 1].push({ text: tk, kind });
      else words.push([{ text: tk, kind }]);
      glue = true;
    });
    if (/\s$/.test(body)) glue = false;
  }
  return words;
}

// Traço de caneta: polígono preenchido com largura variando (afina nas pontas), revelado até `k`.
function pen(ctx, pts, width, k, jit) {
  const n = pts.length;
  if (n < 2 || k <= 0) return;
  const end = k * (n - 1);
  const last = Math.floor(end);
  const P = pts.slice(0, last + 1);
  if (last < n - 1) {
    const f = end - last;
    const a = pts[last];
    const b = pts[last + 1];
    P.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  const m = P.length;
  if (m < 2) return;
  const L = [];
  const R = [];
  for (let i = 0; i < m; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(m - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    // Afinamento pela posição no traço completo (não no trecho revelado).
    const u = (i / (m - 1)) * (end / (n - 1));
    const taper = Math.min(1, Math.sin(Math.PI * clamp(u)) * 2.2 + 0.18);
    const r = (width / 2) * taper * (1 + 0.18 * Math.sin(u * 17 + jit));
    L.push([P[i][0] - dy * r, P[i][1] + dx * r]);
    R.push([P[i][0] + dy * r, P[i][1] - dx * r]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < m; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = m - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fill();
}

// Quebra gulosa por palavras.
function layoutWords(ctx, words, maxW) {
  const sp = ctx.measureText(' ').width;
  const lines = [[]];
  let x = 0;
  for (const wd of words) {
    const ww = ctx.measureText(wd.map((q) => q.text).join('')).width;
    if (x > 0 && x + ww > maxW) {
      lines.push([]);
      x = 0;
    }
    let px = x;
    for (const q of wd) {
      const qw = ctx.measureText(q.text).width;
      lines[lines.length - 1].push({ ...q, x: px, w: qw, first: px === x });
      px += qw;
    }
    x += ww + sp;
  }
  return lines.map((ws) => ({ words: ws, w: ws.length ? ws[ws.length - 1].x + ws[ws.length - 1].w : 0 }));
}

export default {
  id: 'hand-annotations',
  title: 'Hand Annotations',
  description: 'Um marca-texto passa sobre a frase, depois entram um sublinhado, um círculo e uma seta desenhados à mão.',
  category: 'tipografia',
  tags: ['tipografia', 'overlay', 'alpha'],
  duration: 7,
  poster: 4.9,

  params: {
    text: {
      type: 'textarea',
      label: 'Frase (==marca== __sublinha__ ((círculo)))',
      rows: 3,
      default: 'O bom design é ==quase invisível==: __ninguém__ repara, até o dia em que ele ((falta)).',
    },
    note: { type: 'text', label: 'Nota da seta', default: 'repare' },
    size: { type: 'range', label: 'Tamanho', min: 0.04, max: 0.14, step: 0.002, default: 0.1 },
    color: { type: 'color', label: 'Texto', default: '#17161a' },
    marker: { type: 'color', label: 'Marca-texto', default: '#ffd84a' },
    ink: { type: 'color', label: 'Caneta', default: '#e5432d' },
    bg: { type: 'color', label: 'Fundo', default: '#f3efe6' },
    roughness: { type: 'range', label: 'Tremor da mão', min: 0, max: 2, step: 0.05, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ p }) {
    const r = rng(p.seed * 7919 + 13);
    const g = () => r() * 2 - 1;
    // Tudo normalizado; a geometria real sai do layout no render.
    return {
      words: parse(p.text),
      hl: { tilt: g() * 0.012, top: Array.from({ length: 9 }, g), bot: Array.from({ length: 9 }, g), cap: g() },
      ul: {
        harm: [g(), g(), g()].map((v, i) => ({ a: v, f: 1.5 + i * 1.7 + r(), ph: r() * TAU })),
        tilt: -0.02 + g() * 0.015,
        back: 0.55 + r() * 0.2,
      },
      ci: {
        a0: Math.PI * (0.78 + g() * 0.12),
        rot: g() * 0.06,
        over: 0.1 + r() * 0.08,
        harm: [1, 2, 3].map((n) => ({ n, a: g() * (0.05 / n), ph: r() * TAU })),
        drift: 0.05 + r() * 0.03,
      },
      ar: { bend: 0.25 + r() * 0.2, side: r() < 0.5 ? -1 : 1, wob: r() * TAU, head: 0.95 + g() * 0.12 },
      jit: [r() * 10, r() * 10, r() * 10, r() * 10],
    };
  },

  render(ctx, t, { w, h, p, duration: D, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const v = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      v.addColorStop(0, 'rgba(60,40,10,0)');
      v.addColorStop(1, 'rgba(60,40,10,0.09)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    }
    const { words } = state;
    if (!words.length) return;
    const m = Math.min(w, h);
    let fs = m * p.size;
    const font = (s) => `700 ${s}px Inter, system-ui, sans-serif`;
    ctx.font = font(fs);
    const maxW = w * (w > h ? 0.72 : 0.8);
    let lines = layoutWords(ctx, words, maxW);
    const lh = fs * 1.32;
    // Encolhe se o bloco ficar alto demais.
    if (lines.length * lh > h * 0.55) {
      fs *= (h * 0.55) / (lines.length * lh);
      ctx.font = font(fs);
      lines = layoutWords(ctx, words, maxW);
    }
    const LH = fs * 1.32;
    const blockW = Math.max(...lines.map((l) => l.w));
    const blockH = lines.length * LH;
    // Centraliza o conjunto texto + seta/nota (que fica abaixo).
    let ciLine0 = -1;
    lines.forEach((l, li) => l.words.forEach((q) => q.kind === 'ci' && ciLine0 < 0 && (ciLine0 = li)));
    const up = ciLine0 === 0 && lines.length > 1 ? -1 : 1;
    const yTop = h / 2 - (blockH + fs * 2.4) / 2 + (up < 0 ? fs * 2.4 : 0);
    // Posições absolutas (cada linha centralizada).
    const flat = [];
    let wi = -1;
    lines.forEach((l, li) => {
      const x0 = (w - l.w) / 2;
      const base = yTop + li * LH + fs * 1.0;
      for (const wd of l.words) {
        if (wd.first) wi++;
        flat.push({ ...wd, ax: x0 + wd.x, base, li, wi });
      }
    });

    // Saída: tudo some junto, subindo levemente.
    const out = ease.inCubic(seg(t, D - 0.85, D - 0.2));
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.translate(0, -out * fs * 0.25);

    const rough = p.roughness;
    const boxes = (kind) => {
      // retângulo por linha para a marca
      const by = {};
      for (const f of flat) {
        if (f.kind !== kind) continue;
        const b = by[f.li] || (by[f.li] = { x0: f.ax, x1: f.ax + f.w, base: f.base });
        b.x0 = Math.min(b.x0, f.ax);
        b.x1 = Math.max(b.x1, f.ax + f.w);
      }
      return Object.values(by);
    };

    // 1) Marca-texto (atrás do texto), linha por linha.
    const hlBoxes = boxes('hl');
    if (hlBoxes.length) {
      const H = state.hl;
      const T0 = 1.0;
      const per = 0.55 / hlBoxes.length + 0.12;
      ctx.fillStyle = rgba(p.marker, p.transparent ? 0.75 : 0.88);
      hlBoxes.forEach((b, i) => {
        const k = ease.inOutCubic(seg(t, T0 + i * per, T0 + i * per + per + 0.1));
        if (k <= 0) return;
        const pad = fs * 0.12;
        const xa = b.x0 - pad;
        const xb = xa + (b.x1 - b.x0 + pad * 2) * k;
        const yc = b.base - fs * 0.34;
        const hh = fs * 0.62;
        const tilt = H.tilt * rough;
        const N = 4;
        ctx.beginPath();
        for (let j = 0; j <= N; j++) {
          const x = xa + ((xb - xa) * j) / N;
          const y = yc - hh / 2 + (x - xa) * tilt + H.top[j] * fs * 0.014 * rough;
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        // ponta do marcador chanfrada
        ctx.lineTo(xb + fs * 0.05, yc + (xb - xa) * tilt + fs * 0.05 * H.cap);
        for (let j = N; j >= 0; j--) {
          const x = xa + ((xb - xa) * j) / N;
          const y = yc + hh / 2 + (x - xa) * tilt + H.bot[j] * fs * 0.014 * rough;
          ctx.lineTo(x - (j === 0 ? fs * 0.04 : 0), y);
        }
        ctx.closePath();
        ctx.fill();
      });
    }

    // 2) Texto: palavras sobem em cascata.
    ctx.fillStyle = p.color;
    ctx.textBaseline = 'alphabetic';
    const stg = Math.min(0.06, 0.75 / Math.max(1, wi));
    flat.forEach((f) => {
      const t0 = 0.15 + f.wi * stg;
      const k = ease.outExpo(seg(t, t0, t0 + 0.9));
      if (k <= 0) return;
      ctx.globalAlpha = (1 - out) * Math.min(1, k * 1.4);
      ctx.fillText(f.text, f.ax, f.base + (1 - k) * fs * 0.45);
    });
    ctx.globalAlpha = 1 - out;

    ctx.fillStyle = p.ink;
    const pw = fs * 0.075;

    // 3) Sublinhado: ida e volta curta.
    const ulBoxes = boxes('ul');
    ulBoxes.forEach((b, bi) => {
      const U = state.ul;
      const T0 = 2.0 + bi * 0.35;
      const k1 = ease.inOutCubic(seg(t, T0, T0 + 0.5));
      const k2 = ease.inOutCubic(seg(t, T0 + 0.45, T0 + 0.8));
      const xa = b.x0 - fs * 0.08;
      const xb = b.x1 + fs * 0.12;
      const y = b.base + fs * 0.2;
      const line = (from, to, dy, amp) => {
        const pts = [];
        const N = 40;
        for (let j = 0; j <= N; j++) {
          const s = j / N;
          const x = from + (to - from) * s;
          let wob = 0;
          for (const hm of U.harm) wob += hm.a * Math.sin(s * hm.f * Math.PI + hm.ph);
          pts.push([x, y + dy + (x - xa) * U.tilt * rough + wob * fs * 0.025 * rough * amp]);
        }
        return pts;
      };
      pen(ctx, line(xa, xb, 0, 1), pw, k1, state.jit[0]);
      pen(ctx, line(xb - fs * 0.05, xb - (xb - xa) * U.back, fs * 0.13, 0.7), pw * 0.85, k2, state.jit[1]);
    });

    // 4) Círculo em volta da palavra (elipse aberta, passando um pouco do início).
    const ciBoxes = boxes('ci');
    let circle = null;
    if (ciBoxes.length) {
      const b = ciBoxes[0];
      const C = state.ci;
      const cx = (b.x0 + b.x1) / 2;
      const cy = b.base - fs * 0.36;
      const rx = (b.x1 - b.x0) / 2 + fs * 0.42;
      const ry = fs * 0.72;
      circle = { cx, cy, rx, ry };
      const k = ease.inOutCubic(seg(t, 2.85, 3.65));
      if (k > 0) {
        const pts = [];
        const N = 90;
        const span = TAU * (1 + C.over);
        const cr = Math.cos(C.rot * rough);
        const sr = Math.sin(C.rot * rough);
        for (let j = 0; j <= N; j++) {
          const s = j / N;
          const a = C.a0 - span * s; // anti-horário na tela
          let rr = 1 + (0.5 - s) * C.drift * 2 * rough;
          for (const hm of C.harm) rr += hm.a * rough * Math.sin(a * hm.n + hm.ph);
          const x = Math.cos(a) * rx * rr;
          const y = Math.sin(a) * ry * rr;
          pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
        }
        pen(ctx, pts, pw, k, state.jit[2]);
      }
    }

    // 5) Seta: nasce numa nota manuscrita e aponta para o círculo (ou para o sublinhado/marca).
    // Vem de baixo (ou de cima, se o alvo está na primeira linha de um bloco com várias).
    const target = circle
      ? { x: circle.cx, y: circle.cy + up * circle.ry * 1.05 }
      : ulBoxes[0]
        ? { x: (ulBoxes[0].x0 + ulBoxes[0].x1) / 2, y: ulBoxes[0].base + fs * 0.45 }
        : hlBoxes[0]
          ? { x: (hlBoxes[0].x0 + hlBoxes[0].x1) / 2, y: hlBoxes[0].base + fs * 0.25 }
          : null;
    if (target) {
      const A = state.ar;
      const blockBottom = yTop + blockH;
      // Lado com mais espaço horizontal.
      const side = target.x > w / 2 ? -1 : 1;
      const sx = clamp(target.x + side * fs * (w > h ? 2.4 : 1.6), fs * 1.5, w - fs * 1.5);
      const sy = up > 0 ? Math.max(target.y + fs * 1.4, blockBottom + fs * 1.25) : Math.min(target.y - fs * 1.4, yTop - fs * 0.6);
      const ex = target.x + side * fs * 0.15;
      const ey = target.y + up * fs * 0.1;
      // Curva quadrática com barriga para fora.
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      const dx = ex - sx;
      const dy = ey - sy;
      const bend = A.bend * (rough * 0.5 + 0.5) * up;
      const qx = mx - dy * bend * side * -1;
      const qy = my + dx * bend * side * -1 * 0.5;
      const pts = [];
      const N = 40;
      for (let j = 0; j <= N; j++) {
        const s = j / N;
        const x = (1 - s) * (1 - s) * sx + 2 * (1 - s) * s * qx + s * s * ex;
        const y = (1 - s) * (1 - s) * sy + 2 * (1 - s) * s * qy + s * s * ey;
        pts.push([x + Math.sin(s * 9 + A.wob) * fs * 0.012 * rough, y]);
      }
      const T0 = 3.85;
      const k = ease.inOutCubic(seg(t, T0, T0 + 0.55));
      pen(ctx, pts, pw * 0.9, k, state.jit[3]);
      // Cabeça: duas farpas rápidas.
      const e = pts[N];
      const pv = pts[N - 4];
      const ang = Math.atan2(e[1] - pv[1], e[0] - pv[0]);
      const hl = fs * 0.42 * A.head;
      [0.55, -0.5].forEach((da, i) => {
        const kk = ease.outCubic(seg(t, T0 + 0.5 + i * 0.12, T0 + 0.72 + i * 0.12));
        if (kk <= 0) return;
        const a = ang + Math.PI + da;
        const barb = [];
        for (let j = 0; j <= 8; j++) {
          const s = j / 8;
          barb.push([e[0] + Math.cos(a) * hl * s, e[1] + Math.sin(a) * hl * s + Math.sin(s * Math.PI) * fs * 0.02 * rough]);
        }
        pen(ctx, barb, pw * 0.85, kk, i + 4);
      });
      // Nota manuscrita na cauda.
      if (p.note) {
        const nk = seg(t, T0 - 0.35, T0 + 0.25);
        if (nk > 0) {
          const nfs = fs * 1.05;
          ctx.font = `italic 400 ${nfs}px 'Instrument Serif', Georgia, serif`;
          const nw = ctx.measureText(p.note).width;
          let nx = side > 0 ? sx + fs * 0.25 : sx - nw - fs * 0.25;
          nx = clamp(nx, fs * 0.5, w - nw - fs * 0.5);
          const ny = up > 0 ? sy + nfs * 0.55 : sy - nfs * 0.15;
          ctx.save();
          ctx.beginPath();
          // revela da esquerda para a direita, como escrita
          ctx.rect(nx - fs * 0.3, ny - nfs * 1.2, (nw + fs * 0.6) * ease.inOutSine(nk), nfs * 1.8);
          ctx.clip();
          ctx.translate(nx, ny);
          ctx.rotate(-0.04 * rough);
          ctx.fillText(p.note, 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  },
};
