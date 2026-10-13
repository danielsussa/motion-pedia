import { TAU, clamp, seg, ease, spring, rgba, smoothstep } from '../lib/anim.js';

const INTER = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (s) => `500 ${s}px 'JetBrains Mono', ui-monospace, monospace`;

// Odômetro: desenha o inteiro `c` (contínuo) com cada dígito rolando, alinhado pela direita em `right`.
// Os dígitos à esquerda aparecem rolando quando o contador chega neles (largura animada, sem salto).
function drawOdometer(ctx, c, maxDigits, right, y, size, color) {
  ctx.font = INTER(800, size);
  const slot = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width)) * 0.92;
  const lineH = size * 1.15;
  ctx.save();
  ctx.beginPath();
  ctx.rect(right - slot * (maxDigits + 0.5), y - size * 0.47, slot * (maxDigits + 1), size * 0.94);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let x = right;
  let width = 0;
  for (let k = 0; k < maxDigits; k++) {
    const unit = 10 ** k;
    const vis = k === 0 ? 1 : clamp(c - (unit - 1));
    if (vis <= 0) break;
    // Cada virada acontece no fim do intervalo ("tique"), deixando o dígito legível a maior parte do tempo.
    const f = smoothstep(0.5, 1, k === 0 ? c - Math.floor(c) : clamp((c % unit) - (unit - 1)));
    const d = Math.floor(c / unit) % 10;
    const leading = k > 0 && Math.floor(c / unit) === 0;
    const sx = x - slot * vis * 0.5;
    const dy = -f * lineH;
    if (!leading && f < 0.999) {
      ctx.globalAlpha = vis * (1 - f * 0.7);
      ctx.fillText(String(d), sx, y + dy);
    }
    if (f > 0.001) {
      ctx.globalAlpha = vis * (0.3 + 0.7 * f);
      ctx.fillText(String((d + 1) % 10), sx, y + dy + lineH);
    }
    x -= slot * vis;
    width += slot * vis;
  }
  ctx.restore();
  return width;
}

