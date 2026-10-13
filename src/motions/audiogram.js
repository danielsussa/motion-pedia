import { seg, ease, clamp, lerp, rgba, mixHex } from '../lib/anim.js';
import { asset, audioAt } from '../lib/assets.js';
import { drawCover } from '../lib/image.js';

const SANS = 'Inter, system-ui, sans-serif';
const SERIF = "'Instrument Serif', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const DT = 1 / 15; // largura de uma barra da onda, em segundos

const fmt = (s) => {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

// Legenda: palavras com tempo uniforme (1/wps, um pouco mais nas longas e após pontuação),
// páginas de até `per` palavras; pontuação final e quebras de linha abrem página nova.
function captionTimeline(text, wps, per, lead) {
  const pages = [];
  let t = lead;
  const base = 1 / wps;
  for (const line of String(text || '').split(/\n+/)) {
    let page = [];
    const toks = line.trim().split(/\s+/).filter(Boolean);
    toks.forEach((tok, k) => {
      const len = tok.replace(/[^\p{L}\p{N}]/gu, '').length;
      const d = base * (0.75 + 0.25 * clamp(len / 5, 0.4, 2));
      page.push({ text: tok, start: t });
      t += d;
      if (/[,;:]$/.test(tok)) t += base * 0.4;
      const stop = /[.!?…]$/.test(tok);
      if (stop) t += base * 0.8;
      if (page.length >= per || stop || k === toks.length - 1) {
        pages.push(page);
        page = [];
      }
    });
  }
  pages.forEach((pg, i) => {
    pg.start = pg[0].start;
    pg.end = i < pages.length - 1 ? pages[i + 1].start : Infinity;
  });
  return pages;
}

let mc = null;
const mctx = () => (mc ??= new OffscreenCanvas(4, 4).getContext('2d'));

// Quebra equilibrada: tenta larguras menores enquanto o número de linhas não aumenta (evita viúva).
function wrapLines(text, font, maxW, maxLines) {
  const base = wrapRaw(text, font, maxW, maxLines);
  if (base.length < 2) return base;
  let best = base;
  for (let k = 0.95; k > 0.5; k -= 0.05) {
    const tryL = wrapRaw(text, font, maxW * k, maxLines + 1);
    if (tryL.length > base.length) break;
    best = tryL;
  }
  return best;
}

function wrapRaw(text, font, maxW, maxLines) {
  const c = mctx();
  c.font = font;
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? `${cur} ${wd}` : wd;
    if (cur && c.measureText(test).width > maxW) {
      lines.push(cur);
      cur = wd;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] += '…';
  }
  return lines;
}

