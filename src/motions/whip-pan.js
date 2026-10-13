import { TAU, seg, ease, rng, hexToRgb } from '../lib/anim.js';

// Direção em que o conteúdo da cena se move (a câmera "chicoteia" para o lado oposto).
const DIRS = {
  esquerda: [-1, 0],
  direita: [1, 0],
  cima: [0, -1],
  baixo: [0, 1],
};

const SHUTTER = 0.11; // quanto o borrão da prévia "arrasta" (s de exposição exagerada)

// Deslocamento da câmera (0 → 1 tela): acelera até o corte, desacelera depois.
function camPos(t, mid, duration) {
  if (t < mid) return 0.5 * ease.inCubic(seg(t, 0, mid));
  return 0.5 + 0.5 * ease.outCubic(seg(t, mid, duration));
}

const mixRgb = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k].map(Math.round);
const css = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

export default {
  id: 'whip-pan',
  title: 'Whip Pan',
  description: 'Chicote de câmera: faixas de borrão de movimento atravessam a tela em aceleração, cobrem tudo no corte e saem desacelerando com a próxima cena.',
  category: 'transicoes',
  tags: ['transição', 'overlay', 'alpha'],
  duration: 1.2,
  poster: 0.5,

  params: {
    direction: { type: 'select', label: 'Movimento da cena', options: Object.keys(DIRS), default: 'esquerda' },
    dark: { type: 'color', label: 'Tom escuro', default: '#141418' },
    light: { type: 'color', label: 'Tom claro', default: '#ece7dd' },
    accent: { type: 'color', label: 'Destaque', default: '#ff4d2e' },
    accentAmt: { type: 'range', label: 'Quantidade de destaque', min: 0, max: 0.4, step: 0.01, default: 0.08 },
    streaks: { type: 'range', label: 'Faixas', min: 20, max: 160, step: 1, default: 70 },
    smear: { type: 'range', label: 'Arrasto', min: 0.1, max: 1, step: 0.01, default: 0.55 },
    glints: { type: 'range', label: 'Riscos de luz', min: 0, max: 40, step: 1, default: 14 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 11 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  setup({ w, h, p }) {
    const vertical = p.direction === 'cima' || p.direction === 'baixo';
    const H = vertical ? w : h; // espessura total (perpendicular ao movimento)
    const r = rng(p.seed * 53 + 3);
    const dark = hexToRgb(p.dark);
    const light = hexToRgb(p.light);
    const acc = hexToRgb(p.accent);
    const n = Math.round(p.streaks);
    // Alturas aleatórias normalizadas para somar H exatamente.
    const hs = [];
    for (let i = 0; i < n; i++) hs.push(0.3 + r() ** 2 * 2.4);
    const sum = hs.reduce((a, b) => a + b, 0);
    const ph1 = r() * TAU;
    const ph2 = r() * TAU;
    const rows = [];
    let y = 0;
    for (let i = 0; i < n; i++) {
      const hh = (hs[i] / sum) * H;
      const yc = (y + hh / 2) / H;
      // Tom suave ao longo da espessura (parece uma imagem borrada) + ruído por faixa.
      const base = 0.5 + 0.28 * Math.sin(TAU * 1.3 * yc + ph1) + 0.16 * Math.sin(TAU * 3.7 * yc + ph2);
      const tone = Math.min(1, Math.max(0, base * 0.8 + (r() - 0.5) * 0.5)) ** 2.4;
      const rgb = r() < p.accentAmt ? mixRgb(acc, dark, r() * 0.25) : mixRgb(dark, light, tone);
      rows.push({
        y,
        h: hh,
        rgb,
        fl: 0.25 + 0.75 * r(), // arrasto da borda da frente (fração do máximo)
        ft: 0.25 + 0.75 * r(), // arrasto da borda de trás
        dIn: r(),
        dOut: r(),
      });
      y += hh;
    }
    const glints = [];
    for (let i = 0; i < Math.round(p.glints); i++) {
      glints.push({
        y: r() * H,
        h: 0.6 + r() * 2.2, // em px lógicos × m/1080
        len: 0.25 + r() * 0.6,
        t0: 0.25 + r() * 0.55, // centro do risco (fração da duração)
        a: 0.35 + r() * 0.5,
        rgb: r() < 0.25 ? acc : light,
      });
    }
    return { rows, glints };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    const mid = duration / 2;
    const m = Math.min(w, h);
    const [dx, dy] = DIRS[p.direction] ?? DIRS.esquerda;
    const W = dx ? w : h; // comprimento ao longo do movimento
    const H = dx ? h : w;

    // --- Prévia: A (antes do corte) e B (depois) arrastadas pela câmera, com borrão direcional na letra.
    if (!p.transparent) {
      const isA = t < mid;
      const s = camPos(t, mid, duration);
      const e = 1 / 600;
      const vel = (Math.abs(camPos(Math.min(duration, t + e), mid, duration) - camPos(Math.max(0, t - e), mid, duration)) / (2 * e)) * W;
      const blur = Math.min(W * 0.7, vel * SHUTTER);
      ctx.fillStyle = isA ? p.colorA : p.colorB;
      ctx.fillRect(0, 0, w, h);
      // A sai pelo lado do movimento; B vem do lado oposto
      const off = (isA ? s : s - 1) * W;
      const cx = w / 2 + dx * off;
      const cy = h / 2 + dy * off + m * 0.02;
      ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const taps = blur > 2 ? 16 : 1;
      const a1 = 1 - (1 - 0.14) ** (1 / taps);
      ctx.fillStyle = isA ? `rgba(255,255,255,${a1})` : `rgba(0,0,0,${a1})`;
      for (let k = 0; k < taps; k++) {
        const o = taps > 1 ? (k / (taps - 1) - 0.5) * blur : 0;
        ctx.fillText(isA ? 'A' : 'B', cx + dx * o, cy + dy * o);
      }
    }

    // --- Faixas de borrão: num referencial em que elas viajam para -X, de largura W e espessura H.
    const { rows, glints } = state;
    const pad = 2;
    const life = mid * 0.6;
    const spread = mid * 0.94 - life;
    const fMax = W * (0.15 + 0.85 * p.smear);
    const inPhase = t < mid;
    ctx.save();
    // eixo X do referencial = contra o movimento da cena; origem no canto correspondente
    const ex = -dx || 0;
    const ey = -dy || 0;
    const ox = dx > 0 ? w : 0;
    const oy = dy > 0 ? h : 0;
    ctx.transform(ex, ey, dx ? 0 : 1, dx ? 1 : 0, ox, oy);
    for (const R of rows) {
      const fl = fMax * R.fl;
      const ft = fMax * R.ft;
      let lead;
      let tail;
      if (inPhase) {
        const d = R.dIn * spread;
        const u = ease.inCubic(seg(t, d, d + life));
        if (u <= 0) continue;
        lead = W + fl - (W + fl + pad) * u;
        tail = W + pad;
      } else {
        const d = R.dOut * spread;
        const v = ease.outCubic(seg(t, mid + d, mid + d + life));
        if (v >= 1) continue;
        lead = -pad;
        tail = W + pad - (W + pad + ft) * v;
      }
      const x0 = lead - fl;
      const x1 = tail + (inPhase ? 0 : ft);
      const len = x1 - x0;
      if (len <= 0.5) continue;
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, css(R.rgb, 0));
      g.addColorStop(Math.min(1, fl / len), css(R.rgb, 1));
      if (!inPhase) {
        g.addColorStop(Math.max(fl / len, 1 - ft / len), css(R.rgb, 1));
        g.addColorStop(1, css(R.rgb, 0));
      }
      ctx.fillStyle = g;
      // sobreposição de 1 px entre faixas vizinhas: sem fresta de antialias
      ctx.fillRect(x0, R.y - 1, len, R.h + 2);
    }

    // Riscos de luz finos que cruzam rápido perto do corte.
    const k = m / 1080;
    for (const G of glints) {
      const c = G.t0 * duration;
      const half = duration * 0.22;
      const u = seg(t, c - half, c + half);
      if (u <= 0 || u >= 1) continue;
      const L = W * G.len;
      const xc = W + L - (W + 2 * L) * u;
      const a = G.a * Math.sin(Math.PI * u);
      const g = ctx.createLinearGradient(xc - L / 2, 0, xc + L / 2, 0);
      g.addColorStop(0, css(G.rgb, 0));
      g.addColorStop(0.3, css(G.rgb, a));
      g.addColorStop(1, css(G.rgb, 0));
      ctx.fillStyle = g;
      ctx.fillRect(xc - L / 2, G.y, L, G.h * k);
    }
    ctx.restore();
  },
};
