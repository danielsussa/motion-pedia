import { TAU, clamp, lerp, seg, ease, spring, rgba, mixHex } from '../lib/anim.js';

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const F = 'Inter, system-ui, sans-serif';

const DEFAULT = `// anima um valor com mola
import { spring } from './anim.js';

const DURATION = 1.2;

export function bounce(el, t) {
  const k = spring(t / DURATION, 0.35);
  el.style.transform = \`scale(\${0.8 + 0.2 * k})\`;
  return k > 0.99 ? 'pronto' : null;
}`;

const KEYWORDS = new Set(
  ('const let var function return if else for while do break continue switch case default new class extends ' +
    'import export from as async await yield try catch finally throw typeof instanceof in of this super null ' +
    'undefined true false void delete static get set').split(' '),
);

// Tokenizer mínimo de JS → linhas de [{ s, k }] (k: kw, str, num, com, fn, prop, punc, id, ws).
// Strings com template literal e comentários de bloco atravessam linhas (estado `mode`).
function tokenize(src) {
  const lines = String(src).replace(/\t/g, '  ').replace(/\r/g, '').split('\n');
  const out = [];
  let mode = null; // null | 'block' | '`' | 'expr' (dentro de ${ } num template)
  let depth = 0;
  for (const line of lines) {
    const toks = [];
    let i = 0;
    const push = (s, k) => s && toks.push({ s, k });
    while (i < line.length) {
      if (mode === 'block') {
        const e = line.indexOf('*/', i);
        if (e < 0) { push(line.slice(i), 'com'); i = line.length; }
        else { push(line.slice(i, e + 2), 'com'); i = e + 2; mode = null; }
        continue;
      }
      if (mode === '`') {
        let j = i;
        while (j < line.length && line[j] !== '`' && !(line[j] === '$' && line[j + 1] === '{')) { if (line[j] === '\\') j++; j++; }
        if (j >= line.length) { push(line.slice(i), 'str'); i = line.length; }
        else if (line[j] === '`') { push(line.slice(i, j + 1), 'str'); i = j + 1; mode = null; }
        else { push(line.slice(i, j), 'str'); push('${', 'op'); i = j + 2; mode = 'expr'; depth = 0; }
        continue;
      }
      const c = line[i];
      if (mode === 'expr' && (c === '{' || c === '}')) {
        if (c === '}' && depth === 0) { push('}', 'op'); i++; mode = '`'; continue; }
        depth += c === '{' ? 1 : -1;
      }
      const rest = line.slice(i);
      let m;
      if (rest.startsWith('//')) { push(rest, 'com'); break; }
      if (rest.startsWith('/*')) { mode = 'block'; push('/*', 'com'); i += 2; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < line.length && line[j] !== c) { if (line[j] === '\\') j++; j++; }
        push(line.slice(i, j + 1), 'str');
        i = j + 1;
        continue;
      }
      if (c === '`' && mode !== 'expr') { mode = '`'; push('`', 'str'); i++; continue; }
      if ((m = rest.match(/^\s+/))) { push(m[0], 'ws'); i += m[0].length; continue; }
      if ((m = rest.match(/^(0x[\da-f]+|\d[\d_]*\.?\d*(e[+-]?\d+)?|\.\d+)/i))) { push(m[0], 'num'); i += m[0].length; continue; }
      if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) {
        const wd = m[0];
        const after = line.slice(i + wd.length);
        const prev = toks.length ? toks[toks.length - 1].s : '';
        let k = 'id';
        if (KEYWORDS.has(wd)) k = 'kw';
        else if (/^\s*\(/.test(after)) k = 'fn';
        else if (prev === '.') k = 'prop';
        else if (/^[A-Z][A-Z0-9_]+$/.test(wd)) k = 'num';
        else if (/^[A-Z]/.test(wd)) k = 'fn';
        push(wd, k);
        i += wd.length;
        continue;
      }
      if ((m = rest.match(/^(=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\+\+|--|[+\-*/%=<>!?:&|^~])/))) { push(m[0], 'op'); i += m[0].length; continue; }
      push(c, 'punc');
      i++;
    }
    out.push({ text: line, toks });
  }
  while (out.length > 1 && !out[out.length - 1].text.trim()) out.pop();
  return out;
}