export default {
  id: 'audiogram',
  title: 'Audiogram',
  description: 'Podcast audiogram: a pulsing cover, a scrolling waveform and word-by-word captions.',
  category: 'dados',
  tags: ['audio', 'data', 'ui'],
  duration: 12,
  poster: 4.3,

  params: {
    audio: { type: 'audio', label: 'Audio', default: '/samples/beat.wav' },
    cover: { type: 'image', label: 'Cover', default: '/samples/portrait.jpg' },
    show: { type: 'text', label: 'Podcast', default: 'Frame by Frame · Ep. 42' },
    episode: { type: 'text', label: 'Episode', default: 'Why timing matters more than effects' },
    caption: {
      type: 'textarea',
      label: 'Caption',
      rows: 4,
      default:
        'The secret is not the effect itself. It is the time between one thing and the next, the pause before the cut. When the timing is right, the audience never notices the technique.',
    },
    wps: { type: 'range', label: 'Words per second', min: 1, max: 5, step: 0.1, default: 2.4 },
    accent: { type: 'color', label: 'Accent', default: '#e4572e' },
    ink: { type: 'color', label: 'Text', default: '#1c1a17' },
    bg: { type: 'color', label: 'Background', default: '#efe9df' },
  },

  setup({ w, h, p }) {
    const a = asset(p.audio);
    // Envelope da onda: pico do rms por janela de DT, normalizado (percentil 98).
    let env = null;
    if (a) {
      const n = Math.ceil(a.duration / DT);
      env = new Float32Array(n);
      for (let f = 0; f < a.frames; f++) {
        const i = Math.min(n - 1, Math.floor(f / a.fps / DT));
        env[i] = Math.max(env[i], a.rms[f]);
      }
      const s = Float32Array.from(env).sort();
      const top = Math.max(1e-6, s[Math.floor(n * 0.98)]);
      for (let i = 0; i < n; i++) env[i] = clamp(env[i] / top) ** 0.8;
    }
    let rmax = 1e-6;
    if (a) for (let f = 0; f < a.frames; f++) rmax = Math.max(rmax, a.rms[f]);

    // Layouts: paisagem = capa à esquerda e coluna de texto; vertical = tudo empilhado e centrado;
    // quadrado/4:5 = capa pequena com o título ao lado, onda e legenda embaixo em largura total.
    const m = Math.min(w, h);
    const mode = w / h > 1.2 ? 'wide' : h / w > 1.5 ? 'tall' : 'compact';
    const L = {};
    const kick = m * 0.022;
    const waveH = m * 0.14;
    const capH = m * 0.12;
    const prog = m * 0.05;
    const gap = m * 0.04;
    const head = (tw, size, lines) => {
      L.titleSize = size;
      L.tf = `italic 400 ${size}px ${SERIF}`;
      L.titleLines = wrapLines(p.episode, L.tf, tw, lines);
      return kick + gap * 0.6 + L.titleLines.length * size * 1.02;
    };
    const bottom = waveH + gap * 0.8 + capH + gap * 0.6 + prog;
    let y;
    if (mode === 'wide') {
      const S = h * 0.56;
      L.cover = { x: w * 0.08, y: (h - S) / 2, s: S };
      L.x = L.tx = L.cover.x + S + w * 0.05;
      L.cw = L.tcw = w * 0.92 - L.x;
      const hh = head(L.tcw, m * 0.064, 2);
      y = (h - (hh + gap + bottom)) / 2;
      L.kickY = y + kick * 0.8;
      L.titleY = y + kick + gap * 0.6 + L.titleSize * 0.82;
      y += hh + gap;
    } else if (mode === 'tall') {
      const S = Math.min(w * 0.6, h * 0.34);
      L.x = L.tx = w * 0.09;
      L.cw = L.tcw = w * 0.82;
      const hh = head(L.tcw, m * 0.068, 2);
      const total = S + m * 0.08 + hh + gap + bottom;
      let top = (h - total) / 2 - h * 0.02;
      L.cover = { x: (w - S) / 2, y: top, s: S };
      top += S + m * 0.08;
      L.kickY = top + kick * 0.8;
      L.titleY = top + kick + gap * 0.6 + L.titleSize * 0.82;
      y = top + hh + gap;
    } else {
      const S = m * 0.3;
      L.x = w * 0.08;
      L.cw = w * 0.84;
      L.tx = L.x + S + m * 0.05;
      L.tcw = L.x + L.cw - L.tx;
      const hh = head(L.tcw, m * 0.056, 3);
      const total = S + gap * 1.4 + bottom;
      const top = (h - total) / 2;
      L.cover = { x: L.x, y: top, s: S };
      const ty = top + (S - hh) / 2;
      L.kickY = ty + kick * 0.8;
      L.titleY = ty + kick + gap * 0.6 + L.titleSize * 0.82;
      y = top + S + gap * 1.4;
    }
    L.waveY = y + waveH / 2;
    L.waveH = waveH;
    y += waveH + gap * 0.8;
    L.capY = y;
    L.capH = capH;
    y += capH + gap * 0.6;
    L.progY = y;
    const wide = mode === 'wide';
    return { a, env, rmax, L, pages: captionTimeline(p.caption, p.wps, wide ? 7 : 5, 0.4), wide };
  },

  render(ctx, t, { w, h, p, duration: D, state }) {
    const m = Math.min(w, h);
    const { a, env, L, pages } = state;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const total = a ? a.duration : D;
    const tt = ((t % total) + total) % total;
    // Nível suavizado (pico com decaimento nos últimos ~150 ms).
    let level = 0;
    if (a) for (let k = 0; k < 9; k++) level = Math.max(level, (audioAt(a, t - k / 60).rms / state.rmax) * (1 - k * 0.1));
    level = clamp(level);
    const intro = (d, dur = 0.9) => ease.outExpo(seg(t, d, d + dur));

    // ---- capa ----
    const c = L.cover;
    const ci = intro(0, 1.1);
    const sc = lerp(0.9, 1, ci) * (1 + 0.018 * level);
    ctx.save();
    ctx.globalAlpha = clamp(ci * 1.5);
    ctx.translate(c.x + c.s / 2, c.y + c.s / 2);
    ctx.scale(sc, sc);
    // sombra suave barata: dois retângulos translúcidos deslocados
    const r = c.s * 0.06;
    ctx.fillStyle = rgba(p.ink, 0.06);
    ctx.beginPath();
    ctx.roundRect(-c.s / 2 + m * 0.004, -c.s / 2 + m * 0.018, c.s, c.s, r);
    ctx.fill();
    ctx.fillStyle = rgba(p.ink, 0.05);
    ctx.beginPath();
    ctx.roundRect(-c.s / 2, -c.s / 2 + m * 0.008, c.s, c.s, r);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-c.s / 2, -c.s / 2, c.s, c.s, r);
    ctx.clip();
    const img = asset(p.cover);
    if (img && img.width) {
      ctx.translate(-c.s / 2, -c.s / 2);
      drawCover(ctx, img, c.s, c.s, { fy: 0.3, zoom: lerp(1.08, 1, ease.outCubic(seg(t, 0, D))) });
    } else {
      ctx.fillStyle = mixHex(p.bg, p.ink, 0.12);
      ctx.fillRect(-c.s / 2, -c.s / 2, c.s, c.s);
    }
    ctx.restore();
    // selo "ao vivo" com o nível do som
    const bx = -c.s / 2 + c.s * 0.06, by = c.s / 2 - c.s * 0.06;
    const bh = c.s * 0.085, bw = bh * 1.9;
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.roundRect(bx, by - bh, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const v = a ? audioAt(a, t - i * 0.05).rms / state.rmax : 0.2;
      const hh = bh * (0.2 + 0.48 * clamp(v * 1.3));
      const xx = bx + bw * (0.3 + i * 0.13);
      ctx.fillRect(xx - bh * 0.04, by - bh / 2 - hh / 2, bh * 0.08, hh);
    }
    ctx.restore();

    // ---- textos ----
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const ki = intro(0.25);
    ctx.globalAlpha = ki;
    ctx.font = `600 ${m * 0.021}px ${MONO}`;
    ctx.letterSpacing = `${(m * 0.003).toFixed(2)}px`;
    ctx.fillStyle = p.accent;
    ctx.fillText(p.show.toUpperCase(), L.tx, L.kickY + (1 - ki) * m * 0.02);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = p.ink;
    ctx.font = L.tf;
    L.titleLines.forEach((ln, i) => {
      const e = intro(0.35 + i * 0.08);
      ctx.globalAlpha = e;
      ctx.fillText(ln, L.tx, L.titleY + i * L.titleSize * 1.02 + (1 - e) * m * 0.03);
    });
    ctx.globalAlpha = 1;

    // ---- onda: barras na grade do tempo, rolando; passado no destaque, futuro apagado ----
    const N = Math.round(L.cw / (m * 0.0125));
    const slot = L.cw / N;
    const bwid = slot * 0.5;
    const head = Math.round(N * 0.62); // posição da agulha
    const gi = Math.floor(t / DT);
    const fr = t / DT - gi;
    const wy = L.waveY;
    const wi = intro(0.5, 1.2);
    const past = new Path2D();
    const fut = new Path2D();
    for (let i = -1; i <= N; i++) {
      const idx = gi + (i - head);
      let v;
      if (env) {
        const n = env.length;
        v = env[((idx % n) + n) % n];
      } else v = 0.12 + 0.1 * Math.abs(Math.sin(idx * 1.7));
      if (idx < 0 && t < total) v *= 0.15;
      const x = L.x + (i - fr) * slot + (slot - bwid) / 2;
      if (x < L.x - 0.5 || x + bwid > L.x + L.cw + 0.5) continue;
      // abre do centro na entrada
      const open = clamp(wi * 1.6 - Math.abs(i / N - 0.5) * 1.2);
      const hh = Math.max(bwid, L.waveH * (0.06 + 0.94 * v) * open);
      (i <= head ? past : fut).roundRect(x, wy - hh / 2, bwid, hh, bwid / 2);
    }
    ctx.fillStyle = p.accent;
    ctx.fill(past);
    ctx.fillStyle = rgba(p.ink, 0.16);
    ctx.fill(fut);
    // agulha
    const hx = L.x + head * slot + slot / 2 - fr * slot;
    ctx.fillStyle = rgba(p.ink, 0.8 * wi);
    ctx.fillRect(hx - 0.75, wy - L.waveH * 0.62, 1.5, L.waveH * 1.24);
    ctx.beginPath();
    ctx.arc(hx, wy - L.waveH * 0.62, m * (0.005 + 0.004 * level), 0, Math.PI * 2);
    ctx.fill();

    // ---- legenda (página atual; palavra falada no destaque) ----
    let pg = null;
    for (const q of pages) if (tt >= q.start - 0.05) pg = q;
    if (pg) {
      const fs = m * (state.wide ? 0.04 : 0.046);
      ctx.font = `600 ${fs}px ${SANS}`;
      const sp = ctx.measureText(' ').width;
      const lines = [[]];
      let x = 0;
      for (const wd of pg) {
        const ww = ctx.measureText(wd.text).width;
        if (x > 0 && x + ww > L.cw) {
          lines.push([]);
          x = 0;
        }
        lines[lines.length - 1].push({ wd, x, ww });
        x += ww + sp;
      }
      const pin = ease.outCubic(seg(tt, pg.start - 0.05, pg.start + 0.2));
      const pout = pg.end === Infinity ? 0 : ease.inCubic(seg(tt, pg.end - 0.15, pg.end));
      lines.forEach((ln, li) => {
        const yy = L.capY + fs * 1.0 + li * fs * 1.25 + (1 - pin) * fs * 0.4;
        for (const { wd, x: wx, ww } of ln) {
          const on = tt >= wd.start;
          const k = ease.outCubic(seg(tt, wd.start, wd.start + 0.15));
          ctx.globalAlpha = pin * (1 - pout) * (on ? 1 : 0.38);
          if (on && (wd === pg[pg.length - 1] || pg[pg.indexOf(wd) + 1]?.start > tt)) {
            // marca-texto atrás da palavra atual
            ctx.fillStyle = rgba(p.accent, 0.18 * k);
            ctx.beginPath();
            ctx.roundRect(L.x + wx - fs * 0.12, yy - fs * 0.86, (ww + fs * 0.24) * k, fs * 1.14, fs * 0.16);
            ctx.fill();
            ctx.fillStyle = mixHex(p.ink, p.accent, 0.75);
          } else ctx.fillStyle = p.ink;
          ctx.fillText(wd.text, L.x + wx, yy);
        }
      });
      ctx.globalAlpha = 1;
    }

    // ---- progresso ----
    const pi = intro(0.6);
    const py = L.progY + m * 0.01;
    const ph = Math.max(2, m * 0.004);
    ctx.globalAlpha = pi;
    ctx.fillStyle = rgba(p.ink, 0.12);
    ctx.fillRect(L.x, py, L.cw, ph);
    ctx.fillStyle = p.ink;
    ctx.fillRect(L.x, py, L.cw * (tt / total), ph);
    ctx.font = `500 ${m * 0.019}px ${MONO}`;
    ctx.fillStyle = rgba(p.ink, 0.55);
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(tt), L.x, py + m * 0.016);
    ctx.textAlign = 'right';
    ctx.fillText(a ? `-${fmt(total - tt)}` : 'loading audio…', L.x + L.cw, py + m * 0.016);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  },
};
