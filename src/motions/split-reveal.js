import { seg, ease, rgba } from '../lib/anim.js';

export default {
  id: 'split-reveal',
  title: 'Split Reveal',
  description: 'A title is sliced in half; the halves slide apart and reveal a second line in the gap.',
  category: 'tipografia',
  tags: ['typography', 'intro'],
  duration: 4.5,
  poster: 2.6,

  params: {
    line1: { type: 'text', label: 'Line 1', default: 'MOTION' },
    line2: { type: 'text', label: 'Line 2 (revealed)', default: 'in every frame' },
    size: { type: 'range', label: 'Size', min: 0.1, max: 0.45, step: 0.005, default: 0.3 },
    angle: { type: 'range', label: 'Cut angle (°)', min: -15, max: 15, step: 0.5, default: -4 },
    slide: { type: 'range', label: 'Side slide', min: 0, max: 0.3, step: 0.005, default: 0.08 },
    color: { type: 'color', label: 'Text', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Background', default: '#0d0d10' },
  },

  render(ctx, t, { w, h, p }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    const m = Math.min(w, h);
    let fs = m * p.size;
    const f1 = (s) => `900 ${s}px Inter, system-ui, sans-serif`;
    const f2 = (s) => `italic 400 ${s}px "Instrument Serif", Georgia, serif`;
    ctx.font = f1(fs);
    ctx.letterSpacing = `${-fs * 0.03}px`;
    let w1 = ctx.measureText(p.line1).width;
    if (w1 > w * 0.8) {
      fs *= (w * 0.8) / w1;
      ctx.font = f1(fs);
      ctx.letterSpacing = `${-fs * 0.03}px`;
      w1 = ctx.measureText(p.line1).width;
    }
    let fs2 = fs * 0.42;
    ctx.font = f2(fs2);
    ctx.letterSpacing = '0px';
    let w2 = ctx.measureText(p.line2).width;
    if (w2 > w * 0.86) {
      fs2 *= (w * 0.86) / w2;
      ctx.font = f2(fs2);
      w2 = ctx.measureText(p.line2).width;
    }

    const a = (p.angle * Math.PI) / 180;
    const tanA = Math.tan(a);
    const cx = w / 2;
    const cy = h / 2;
    const capH = fs * 0.73;
    const base = cy + capH / 2; // baseline do título
    const gapH = fs2 * 1.25 + w2 * Math.abs(tanA);

    // Tempos.
    const rise = ease.outExpo(seg(t, 0.1, 1.0));
    const cut = ease.inOutCubic(seg(t, 0.95, 1.35));
    const open = ease.outExpo(seg(t, 1.35, 2.25));
    const leave = ease.inExpo(seg(t, 3.3, 3.95));
    const l2In = ease.outCubic(seg(t, 1.45, 2.2));
    const l2Out = ease.inCubic(seg(t, 3.4, 3.85));

    const dx = m * p.slide * open + w * 1.1 * leave;
    const dy = (gapH / 2) * open;

    // Meio-plano acima/abaixo da linha de corte (y = cy + (x - cx)·tanA), deslocado por (ox, oy).
    const half = (top, ox, oy) => {
      const far = Math.max(w, h) * 3;
      const yL = cy + (-far - cx) * tanA + oy;
      const yR = cy + (far - cx) * tanA + oy;
      ctx.beginPath();
      ctx.moveTo(-far + ox, yL);
      ctx.lineTo(far + ox, yR);
      ctx.lineTo(far + ox, top ? -far : far);
      ctx.lineTo(-far + ox, top ? -far : far);
      ctx.closePath();
    };

    const drawTitle = (ox, oy) => {
      ctx.font = f1(fs);
      ctx.letterSpacing = `${-fs * 0.03}px`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = p.color;
      ctx.fillText(p.line1, cx + ox, base + oy + (1 - rise) * fs * 1.1);
    };

    // Máscara de entrada do título (sobe por uma janela).
    ctx.save();
    if (rise < 1) {
      ctx.beginPath();
      ctx.rect(0, base - fs * 0.95, w, fs * 1.2);
      ctx.clip();
    }
    // Metade de cima: sobe e vai para a esquerda.
    ctx.save();
    half(true, -dx, -dy);
    ctx.clip();
    drawTitle(-dx, -dy);
    ctx.restore();
    // Metade de baixo: desce e vai para a direita.
    ctx.save();
    half(false, dx, dy);
    ctx.clip();
    drawTitle(dx, dy);
    ctx.restore();
    ctx.restore();

    // Linha de corte: varre da esquerda para a direita e some quando abre.
    const cutVis = cut * (1 - ease.outCubic(seg(t, 1.35, 1.7)));
    if (cutVis > 0) {
      const len = (w1 + fs * 0.6) * cut;
      const x0 = cx - (w1 + fs * 0.6) / 2;
      const th = Math.max(2, fs * 0.022) * (0.4 + 0.6 * cutVis);
      ctx.save();
      ctx.translate(x0, cy + (x0 - cx) * tanA);
      ctx.rotate(a);
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = Math.min(1, cutVis * 1.5);
      ctx.fillRect(0, -th / 2, len / Math.cos(a), th);
      ctx.restore();
    }

    // Segunda linha, dentro da fenda.
    if (open > 0 && l2Out < 1) {
      ctx.save();
      const far = Math.max(w, h) * 3;
      ctx.beginPath();
      ctx.moveTo(-far, cy + (-far - cx) * tanA - dy);
      ctx.lineTo(far, cy + (far - cx) * tanA - dy);
      ctx.lineTo(far, cy + (far - cx) * tanA + dy);
      ctx.lineTo(-far, cy + (-far - cx) * tanA + dy);
      ctx.closePath();
      ctx.clip();
      ctx.font = f2(fs2);
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const s = 1.18 - 0.18 * l2In;
      ctx.translate(cx, cy + fs2 * 0.05 + l2Out * gapH * 0.8);
      ctx.scale(s, s);
      ctx.globalAlpha = l2In;
      ctx.fillStyle = p.accent;
      ctx.fillText(p.line2, 0, 0);
      ctx.restore();
      // fio fino nas bordas da fenda
      ctx.strokeStyle = rgba(p.accent, 0.35 * open * (1 - leave));
      ctx.lineWidth = Math.max(1, fs * 0.006);
      for (const sgn of [-1, 1]) {
        const ox = sgn * dx;
        const oy = sgn * dy;
        const xa = cx - (w1 / 2) * 1.05 + ox;
        const xb = cx + (w1 / 2) * 1.05 + ox;
        ctx.beginPath();
        ctx.moveTo(xa, cy + (xa - ox - cx) * tanA + oy);
        ctx.lineTo(xb, cy + (xb - ox - cx) * tanA + oy);
        ctx.stroke();
      }
    }
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'start';
  },
};