export default {
  id: 'code-editor',
  title: 'Code Editor',
  description: 'Código sendo digitado num editor escuro com syntax highlight, números de linha, linha atual e cursor piscando.',
  category: 'dados',
  tags: ['ui', 'dados', 'tipografia'],
  duration: 12,
  poster: 9.5,

  params: {
    code: { type: 'textarea', label: 'Código', rows: 10, default: DEFAULT },
    file: { type: 'text', label: 'Arquivo', default: 'bounce.js' },
    accent: { type: 'color', label: 'Destaque (palavras-chave)', default: '#c3a6ff' },
    window: { type: 'color', label: 'Janela', default: '#15171e' },
    bg: { type: 'color', label: 'Fundo', default: '#0b0c10' },
    speed: { type: 'range', label: 'Velocidade de digitação', min: 0.5, max: 2, step: 0.05, default: 1 },
    lineNumbers: { type: 'boolean', label: 'Números de linha', default: true },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, p, px, duration }) {
    const lines = tokenize(p.code);
    // Agenda de digitação: custo por caractere; a indentação entra de uma vez (auto-indent),
    // quebra de linha e pontuação ganham uma pausa.
    const T0 = 1.0;
    const T1 = duration - 2.2;
    let c = 0;
    const charAt = []; // por linha: tempo (em "custo") antes do primeiro caractere visível; custo por char
    for (const L of lines) {
      const ind = L.text.match(/^\s*/)[0].length;
      const start = c;
      const n = L.text.length - ind;
      let acc = 0;
      const cum = new Float32Array(n + 1);
      for (let j = 0; j < n; j++) {
        const ch = L.text[ind + j];
        acc += ch === ' ' ? 0.7 : /[;{}(),]/.test(ch) ? 1.6 : 1;
        cum[j + 1] = acc;
      }
      c += acc + (L.text.trim() ? 7 : 3); // pausa no Enter
      charAt.push({ start, ind, cum });
    }
    const total = Math.max(c, 1);
    // custo por segundo: ritmo base × velocidade, acelerado se o código não couber na janela de tempo
    const k = 1 / Math.max(24 * p.speed, total / (T1 - T0));
    const sched = charAt.map((a) => ({ ...a, start: T0 + a.start * k, k }));
    const endT = T0 + total * k;

    // fundo estático pré-renderizado
    let wall = null;
    if (!p.transparent) {
      wall = document.createElement('canvas');
      wall.width = Math.max(4, Math.round(w * px));
      wall.height = Math.max(4, Math.round(h * px));
      const g = wall.getContext('2d');
      g.scale(px, px);
      g.fillStyle = p.bg;
      g.fillRect(0, 0, w, h);
      const rg = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      rg.addColorStop(0, rgba(p.accent, 0.13));
      rg.addColorStop(0.5, rgba(p.accent, 0.03));
      rg.addColorStop(1, rgba(p.accent, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    }
    return { lines, sched, endT, wall };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    const { lines, sched, endT, wall } = state;
    if (wall) ctx.drawImage(wall, 0, 0, w, h);

    // ---------- geometria ----------
    const m = Math.min(w, h);
    const portrait = h > w * 1.15;
    const WW = portrait ? w * 0.9 : Math.min(w * 0.78, h * 1.5);
    const maxCols = Math.max(24, ...lines.map((l) => l.text.length)) + 2;
    const titleH = WW * 0.052;
    const statusH = WW * 0.036;
    const gutterCols = p.lineNumbers ? Math.max(2, String(lines.length).length) + 2.2 : 1.2;
    // tamanho da fonte: cabe na largura (colunas) e um número razoável de linhas na altura
    const cwRatio = 0.6; // largura do caractere do JetBrains Mono / tamanho
    const padX = WW * 0.03;
    const fsW = (WW - padX * 2) / ((maxCols + gutterCols) * cwRatio);
    const visRows = clamp(lines.length + 1, 8, 22);
    const maxWH = h * (portrait ? 0.62 : 0.84);
    const fsH = (maxWH - titleH - statusH - padX * 1.4) / (visRows * 1.62);
    const fs = Math.min(fsW, fsH, m * 0.042);
    const lh = fs * 1.62;
    const cw = fs * cwRatio;
    const rows = Math.min(lines.length + 1, Math.max(4, Math.floor((maxWH - titleH - statusH - padX * 1.4) / lh)));
    const WH = titleH + statusH + padX * 1.4 + Math.max(rows, 8) * lh;
    const R = WW * 0.018;

    // ---------- entrada / saída ----------
    const inK = spring(seg(t, 0.05, 1.05), 0.14);
    const outK = ease.inCubic(seg(t, duration - 0.7, duration - 0.05));
    if (outK >= 1) return;
    ctx.save();
    ctx.globalAlpha = clamp(seg(t, 0.05, 0.35)) * (1 - outK);
    ctx.translate(w / 2, h / 2 + (1 - inK) * m * 0.08 + outK * m * 0.05);
    const sc = (0.94 + 0.06 * inK) * (1 - 0.03 * outK);
    ctx.scale(sc, sc);
    ctx.translate(-WW / 2, -WH / 2);

    // sombra barata em camadas + janela
    for (const [e, a] of [[60, 0.1], [30, 0.14], [10, 0.18]]) {
      const s = (e * WW) / 1600;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.roundRect(-s * 0.5, s * 0.7, WW + s, WH + s * 0.4, R + s);
      ctx.fill();
    }
    const win = p.window;
    ctx.fillStyle = win;
    ctx.beginPath();
    ctx.roundRect(0, 0, WW, WH, R);
    ctx.fill();
    ctx.save();
    ctx.clip();

    // barra de título com abas
    const bar = mixHex(win, '#000000', 0.28);
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, WW, titleH);
    const dotR = titleH * 0.12;
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(titleH * 0.55 + i * dotR * 3.3, titleH / 2, dotR, 0, TAU);
      ctx.fill();
    });
    // aba ativa
    const tabX = titleH * 0.55 + dotR * 10;
    ctx.font = `500 ${titleH * 0.3}px ${F}`;
    const tabLabel = p.file || 'index.js';
    const tabW = ctx.measureText(tabLabel).width + titleH * 1.3;
    ctx.fillStyle = win;
    ctx.beginPath();
    ctx.roundRect(tabX, titleH * 0.2, tabW, titleH * 0.8 + 2, [titleH * 0.16, titleH * 0.16, 0, 0]);
    ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.fillRect(tabX, titleH * 0.2, tabW, Math.max(1, titleH * 0.04));
    // ícone "JS" + nome
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8d44d';
    ctx.font = `800 ${titleH * 0.2}px ${F}`;
    ctx.fillText('JS', tabX + titleH * 0.3, titleH * 0.61);
    ctx.font = `500 ${titleH * 0.28}px ${F}`;
    ctx.fillStyle = '#d6d8e0';
    ctx.fillText(tabLabel, tabX + titleH * 0.72, titleH * 0.61);
    // indicador "não salvo" ↔ "x"
    const saved = t > endT + 0.5;
    const dx = tabX + tabW - titleH * 0.32;
    if (!saved && t > sched[0].start) {
      ctx.fillStyle = '#c9cbd3';
      ctx.beginPath();
      ctx.arc(dx, titleH * 0.6, titleH * 0.065, 0, TAU);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#6b6f7c';
      ctx.lineWidth = titleH * 0.035;
      ctx.lineCap = 'round';
      const q = titleH * 0.08;
      ctx.beginPath();
      ctx.moveTo(dx - q, titleH * 0.6 - q);
      ctx.lineTo(dx + q, titleH * 0.6 + q);
      ctx.moveTo(dx + q, titleH * 0.6 - q);
      ctx.lineTo(dx - q, titleH * 0.6 + q);
      ctx.stroke();
    }

    // ---------- estado de digitação ----------
    let curLine = 0;
    let curCol = 0;
    const shown = new Int32Array(lines.length).fill(-1); // -1 = linha ainda não existe
    for (let i = 0; i < lines.length; i++) {
      const S = sched[i];
      if (t < S.start) break;
      curLine = i;
      const local = (t - S.start) / S.k;
      // busca do número de caracteres digitados
      let n = 0;
      const cum = S.cum;
      while (n < cum.length - 1 && cum[n + 1] <= local) n++;
      shown[i] = S.ind + n;
      curCol = S.ind + n;
    }
    const typing = t >= sched[0].start && t < endT;
    if (t >= endT) {
      curLine = lines.length - 1;
      curCol = lines[curLine].text.length;
    }

    // ---------- área do código ----------
    const top = titleH + padX * 0.7;
    const gutW = gutterCols * cw;
    const codeX = padX + gutW;
    // rolagem suave para manter o cursor visível
    const scrollRows = (i) => Math.max(0, i - rows + 1);
    let scroll = 0;
    for (let i = 1; i < lines.length; i++) {
      const target = scrollRows(i) - scrollRows(i - 1);
      if (target > 0) scroll += target * ease.outCubic(seg(t, sched[i].start - 0.05, sched[i].start + 0.3));
    }
    const viewH = WH - top - statusH - padX * 0.3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - lh * 0.2, WW, viewH + lh * 0.2);
    ctx.clip();

    const yOf = (i) => top + (i - scroll) * lh;
    // linha atual
    if (t >= sched[0].start - 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(0, yOf(curLine), WW, lh);
    }

    const COL = {
      kw: p.accent,
      str: '#9fd8b4',
      num: '#f0b47d',
      com: '#5d6272',
      fn: '#8fb8ff',
      prop: '#d6d8e0',
      op: '#9aa0b0',
      punc: '#8a8f9e',
      id: '#e4e6ec',
      ws: '#000',
    };
    ctx.textBaseline = 'middle';
    // números de linha
    if (p.lineNumbers) {
      ctx.font = `400 ${fs * 0.9}px ${MONO}`;
      ctx.textAlign = 'right';
      for (let i = 0; i < lines.length; i++) {
        if (shown[i] < 0 && i > 0) break;
        const y = yOf(i);
        if (y < top - lh || y > top + viewH) continue;
        ctx.fillStyle = i === curLine ? '#c9cbd3' : '#454956';
        ctx.fillText(String(i + 1), padX + gutW - cw * 1.4, y + lh / 2);
      }
    }
    // código: agrupado por tipo de token (um fillStyle por tipo)
    ctx.textAlign = 'left';
    const byKind = {};
    for (let i = 0; i < lines.length; i++) {
      const lim = shown[i];
      if (lim < 0) continue;
      const y = yOf(i);
      if (y < top - lh || y > top + viewH) continue;
      let col = 0;
      for (const tk of lines[i].toks) {
        if (col >= lim) break;
        const s = col + tk.s.length > lim ? tk.s.slice(0, lim - col) : tk.s;
        if (tk.k !== 'ws') (byKind[tk.k] ||= []).push(s, codeX + col * cw, y + lh / 2);
        col += tk.s.length;
      }
    }
    for (const k in byKind) {
      const arr = byKind[k];
      ctx.fillStyle = COL[k];
      ctx.font = k === 'com' ? `italic 400 ${fs}px ${MONO}` : `${k === 'kw' ? 500 : 400} ${fs}px ${MONO}`;
      for (let j = 0; j < arr.length; j += 3) ctx.fillText(arr[j], arr[j + 1], arr[j + 2]);
    }

    // guias de indentação sutis
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < lines.length; i++) {
      if (shown[i] < 0) continue;
      const ind = sched[i].ind;
      for (let g = 2; g <= ind - 1 && g < 40; g += 2) ctx.fillRect(codeX + (g - 2) * cw + cw * 0.1, yOf(i), Math.max(1, fs * 0.05), lh);
    }

    // cursor: sólido enquanto digita, piscando quando parado
    const blinkOn = typing || Math.floor(t * 1.9) % 2 === 0;
    if (blinkOn && t >= sched[0].start - 0.6) {
      ctx.fillStyle = p.accent;
      ctx.fillRect(codeX + curCol * cw, yOf(curLine) + lh * 0.16, Math.max(1.5, fs * 0.11), lh * 0.68);
    }
    ctx.restore();

    // ---------- barra de status ----------
    const sy = WH - statusH;
    ctx.fillStyle = bar;
    ctx.fillRect(0, sy, WW, statusH);
    ctx.font = `500 ${statusH * 0.4}px ${F}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // pílula de modo com destaque
    const pillTxt = saved ? '✓ salvo' : typing ? 'editando' : 'pronto';
    const pw = ctx.measureText(pillTxt).width + statusH * 0.8;
    ctx.fillStyle = rgba(p.accent, saved ? 0.22 : 0.14);
    ctx.beginPath();
    ctx.roundRect(padX * 0.6, sy + statusH * 0.18, pw, statusH * 0.64, statusH * 0.32);
    ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.fillText(pillTxt, padX * 0.6 + statusH * 0.4, sy + statusH * 0.52);
    ctx.fillStyle = '#7c8090';
    ctx.textAlign = 'right';
    ctx.fillText(`Ln ${curLine + 1}, Col ${curCol + 1}    Espaços: 2    UTF-8    JavaScript`, WW - padX * 0.6, sy + statusH * 0.52);

    ctx.restore(); // clip janela
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = Math.max(1, WW / 1400);
    ctx.beginPath();
    ctx.roundRect(0, 0, WW, WH, R);
    ctx.stroke();
    ctx.restore();
  },
};
