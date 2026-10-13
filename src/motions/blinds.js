import { seg, ease, hexToRgb } from '../lib/anim.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, t, { w, h, p, duration }) {
  if (p.transparent) return;
  const isA = t < duration / 2;
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

const shadeRgb = ([r, g, b], k) => {
  // k < 1 escurece, k > 1 clareia em direção ao branco
  if (k <= 1) return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
  const u = Math.min(1, k - 1);
  return `rgb(${Math.round(r + (255 - r) * u)},${Math.round(g + (255 - g) * u)},${Math.round(b + (255 - b) * u)})`;
};

export default {
  id: 'blinds',
  title: 'Blinds',
  description: 'Blinds flip in a cascade until the screen is covered, with light and shadow on every slat, then keep turning to open onto the next scene.',
  category: 'transicoes',
  tags: ['transition', 'shape', '3d', 'alpha'],
  duration: 1.6,
  poster: 0.62,

  params: {
    color: { type: 'color', label: 'Slat color', default: '#ff4d2e' },
    count: { type: 'range', label: 'Slats', min: 4, max: 40, step: 1, default: 12 },
    orientation: { type: 'select', label: 'Orientation', options: ['horizontal', 'vertical'], default: 'horizontal' },
    reopen: { type: 'select', label: 'Opening', options: ['continua girando', 'volta'], default: 'continua girando' },
    stagger: { type: 'range', label: 'Cascade', min: 0, max: 1, step: 0.01, default: 0.45 },
    light: { type: 'range', label: 'Light', min: 0, max: 1, step: 0.01, default: 0.7 },
    shadow: { type: 'range', label: 'Shadow', min: 0, max: 1, step: 0.01, default: 0.6 },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  render(ctx, t, env) {
    const { w, h, p, duration } = env;
    preview(ctx, t, env);
    const mid = duration / 2;
    const m = Math.min(w, h);
    const vert = p.orientation === 'vertical';
    // Referencial: lâminas empilhadas ao longo de Y (altura H), com comprimento W.
    const W = vert ? h : w;
    const H = vert ? w : h;
    const n = Math.round(p.count);
    const band = H / n;
    const ov = Math.max(2, band * 0.06); // sobreposição das lâminas fechadas (nada de fresta)
    const thick = Math.max(1, m * 0.0035); // espessura vista de lado
    const rgb = hexToRgb(p.color);
    const back = p.reopen === 'volta';

    // Cada lâmina usa parte da metade; o resto é a cascata (de cima para baixo).
    const life = mid * (0.92 - 0.5 * p.stagger);
    const spread = mid * 0.92 - life;
    const fadeIn = seg(t, 0, duration * 0.06);
    const fadeOut = 1 - seg(t, duration * 0.94, duration);

    ctx.save();
    if (vert) ctx.transform(0, 1, 1, 0, 0, 0); // troca X↔Y (espelho: a ordem vira da esquerda para a direita)

    // Ângulo de cada lâmina: +90° (de lado) → 0 (fechada, de frente) → −90° (de lado, ou +90° se "volta").
    const phis = [];
    for (let i = 0; i < n; i++) {
      const d = (n > 1 ? i / (n - 1) : 0) * spread;
      let phi;
      if (t < mid) phi = (Math.PI / 2) * (1 - ease.inOutCubic(seg(t, d, d + life)));
      else {
        const u = ease.inOutCubic(seg(t, mid + d, mid + d + life));
        phi = (back ? 1 : -1) * (Math.PI / 2) * u;
      }
      phis.push(phi);
    }

    // 1) Sombra das lâminas sobre a cena (embaixo de cada uma, quando entreabertas).
    if (p.shadow > 0) {
      for (let i = 0; i < n; i++) {
        const c = Math.cos(phis[i]);
        const open = Math.abs(Math.sin(phis[i]));
        const hs = Math.max(thick, band * c);
        const yb = band * (i + 0.5) + hs / 2;
        const len = band * (0.15 + 0.6 * open);
        const a = 0.38 * p.shadow * Math.min(1, c * 3) * fadeIn * fadeOut;
        if (a < 0.003) continue;
        const g = ctx.createLinearGradient(0, yb, 0, yb + len);
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-2, yb, W + 4, len);
      }
    }

    // 2) Lâminas: altura projetada band·cos φ, centradas na faixa; luz vem de cima e da frente.
    for (let i = 0; i < n; i++) {
      const phi = phis[i];
      const c = Math.cos(phi);
      const closed = c > 0.999;
      const hs = closed ? band + ov : Math.max(thick, band * c + ov * c * c);
      if (!closed && hs <= thick && fadeIn * fadeOut <= 0) continue;
      const yc = band * (i + 0.5);
      const y0 = yc - hs / 2;
      // normal (0, −sin φ, cos φ) · luz (0, −0.6, 0.8): lâmina virada para cima fica mais clara
      const lit = 0.6 * Math.sin(phi) + 0.8 * c;
      const L = p.light;
      const k = 1 - 0.32 * L + 0.32 * L * lit; // 0.68..1 (+ brilho)
      const top = shadeRgb(rgb, k * (1 + 0.04 * L) + (phi > 0 ? 0.05 * L : 0));
      const bot = shadeRgb(rgb, k * (1 - 0.2 * L));
      ctx.globalAlpha = hs <= thick * 1.01 ? fadeIn * fadeOut : 1;
      if (ctx.globalAlpha <= 0) continue;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + hs);
      g.addColorStop(0, top);
      g.addColorStop(0.55, shadeRgb(rgb, k));
      g.addColorStop(1, bot);
      ctx.fillStyle = g;
      ctx.fillRect(-2, y0, W + 4, hs);
      // Sombra da lâmina de cima projetada no topo desta (mais forte quando fechada) e frestinha escura.
      if (i > 0 && p.shadow > 0 && hs > thick * 2) {
        const sh = Math.min(hs, band * 0.22);
        const a = 0.22 * p.shadow * c;
        const gs = ctx.createLinearGradient(0, y0, 0, y0 + sh);
        gs.addColorStop(0, `rgba(0,0,0,${a})`);
        gs.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gs;
        ctx.fillRect(-2, y0, W + 4, sh);
      }
      // Quina: fresta escura e um fio de luz logo abaixo (bordas nítidas entre as lâminas).
      if (i > 0 && hs > thick * 3) {
        const lw = Math.max(1, m * 0.0016);
        ctx.fillStyle = `rgba(0,0,0,${(0.12 + 0.3 * p.shadow) * c})`;
        ctx.fillRect(-2, y0, W + 4, lw);
        if (p.light > 0) {
          ctx.fillStyle = `rgba(255,255,255,${0.22 * p.light * c * Math.max(0, lit)})`;
          ctx.fillRect(-2, y0 + lw, W + 4, lw * 1.5);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};
