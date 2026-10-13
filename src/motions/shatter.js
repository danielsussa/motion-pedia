import { TAU, seg, ease, rng, clamp } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { drawCover } from '../lib/image.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, isA, { w, h, p }) {
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

// Vidro estilhaçado: raios saindo do ponto de impacto + anéis concêntricos (vértices compartilhados, então os
// cacos ladrilham a tela sem fresta). Quando um par de raios se afasta demais, nasce um raio novo no meio da
// aresta do anel (vértice colinear, continua sem fresta). Alguns quadriláteros viram dois triângulos.
function buildShards({ w, h, m, ix, iy, R, pieces, r }) {
  const shards = [];
  const n0 = Math.round(9 + 5 * pieces);
  let spokes = [];
  for (let i = 0; i < n0; i++) spokes.push({ a: ((i + (r() - 0.5) * 0.6) / n0) * TAU, v: null });
  const r0 = m * (0.03 + 0.012 * r());
  const gap = (k) => {
    const n = spokes.length;
    const a = spokes[k].a;
    const prev = spokes[(k - 1 + n) % n].a;
    const next = spokes[(k + 1) % n].a;
    const d1 = (a - prev + TAU * 2) % TAU;
    const d2 = (next - a + TAU * 2) % TAU;
    return Math.min(d1, d2);
  };
  const vert = (k, rad) => {
    const s = spokes[k];
    const a = s.a + (r() - 0.5) * 0.45 * gap(k);
    const rr = rad * (1 + (r() - 0.5) * 0.16);
    return [ix + Math.cos(a) * rr, iy + Math.sin(a) * rr];
  };
  // anel 0 + leque central de triângulos pequenos (o vidro pulverizado no impacto)
  for (let k = 0; k < spokes.length; k++) spokes[k].v = vert(k, r0);
  for (let k = 0; k < spokes.length; k++) {
    const a = spokes[k].v;
    const b = spokes[(k + 1) % spokes.length].v;
    shards.push([[ix, iy], a, b]);
  }
  let rad = r0;
  const maxLen = (m * 0.22) / pieces;
  let ring = 0;
  while (rad < R) {
    // anéis apertados perto do impacto; para fora os cacos ficam compridos no sentido radial
    rad *= ring++ < 2 ? 1.5 + 0.2 * r() : 1.75 + 0.35 * r();
    const outer = spokes.map((_, k) => vert(k, rad));
    const next = [];
    const n = spokes.length;
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const A0 = spokes[k].v;
      const B0 = spokes[k2].v;
      const A1 = outer[k];
      const B1 = outer[k2];
      next.push({ a: spokes[k].a, v: A1 });
      const len = Math.hypot(B1[0] - A1[0], B1[1] - A1[1]);
      const mids = [];
      if (len > maxLen) {
        const cnt = len > maxLen * 2.2 ? 2 : 1;
        for (let c = 1; c <= cnt; c++) {
          const u = (c + (r() - 0.5) * 0.5) / (cnt + 1);
          const v = [A1[0] + (B1[0] - A1[0]) * u, A1[1] + (B1[1] - A1[1]) * u];
          mids.push(v);
          next.push({ a: Math.atan2(v[1] - iy, v[0] - ix), v });
        }
      }
      // caco da faixa: lado de dentro A0→B0, lado de fora B1→(meios ao contrário)→A1
      const poly = [A0, B0, B1, ...mids.slice().reverse(), A1];
      if (poly.length === 4 && r() < 0.4) {
        shards.push([A0, B0, B1], [A0, B1, A1]);
      } else shards.push(poly);
    }
    spokes = next;
  }
  // só o que aparece na tela
  return shards.filter((pts) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return x1 > -2 && y1 > -2 && x0 < w + 2 && y0 < h + 2;
  });
}

const tracePoly = (ctx, pts, dx = 0, dy = 0) => {
  ctx.moveTo(pts[0][0] - dx, pts[0][1] - dy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] - dx, pts[i][1] - dy);
  ctx.closePath();
};

