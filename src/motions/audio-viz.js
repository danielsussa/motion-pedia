import { TAU, clamp, lerp, rgba, mixHex } from '../lib/anim.js';
import { asset, audioAt } from '../lib/assets.js';

const F = 'Inter, system-ui, sans-serif';
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const NB = 32;

const fmt = (s) => {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

export default {
  id: 'audio-viz',
  title: 'Audio Visualizer',
  description: 'Espectro do áudio enviado em barras espelhadas ou em anel radial que pulsa no grave, com título e barra de progresso.',
  category: 'dados',
  tags: ['áudio', 'dados', 'loop', 'alpha'],
  duration: 12,
  poster: 4.02,

  params: {
    audio: { type: 'audio', label: 'Áudio', default: '/samples/beat.wav' },
    style: { type: 'select', label: 'Estilo', options: ['barras', 'círculo'], default: 'barras' },
    title: { type: 'text', label: 'Título', default: 'Beat Demo — 120 BPM' },
    bars: { type: 'range', label: 'Barras', min: 16, max: 96, step: 1, default: 56 },
    gain: { type: 'range', label: 'Sensibilidade', min: 0.5, max: 2, step: 0.05, default: 1 },
    accent: { type: 'color', label: 'Destaque', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Fundo', default: '#0d0d12' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  // Normalização por banda a partir do áudio inteiro (piso = percentil 20, teto = percentil 99),
  // para que agudos fracos também se mexam e o grave não fique sempre cheio.
  setup({ p }) {
    const a = asset(p.audio);
    if (!a) return { a: null };
    const lo = new Float32Array(NB);
    const span = new Float32Array(NB);
    const col = new Float32Array(a.frames);
    for (let b = 0; b < NB; b++) {
      for (let f = 0; f < a.frames; f++) col[f] = a.data[f * NB + b];
      const s = Float32Array.from(col).sort();
      const l = s[Math.floor(s.length * 0.2)];
      const hi = s[Math.floor(s.length * 0.99)];
      lo[b] = l;
      span[b] = Math.max(0.12, hi - l);
    }
    let rmsMax = 1e-6;
    for (let f = 0; f < a.frames; f++) rmsMax = Math.max(rmsMax, a.rms[f]);
    return { a, lo, span, rmsMax };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    const m = Math.min(w, h);
    const { a } = state;

    // Espectro suavizado: pico com decaimento nos últimos frames (puro em t).
    const spec = new Float32Array(NB);
    let level = 0;
    if (a) {
      for (let k = 0; k < 9; k++) {
        const tk = t - k / 60;
        const { bands, rms } = audioAt(a, tk);
        const d = 1 - k * 0.1;
        for (let b = 0; b < NB; b++) {
          const x = Math.max(0, ((bands[b] - state.lo[b]) / state.span[b]) * p.gain);
          const v = (1 - Math.exp(-1.8 * x)) * d; // joelho suave: sem topo achatado
          if (v > spec[b]) spec[b] = v;
        }
        level = Math.max(level, (rms / state.rmsMax) * (1 - k * 0.11));
      }
    }
    level = clamp(level);
    const total = a ? a.duration : duration;
    const tt = a ? ((t % total) + total) % total : t;

    // Fundo com pulso no grave
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.55);
      g.addColorStop(0, rgba(p.accent, 0.06 + 0.16 * level ** 2));
      g.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const N = Math.round(p.bars);
    const valAt = (x) => {
      // x 0..1 → banda (interpolada)
      const f = x * (NB - 1);
      const i = Math.floor(f);
      return lerp(spec[i], spec[Math.min(NB - 1, i + 1)], f - i);
    };
    const hot = mixHex(p.accent, '#ffffff', 0.55);

    if (p.style === 'círculo') {
      const cx = w / 2, cy = h / 2 - m * 0.02;
      const r0 = m * 0.2 * (1 + 0.06 * level);
      const L = m * 0.2;
      // halo
      ctx.save();
      const hg = ctx.createRadialGradient(cx, cy, r0 * 0.8, cx, cy, r0 + L * 1.4);
      hg.addColorStop(0, rgba(p.accent, 0.35 * level));
      hg.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(cx, cy, r0 + L * 1.4, 0, TAU);
      ctx.fill();
      // barras radiais espelhadas (graves no topo, agudos embaixo)
      const bw = Math.max(1.5, ((TAU * r0) / (N * 2)) * 0.55);
      ctx.lineCap = 'round';
      ctx.lineWidth = bw;
      const rot = -Math.PI / 2;
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass ? hot : p.accent;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const x = i / (N - 1);
          const v = valAt(x);
          if (pass === 1 && v < 0.75) continue;
          const len = L * 0.06 + L * v ** 1.3 * (pass ? 1 : 1);
          const r1 = r0 + bw * 1.2;
          const r2 = pass ? r1 + len : r1 + len;
          const r1b = pass ? r1 + len * 0.7 : r1;
          for (const s of [1, -1]) {
            const ang = rot + s * (x * Math.PI * 0.98 + 0.03);
            const c = Math.cos(ang), sn = Math.sin(ang);
            ctx.moveTo(cx + c * r1b, cy + sn * r1b);
            ctx.lineTo(cx + c * r2, cy + sn * r2);
          }
        }
        ctx.stroke();
      }
      // disco central
      ctx.fillStyle = mixHex(p.bg, '#000000', 0.25);
      ctx.beginPath();
      ctx.arc(cx, cy, r0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.08);
      ctx.lineWidth = m * 0.002;
      ctx.stroke();
      // anel de progresso
      const pr = r0 * 0.88;
      ctx.lineWidth = m * 0.006;
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba('#ffffff', 0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = p.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, pr, -Math.PI / 2, -Math.PI / 2 + TAU * (tt / total));
      ctx.stroke();
      // texto
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f4f2ee';
      let fs = m * 0.042;
      ctx.font = `700 ${fs}px ${F}`;
      const maxT = r0 * 1.45;
      const tw = ctx.measureText(p.title).width;
      if (tw > maxT) {
        fs *= maxT / tw;
        ctx.font = `700 ${fs}px ${F}`;
      }
      ctx.fillText(p.title, cx, cy - m * 0.015);
      ctx.font = `500 ${m * 0.024}px ${MONO}`;
      ctx.fillStyle = rgba('#ffffff', 0.55);
      ctx.fillText(`${fmt(tt)} / ${fmt(total)}`, cx, cy + m * 0.04);
      ctx.restore();
      if (!a) drawLoading(ctx, w, h, m, t);
      return;
    }

    // ---- barras espelhadas ----
    const areaW = w * (w > h ? 0.78 : 0.86);
    const x0 = (w - areaW) / 2;
    const base = h * (w > h ? 0.56 : 0.52);
    const maxH = Math.min(h * 0.3, w * 0.42);
    const slot = areaW / N;
    const bw = slot * 0.62;
    const heights = new Float32Array(N);
    for (let i = 0; i < N; i++) heights[i] = maxH * (0.025 + 0.975 * valAt(i / (N - 1)) ** 1.25);

    // gradiente vertical: destaque na base, claro nas pontas
    const gUp = ctx.createLinearGradient(0, base, 0, base - maxH);
    gUp.addColorStop(0, p.accent);
    gUp.addColorStop(0.6, mixHex(p.accent, '#ffffff', 0.2));
    gUp.addColorStop(1, hot);
    ctx.save();
    ctx.shadowColor = rgba(p.accent, 0.6);
    ctx.shadowBlur = m * 0.02 * px;
    ctx.fillStyle = gUp;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = x0 + i * slot + (slot - bw) / 2;
      ctx.roundRect(x, base - heights[i], bw, heights[i], [bw / 2, bw / 2, 0, 0]);
    }
    ctx.fill();
    ctx.restore();
    // reflexo
    const gDn = ctx.createLinearGradient(0, base, 0, base + maxH * 0.5);
    gDn.addColorStop(0, rgba(p.accent, 0.38));
    gDn.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = gDn;
    ctx.beginPath();
    const gapY = m * 0.008;
    for (let i = 0; i < N; i++) {
      const x = x0 + i * slot + (slot - bw) / 2;
      ctx.roundRect(x, base + gapY, bw, heights[i] * 0.45, [0, 0, bw / 2, bw / 2]);
    }
    ctx.fill();

    // título acima
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4f2ee';
    let fs = m * 0.05;
    ctx.font = `700 ${fs}px ${F}`;
    const tw = ctx.measureText(p.title).width;
    if (tw > areaW) {
      fs *= areaW / tw;
      ctx.font = `700 ${fs}px ${F}`;
    }
    const titleY = base - maxH - m * 0.07;
    ctx.fillText(p.title, x0, titleY);
    // indicador "ao vivo" pulsando no grave
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(x0 + m * 0.009, titleY - fs * 1.25, m * 0.008 * (0.8 + 0.5 * level), 0, TAU);
    ctx.fill();
    ctx.font = `600 ${m * 0.02}px ${MONO}`;
    ctx.fillStyle = rgba('#ffffff', 0.55);
    ctx.fillText('NOW PLAYING', x0 + m * 0.03, titleY - fs * 1.25 + m * 0.007);

    // progresso
    const py = base + maxH * 0.5 + m * 0.07;
    const ph = m * 0.006;
    ctx.fillStyle = rgba('#ffffff', 0.12);
    ctx.beginPath();
    ctx.roundRect(x0, py, areaW, ph, ph / 2);
    ctx.fill();
    const k = tt / total;
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.roundRect(x0, py, Math.max(ph, areaW * k), ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x0 + areaW * k, py + ph / 2, ph * 1.6, 0, TAU);
    ctx.fill();
    ctx.font = `500 ${m * 0.022}px ${MONO}`;
    ctx.fillStyle = rgba('#ffffff', 0.55);
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(tt), x0, py + m * 0.025);
    ctx.textAlign = 'right';
    ctx.fillText(fmt(total), x0 + areaW, py + m * 0.025);
    if (!a) drawLoading(ctx, w, h, m, t);
  },
};

// Enquanto o áudio decodifica: aviso discreto.
function drawLoading(ctx, w, h, m, t) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${m * 0.022}px ${MONO}`;
  ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.2 * Math.sin(t * TAU)})`;
  ctx.fillText('carregando áudio…', w / 2, h * 0.92);
  ctx.restore();
}
