import { TAU, clamp, seg, ease, spring, rgba } from '../lib/anim.js';

const STEP = 1; // segundos por número
const N = 3;
const T_WORD = N * STEP; // 3 s: flash + palavra final

export default {
  id: 'countdown',
  title: 'Countdown',
  description: 'A 3-2-1 countdown with a ring that drains every second, pulses and a flash on the final word.',
  category: 'dados',
  tags: ['typography', 'intro', 'ui'],
  duration: 4.6,
  poster: 1.45,

  params: {
    word: { type: 'text', label: 'Final word', default: 'GO!' },
    style: { type: 'select', label: 'Style', options: ['anel', 'filme'], default: 'anel' },
    flash: { type: 'boolean', label: 'Flash at the end', default: true },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    ink: { type: 'color', label: 'Text', default: '#f4f1ea' },
    bg: { type: 'color', label: 'Background', default: '#0d0d10' },
  },

  render(ctx, t, { w, h, p, px }) {
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const film = p.style === 'filme';

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    let vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * 0.55);
    // (paradas com a mesma cor: o canvas interpola em RGBA não pré-multiplicado e misturaria o matiz)
    const glow = film ? '#ffffff' : p.accent;
    vg.addColorStop(0, rgba(glow, film ? 0.05 : 0.05));
    vg.addColorStop(0.6, rgba(glow, 0));
    vg.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * 0.55);
    vg.addColorStop(0.3, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    const R = m * 0.3;
    const k = Math.floor(t / STEP); // índice do número atual
    const local = t - k * STEP; // 0..1 dentro do segundo
    const counting = t < T_WORD;
    const intro = ease.outExpo(seg(t, 0, 0.5));
    const outro = ease.inCubic(seg(t, T_WORD - 0.05, T_WORD + 0.15));
    const frameA = intro * (1 - outro);

    // ---------- moldura: anel ou "leader" de filme ----------
    if (frameA > 0.001) {
      ctx.save();
      ctx.globalAlpha = frameA;
      const sweep = counting ? local / STEP : 1; // 0→1 a cada segundo
      if (film) {
        // Varredura tipo leader de cinema: setor preenchido + mira + círculos.
        ctx.fillStyle = rgba(p.ink, 0.1);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, Math.hypot(w, h), -Math.PI / 2, -Math.PI / 2 + sweep * TAU);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba(p.ink, 0.55);
        ctx.lineWidth = m * 0.004;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.stroke();
        ctx.lineWidth = m * 0.008;
        ctx.strokeStyle = rgba(p.ink, 0.85);
        for (const r of [R, R * 1.18]) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, TAU);
          ctx.stroke();
        }
        // Ponteiro da varredura.
        const a = -Math.PI / 2 + sweep * TAU;
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = m * 0.006;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * Math.hypot(w, h), cy + Math.sin(a) * Math.hypot(w, h));
        ctx.stroke();
      } else {
        // Trilho + ticks + arco que se esvazia.
        const lw = m * 0.018;
        ctx.lineWidth = lw;
        ctx.strokeStyle = rgba(p.ink, 0.08);
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = rgba(p.ink, 0.22);
        ctx.lineWidth = Math.max(1, m * 0.0025);
        ctx.beginPath();
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * TAU;
          const r0 = R + lw * 1.4;
          const r1 = r0 + m * (i % 5 === 0 ? 0.02 : 0.009);
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        }
        ctx.stroke();

        const rem = 1 - ease.inOutSine(sweep);
        if (rem > 0.002) {
          const a0 = -Math.PI / 2;
          const a1 = a0 + rem * TAU;
          ctx.save();
          ctx.shadowColor = p.accent;
          ctx.shadowBlur = m * 0.03 * px;
          ctx.strokeStyle = p.accent;
          ctx.lineWidth = lw;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy, R, a0, a1);
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, lw * 0.3, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // ---------- pulso a cada troca de número ----------
    for (let i = 0; i <= N; i++) {
      const pt = seg(t, i * STEP, i * STEP + 0.7);
      if (pt <= 0 || pt >= 1) continue;
      const e = ease.outExpo(pt);
      ctx.strokeStyle = rgba(i === N ? p.ink : p.accent, 0.5 * (1 - pt));
      ctx.lineWidth = m * 0.006 * (1 - pt) + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R * (0.9 + 0.7 * e), 0, TAU);
      ctx.stroke();
    }

    // ---------- número ----------
    if (counting) {
      const num = String(N - k);
      const inE = spring(seg(local, 0, 0.55), 0.25);
      const outE = ease.inCubic(seg(local, 0.78, 1));
      const s = (1.35 - 0.35 * inE) * (1 - 0.25 * outE);
      const size = m * (film ? 0.4 : 0.36);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp(seg(local, 0, 0.12)) * (1 - outE);
      ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = p.ink;
      // Centraliza pela altura real do dígito.
      const mt = ctx.measureText(num);
      const yOff = (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2;
      ctx.fillText(num, 0, yOff);
      ctx.restore();
    }

    // ---------- palavra final + flash + raios ----------
    const wt = t - T_WORD;
    if (wt >= 0) {
      // Raios saindo do centro.
      const rt = seg(wt, 0, 0.7);
      if (rt > 0 && rt < 1) {
        const rays = 14;
        ctx.strokeStyle = p.accent;
        ctx.lineCap = 'round';
        ctx.lineWidth = m * 0.008 * (1 - rt);
        ctx.beginPath();
        for (let i = 0; i < rays; i++) {
          const a = (i / rays) * TAU + 0.2;
          const r0 = R * (0.5 + 1.1 * ease.outExpo(rt));
          const r1 = r0 + m * 0.12 * (1 - rt);
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        }
        ctx.stroke();
      }

      const inE = spring(seg(wt, 0.02, 0.6), 0.35);
      const outE = ease.inCubic(seg(wt, 1.1, 1.45));
      let size = m * 0.3;
      ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(p.word).width;
      if (tw > w * 0.84) size *= (w * 0.84) / tw;
      const s = (0.6 + 0.4 * inE) * (1 + 0.15 * outE);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp(seg(wt, 0, 0.08)) * (1 - outE);
      ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
      ctx.letterSpacing = `${-size * 0.03}px`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const mt = ctx.measureText(p.word);
      const yOff = (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2;
      ctx.fillStyle = p.accent;
      ctx.fillText(p.word, 0, yOff);
      ctx.restore();

      if (p.flash) {
        const f = 1 - ease.outCubic(seg(wt, 0, 0.45));
        if (f > 0.001) {
          ctx.fillStyle = `rgba(255,255,255,${0.85 * f})`;
          ctx.fillRect(0, 0, w, h);
        }
      }
    }
  },
};
