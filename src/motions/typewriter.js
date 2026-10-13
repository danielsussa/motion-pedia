import { seg, ease, fract, rgba } from '../lib/anim.js';

// Hash determinístico 0..1 (ritmo "humano" da digitação sem Math.random).
const hash = (a, b = 0) => fract(Math.sin(a * 12.9898 + b * 78.233 + 0.5) * 43758.5453);

const FONTS = {
  Sans: (s) => `700 ${s}px Inter, system-ui, sans-serif`,
  Mono: (s) => `500 ${s}px "JetBrains Mono", ui-monospace, monospace`,
  Serif: (s) => `400 ${s * 1.12}px "Instrument Serif", Georgia, serif`,
};

// Quebra de linha gulosa por palavra.
function wrap(ctx, text, maxW) {
  const lines = [];
  let line = '';
  let start = 0;
  let lineStart = 0;
  const words = text.split(/(\s+)/);
  for (const wd of words) {
    const test = line + wd;
    if (line && !/^\s+$/.test(wd) && ctx.measureText(test.trimEnd()).width > maxW) {
      lines.push({ text: line, start: lineStart });
      lineStart = start;
      line = wd;
    } else line = test;
    start += wd.length;
  }
  lines.push({ text: line, start: lineStart });
  return lines;
}

