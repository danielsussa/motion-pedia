import { seg, ease, rgba } from '../lib/anim.js';

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

// Recorta um polígono convexo pelo semiplano d(P) >= 0 (Sutherland–Hodgman com um plano).
function clipPoly(poly, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = d(a);
    const db = d(b);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const k = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  return out;
}

function polyPath(ctx, poly, dx = 0, dy = 0) {
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
  ctx.closePath();
}

const CORNERS = {
  'inferior direito': [1, 1],
  'inferior esquerdo': [0, 1],
  'superior direito': [1, 0],
  'superior esquerdo': [0, 0],
};

export default {
  id: 'page-curl',
  title: 'Page Curl',
  description: 'A page settles over the scene, then its corner curls and turns to show the back, with shadows on the fold and the scene below.',
  category: 'transicoes',
  tags: ['transition', 'shape', '3d', 'alpha'],
  duration: 1.6,
  poster: 1.05,

  params: {
    front: { type: 'color', label: 'Page front', default: '#f4f1ea' },
    back: { type: 'color', label: 'Back', default: '#ff4d2e' },
    corner: { type: 'select', label: 'Turning corner', options: Object.keys(CORNERS), default: 'inferior direito' },
    angle: { type: 'range', label: 'Fold angle', min: -30, max: 30, step: 1, default: 10 },
    curl: { type: 'range', label: 'Fold highlight', min: 0, max: 1, step: 0.01, default: 0.6 },
    shadow: { type: 'range', label: 'Shadow', min: 0, max: 1, step: 0.01, default: 0.55 },
    lines: { type: 'boolean', label: 'Ruled lines', default: true },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  render(ctx, t, env) {
    const { w, h, p, duration } = env;
    preview(ctx, t, env);
    const m = Math.min(w, h);
    const mid = duration / 2;
    const rect = [[-2, -2], [w + 2, -2], [w + 2, h + 2], [-2, h + 2]];
    const [kx, ky] = CORNERS[p.corner] ?? [1, 1];

    // Fase 2: o canto escolhido descola e a página vira em direção ao canto oposto.
    // Fase 1: o mesmo movimento ao contrário a partir do canto oposto (a página chega virando e assenta).
    const out = t >= mid;
    const C = out ? [kx * w, ky * h] : [(1 - kx) * w, (1 - ky) * h];
    const F = out ? [(1 - kx) * w, (1 - ky) * h] : [kx * w, ky * h];
    let nx = F[0] - C[0];
    let ny = F[1] - C[1];
    const nl = Math.hypot(nx, ny);
    const ang = ((out ? 1 : -1) * p.angle * Math.PI) / 180;
    [nx, ny] = [(nx / nl) * Math.cos(ang) - (ny / nl) * Math.sin(ang), (nx / nl) * Math.sin(ang) + (ny / nl) * Math.cos(ang)];
    const proj = ([x, y]) => (x - C[0]) * nx + (y - C[1]) * ny;
    const L = Math.max(...rect.map(proj));
    const shadowD = m * 0.16;
    const pad = shadowD + 4;
    // metade inOutCubic, metade linear: perto dos cantos a área muda pouco, não dá para demorar ali
    const mv = (x) => 0.55 * ease.inOutCubic(x) + 0.45 * x;
    const e = out ? mv(seg(t, mid + duration * 0.02, duration)) : 1 - mv(seg(t, 0, mid - duration * 0.02));
    // posição da dobra ao longo de n: o que está antes dela (lado do canto C) já virou
    const s0 = Math.min(...rect.map(proj)) - 1; // dobra exatamente no canto: nada virado
    const s = s0 + (L + pad - s0) * e;
    if (s >= L + pad) return;

    const flat = clipPoly(rect, (P) => proj(P) - s);
    const peeled = clipPoly(rect, (P) => s - proj(P));
    // a parte virada é refletida sobre a reta da dobra
    const flap = peeled.map((P) => {
      const d = 2 * (s - proj(P));
      return [P[0] + d * nx, P[1] + d * ny];
    });
    const depth = peeled.length ? Math.max(...peeled.map((P) => s - proj(P))) : 0;
    // ponto da reta da dobra mais próximo de C (origem dos gradientes perpendiculares a ela)
    const Lx = C[0] + nx * s;
    const Ly = C[1] + ny * s;
    const grad = (from, to, stops) => {
      const g = ctx.createLinearGradient(Lx + nx * from, Ly + ny * from, Lx + nx * to, Ly + ny * to);
      for (const [o, c] of stops) g.addColorStop(o, c);
      return g;
    };
    const lift = Math.min(1, depth / (m * 0.5)); // quanto a página está levantada (escala das sombras)

    // 1) Sombra da curva sobre a cena revelada (do lado do canto, junto à dobra).
    if (peeled.length && p.shadow > 0) {
      const D = shadowD * (0.35 + 0.65 * lift);
      ctx.fillStyle = grad(0, -D, [[0, `rgba(0,0,0,${0.42 * p.shadow})`], [0.35, `rgba(0,0,0,${0.16 * p.shadow})`], [1, 'rgba(0,0,0,0)']]);
      ctx.beginPath();
      polyPath(ctx, peeled);
      ctx.fill();
    }

    // 2) Parte ainda assentada da página.
    if (flat.length) {
      ctx.fillStyle = p.front;
      ctx.beginPath();
      polyPath(ctx, flat);
      ctx.fill();
      ctx.save();
      ctx.clip();
      if (p.lines) {
        // pauta fina e margem: dá leitura de "página"
        const gap = m * 0.06;
        ctx.fillStyle = rgba('#3a6ea5', 0.12);
        ctx.beginPath();
        for (let y = gap * 2; y < h; y += gap) ctx.rect(0, y, w, Math.max(1, m * 0.0016));
        ctx.fill();
        ctx.fillStyle = rgba('#ff4d2e', 0.28);
        ctx.fillRect(m * 0.12, 0, Math.max(1, m * 0.002), h);
      }
      if (peeled.length && p.shadow > 0) {
        // sombra do verso sobre a página: o contorno virado deslocado para longe da dobra
        ctx.fillStyle = `rgba(0,0,0,${0.07 * p.shadow})`;
        for (let k = 1; k <= 4; k++) {
          const o = m * 0.0075 * k * (0.3 + lift);
          ctx.beginPath();
          polyPath(ctx, flap, nx * o * 0.6 + o * 0.25, ny * o * 0.6 + o * 0.4);
          ctx.fill();
        }
        // a página escurece junto à dobra (começa a curvar)
        const D2 = Math.min(depth, m * 0.12) + 1;
        ctx.fillStyle = grad(0, D2, [[0, `rgba(0,0,0,${0.18 * p.shadow})`], [1, 'rgba(0,0,0,0)']]);
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    // 3) Verso da parte virada, com sombreado de cilindro junto à dobra.
    if (flap.length > 2) {
      ctx.fillStyle = p.back;
      ctx.beginPath();
      polyPath(ctx, flap);
      ctx.fill();
      if (p.curl > 0 && depth > 1) {
        const c = p.curl;
        const band = Math.min(depth, m * 0.35);
        ctx.fillStyle = grad(0, band, [
          [0, `rgba(0,0,0,${0.32 * c})`],
          [0.08, `rgba(0,0,0,${0.12 * c})`],
          [0.22, 'rgba(0,0,0,0)'],
          [1, 'rgba(0,0,0,0)'],
        ]);
        ctx.fill();
        ctx.fillStyle = grad(0, band, [
          [0, 'rgba(255,255,255,0)'],
          [0.16, `rgba(255,255,255,${0.32 * c})`],
          [0.42, `rgba(255,255,255,${0.08 * c})`],
          [1, 'rgba(255,255,255,0)'],
        ]);
        ctx.fill();
        // borda externa do verso levemente mais escura
        ctx.fillStyle = grad(0, depth, [[0, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${0.12 * c})`]]);
        ctx.fill();
      }
    }
  },
};
