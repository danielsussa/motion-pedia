import { TAU, clamp, seg, ease, spring, rng, rgba, mixHex } from '../lib/anim.js';

const INTER = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (s) => `500 ${s}px 'JetBrains Mono', ui-monospace, monospace`;

const T_DROP = 0.45; // pin começa a cair
const T_HIT = 1.0; // toca o chão
const T_OUT = 4.3; // saída

// Pin em gota com a ponta em (0,0) e altura H.
function pinPath(ctx, H) {
  const r = H * 0.34;
  const d = H - r; // distância da ponta ao centro da cabeça
  const b = Math.acos(r / d);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, -d, r, Math.PI / 2 + b, Math.PI / 2 - b + TAU);
  ctx.closePath();
  return { r, d };
}

export default {
  id: 'map-pin',
  title: 'Map Pin',
  description: 'A pin drops onto a stylized map, bounces, sends out ripples and reveals the place name on a card.',
  category: 'dados',
  tags: ['ui', 'overlay', 'alpha'],
  duration: 5.4,
  poster: 2.4,

  params: {
    place: { type: 'text', label: 'Place', default: 'São Paulo' },
    detail: { type: 'text', label: 'Detail', default: '23°33′S · 46°38′W' },
    theme: { type: 'select', label: 'Map', options: ['escuro', 'claro'], default: 'escuro' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    scale: { type: 'range', label: 'Scale', min: 0.5, max: 1.6, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Map seed', min: 1, max: 99, step: 1, default: 7 },
    transparent: { type: 'boolean', label: 'Transparent background (no map)', default: false },
  },

  // Mapa procedural: duas malhas de ruas em ângulos diferentes, avenidas, quadras de parque e um rio.
  setup({ w, h, p }) {
    const R = rng(p.seed * 9973);
    const S = Math.hypot(w, h) * 0.75; // raio coberto (com folga para o zoom)
    const grids = [
      { ang: (R() - 0.5) * 0.5, step: Math.min(w, h) * (0.07 + R() * 0.03), half: 1 },
      { ang: 0.6 + R() * 0.5, step: Math.min(w, h) * (0.09 + R() * 0.04), half: -1 },
    ];
    const streets = [];
    const avenues = [];
    grids.forEach((g) => {
      const c = Math.cos(g.ang);
      const s = Math.sin(g.ang);
      for (const dir of [0, 1]) {
        const ca = dir ? -s : c;
        const sa = dir ? c : s;
        for (let k = -Math.ceil(S / g.step); k <= Math.ceil(S / g.step); k++) {
          const off = k * g.step + (R() - 0.5) * g.step * 0.25;
          const ox = -sa * off;
          const oy = ca * off;
          // Cada malha cobre só um "bairro" (um semiplano com borda inclinada).
          const seg0 = { x0: ox - ca * S, y0: oy - sa * S, x1: ox + ca * S, y1: oy + sa * S };
          if (R() < 0.12) avenues.push(seg0);
          else streets.push({ ...seg0, half: g.half });
        }
      }
    });
    const parks = [];
    for (let i = 0; i < 5; i++) {
      parks.push({ x: (R() - 0.5) * w * 1.1, y: (R() - 0.5) * h * 1.1, w: Math.min(w, h) * (0.08 + R() * 0.14), h: Math.min(w, h) * (0.06 + R() * 0.1), a: (R() - 0.5) * 0.6 });
    }
    // Rio: curva suave atravessando o quadro, longe do centro.
    const river = [];
    const side = R() < 0.5 ? -1 : 1;
    const ph = R() * TAU;
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const y = (u - 0.5) * S * 2;
      const x = side * Math.min(w, h) * 0.38 + Math.sin(u * 5 + ph) * Math.min(w, h) * 0.08;
      river.push([x, y]);
    }
    const rAng = (R() - 0.5) * 1.2;
    return { streets, avenues, parks, river, rAng };
  },

  render(ctx, t, { w, h, p, px, state }) {
    const m = Math.min(w, h) * p.scale;
    const mm = Math.min(w, h);
    const dark = p.theme !== 'claro';
    const cx = w / 2;
    const portrait = h > w * 1.1;
    const cy = h * (portrait ? 0.5 : 0.56);

    const exitE = ease.inOutCubic(seg(t, T_OUT, T_OUT + 0.8));

    // ---------- mapa ----------
    if (!p.transparent) {
      const land = dark ? '#121418' : '#ece8df';
      const road = dark ? '#1e2128' : '#ffffff';
      const avenue = dark ? '#2b2f38' : '#fbfaf7';
      const water = dark ? '#0b1a26' : '#bfd6e3';
      const park = dark ? '#16201b' : '#d9e5cf';
      ctx.fillStyle = land;
      ctx.fillRect(0, 0, w, h);

      // Câmera: aproxima no começo, deriva devagar, afasta na saída.
      const zoom = 1.25 - 0.25 * ease.outExpo(seg(t, 0, 2.2)) - 0.06 * exitE;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);
      ctx.rotate(-0.03 + 0.03 * ease.outCubic(seg(t, 0, 3)));
      ctx.translate(-mm * 0.02 * t, mm * 0.008 * t);

      ctx.fillStyle = park;
      for (const k of state.parks) {
        ctx.save();
        ctx.translate(k.x, k.y);
        ctx.rotate(k.a);
        ctx.beginPath();
        ctx.roundRect(-k.w / 2, -k.h / 2, k.w, k.h, mm * 0.01);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.rotate(state.rAng);
      ctx.strokeStyle = water;
      ctx.lineWidth = mm * 0.05;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      state.river.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.restore();

      // Ruas: cada malha recortada no seu semiplano.
      for (const half of [1, -1]) {
        ctx.save();
        ctx.beginPath();
        const big = Math.hypot(w, h) * 2;
        ctx.rotate(0.35);
        ctx.rect(half > 0 ? -big : mm * 0.06, -big, big + (half > 0 ? mm * 0.06 : 0), big * 2);
        ctx.rotate(-0.35);
        ctx.clip();
        ctx.strokeStyle = road;
        ctx.lineWidth = mm * 0.005;
        ctx.beginPath();
        for (const s of state.streets) {
          if (s.half !== half) continue;
          ctx.moveTo(s.x0, s.y0);
          ctx.lineTo(s.x1, s.y1);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = avenue;
      ctx.lineWidth = mm * 0.012;
      ctx.beginPath();
      for (const s of state.avenues) {
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(s.x1, s.y1);
      }
      ctx.stroke();
      ctx.restore();

      // Vinheta (cor única por gradiente para não puxar matiz).
      const vg = ctx.createRadialGradient(cx, cy, mm * 0.1, cx, cy, Math.hypot(w, h) * 0.6);
      const vc = dark ? '#000000' : '#ffffff';
      vg.addColorStop(0, rgba(vc, 0));
      vg.addColorStop(1, rgba(vc, dark ? 0.6 : 0.55));
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      // Começo e fim em cor lisa: o loop não salta de enquadramento.
      const veil = 1 - Math.min(ease.outCubic(seg(t, 0, 0.6)), 1 - ease.inOutCubic(seg(t, 4.8, 5.4)));
      if (veil > 0.001) {
        ctx.fillStyle = rgba(dark ? '#0c0d10' : '#ece8df', veil);
        ctx.fillRect(0, 0, w, h);
      }
    }

    // ---------- ondas no chão ----------
    const ink = dark || p.transparent ? '#f4f1ea' : '#16181d';
    const waveOn = 1 - clamp(seg(t, T_OUT - 0.2, T_OUT + 0.3));
    for (let i = 0; i < 6; i++) {
      const t0 = T_HIT + i * 0.55;
      const u = seg(t, t0, t0 + 1.6);
      if (u <= 0 || u >= 1 || t0 > T_OUT) continue;
      const e = ease.outCubic(u);
      ctx.strokeStyle = rgba(p.accent, 0.7 * (1 - u) * waveOn);
      ctx.lineWidth = m * (i === 0 ? 0.006 : 0.003);
      ctx.beginPath();
      ctx.ellipse(cx, cy, m * 0.03 + m * 0.2 * e, (m * 0.03 + m * 0.2 * e) * 0.5, 0, 0, TAU);
      ctx.stroke();
    }
    // Disco do local no chão.
    const disc = spring(seg(t, T_HIT - 0.05, T_HIT + 0.6), 0.3) * (1 - exitE);
    if (disc > 0) {
      ctx.fillStyle = rgba(p.accent, 0.22);
      ctx.beginPath();
      ctx.ellipse(cx, cy, m * 0.035 * disc, m * 0.035 * 0.5 * disc, 0, 0, TAU);
      ctx.fill();
    }

    // ---------- pin ----------
    const H = m * 0.15;
    const fall = seg(t, T_DROP, T_HIT);
    const yOff = -(1 - ease.inCubic(fall)) * h * 0.65; // cai de cima
    const landed = t >= T_HIT;
    // Amassa ao tocar e assenta com mola.
    const bounce = landed ? spring(seg(t, T_HIT, T_HIT + 0.9), 0.45) : 0;
    let sx = 1;
    let sy = 1;
    if (landed) {
      const sq = (1 - bounce) * 0.35;
      sx = 1 + sq;
      sy = 1 - sq;
    } else {
      sy = 1 + 0.12 * ease.inCubic(fall); // estica caindo
      sx = 1 - 0.06 * ease.inCubic(fall);
    }
    const outS = 1 - ease.inBack(seg(t, T_OUT + 0.15, T_OUT + 0.65));
    const visible = t >= T_DROP && outS > 0.001;

    if (visible) {
      // Sombra: cresce e escurece quando o pin se aproxima.
      const near = landed ? 1 : ease.inCubic(fall);
      ctx.fillStyle = `rgba(0,0,0,${(dark || p.transparent ? 0.45 : 0.22) * near * outS})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, H * 0.22 * (0.4 + 0.6 * near) * sx * outS, H * 0.07 * (0.4 + 0.6 * near) * outS, 0, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy + yOff);
      ctx.scale(sx * outS, sy * outS);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = H * 0.12 * px;
      ctx.shadowOffsetY = H * 0.04 * px;
      const { r, d } = pinPath(ctx, H);
      const pg = ctx.createLinearGradient(-r, -H, r, 0);
      pg.addColorStop(0, mixHex(p.accent, '#ffffff', 0.18));
      pg.addColorStop(1, mixHex(p.accent, '#000000', 0.18));
      ctx.fillStyle = pg;
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -d, r * 0.42, 0, TAU);
      ctx.fill();
      // Brilho especular.
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.4, -d - r * 0.45, r * 0.28, r * 0.16, -0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // ---------- cartão com o nome ----------
    const cardIn = ease.outExpo(seg(t, T_HIT + 0.25, T_HIT + 1.1));
    const cardOut = ease.inOutCubic(seg(t, T_OUT - 0.1, T_OUT + 0.4));
    if (cardIn > 0.001 && cardOut < 0.999) {
      const ps = m * 0.06;
      const ds = m * 0.024;
      ctx.font = INTER(800, ps);
      let pS = ps;
      const maxW = w < h * 1.3 ? w * 0.8 : w * 0.4;
      let pw = ctx.measureText(p.place).width;
      if (pw > maxW) {
        pS = (ps * maxW) / pw;
        pw = maxW;
      }
      ctx.font = MONO(ds);
      const dw = p.detail.trim() ? ctx.measureText(p.detail).width : 0;
      const pad = m * 0.035;
      const cw = Math.max(pw, dw) + pad * 2;
      const ch = pS * 1.2 + (dw ? ds * 1.9 : 0) + pad * 1.5;
      // Posição: à direita do pin (paisagem) ou abaixo (retrato).
      const below = portrait || cx + H * 0.55 + cw > w * 0.95; // sem espaço à direita: vai para baixo
      const bx = below ? clamp(cx - cw / 2, w * 0.04, w * 0.96 - cw) : cx + H * 0.55;
      const by = below ? cy + m * 0.1 : cy - H * 0.75 - ch / 2;

      // Linha guia do pin até o cartão.
      ctx.strokeStyle = rgba(ink, 0.5);
      ctx.lineWidth = Math.max(1, m * 0.0025);
      ctx.beginPath();
      if (below) {
        const y0 = cy + m * 0.015;
        ctx.moveTo(cx, y0);
        ctx.lineTo(cx, y0 + (by - y0) * cardIn * (1 - cardOut));
      } else {
        const x0 = cx + H * 0.2;
        const yl = by + ch / 2;
        ctx.moveTo(x0, yl);
        ctx.lineTo(x0 + (bx - x0) * cardIn * (1 - cardOut), yl);
      }
      ctx.stroke();

      // Wipe horizontal (entra da esquerda, sai pela direita).
      const a = bx + cw * cardOut;
      const b = bx + cw * cardIn;
      if (b > a) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(a, by - m * 0.05, b - a, ch + m * 0.1);
        ctx.clip();
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = m * 0.03 * px;
        ctx.shadowOffsetY = m * 0.008 * px;
        ctx.fillStyle = dark || p.transparent ? '#f4f1ea' : '#16181d';
        ctx.beginPath();
        ctx.roundRect(bx, by, cw, ch, m * 0.012);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = p.accent;
        ctx.fillRect(bx, by, m * 0.008, ch);
        const textE = ease.outCubic(seg(t, T_HIT + 0.45, T_HIT + 1.2));
        const ty = by + pad * 0.75 + pS * 0.95 + (1 - textE) * pS * 0.4;
        ctx.globalAlpha = textE;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = INTER(800, pS);
        ctx.letterSpacing = `${-pS * 0.02}px`;
        ctx.fillStyle = dark || p.transparent ? '#111114' : '#f4f1ea';
        ctx.fillText(p.place, bx + pad, ty);
        ctx.letterSpacing = '0px';
        if (dw) {
          ctx.font = MONO(ds);
          ctx.fillStyle = rgba(dark || p.transparent ? '#111114' : '#f4f1ea', 0.6);
          ctx.fillText(p.detail, bx + pad, ty + ds * 1.75);
        }
        ctx.restore();
      }
    }
  },
};
