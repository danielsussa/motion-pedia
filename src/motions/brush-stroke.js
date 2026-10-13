import { TAU, seg, ease, clamp, rng, mixHex } from '../lib/anim.js';

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

const SEGS = 20; // segmentos por cerda (a pincelada é levemente curva)

export default {
  id: 'brush-stroke',
  title: 'Brush Stroke',
  description: 'Broad paint strokes with dry-bristle tips and splatter zigzag diagonally across the screen, cover it all and drag their tails out.',
  category: 'transicoes',
  tags: ['transition', 'shape', 'alpha'],
  duration: 1.6,
  poster: 0.55,

  params: {
    color1: { type: 'color', label: 'Ink', default: '#111114' },
    color2: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    accentEvery: { type: 'range', label: 'Accent every', min: 0, max: 5, step: 1, default: 3 },
    count: { type: 'range', label: 'Strokes', min: 3, max: 9, step: 1, default: 5 },
    angle: { type: 'range', label: 'Angle', min: -45, max: 45, step: 1, default: -16 },
    dry: { type: 'range', label: 'Dry bristles', min: 0, max: 1, step: 0.01, default: 0.6 },
    splatter: { type: 'range', label: 'Splatter', min: 0, max: 1, step: 0.01, default: 0.6 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
    colorA: { type: 'color', label: 'Preview A', default: '#e7e2d8' },
    colorB: { type: 'color', label: 'Preview B', default: '#1a1c22' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const ang = (p.angle * Math.PI) / 180;
    const L = Math.abs(w * Math.cos(ang)) + Math.abs(h * Math.sin(ang));
    const Hh = Math.abs(w * Math.sin(ang)) + Math.abs(h * Math.cos(ang));
    const K = Math.round(p.count);
    const space = Hh / K;
    const bw = space * 1.5; // largura da pincelada (sobreposição generosa: sem frestas)
    const r = rng(p.seed * 17 + 3);
    const strokes = [];
    for (let i = 0; i < K; i++) {
      const every = Math.round(p.accentEvery);
      const color = every > 0 && i % every === 1 % every ? p.color2 : p.color1;
      // cerdas: faixas finas sobrepostas atravessando a largura
      const NB = 30;
      const bristles = [];
      for (let j = 0; j < NB; j++) {
        const v = (j + 0.5) / NB - 0.5; // -0.5..0.5 através da largura
        const edge = Math.abs(v) * 2; // 0 no meio, 1 na borda
        bristles.push({
          v: v + (r() - 0.5) * 0.012,
          th: (bw / NB) * (2.1 + r() * 1.4) * (1 - 0.25 * edge ** 3),
          head: bw * p.dry * (0.02 + 0.5 * r() ** 2 + 0.35 * edge ** 2 * r()),
          tail: bw * p.dry * (0.04 + 0.7 * r() ** 2 + 0.4 * edge ** 2 * r()),
          shade: r() < 0.4 ? (r() < 0.55 ? -1 : 1) : 0, // cerdas um pouco mais escuras/claras
          wa: (bw / NB) * (0.2 + 1.2 * edge ** 2) * r(), // ondulação da cerda (mais nas bordas)
          wf: (1 + 4 * r()) / bw,
          wp: r() * TAU,
          tip: bw * (0.06 + 0.16 * r()), // comprimento da ponta afinada
        });
      }
      // a ponta afinada também precisa sair inteira da tela antes do meio
      const maxTip = Math.max(...bristles.map((b) => b.tip));
      const maxHead = Math.max(...bristles.map((b) => b.head)) + maxTip;
      const maxTail = Math.max(...bristles.map((b) => b.tail)) + maxTip;
      // respingos ao longo do trajeto, fora da borda
      const drops = [];
      const ND = Math.round(16 * p.splatter);
      for (let k = 0; k < ND; k++) {
        const side = r() < 0.5 ? -1 : 1;
        const big = r() < 0.25;
        drops.push({
          x: (r() - 0.5) * L,
          y: side * (bw * 0.5 + bw * (0.03 + 0.25 * r() ** 2)),
          rad: m * (big ? 0.005 + 0.006 * r() : 0.0015 + 0.004 * r()),
          stretch: 1 + 2.5 * r() ** 2,
          tilt: (r() - 0.5) * 0.5,
        });
      }
      strokes.push({
        color,
        dark: mixHex(color, '#000000', 0.14),
        light: mixHex(color, '#ffffff', 0.09),
        y: -Hh / 2 + space * (i + 0.5),
        dir: i % 2 ? -1 : 1,
        wob: space * 0.07 * (0.5 + r()),
        wf: 0.6 + r() * 0.9,
        wp: r() * TAU,
        bristles,
        maxHead,
        maxTail,
        drops,
      });
    }
    return { ang, L, Hh, bw, strokes };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    preview(ctx, t, env);
    const { ang, L, bw, strokes } = state;
    const m = Math.min(w, h);
    const mid = duration / 2;
    const K = strokes.length;
    const spread = mid * 0.4;
    const life = mid * 0.98 - spread;
    const margin = m * 0.02;
    // entrada: acelera e mantém o embalo até sair da tela; saída: arranca rápido e desacelera
    const mvIn = (x) => 0.55 * ease.inOutCubic(x) + 0.45 * x;
    const mvOut = (x) => 0.5 * ease.inOutCubic(x) + 0.5 * ease.outCubic(x);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(ang);

    for (let i = 0; i < K; i++) {
      const s = strokes[i];
      const d = (i / Math.max(1, K - 1)) * spread;
      const eIn = mvIn(seg(t, d, d + life));
      const eOut = mvOut(seg(t, mid + d, mid + d + life));
      if (eIn <= 0 || eOut >= 1) continue;
      // posições ao longo do trajeto (coordenada "u", no sentido em que o pincel anda)
      // ponta: no início toda cerda está antes da tela; no fim, toda cerda passou da borda oposta
      const head = -L / 2 - margin + (L + margin * 2 + s.maxHead) * eIn;
      const tail = -L / 2 - margin - s.maxTail + (L + margin * 2 + s.maxTail) * eOut;
      const head0 = head - s.maxHead * 0.5;
      const yc = (u) => s.y + s.wob * Math.sin((u / L) * Math.PI * 2 * s.wf + s.wp);

      // cerdas agrupadas por tom: um fill() por grupo
      const groups = [
        { c: s.color, f: () => true },
        { c: s.dark, f: (b) => b.shade < 0 },
        { c: s.light, f: (b) => b.shade > 0 },
      ];
      for (const g of groups) {
        ctx.fillStyle = g.c;
        ctx.beginPath();
        for (const b of s.bristles) {
          if (!g.f(b)) continue;
          const u0 = tail + b.tail;
          const u1 = head - b.head;
          if (u1 <= u0) continue;
          const th = g.c === s.color ? b.th : b.th * 0.22;
          const off = b.v * bw;
          // pontas afinadas: a espessura cai a zero nos dois extremos (só onde a cerda está na tela)
          const tip = Math.min(b.tip, (u1 - u0) / 2);
          const half = (u) => (th / 2) * Math.sqrt(clamp((u1 - u) / tip) * clamp((u - u0) / tip));
          const cy = (u) => yc(u) + off + b.wa * Math.sin(u * b.wf + b.wp);
          const N = SEGS + 4;
          const us = [];
          // amostras mais densas nas pontas
          for (let k = 0; k <= N; k++) {
            const q = k / N;
            const qq = q < 0.5 ? 0.5 * (2 * q) ** 1.8 : 1 - 0.5 * (2 - 2 * q) ** 1.8;
            us.push(u0 + (u1 - u0) * qq);
          }
          us.forEach((u, k) => (k ? ctx.lineTo(u * s.dir, cy(u) - half(u)) : ctx.moveTo(u * s.dir, cy(u) - half(u))));
          for (let k = N; k >= 0; k--) ctx.lineTo(us[k] * s.dir, cy(us[k]) + half(us[k]));
          ctx.closePath();
        }
        ctx.fill();
      }

      // respingos: aparecem quando a ponta passa, somem quando a cauda passa
      if (s.drops.length) {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        for (const dp of s.drops) {
          const a = clamp((head0 - dp.x) / (m * 0.12));
          const z = eOut > 0 ? clamp((dp.x - tail) / (m * 0.08)) : 1;
          const k = ease.outBack(a) * z;
          if (k <= 0.01) continue;
          const x = dp.x * s.dir;
          const y = yc(dp.x) + dp.y;
          ctx.moveTo(x + dp.rad * dp.stretch * k, y);
          ctx.ellipse(x, y, dp.rad * dp.stretch * k, dp.rad * k, dp.tilt, 0, TAU);
        }
        ctx.fill();
      }
    }
    ctx.restore();
  },
};
