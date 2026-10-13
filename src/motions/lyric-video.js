import { seg, ease, clamp, lerp, rgba } from '../lib/anim.js';
import { asset } from '../lib/assets.js';

const SANS = 'Inter, system-ui, sans-serif';
const SERIF = "'Instrument Serif', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const LAYOUTS = ['solo', 'pilha', 'frase'];

// Batidas: fluxo positivo da energia grave (bandas 0–7 ≈ até 200 Hz) somado ao do rms,
// picos locais acima de um limiar entre a mediana e o percentil 97, com intervalo mínimo.
function detectBeats(a, sens = 1) {
  const n = a.frames;
  const low = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let b = 0; b < 8; b++) s += a.data[f * a.bands + b];
    low[f] = s / 8;
  }
  let rmax = 1e-6;
  for (let f = 0; f < n; f++) rmax = Math.max(rmax, a.rms[f]);
  const o = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    // antes do início conta como silêncio (uma batida em t = 0 também vale)
    const dl = low[f] - (f > 1 ? Math.min(low[f - 1], low[f - 2]) : 0);
    const dr = (a.rms[f] - (f > 1 ? Math.min(a.rms[f - 1], a.rms[f - 2]) : 0)) / rmax;
    o[f] = Math.max(0, dl) + 0.5 * Math.max(0, dr);
  }
  const sorted = Float32Array.from(o).sort();
  const med = sorted[Math.floor(n * 0.5)];
  const hi = sorted[Math.floor(n * 0.97)];
  const thr = med + (hi - med) * clamp(0.75 / sens, 0.1, 0.95);
  const minGap = Math.round(0.2 * a.fps);
  const beats = [];
  let last = -1e9;
  for (let f = 0; f < n; f++) {
    if (o[f] < thr) continue;
    let peak = true;
    for (let k = -3; k <= 3 && peak; k++) if (k && f + k >= 0 && f + k < n && o[f + k] > o[f]) peak = false;
    if (!peak || f - last < minGap) continue;
    beats.push(f < 4 ? 0 : f / a.fps);
    last = f;
  }
  return beats;
}

// Letra: uma frase por linha; *palavra* sai em serif itálico.
function parseLyrics(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) =>
      l
        .split(/\s+/)
        .filter(Boolean)
        .map((raw) => {
          const em = /^\*.*\*[.,!?…]*$/.test(raw);
          return { text: raw.replace(/\*/g, ''), em };
        }),
    );
}

let mc = null;
const mctx = () => (mc ??= new OffscreenCanvas(4, 4).getContext('2d'));
const sansF = (wt, s) => `${wt} ${s}px ${SANS}`;
const serifF = (s) => `italic 400 ${s * 1.12}px ${SERIF}`;