export default {
  id: 'typewriter',
  title: 'Typewriter',
  description: 'Texto digitado com cursor piscando, um erro de digitação apagado com backspace e corrigido.',
  category: 'tipografia',
  tags: ['tipografia', 'intro', 'ui'],
  duration: 7,
  poster: 3.2,

  params: {
    text: { type: 'text', label: 'Texto ([certo|errado] = erro)', default: 'Ideias que viram [movimento|moviemnto] em segundos.' },
    font: { type: 'select', label: 'Fonte', options: ['Sans', 'Mono', 'Serif'], default: 'Sans' },
    size: { type: 'range', label: 'Tamanho', min: 0.03, max: 0.16, step: 0.001, default: 0.1 },
    cps: { type: 'range', label: 'Letras por segundo', min: 5, max: 30, step: 1, default: 15 },
    color: { type: 'color', label: 'Texto', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Cursor / destaque', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Fundo', default: '#0d0d10' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ p, duration }) {
    // Interpreta "[certo|errado]".
    const m = p.text.match(/\[([^|\]]*)\|([^\]]*)\]/);
    const before = m ? p.text.slice(0, m.index) : p.text;
    const right = m ? m[1] : '';
    const wrong = m ? m[2] : '';
    const after = m ? p.text.slice(m.index + m[0].length) : '';
    const final = before + right + after;

    // Eventos: { t, str, times[] } (times = instante em que cada caractere apareceu).
    const ev = [{ t: 0, str: '', times: [] }];
    let tc = 0.45;
    let str = '';
    let times = [];
    let k = 0;
    const base = 1 / p.cps;
    const type = (s) => {
      for (const c of s) {
        const prev = str[str.length - 1] || '';
        let d = base * (0.55 + 0.9 * hash(k++, 3));
        if (/[\s,.;:!?]/.test(prev)) d *= 1.7;
        tc += d;
        str += c;
        times = [...times, tc];
        ev.push({ t: tc, str, times });
      }
    };
    let typo = null;
    type(before);
    if (m && wrong !== right) {
      type(wrong);
      typo = { from: before.length, len: wrong.length, t0: tc, t1: tc + 0.7 };
      tc += 0.7;
      let common = 0;
      while (common < wrong.length && wrong[common] === right[common]) common++;
      for (let i = wrong.length; i > common; i--) {
        tc += base * 0.45;
        str = str.slice(0, -1);
        times = times.slice(0, -1);
        ev.push({ t: tc, str, times });
      }
      tc += 0.18;
      type(right.slice(common));
    } else type(right);
    type(after);

    // Encaixa na duração: digitação termina até D − 2.5 s.
    const end = duration - 2.5;
    const sc = tc > end ? (end - 0.45) / (tc - 0.45) : 1;
    const fit = (x) => 0.45 + (x - 0.45) * sc;
    for (const e of ev) {
      e.t = fit(e.t);
      e.times = e.times.map(fit);
    }
    if (typo) {
      typo.t0 = fit(typo.t0);
      typo.t1 = fit(typo.t1);
    }
    return { ev, final, typo, typedEnd: fit(tc) };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const { ev, final, typo } = state;
    const D = duration;
    const fs = Math.min(w, h) * p.size;
    const font = FONTS[p.font] || FONTS.Sans;
    ctx.font = font(fs);
    ctx.textBaseline = 'alphabetic';
    const lh = fs * 1.22;
    // Largura de quebra "balanceada": a menor que mantém o mesmo número de linhas.
    let maxW = w * 0.8;
    const nL = wrap(ctx, final, maxW).length;
    if (nL > 1) {
      let lo = maxW * 0.4;
      let hi = maxW;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (wrap(ctx, final, mid).length > nL) lo = mid;
        else hi = mid;
      }
      maxW = hi + 1;
    }

    // Bloco centralizado pelo texto final (não "pula" enquanto digita).
    const finalLines = wrap(ctx, final, maxW);
    const blockW = Math.max(...finalLines.map((l) => ctx.measureText(l.text.trimEnd()).width));
    const x0 = (w - blockW) / 2;
    const y0 = h / 2 - (finalLines.length * lh) / 2 + fs * 0.92;

    // Estado atual.
    const delAt = D - 0.75;
    let cur = ev[0];
    for (const e of ev) if (e.t <= t) cur = e;
    let str = cur.str;
    let times = cur.times;
    if (t >= delAt) {
      str = '';
      times = [];
    }
    const lastKey = t >= delAt ? delAt : cur.t;

    const lines = wrap(ctx, str, maxW);
    const posOf = (idx) => {
      // posição (x, y) do caractere idx
      let li = lines.length - 1;
      for (let i = 0; i < lines.length; i++) if (idx < lines[i].start + lines[i].text.length || i === lines.length - 1) { li = i; break; }
      const L = lines[li];
      return { x: x0 + ctx.measureText(L.text.slice(0, idx - L.start)).width, y: y0 + li * lh, li };
    };

    // Seleção (antes de apagar): varre do fim ao começo.
    const sel = ease.inOutCubic(seg(t, D - 1.45, D - 0.95));
    if (sel > 0 && str.length) {
      const nSel = Math.round(str.length * sel);
      const from = str.length - nSel;
      ctx.fillStyle = rgba(p.accent, 0.38);
      lines.forEach((L, li) => {
        const a = Math.max(from, L.start);
        const b = Math.min(str.length, L.start + L.text.length);
        if (b <= a) return;
        const xa = x0 + ctx.measureText(L.text.slice(0, a - L.start)).width;
        const xb = x0 + ctx.measureText(L.text.slice(0, b - L.start).trimEnd()).width;
        ctx.fillRect(xa, y0 + li * lh - fs * 0.86, Math.max(0, xb - xa), fs * 1.12);
      });
    }

    // Texto, caractere a caractere (pop sutil nos recém-digitados).
    ctx.fillStyle = p.color;
    lines.forEach((L, li) => {
      const y = y0 + li * lh;
      // parte "assentada" de uma vez
      let settled = 0;
      while (settled < L.text.length && t - times[L.start + settled] > 0.12) settled++;
      ctx.fillText(L.text.slice(0, settled), x0, y);
      for (let i = settled; i < L.text.length; i++) {
        const k = seg(t - times[L.start + i], 0, 0.12);
        const e = ease.outCubic(k);
        const x = x0 + ctx.measureText(L.text.slice(0, i)).width;
        ctx.globalAlpha = 0.25 + 0.75 * e;
        ctx.fillText(L.text[i], x, y + (1 - e) * fs * 0.12);
      }
      ctx.globalAlpha = 1;
    });

    // Sublinhado ondulado no erro enquanto ele "é notado".
    if (typo && t > typo.t0 && t < typo.t1 + 0.05 && str.length >= typo.from + typo.len) {
      const a = posOf(typo.from);
      const b = posOf(typo.from + typo.len - 1);
      if (a.li === b.li) {
        const xb = b.x + ctx.measureText(str[typo.from + typo.len - 1]).width;
        const grow = ease.outCubic(seg(t, typo.t0 + 0.05, typo.t0 + 0.35));
        const amp = fs * 0.045;
        const wl = fs * 0.16;
        const y = a.y + fs * 0.2;
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = Math.max(1, fs * 0.04);
        ctx.lineCap = 'round';
        ctx.beginPath();
        const end = a.x + (xb - a.x) * grow;
        for (let x = a.x; x <= end; x += wl / 8) ctx.lineTo(x, y + Math.sin(((x - a.x) / wl) * Math.PI * 2) * amp);
        ctx.stroke();
      }
    }

    // Cursor: sólido enquanto digita, pisca parado.
    const caret = str.length ? posOf(str.length) : { x: x0, y: y0 };
    if (str.length) {
      const L = lines[lines.length - 1];
      caret.x = x0 + ctx.measureText(L.text).width;
      caret.y = y0 + (lines.length - 1) * lh;
    }
    const typing = t - lastKey < 0.45 && t > 0.3;
    const blink = fract(t * 1.0) < 0.55;
    if (typing || blink) {
      ctx.fillStyle = p.accent;
      const cw = p.font === 'Mono' ? fs * 0.58 : Math.max(2, fs * 0.075);
      const ca = p.font === 'Mono' ? 0.85 : 1;
      ctx.globalAlpha = ca;
      ctx.fillRect(caret.x + fs * 0.04, caret.y - fs * 0.84, cw, fs * 1.04);
      ctx.globalAlpha = 1;
    }
  },
};
