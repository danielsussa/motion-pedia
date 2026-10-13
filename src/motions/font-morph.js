import { TAU, clamp, lerp, seg, ease, rgba } from '../lib/anim.js';

// A mesma palavra em três famílias: serifada itálica → grotesca → mono → serifada (loop).
// Cada letra troca de fonte por uma cortina inclinada que desce sobre ela (a nova fica acima da linha,
// a velha abaixo, um fio de destaque marca o corte), com stagger da esquerda para a direita. As
// posições das letras deslizam juntas entre os dois layouts. Corpo normalizado pela altura de
// maiúscula, então a troca não "pula" de tamanho.
const FACES = [
  { name: 'Instrument Serif Italic', css: (z) => `italic ${z}px "Instrument Serif", serif`, track: 0 },
  { name: 'Inter Extra Bold', css: (z) => `800 ${z}px Inter, system-ui, sans-serif`, track: -0.03 },
  { name: 'JetBrains Mono', css: (z) => `600 ${z}px "JetBrains Mono", monospace`, track: -0.02 },
];

// [início, fim] de cada troca (s): 0→1, 1→2, 2→0. Entre elas, a palavra descansa.
const MORPHS = [[1.6, 3.0], [4.6, 6.0], [7.6, 9.0]];

export default {
  id: 'font-morph',
  title: 'Font Morph',
  description: 'Uma palavra passa de serifada itálica a grotesca e a mono, letra por letra, por uma cortina inclinada com fio de destaque.',
  category: 'tipografia',
  tags: ['tipografia', 'loop', 'transição'],
  duration: 9,
  poster: 2.35,

  params: {
    text: { type: 'text', label: 'Palavra', default: 'Tipografia' },
    size: { type: 'range', label: 'Tamanho', min: 0.1, max: 0.4, step: 0.005, default: 0.22 },
    spread: { type: 'range', label: 'Stagger (s)', min: 0, max: 1, step: 0.05, default: 0.5 },
    slant: { type: 'range', label: 'Inclinação da cortina', min: -0.6, max: 0.6, step: 0.05, default: 0.25 },
    labels: { type: 'boolean', label: 'Nome da fonte', default: true },
    color: { type: 'color', label: 'Texto', default: '#16151a' },
    accent: { type: 'color', label: 'Destaque', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Fundo', default: '#f1ece4' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const chars = [...(p.text || ' ')];
    const c = document.createElement('canvas').getContext('2d');
    // escala de cada família para a mesma altura de maiúscula
    const capOf = (f) => {
      c.font = f.css(100);
      return c.measureText('H').actualBoundingBoxAscent / 100;
    };
    const caps = FACES.map(capOf);
    const ref = caps[1];
    const scales = caps.map((k) => ref / k);
    const layout = (fs) =>
      FACES.map((f, i) => {
        const z = fs * scales[i];
        c.font = f.css(z);
        const ws = chars.map((ch) => c.measureText(ch).width);
        const tr = f.track * z;
        const total = ws.reduce((a, b) => a + b, 0) + tr * (chars.length - 1);
        let x = -total / 2;
        const cx = ws.map((cw) => {
          const v = x + cw / 2;
          x += cw + tr;
          return v;
        });
        return { z, ws, cx, total };
      });
    let fs = m * p.size;
    const widest = Math.max(...layout(fs).map((l) => l.total));
    if (widest > w * 0.86) fs *= (w * 0.86) / widest;
    return { chars, fs, L: layout(fs) };
  },

  render(ctx, t, { w, h, p, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const { chars, fs, L } = state;
    const n = chars.length;
    const m = Math.min(w, h);
    const capH = fs * 0.727;
    const base = h / 2 + capH / 2;
    const cx0 = w / 2;

    // qual troca está ativa (ou a última concluída)
    let k = MORPHS.length - 1;
    let from = 2;
    let to = 0;
    for (let i = 0; i < MORPHS.length; i++) {
      if (t < MORPHS[i][1] || i === MORPHS.length - 1) {
        k = i;
        break;
      }
    }
    const [a, b] = MORPHS[k];
    from = k;
    to = (k + 1) % FACES.length;
    if (t < a && k === 0) {
      // antes da primeira troca: descansa na fonte 0
      from = 0;
      to = 0;
    }
    const spread = Math.min(p.spread, (b - a) * 0.6);
    const per = b - a - spread; // duração da cortina de cada letra
    const glob = ease.inOutCubic(seg(t, a, b)); // trilho da legenda

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const top = base - fs * 1.0; // cobre ascendentes
    const bot = base + fs * 0.32; // e descendentes
    const slope = p.slant;
    const lineW = Math.max(1, m * 0.0022);

    const A = L[from];
    const Bl = L[to];
    // Cada letra tem a sua cortina; a largura do "slot" acompanha a própria troca, e o layout é refeito
    // em sequência (sem sobreposição entre vizinhas). O total é recentrado a cada quadro.
    const es = chars.map((_, i) => {
      if (from === to) return 0;
      const s0 = a + (n > 1 ? (i / (n - 1)) * spread : 0);
      return ease.inOutCubic(seg(t, s0, s0 + per));
    });
    const trA = FACES[from].track * A.z;
    const trB = FACES[to].track * Bl.z;
    const slots = es.map((e, i) => lerp(A.ws[i], Bl.ws[i], e));
    const gaps = es.map((e) => lerp(trA, trB, e));
    const total = slots.reduce((s1, v) => s1 + v, 0) + gaps.slice(0, -1).reduce((s1, v) => s1 + v, 0);
    let cursorX = cx0 - total / 2;
    for (let i = 0; i < n; i++) {
      const ch = chars[i];
      const x = cursorX + slots[i] / 2;
      cursorX += slots[i] + gaps[i];
      const e = es[i];
      if (e <= 0 || e >= 1) {
        const f = e >= 1 ? to : from;
        ctx.font = FACES[f].css(L[f].z);
        ctx.fillStyle = p.color;
        ctx.fillText(ch, x, base);
        continue;
      }
      // cortina: linha inclinada que desce de cima (antes do topo) até abaixo da base
      const half = Math.max(A.ws[i], Bl.ws[i]) / 2 + fs * 0.3; // folga para o itálico (o "f" passa da caixa)
      const lh = slots[i] / 2 + fs * 0.03; // meia largura do fio
      // cada glifo é espremido/esticado na horizontal para caber no slot (sem invadir as vizinhas)
      const kNew = Math.min(1.6, slots[i] / Math.max(1, Bl.ws[i]));
      const kOld = Math.min(1.6, slots[i] / Math.max(1, A.ws[i]));
      const span = slope * half;
      const y0 = lerp(top - Math.abs(span), bot + Math.abs(span), e);
      const yl = y0 - span; // y da linha na esquerda
      const yr = y0 + span; // na direita
      const l = x - half;
      const r = x + half;
      // nova (acima da linha), entrando de cima com um leve deslize
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(l, top - fs);
      ctx.lineTo(r, top - fs);
      ctx.lineTo(r, yr);
      ctx.lineTo(l, yl);
      ctx.closePath();
      ctx.clip();
      ctx.font = FACES[to].css(Bl.z);
      ctx.fillStyle = p.color;
      ctx.translate(x, 0);
      ctx.scale(kNew, 1);
      ctx.fillText(ch, 0, base - (1 - e) * fs * 0.08);
      ctx.restore();
      // velha (abaixo da linha), afundando um pouco
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(l, yl);
      ctx.lineTo(r, yr);
      ctx.lineTo(r, bot + fs);
      ctx.lineTo(l, bot + fs);
      ctx.closePath();
      ctx.clip();
      ctx.font = FACES[from].css(A.z);
      ctx.fillStyle = p.color;
      ctx.translate(x, 0);
      ctx.scale(kOld, 1);
      ctx.fillText(ch, 0, base + e * fs * 0.08);
      ctx.restore();
      // fio de destaque no corte
      // fio de destaque no corte, só enquanto atravessa a letra
      const inLetter = clamp((y0 - (base - capH * 1.05)) / (capH * 1.05 + fs * 0.12));
      const fa = Math.sin(Math.PI * inLetter);
      if (fa > 0.01) {
        ctx.strokeStyle = rgba(p.accent, fa);
        ctx.lineWidth = lineW;
        ctx.beginPath();
        ctx.moveTo(x - lh, y0 - slope * lh);
        ctx.lineTo(x + lh, y0 + slope * lh);
        ctx.stroke();
      }
    }

    if (!p.labels) return;
    // Legenda: nome da família atual (troca no meio da transição) + índice e um trilho de progresso.
    const mono = Math.max(10, m * 0.024);
    const ly = base + fs * 0.42 + mono * 1.6;
    const swap = seg(t, a + (b - a) * 0.35, a + (b - a) * 0.65);
    const cur = from === to ? from : swap < 0.5 ? from : to;
    const vis = from === to ? 1 : Math.abs(1 - 2 * swap);
    const dy = (from === to ? 0 : swap < 0.5 ? ease.inCubic(swap * 2) : -(1 - ease.outCubic((swap - 0.5) * 2))) * mono * 0.8;
    ctx.font = `600 ${mono}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba(p.color, 0.55 * clamp(vis * 1.4));
    ctx.fillText(FACES[cur].name.toUpperCase(), cx0, ly + dy);
    // trilho: três marcas, a ativa em destaque
    const gap = mono * 1.4;
    const ry = ly + mono * 1.5;
    for (let i = 0; i < FACES.length; i++) {
      const on = i === from ? 1 - glob : i === to ? glob : 0;
      const on2 = from === to ? (i === from ? 1 : 0) : on;
      const x = cx0 + (i - 1) * gap;
      ctx.fillStyle = on2 > 0.5 ? p.accent : rgba(p.color, 0.25);
      ctx.beginPath();
      ctx.arc(x, ry, mono * (0.16 + 0.1 * on2), 0, TAU);
      ctx.fill();
    }
  },
};