// Posições finais de cada palavra para o layout da frase (coordenadas absolutas, baseline).
function layoutPhrase(words, kind, w, h, m) {
  const c = mctx();
  const maxW = w * 0.84;
  const out = words.map((wd) => ({ ...wd }));
  if (kind === 'solo') {
    for (const wd of out) {
      wd.text = wd.em ? wd.text : wd.text.toUpperCase();
      let s = m * 0.24;
      const f = (x) => (wd.em ? serifF(x * 1.15) : sansF(900, x));
      c.font = f(s);
      let mt = c.measureText(wd.text);
      if (mt.width > maxW) {
        s *= maxW / mt.width;
        c.font = f(s);
        mt = c.measureText(wd.text);
      }
      wd.font = f(s);
      wd.size = s;
      wd.w = mt.width;
      wd.x = (w - mt.width) / 2;
      wd.y = h / 2 + (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2;
    }
    return out;
  }
  if (kind === 'pilha') {
    const n = out.length;
    let s = Math.min(m * 0.2, (h * 0.72) / (n * 0.92));
    const f = (wd, x) => (wd.em ? serifF(x * 1.1) : sansF(850, x));
    for (const wd of out) wd.text = wd.em ? wd.text : wd.text.toUpperCase();
    let widest = 0;
    for (const wd of out) {
      c.font = f(wd, s);
      widest = Math.max(widest, c.measureText(wd.text).width);
    }
    if (widest > maxW) {
      s *= maxW / widest;
      widest = maxW;
    }
    const lh = s * 0.92;
    const x0 = (w - widest) / 2;
    const top = h / 2 - (lh * n) / 2;
    out.forEach((wd, i) => {
      wd.font = f(wd, s);
      c.font = wd.font;
      wd.w = c.measureText(wd.text).width;
      wd.size = s;
      wd.x = x0;
      wd.y = top + lh * (i + 1) - s * 0.14;
      wd.lh = lh;
    });
    return out;
  }
  // frase: texto corrido centrado, quebrando linhas.
  let s = m * 0.15;
  {
    // nenhuma palavra sozinha pode passar da largura
    let widest = 0;
    for (const wd of out) {
      c.font = wd.em ? serifF(s * 1.08) : sansF(700, s);
      widest = Math.max(widest, c.measureText(wd.text).width);
    }
    if (widest > maxW) s *= maxW / widest;
  }
  for (let tries = 0; tries < 8; tries++) {
    const sp = s * 0.28;
    const lines = [[]];
    let x = 0;
    for (const wd of out) {
      wd.font = wd.em ? serifF(s * 1.08) : sansF(700, s);
      c.font = wd.font;
      wd.w = c.measureText(wd.text).width;
      if (x > 0 && x + wd.w > maxW) {
        lines.push([]);
        x = 0;
      }
      lines[lines.length - 1].push(wd);
      x += wd.w + sp;
    }
    const lh = s * 1.12;
    if (lines.length * lh > h * 0.62 && tries < 7) {
      s *= 0.88;
      continue;
    }
    const top = h / 2 - (lines.length * lh) / 2;
    lines.forEach((ln, li) => {
      const lw = ln.reduce((a, wd) => a + wd.w, 0) + sp * (ln.length - 1);
      let xx = (w - lw) / 2;
      for (const wd of ln) {
        wd.x = xx;
        wd.y = top + lh * li + s * 0.86;
        wd.size = s;
        xx += wd.w + sp;
      }
    });
    break;
  }
  return out;
}

export default {
  id: 'lyric-video',
  title: 'Lyric Video',
  description: 'Lyrics appear word by word to the beat of the audio (each beat swaps the word), switching layouts per phrase.',
  category: 'tipografia',
  tags: ['typography', 'audio', 'loop'],
  duration: 12,
  poster: 4.7,

  params: {
    audio: { type: 'audio', label: 'Audio', default: '/samples/beat.wav' },
    lyrics: {
      type: 'textarea',
      label: 'Lyrics (one phrase per line, *emphasis*)',
      rows: 5,
      default: 'I feel the city *pulse*\nevery light a beat\nnever stops\nthe whole night in *motion*\nheart on the rhythm',
    },
    layout: { type: 'select', label: 'Layout', options: ['variado', 'solo', 'pilha', 'frase'], default: 'variado' },
    beatsPerWord: { type: 'range', label: 'Beats per word', min: 1, max: 4, step: 1, default: 1 },
    sensitivity: { type: 'range', label: 'Sensitivity', min: 0.5, max: 2, step: 0.05, default: 1 },
    track: { type: 'text', label: 'Track', default: 'Electric Night — Beat Demo' },
    color: { type: 'color', label: 'Text', default: '#f3efe8' },
    accent: { type: 'color', label: 'Accent', default: '#c6ff3d' },
    bg: { type: 'color', label: 'Background', default: '#0e0e10' },
  },

  setup({ w, h, p, px, duration: D }) {
    const m = Math.min(w, h);
    const a = asset(p.audio);
    let beats = a ? detectBeats(a, p.sensitivity) : [];
    const total = a ? Math.min(a.duration, D) : D;
    if (beats.length < 4) beats = Array.from({ length: Math.ceil(total / 0.5) }, (_, i) => i * 0.5);
    beats = beats.filter((b) => b < D);
    const bpw = Math.round(p.beatsPerWord);

    // Agenda: cada palavra começa numa batida; entre frases uma batida de respiro (a frase sai nela).
    const phrases = parseLyrics(p.lyrics);
    const scheduled = [];
    if (phrases.length) {
      let bi = 0;
      let pi = 0;
      let guard = 0;
      while (bi < beats.length && guard++ < 500) {
        const src = phrases[pi % phrases.length];
        const kind = p.layout === 'variado' ? LAYOUTS[pi % LAYOUTS.length] : p.layout;
        const words = layoutPhrase(src, kind, w, h, m);
        words.forEach((wd, k) => (wd.t0 = beats[Math.min(beats.length - 1, bi + k * bpw)]));
        const endBeat = bi + src.length * bpw;
        const end = endBeat < beats.length ? beats[endBeat] : D + 1;
        if (bi + (src.length - 1) * bpw >= beats.length) {
          // não cabe inteira: mostra só as palavras que têm batida
          const fit = Math.floor((beats.length - 1 - bi) / bpw) + 1;
          words.length = Math.max(0, fit);
        }
        if (words.length) scheduled.push({ kind, words, start: words[0].t0, end });
        bi = endBeat + 1;
        pi++;
      }
    }

    // Brilho de fundo pré-renderizado (um drawImage por frame).
    const glow = new OffscreenCanvas(Math.max(1, Math.round(w * px)), Math.max(1, Math.round(h * px)));
    const g = glow.getContext('2d');
    g.scale(px, px);
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    rg.addColorStop(0, rgba(p.accent, 0.22));
    rg.addColorStop(0.5, rgba(p.accent, 0.06));
    rg.addColorStop(1, rgba(p.accent, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    return { beats, phrases: scheduled, glow, hasAudio: !!a };
  },

  render(ctx, t, { w, h, p, duration: D, state }) {
    const m = Math.min(w, h);
    const { beats, phrases, glow } = state;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    // Envelope da última batida (puro em t).
    let lastBeat = -10;
    for (const b of beats) {
      if (b <= t) lastBeat = b;
      else break;
    }
    const kick = Math.exp(-(t - lastBeat) * 7);
    ctx.globalAlpha = 0.35 + 0.65 * kick;
    ctx.drawImage(glow, 0, 0, w, h);
    ctx.globalAlpha = 1;

    let ph = null;
    for (const q of phrases) if (t >= q.start - 0.001 && t < q.end + 0.5) ph = q;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    if (ph) {
      const out = ease.inCubic(seg(t, ph.end, ph.end + 0.32));
      const n = ph.words.length;
      // índice da palavra atual
      let cur = -1;
      for (let i = 0; i < n; i++) if (t >= ph.words[i].t0 - 0.001) cur = i;

      if (ph.kind === 'solo') {
        const wd = ph.words[cur];
        if (wd) {
          const k = t - wd.t0;
          const pop = 1 + 0.16 * Math.exp(-k * 14);
          const last = cur === n - 1;
          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.scale(pop * (1 - 0.08 * out), pop * (1 - 0.08 * out));
          ctx.translate(-w / 2, -h / 2);
          ctx.globalAlpha = (1 - out) * clamp(0.35 + k * 12);
          ctx.fillStyle = last || wd.em ? p.accent : p.color;
          ctx.font = wd.font;
          ctx.fillText(wd.text, wd.x, wd.y);
          ctx.restore();
          // contador de batida: pontos sob a palavra
          const dotY = h / 2 + wd.size * 0.62;
          const r = m * 0.006;
          const gap = r * 4;
          const x0 = w / 2 - ((n - 1) * gap) / 2;
          ctx.globalAlpha = 1 - out;
          for (let i = 0; i < n; i++) {
            ctx.fillStyle = i === cur ? p.accent : rgba(p.color, i < cur ? 0.5 : 0.18);
            ctx.beginPath();
            ctx.arc(x0 + i * gap, dotY, i === cur ? r * 1.4 : r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      } else if (ph.kind === 'pilha') {
        // A pilha fica centrada no que já entrou: a "câmera" desliza a cada palavra nova.
        const lh0 = ph.words[0].lh;
        const cw = ph.words[Math.max(0, cur)];
        const grown = Math.max(0, cur) + ease.outExpo(seg(t, cw.t0, cw.t0 + 0.45));
        ctx.save();
        ctx.translate(0, (lh0 * (n - grown)) / 2);
        for (let i = 0; i <= cur; i++) {
          const wd = ph.words[i];
          const k = ease.outExpo(seg(t, wd.t0, wd.t0 + 0.4));
          const o = ease.inCubic(seg(t, ph.end + i * 0.04, ph.end + 0.3 + i * 0.04));
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, wd.y - wd.lh * 0.98, w, wd.lh * 1.12);
          ctx.clip();
          ctx.font = wd.font;
          ctx.fillStyle = i === cur ? p.accent : rgba(p.color, wd.em ? 1 : 0.92);
          ctx.fillText(wd.text, wd.x, wd.y + (1 - k) * wd.lh - o * wd.lh * 1.1);
          ctx.restore();
        }
        // filete vertical que cresce com a pilha
        const first = ph.words[0];
        const lastW = ph.words[Math.max(0, cur)];
        const bx = first.x - m * 0.035;
        const y0 = first.y - first.lh * 0.82;
        const y1 = lerp(y0, lastW.y, ease.outExpo(seg(t, lastW.t0, lastW.t0 + 0.4)));
        ctx.fillStyle = rgba(p.accent, 1 - out);
        ctx.fillRect(bx, y0, Math.max(2, m * 0.006), Math.max(0, y1 - y0) * (1 - out));
        ctx.restore();
      } else {
        ctx.save();
        for (let i = 0; i <= cur; i++) {
          const wd = ph.words[i];
          const k = t - wd.t0;
          const e = ease.outBack(seg(k, 0, 0.32));
          const o = ease.inCubic(seg(t, ph.end + i * 0.025, ph.end + 0.28 + i * 0.025));
          ctx.globalAlpha = clamp(k * 8) * (1 - o);
          ctx.font = wd.font;
          ctx.fillStyle = i === cur ? p.accent : wd.em ? p.color : rgba(p.color, 0.82);
          const dy = (1 - e) * wd.size * 0.35 - o * wd.size * 0.5;
          ctx.fillText(wd.text, wd.x, wd.y + dy);
          if (i === cur) {
            const uw = wd.w * ease.outExpo(seg(k, 0, 0.3));
            ctx.fillRect(wd.x, wd.y + wd.size * 0.16, uw, Math.max(2, wd.size * 0.05));
          }
        }
        ctx.restore();
      }
    }

    // Rodapé: faixa + pulsos das batidas na linha do tempo.
    const by = h - m * 0.075;
    const bx0 = m * 0.07;
    const bx1 = w - m * 0.07;
    ctx.font = `500 ${m * 0.019}px ${MONO}`;
    ctx.fillStyle = rgba(p.color, 0.5);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`♪ ${p.track}`.toUpperCase(), bx0, by - m * 0.02);
    ctx.textAlign = 'right';
    if (!state.hasAudio) ctx.fillText('NO AUDIO · 120 BPM', bx1, by - m * 0.02);
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(p.color, 0.12);
    ctx.fillRect(bx0, by, bx1 - bx0, Math.max(1, m * 0.002));
    ctx.fillStyle = p.accent;
    ctx.fillRect(bx0, by, (bx1 - bx0) * clamp(t / D), Math.max(1, m * 0.002));
    const tick = m * 0.008;
    ctx.beginPath();
    for (const b of beats) {
      const x = bx0 + (bx1 - bx0) * (b / D);
      const near = Math.exp(-Math.max(0, t - b) * 6) * (t >= b ? 1 : 0);
      const hh = tick * (0.6 + 1.6 * near);
      ctx.rect(x - 0.75, by - hh, 1.5, hh);
    }
    ctx.fillStyle = rgba(p.color, 0.35);
    ctx.fill();
  },
};