export default {
  id: 'shatter',
  title: 'Shatter',
  description: 'Um impacto racha a cena como vidro, com rachaduras correndo do ponto de impacto, e no corte os cacos caem girando e revelam a próxima cena.',
  category: 'transicoes',
  tags: ['transição', 'forma', 'imagem', 'alpha'],
  duration: 1.6,
  poster: 0.62,

  params: {
    image: { type: 'image', label: 'Cena A (foto opcional, ex.: /samples/landscape.jpg)', default: '' },
    glass: { type: 'color', label: 'Cacos (sem foto, alpha)', default: '#1d2027' },
    crack: { type: 'color', label: 'Rachaduras', default: '#ffffff' },
    pieces: { type: 'range', label: 'Cacos', min: 0.5, max: 2, step: 0.01, default: 1 },
    force: { type: 'range', label: 'Força', min: 0, max: 1, step: 0.01, default: 0.5 },
    cx: { type: 'range', label: 'Impacto X', min: 0, max: 1, step: 0.01, default: 0.56 },
    cy: { type: 'range', label: 'Impacto Y', min: 0, max: 1, step: 0.01, default: 0.44 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  setup({ w, h, p, px, duration }) {
    const m = Math.min(w, h);
    const r = rng(p.seed * 89 + 13);
    const ix = w * p.cx;
    const iy = h * p.cy;
    const R = Math.max(Math.hypot(ix, iy), Math.hypot(w - ix, iy), Math.hypot(ix, h - iy), Math.hypot(w - ix, h - iy)) + m * 0.05;
    const polys = buildShards({ w, h, m, ix, iy, R, pieces: p.pieces, r });
    const mid = duration / 2;

    // Cena A (o que vai nos cacos): foto em cover, a prévia "A" ou, só formas, vidro liso.
    const img = asset(p.image);
    const solid = !img && p.transparent;
    const W = Math.max(1, Math.round(w * px));
    const H = Math.max(1, Math.round(h * px));
    const scene = document.createElement('canvas');
    scene.width = W;
    scene.height = H;
    const g = scene.getContext('2d');
    g.scale(px, px);
    if (img) drawCover(g, img, w, h, { fy: 0.4 });
    else if (!p.transparent) preview(g, true, { w, h, p });
    else {
      g.fillStyle = p.glass;
      g.fillRect(0, 0, w, h);
    }

    const T = duration * 0.985;
    const shards = polys.map((pts) => {
      let cx = 0, cy = 0;
      for (const [x, y] of pts) { cx += x; cy += y; }
      cx /= pts.length;
      cy /= pts.length;
      let ext = 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) {
        ext = Math.max(ext, Math.hypot(x - cx, y - cy));
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      const dist = Math.hypot(cx - ix, cy - iy);
      const dn = clamp(dist / R, 0, 1);
      // perto do impacto: sai antes, mais rápido, em direção à câmera
      const tr = mid + duration * (0.012 + 0.17 * dn ** 0.8 + 0.03 * r());
      const ang = Math.atan2(cy - iy, cx - ix);
      const push = m * (0.25 + 1.3 * p.force) * (0.25 + 1.1 * (1 - dn) ** 2) * (0.7 + 0.6 * r());
      const vx = Math.cos(ang) * push;
      const vy = Math.sin(ang) * push * 0.6 - m * (0.15 + 0.5 * r()) * p.force;
      const zv = (0.15 + 0.9 * (1 - dn) ** 2) * (0.5 + p.force) * (0.7 + 0.6 * r());
      // gravidade suficiente para o caco sair por baixo antes do fim
      const tau = T - tr;
      const sEnd = 1 + zv * tau;
      const need = (2 * (h + ext * sEnd + m * 0.04 - cy - vy * tau)) / (tau * tau);
      const grav = Math.max(m * (3.2 + 2 * r()), need);
      return {
        pts, cx, cy, ext, dist, dn, tr, vx, vy, zv, grav,
        bx: x0, by: y0, bw: x1 - x0, bh: y1 - y0,
        spin: (r() - 0.5) * (2 + 6 * p.force) * (0.4 + (1 - dn)),
        tilt: (2 + 6 * r()) * (r() < 0.5 ? -1 : 1),
        axis: r() * Math.PI,
        sheen: r(),
        pop: duration * (0.02 + 0.26 * dn ** 0.9 + 0.03 * r()),
      };
    });

    // Arestas únicas (para as rachaduras crescerem a partir do impacto).
    const seen = new Set();
    const edges = [];
    const key = (a) => `${Math.round(a[0] * 10)},${Math.round(a[1] * 10)}`;
    for (const s of shards) {
      const n = s.pts.length;
      for (let i = 0; i < n; i++) {
        let a = s.pts[i];
        let b = s.pts[(i + 1) % n];
        const ka = key(a), kb = key(b);
        const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if (seen.has(k)) continue;
        seen.add(k);
        let da = Math.hypot(a[0] - ix, a[1] - iy);
        let db = Math.hypot(b[0] - ix, b[1] - iy);
        if (db < da) { [a, b] = [b, a]; [da, db] = [db, da]; }
        // aresta "de anel" (os dois lados à mesma distância) racha depois das radiais
        const radial = (db - da) / (Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-6);
        edges.push({ a, b, da: da + (1 - radial) * m * 0.06, db: db + (1 - radial) * m * 0.06 });
      }
    }
    // ordem de desenho dos cacos soltos: os que chegam mais perto da câmera por último
    const order = shards.slice().sort((A, B) => A.zv - B.zv);
    return { shards, order, edges, scene, solid, ix, iy, R, r0: m * 0.03 };
  },

  render(ctx, t, env) {
    const { w, h, p, px, duration, state } = env;
    const { shards, order, edges, scene, solid, ix, iy, R } = state;
    const m = Math.min(w, h);
    const mid = duration / 2;
    const sx = scene.width / w;
    const glassA = !solid; // cacos com textura (prévia ou foto)

    // Tempo das rachaduras: impacto em t0, frente corre rápido e desacelera.
    const t0 = solid ? duration * 0.3 : duration * 0.2;
    const crackU = seg(t, t0, solid ? mid * 0.96 : mid * 0.85);
    const front = R * 1.15 * ease.outExpo(crackU) * (crackU > 0 ? 1 : 0);

    if (!p.transparent && t >= mid) preview(ctx, false, env);

    const live = [];
    const still = [];
    for (const s of shards) (t >= s.tr ? live : still).push(s);
    const popping = solid && t < mid * 0.9;

    // 1) Cacos parados: uma área só (sem fresta de anti-alias entre eles).
    if (still.length && !popping) {
      if (still.length === shards.length) {
        ctx.drawImage(scene, 0, 0, w, h);
      } else {
        ctx.save();
        ctx.beginPath();
        for (const s of still) tracePoly(ctx, s.pts);
        ctx.clip();
        ctx.drawImage(scene, 0, 0, w, h);
        ctx.restore();
      }
    } else if (popping) {
      // Sem foto e só formas: os cacos surgem do impacto para fora e se encaixam (o vidro "se forma").
      ctx.fillStyle = p.glass;
      const full = [];
      ctx.beginPath();
      for (const s of shards) {
        const u = seg(t, s.pop, s.pop + duration * 0.1);
        if (u <= 0) continue;
        if (u >= 1) {
          full.push(s);
          continue;
        }
        const k = 0.9 + 0.1 * ease.outCubic(u);
        ctx.save();
        ctx.translate(s.cx, s.cy);
        ctx.scale(k, k);
        ctx.beginPath();
        tracePoly(ctx, s.pts, s.cx, s.cy);
        ctx.globalAlpha = ease.outCubic(u);
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      for (const s of full) tracePoly(ctx, s.pts);
      ctx.fill();
    }

    // Reflexos por caco (vidro rachado reflete em ângulos diferentes) + rachaduras.
    const crackOn = front > 0;
    if (crackOn && still.length) {
      const levels = [[], [], [], []];
      for (const s of still) {
        if (s.dist > front * 0.95) continue;
        const k = s.sheen < 0.55 ? -1 : Math.min(3, Math.floor((s.sheen - 0.55) / 0.12));
        if (k >= 0) levels[k].push(s);
      }
      for (let k = 0; k < 4; k++) {
        if (!levels[k].length) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.018 + 0.016 * k})`;
        ctx.beginPath();
        for (const s of levels[k]) tracePoly(ctx, s.pts);
        ctx.fill();
      }
      // rachaduras: sombra fina + linha clara, crescendo do lado mais perto do impacto
      const lit = [];
      for (const e of edges) {
        if (front <= e.da) continue;
        const u = Math.min(1, (front - e.da) / Math.max(1e-3, e.db - e.da));
        lit.push([e.a, e.b, u]);
      }
      const path = (dx, dy) => {
        ctx.beginPath();
        for (const [a, b, u] of lit) {
          ctx.moveTo(a[0] + dx, a[1] + dy);
          ctx.lineTo(a[0] + (b[0] - a[0]) * u + dx, a[1] + (b[1] - a[1]) * u + dy);
        }
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (t < mid || live.length) {
        ctx.save();
        if (live.length) {
          // depois do corte, só as rachaduras ainda presas no vidro parado
          ctx.beginPath();
          for (const s of still) tracePoly(ctx, s.pts);
          ctx.clip();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = m * 0.0035;
        path(m * 0.0012, m * 0.0016);
        ctx.stroke();
        ctx.strokeStyle = p.crack;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = m * 0.0016;
        path(0, 0);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = m * 0.0035;
        path(m * 0.0012, m * 0.0016);
        ctx.stroke();
        ctx.strokeStyle = p.crack;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = m * 0.0016;
        path(0, 0);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // ponto de impacto: vidro moído e um clarão curto
      if (still.length === shards.length) {
        const flash = 1 - seg(t, t0, t0 + duration * 0.12);
        ctx.fillStyle = p.crack;
        ctx.globalAlpha = 0.35 + 0.5 * flash;
        ctx.beginPath();
        ctx.arc(ix, iy, state.r0 * (0.6 + 0.6 * ease.outCubic(seg(t, t0, t0 + duration * 0.08))), 0, TAU);
        ctx.fill();
        if (flash > 0) {
          ctx.globalAlpha = 0.25 * flash;
          ctx.beginPath();
          ctx.arc(ix, iy, m * 0.12 * ease.outCubic(seg(t, t0, t0 + duration * 0.12)), 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // 2) Cacos soltos: empurrão a partir do impacto, gravidade, giro no plano e em 3D (escala num eixo).
    if (!live.length) return;
    for (const s of order) {
      if (t < s.tr) continue;
      const tau = t - s.tr;
      const x = s.cx + s.vx * tau;
      const y = s.cy + s.vy * tau + 0.5 * s.grav * tau * tau;
      const k = 1 + s.zv * tau;
      if (y - s.ext * k > h + 2) continue;
      const th = s.tilt * tau;
      const c = Math.cos(th);
      // sombra projetada na cena de trás
      const sh = m * 0.02 * (k - 0.7);
      ctx.save();
      ctx.translate(x + sh * 0.5, y + sh);
      ctx.rotate(s.spin * tau + s.axis);
      ctx.scale(k * Math.max(0.04, Math.abs(c)), k);
      ctx.rotate(-s.axis);
      if (!p.transparent) {
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath();
        tracePoly(ctx, s.pts, s.cx, s.cy);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.spin * tau + s.axis);
      ctx.scale(k * Math.max(0.04, Math.abs(c)), k);
      ctx.rotate(-s.axis);
      ctx.beginPath();
      tracePoly(ctx, s.pts, s.cx, s.cy);
      if (glassA) {
        ctx.save();
        ctx.clip();
        const bx = Math.max(0, s.bx - 2);
        const by = Math.max(0, s.by - 2);
        const bw = Math.min(w, s.bx + s.bw + 2) - bx;
        const bh = Math.min(h, s.by + s.bh + 2) - by;
        if (bw > 0 && bh > 0) ctx.drawImage(scene, bx * sx, by * sx, bw * sx, bh * sx, bx - s.cx, by - s.cy, bw, bh);
        ctx.restore();
      } else {
        ctx.fillStyle = p.glass;
        ctx.fill();
      }
      // luz conforme o caco vira: claro de um lado, escuro do outro
      const lum = Math.sin(th) * 0.5 + (s.sheen - 0.5) * 0.15;
      ctx.fillStyle = lum > 0 ? `rgba(255,255,255,${Math.min(0.28, lum * 0.4)})` : `rgba(0,0,0,${Math.min(0.45, -lum * 0.55)})`;
      ctx.fill();
      // aresta lapidada
      ctx.strokeStyle = p.crack;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = (m * 0.0018) / k;
      ctx.stroke();
      ctx.restore();
    }
  },
};