export default {
  id: 'progress-ring',
  title: 'Progress Ring',
  description: 'A progress ring fills with a glowing head while the percentage rolls in the center.',
  category: 'dados',
  tags: ['data', 'ui', 'alpha'],
  duration: 5,
  poster: 3,

  params: {
    value: { type: 'range', label: 'Value (%)', min: 0, max: 100, step: 1, default: 78 },
    label: { type: 'text', label: 'Center label', default: 'COMPLETE' },
    caption: { type: 'text', label: 'Caption', default: 'Quarterly sales goal' },
    style: { type: 'select', label: 'Style', options: ['anel', 'donut', 'segmentos'], default: 'anel' },
    thickness: { type: 'range', label: 'Thickness', min: 0.3, max: 2.5, step: 0.05, default: 1 },
    accent: { type: 'color', label: 'Accent', default: '#3ddc97' },
    ink: { type: 'color', label: 'Text', default: '#f2efe8' },
    bg: { type: 'color', label: 'Background', default: '#0e0f12' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  render(ctx, t, { w, h, p, px }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, rgba(p.accent, 0.07));
      g.addColorStop(0.5, rgba(p.accent, 0));
      g.addColorStop(0.5001, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const m = Math.min(w, h);
    const hasCaption = !!p.caption.trim();
    const cx = w / 2;
    const cy = h / 2 - (hasCaption ? m * 0.05 : 0);
    const R = m * 0.27;
    const target = clamp(p.value, 0, 100) / 100;

    // Tempos.
    const inE = spring(seg(t, 0.05, 1.0), 0.12); // escala do anel
    const trackE = ease.outExpo(seg(t, 0.1, 1.1));
    const fillE = ease.inOutCubic(seg(t, 0.55, 2.7));
    const outE = ease.inCubic(seg(t, 4.15, 4.75));
    const outFill = ease.inOutCubic(seg(t, 3.9, 4.55));
    const prog = target * fillE * (1 - outFill);
    const sc = (0.85 + 0.15 * inE) * (1 - 0.12 * outE);
    const alpha = clamp(seg(t, 0.05, 0.4)) * (1 - outE);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);

    const a0 = -Math.PI / 2;
    const lw = m * (p.style === 'donut' ? 0.075 : 0.032) * p.thickness;
    const track = rgba(p.ink, 0.09);

    // Régua de ticks externa: os já percorridos acendem.
    const nT = 100;
    const rT0 = R + lw / 2 + m * 0.03;
    ctx.lineWidth = Math.max(1, m * 0.0022);
    ctx.lineCap = 'round';
    for (const lit of [false, true]) {
      ctx.strokeStyle = lit ? rgba(p.accent, 0.85) : rgba(p.ink, 0.16);
      ctx.beginPath();
      for (let i = 0; i < nT; i++) {
        const on = i / nT < prog - 1e-6;
        if (on !== lit) continue;
        const appear = clamp(trackE * 1.15 * nT - i * 0.15);
        if (appear <= 0) continue;
        const a = a0 + (i / nT) * TAU;
        const major = i % 10 === 0;
        const len = m * (major ? 0.022 : 0.011) * appear;
        ctx.moveTo(Math.cos(a) * rT0, Math.sin(a) * rT0);
        ctx.lineTo(Math.cos(a) * (rT0 + len), Math.sin(a) * (rT0 + len));
      }
      ctx.stroke();
    }

    const endA = a0 + prog * TAU;
    if (p.style === 'segmentos') {
      const nS = 48;
      const gap = 0.32 * (TAU / nS);
      ctx.lineWidth = lw * 1.3;
      ctx.lineCap = 'butt';
      for (let i = 0; i < nS; i++) {
        const s0 = a0 + (i / nS) * TAU + gap / 2;
        const s1 = a0 + ((i + 1) / nS) * TAU - gap / 2;
        const appear = clamp(trackE * 1.3 - i / nS * 0.3);
        if (appear <= 0) continue;
        // Fração deste segmento coberta pelo progresso (com acendimento suave).
        const fillK = clamp((prog * nS - i) * 1.5);
        ctx.strokeStyle = fillK > 0 ? rgba(p.accent, 0.2 + 0.8 * fillK) : track;
        if (fillK <= 0) ctx.globalAlpha = alpha * appear;
        ctx.beginPath();
        ctx.arc(0, 0, R, s0, s0 + (s1 - s0) * (fillK > 0 ? 1 : appear));
        ctx.stroke();
        ctx.globalAlpha = alpha;
      }
    } else {
      // Trilho.
      ctx.lineWidth = lw;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = track;
      ctx.beginPath();
      ctx.arc(0, 0, R, a0, a0 + TAU * trackE);
      ctx.stroke();

      if (prog > 0.0005) {
        const round = p.style === 'anel';
        // Arco com gradiente angular: mais escuro no começo, cor plena na cabeça. Pontas redondas desenhadas à mão
        // (lineCap 'round' herdaria a cor errada do gradiente cônico no início do arco).
        const startCol = rgba(p.accent, 0.55);
        const cg = ctx.createConicGradient(a0, 0, 0);
        cg.addColorStop(0, startCol);
        cg.addColorStop(Math.max(0.001, prog), p.accent);
        cg.addColorStop(Math.min(1, prog + 0.001), p.accent);
        ctx.lineCap = 'butt';
        ctx.strokeStyle = cg;
        ctx.beginPath();
        ctx.arc(0, 0, R, a0, endA);
        ctx.stroke();
        if (round) {
          ctx.fillStyle = startCol;
          ctx.beginPath();
          ctx.arc(Math.cos(a0) * R, Math.sin(a0) * R, lw / 2, Math.PI / 2, Math.PI * 1.5);
          ctx.fill();
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          ctx.arc(Math.cos(endA) * R, Math.sin(endA) * R, lw / 2, 0, TAU);
          ctx.fill();
        }
        // Cabeça luminosa.
        const hx = Math.cos(endA) * R;
        const hy = Math.sin(endA) * R;
        const moving = clamp(seg(t, 0.55, 0.8)) * (1 - clamp(seg(t, 2.6, 3.4)) * 0.6);
        ctx.save();
        ctx.shadowColor = p.accent;
        ctx.shadowBlur = lw * 1.6 * px;
        ctx.fillStyle = rgba('#ffffff', 0.9 * moving);
        ctx.beginPath();
        ctx.arc(hx, hy, lw * (round ? 0.32 : 0.22), 0, TAU);
        ctx.fill();
        ctx.restore();
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, lw * 2.6);
        hg.addColorStop(0, rgba(p.accent, 0.55 * moving));
        hg.addColorStop(1, rgba(p.accent, 0));
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(hx, hy, lw * 2.6, 0, TAU);
        ctx.fill();
      }
    }

    // Número central (odômetro) + "%".
    const numSize = R * (p.style === 'donut' ? 0.62 : 0.7);
    const pctSize = numSize * 0.38;
    const value = clamp(p.value, 0, 100) * fillE;
    const maxDigits = String(Math.round(clamp(p.value, 0, 100))).length;
    const numY = -R * 0.04;
    // Mede a largura atual para centralizar o conjunto número + %.
    ctx.font = INTER(800, numSize);
    const slot = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width)) * 0.92;
    let curW = slot;
    for (let k = 1; k < maxDigits; k++) curW += slot * clamp(value - (10 ** k - 1));
    ctx.font = INTER(700, pctSize);
    const pctW = ctx.measureText('%').width;
    const gapW = numSize * 0.04;
    const totalW = curW + gapW + pctW;
    const right = -totalW / 2 + curW;
    ctx.letterSpacing = '0px';
    drawOdometer(ctx, value, maxDigits, right, numY, numSize, p.ink);
    ctx.font = INTER(700, pctSize);
    ctx.fillStyle = p.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('%', right + gapW, numY - numSize * 0.08);

    // Rótulo central.
    if (p.label.trim()) {
      const ls = numSize * 0.16;
      const le = ease.outExpo(seg(t, 0.6, 1.5));
      ctx.font = MONO(ls);
      ctx.letterSpacing = `${ls * 0.25}px`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(p.ink, 0.5 * le);
      let lab = p.label;
      while (lab.length > 1 && ctx.measureText(lab).width > R * 1.4) lab = lab.slice(0, -1);
      ctx.fillText(lab, ls * 0.12, numY + numSize * 0.74 + (1 - le) * ls);
      ctx.letterSpacing = '0px';
    }
    ctx.restore();

    // Legenda abaixo do anel.
    if (hasCaption) {
      const cs = m * 0.036;
      const ce = ease.outExpo(seg(t, 0.9, 1.8));
      const co = ease.inCubic(seg(t, 3.9, 4.5));
      ctx.font = INTER(600, cs);
      let cap = p.caption;
      if (ctx.measureText(cap).width > w * 0.86) ctx.font = INTER(600, (cs * w * 0.86) / ctx.measureText(cap).width);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(p.ink, 0.8 * ce * (1 - co));
      ctx.fillText(cap, cx, cy + R + m * 0.17 + (1 - ce) * cs * 0.8 + co * cs * 0.5);
    }
  },
};
