import { seg, ease, spring, rgba } from '../lib/anim.js';

export default {
  id: 'odometer',
  title: 'Odometer',
  description: 'A counter whose digits roll like an odometer up to the final number, with prefix, suffix and caption.',
  category: 'tipografia',
  tags: ['typography', 'data'],
  duration: 5,
  poster: 3.4,

  params: {
    value: { type: 'text', label: 'Value', default: '1250000' },
    decimals: { type: 'select', label: 'Decimal places', options: ['0', '1', '2'], default: '0' },
    prefix: { type: 'text', label: 'Prefix', default: 'R$' },
    suffix: { type: 'text', label: 'Suffix', default: '' },
    label: { type: 'text', label: 'Caption', default: 'in sales in the first month' },
    size: { type: 'range', label: 'Size', min: 0.08, max: 0.4, step: 0.005, default: 0.22 },
    spins: { type: 'range', label: 'Extra spins', min: 0, max: 5, step: 1, default: 1 },
    color: { type: 'color', label: 'Text', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Accent', default: '#3dd68c' },
    bg: { type: 'color', label: 'Background', default: '#0c0d0f' },
  },

  setup({ p }) {
    const dec = Number(p.decimals) || 0;
    const v = Math.abs(Number(String(p.value).replace(',', '.')) || 0);
    const str = v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return { chars: [...str] };
  },

  render(ctx, t, { w, h, p, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, rgba(p.accent, 0.07));
    vg.addColorStop(0.5, rgba(p.accent, 0));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    const { chars } = state;
    let fs = Math.min(w, h) * p.size;
    const fNum = (s) => `800 ${s}px Inter, system-ui, sans-serif`;
    const fAff = (s) => `700 ${s * 0.42}px Inter, system-ui, sans-serif`;

    const layout = () => {
      ctx.font = fNum(fs);
      const cellW = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width));
      const items = chars.map((c) => {
        const digit = /\d/.test(c);
        return { c, digit, w: digit ? cellW : ctx.measureText(c).width * 0.7 };
      });
      ctx.font = fAff(fs);
      const preW = p.prefix ? ctx.measureText(p.prefix).width + fs * 0.1 : 0;
      const sufW = p.suffix ? ctx.measureText(p.suffix).width + fs * 0.06 : 0;
      const numW = items.reduce((a, b) => a + b.w, 0) - fs * 0.03 * (items.length - 1);
      return { cellW, items, preW, sufW, numW, total: preW + numW + sufW };
    };
    let L = layout();
    if (L.total > w * 0.86) {
      fs *= (w * 0.86) / L.total;
      L = layout();
    }

    const labelFs = Math.max(fs * 0.16, Math.min(w, h) * 0.032);
    const rowH = fs * 1.12;
    const blockH = rowH + labelFs * 2.4;
    const cy = h / 2 - blockH / 2 + rowH / 2;
    const base = cy + fs * 0.36; // baseline dos dígitos
    const x0 = (w - L.total) / 2;

    // "Pop" quando o último dígito assenta.
    const digitsIdx = L.items.map((it, i) => (it.digit ? i : -1)).filter((i) => i >= 0);
    const nd = digitsIdx.length;
    const landT = 2.35 + (nd - 1) * 0.06;
    const pop = 1 + 0.045 * Math.sin(Math.PI * seg(t, landT - 0.05, landT + 0.35)) * (1 - seg(t, landT + 0.2, landT + 0.4));

    ctx.save();
    ctx.translate(w / 2, cy);
    ctx.scale(pop, pop);
    ctx.translate(-w / 2, -cy);

    // Máscara da linha.
    const clipTop = cy - rowH / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, w, rowH);
    ctx.clip();

    const outBase = 4.15;
    const enter = (i) => ease.outExpo(seg(t, 0.05 + i * 0.03, 0.75 + i * 0.03));
    const exit = (i) => ease.inCubic(seg(t, outBase + i * 0.03, outBase + 0.45 + i * 0.03));
    const nItems = L.items.length;

    // prefixo
    ctx.textBaseline = 'alphabetic';
    if (p.prefix) {
      const dy = (1 - enter(0)) * rowH - exit(0) * rowH;
      ctx.font = fAff(fs);
      ctx.fillStyle = p.accent;
      ctx.fillText(p.prefix, x0, base - fs * 0.33 + dy);
    }

    let x = x0 + L.preW;
    let di = 0;
    ctx.font = fNum(fs);
    L.items.forEach((it, i) => {
      const k = i + 1;
      const dy = (1 - enter(k)) * rowH - exit(k) * rowH;
      if (!it.digit) {
        ctx.fillStyle = rgba(p.color, 0.55);
        ctx.fillText(it.c, x - it.w * 0.12, base + dy);
        x += it.w - fs * 0.03;
        return;
      }
      const j = di++;
      const target = Number(it.c);
      const spins = Math.round(p.spins) + Math.round((j / Math.max(1, nd - 1)) * 2);
      const travel = target + 10 * spins;
      const a = 0.2 + j * 0.03;
      const b = 2.35 + j * 0.06;
      const posAt = (tt) => travel * ease.outQuart(seg(tt, a, b));
      const step = fs * 1.05; // distância entre dígitos na fita
      const cx = x + L.cellW / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      // borrão de movimento: sub-amostras no "obturador"
      const v = Math.abs(posAt(t + 0.004) - posAt(t - 0.004)) / 0.008; // dígitos/s
      const N = Math.min(10, Math.max(1, Math.ceil(v / 60 / 0.08)));
      const sa = N > 1 ? 1 - 0.12 ** (1 / N) : 1;
      for (let s = 0; s < N; s++) {
        const pos = posAt(t - (s / N) * (1 / 60));
        const fl = Math.floor(pos);
        const fr = pos - fl;
        for (let r = -1; r <= 1; r++) {
          const d = (((fl + r) % 10) + 10) % 10;
          const y = base + dy + (fr - r) * step;
          const dist = Math.abs(y - (base + dy)) / step;
          if (dist >= 1) continue;
          ctx.globalAlpha = sa * (1 - dist * dist * (3 - 2 * dist));
          ctx.fillText(String(d), cx, y);
        }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'start';
      x += it.w - fs * 0.03;
    });

    // sufixo
    if (p.suffix) {
      const dy = (1 - enter(nItems + 1)) * rowH - exit(nItems + 1) * rowH;
      ctx.font = fAff(fs);
      ctx.fillStyle = p.accent;
      ctx.fillText(p.suffix, x + fs * 0.06, base - fs * 0.33 + dy);
    }

    ctx.restore();
    ctx.restore();

    // Barra de destaque + legenda.
    const barIn = ease.outExpo(seg(t, landT - 0.1, landT + 0.7));
    const barOut = ease.inOutCubic(seg(t, 4.0, 4.5));
    const barY = clipTop + rowH + labelFs * 0.3;
    const barW = L.total * 0.16;
    ctx.fillStyle = p.accent;
    ctx.fillRect(w / 2 - barW / 2 + barW * barOut, barY, barW * (barIn - barOut), Math.max(2, fs * 0.025));
    if (p.label) {
      const la = ease.outCubic(seg(t, landT + 0.05, landT + 0.7)) * (1 - ease.inCubic(seg(t, 4.0, 4.4)));
      if (la > 0) {
        ctx.font = `500 ${labelFs}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = la;
        ctx.fillStyle = rgba(p.color, 0.7);
        ctx.fillText(p.label, w / 2, barY + labelFs * 1.5 + (1 - la) * labelFs * 0.6);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'start';
      }
    }
  },
};
