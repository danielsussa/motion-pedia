import { clamp, seg, ease, rgba } from '../lib/anim.js';
import { SOURCE_PARAM, createSource } from '../lib/source.js';

// Título vazado: as letras são uma janela para outro motion. As letras vão num canvas auxiliar
// (do tamanho real, px): a fonte é pintada na tela toda e por cima vai um estêncil = fundo com as
// letras furadas ('destination-out', que aceita vários fillText, ao contrário de 'destination-in').
export default {
  id: 'knockout-title',
  title: 'Knockout Title',
  description: 'A giant knockout title with another motion (domain warp, aurora…) running inside the letters.',
  category: 'tipografia',
  tags: ['typography', 'intro'],
  duration: 6,
  poster: 2.4,

  params: {
    text: { type: 'textarea', label: 'Title', rows: 2, default: 'FLOW' },
    sub: { type: 'text', label: 'Subtitle', default: 'every letter is a window' },
    source: SOURCE_PARAM('domain-warp'),
    size: { type: 'range', label: 'Size', min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    ambient: { type: 'range', label: 'Source outside letters', min: 0, max: 0.4, step: 0.01, default: 0.07 },
    edge: { type: 'range', label: 'Outline', min: 0, max: 1, step: 0.01, default: 0.5 },
    speed: { type: 'range', label: 'Source speed', min: 0.25, max: 2, step: 0.05, default: 1 },
    color: { type: 'color', label: 'Subtitle color', default: '#f4f1ea' },
    bg: { type: 'color', label: 'Background', default: '#0b0b0e' },
  },

  setup(env) {
    const { w, h, px, p } = env;
    const mask = document.createElement('canvas');
    mask.width = Math.max(1, Math.round(w * px));
    mask.height = Math.max(1, Math.round(h * px));
    const base = document.createElement('canvas');
    base.width = mask.width;
    base.height = mask.height;
    const b = base.getContext('2d');
    b.scale(px, px);
    b.fillStyle = rgba(p.bg, 1 - p.ambient);
    b.fillRect(0, 0, w, h);
    if (p.ambient > 0) {
      // vinheta: mesma cor, só alpha
      const vg = b.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      vg.addColorStop(0, rgba(p.bg, 0));
      vg.addColorStop(1, rgba(p.bg, 0.9));
      b.fillStyle = vg;
      b.fillRect(0, 0, w, h);
    }
    return { mask, mctx: mask.getContext('2d'), base, src: createSource(p.source, env, { scale: 0.5 }) };
  },

  render(ctx, t, { w, h, p, px, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const lines = p.text.split('\n').filter((s) => s.trim());
    if (!lines.length) return;

    // Tempos: entrada letra a letra, zoom lento durante tudo, saída para baixo.
    const exitAt = 4.95;
    const zoom = 1.06 - 0.06 * ease.outCubic(seg(t, 0, 5.8));
    const subIn = ease.outExpo(seg(t, 1.0, 1.9));
    const subOut = ease.inCubic(seg(t, 4.75, 5.25));

    // Fonte: tamanho pelo maior entre as linhas, cabendo em 90% da largura e na altura.
    const font = (s) => `900 ${s}px Inter, system-ui, sans-serif`;
    let fs = m * p.size;
    ctx.font = font(fs);
    ctx.letterSpacing = `${-fs * 0.045}px`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest > w * 0.9) fs *= (w * 0.9) / widest;
    const lh = fs * 0.86;
    if (lh * lines.length > h * 0.72) fs *= (h * 0.72) / (lh * lines.length);
    const lineH = fs * 0.86;
    const capH = fs * 0.73;
    const blockH = lineH * (lines.length - 1) + capH;
    const subFs = Math.max(12, m * 0.045);
    const top = h / 2 - (blockH + (p.sub ? subFs * 1.6 : 0)) / 2;

    // Letras (posições animadas) → em qualquer contexto, com a mesma transformação.
    const drawLetters = (c, stroke) => {
      c.font = font(fs);
      c.letterSpacing = `${-fs * 0.045}px`;
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      let k = 0;
      const total = lines.reduce((s, l) => s + [...l].length, 0);
      const stg = Math.min(0.06, 0.7 / total);
      lines.forEach((line, li) => {
        const chars = [...line];
        const lw = c.measureText(line).width;
        const base = top + capH + li * lineH;
        let x = w / 2 - lw / 2;
        c.save();
        c.beginPath();
        c.rect(0, base - capH - fs * 0.12, w, capH + fs * 0.24); // janela da linha
        c.clip();
        for (const ch of chars) {
          const cw = c.measureText(ch).width;
          const inE = ease.outExpo(seg(t, 0.15 + k * stg, 1.15 + k * stg));
          const outE = ease.inExpo(seg(t, exitAt + k * stg * 0.6, exitAt + 0.6 + k * stg * 0.6));
          const dy = (1 - inE) * fs * 1.05 + outE * fs * 1.05;
          if (stroke) c.strokeText(ch, x, base + dy);
          else c.fillText(ch, x, base + dy);
          x += cw;
          k++;
        }
        c.restore();
      });
    };

    const cx = w / 2;
    const cy = h / 2;
    const frame = state.src.frame(t * p.speed);
    // A fonte ocupa a tela toda; por cima vai um estêncil (fundo com as letras furadas). Bem mais barato
    // que 'source-in' com upscale (≈ 3× no Chrome por software).
    ctx.drawImage(frame, 0, 0, w, h);
    // levanta um pouco os pretos da fonte dentro das letras (senão partes escuras somem no fundo)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(p.color, 0.07);
    drawLetters(ctx, false);
    ctx.restore();

    const mc = state.mctx;
    // base do estêncil (fundo + vinheta, pré-renderizada no setup): gradiente radial em tela cheia custa
    // ~30 ms por frame no Chrome por software; copiar um canvas do mesmo tamanho, ~1 ms.
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.globalCompositeOperation = 'copy';
    mc.drawImage(state.base, 0, 0);
    mc.globalCompositeOperation = 'source-over';
    mc.setTransform(px, 0, 0, px, 0, 0);
    mc.translate(cx, cy);
    mc.scale(zoom, zoom);
    mc.translate(-cx, -cy);
    // contorno fino: traço por trás, o miolo é furado em seguida (esconde os contornos internos do Inter)
    if (p.edge > 0) {
      mc.strokeStyle = rgba(p.color, p.edge);
      mc.lineWidth = Math.max(1, m * 0.004);
      mc.lineJoin = 'round';
      drawLetters(mc, true);
    }
    mc.globalCompositeOperation = 'destination-out';
    mc.fillStyle = '#000';
    drawLetters(mc, false);
    mc.globalCompositeOperation = 'source-over';
    mc.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(state.mask, 0, 0, w, h);

    // Linha de apoio: serif itálico, sobe por uma janela.
    if (p.sub && subIn > 0 && subOut < 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
      const sy = top + blockH + subFs * 1.55;
      ctx.beginPath();
      ctx.rect(0, sy - subFs * 1.1, w, subFs * 1.5);
      ctx.clip();
      ctx.font = `italic 400 ${subFs}px "Instrument Serif", Georgia, serif`;
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(p.color, clamp(subIn * 1.2, 0, 1) * (1 - subOut));
      ctx.fillText(p.sub, cx, sy + (1 - subIn) * subFs * 1.2 + subOut * subFs * 0.6);
      ctx.restore();
    }
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'start';
  },
};
