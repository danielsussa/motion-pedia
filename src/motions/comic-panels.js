import { TAU, seg, ease, rng, springWin, stagger, rgba } from '../lib/anim.js';

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

// --- Geometria: célula = interseção de 4 semiplanos n·x >= c (n unitário apontando para dentro).
const line = (nx, ny, px, py) => {
  const l = Math.hypot(nx, ny);
  return { nx: nx / l, ny: ny / l, c: (nx * px + ny * py) / l };
};
function meet(a, b) {
  const det = a.nx * b.ny - a.ny * b.nx;
  return [(a.c * b.ny - a.ny * b.c) / det, (a.nx * b.c - a.c * b.nx) / det];
}
// lados na ordem topo, direita, baixo, esquerda; ins = recuo de cada lado
function poly(L, ins) {
  const s = L.map((l, i) => ({ nx: l.nx, ny: l.ny, c: l.c + ins[i] }));
  return [meet(s[3], s[0]), meet(s[0], s[1]), meet(s[1], s[2]), meet(s[2], s[3])];
}
function pathPoly(g, P) {
  g.beginPath();
  g.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]);
  g.closePath();
}

// Layout de página: linhas de quadros com divisórias inclinadas (depende do formato e da seed).
function layout(w, h, r) {
  const ar = w / h;
  const rows = ar > 1.2 ? 2 : ar > 0.7 ? 3 : 4;
  const pad = Math.max(w, h) * 0.05;
  const hs = [line(0, 1, 0, -pad)]; // divisórias horizontais (semiplano "abaixo" da linha)
  for (let k = 1; k < rows; k++) {
    const y = h * (k / rows + (r() - 0.5) * 0.18 / rows);
    const tilt = (r() - 0.5) * 0.16 * Math.min(1, ar);
    hs.push(line(-tilt, 1, w / 2, y)); // y = yk + tilt (x - w/2)
  }
  hs.push(line(0, 1, 0, h + pad));
  const cells = [];
  for (let j = 0; j < rows; j++) {
    const top = hs[j];
    const bot = { nx: -hs[j + 1].nx, ny: -hs[j + 1].ny, c: -hs[j + 1].c };
    const yc = ((j + 0.5) / rows) * h;
    let cols = ar > 1.2 ? 2 + (r() < 0.55 ? 1 : 0) : ar > 0.7 ? 1 + (r() < 0.75 ? 1 : 0) : 1 + (r() < 0.6 ? 1 : 0);
    if (j === 0 && rows > 2 && cols === 1) cols = 2;
    const vs = [line(1, 0, -pad, 0)];
    for (let k = 1; k < cols; k++) {
      const x = w * (k / cols + (r() - 0.5) * 0.22 / cols);
      const slant = (r() - 0.5) * 0.34;
      vs.push(line(1, -slant, x, yc)); // x = xk + slant (y - yc)
    }
    vs.push(line(1, 0, w + pad, 0));
    for (let k = 0; k < cols; k++) {
      const left = vs[k];
      const right = { nx: -vs[k + 1].nx, ny: -vs[k + 1].ny, c: -vs[k + 1].c };
      cells.push({ L: [top, right, bot, left], outer: [j === 0, k === cols - 1, j === rows - 1, k === 0] });
    }
  }
  return { cells, pad };
}

const KINDS = ['tom', 'pow', 'retícula', 'velocidade', 'balão'];
const BALLOONS = ['!?', '!!', '...', '?!'];

// Conteúdo de cada quadro (desenhado uma vez no setup).
function drawContent(g, kind, inner, box, p, m, r) {
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const halftone = (color, base, grow, ang, ox, oy) => {
    // retícula a 45°: raio cresce na direção `ang`
    const step = m * 0.022;
    const ca = Math.cos(Math.PI / 4);
    const span = Math.hypot(bw, bh);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    g.fillStyle = color;
    g.beginPath();
    for (let a = -span / 2; a <= span / 2; a += step) {
      for (let b = -span / 2; b <= span / 2; b += step) {
        const x = cx + (a - b) * ca;
        const y = cy + (a + b) * ca;
        if (x < x0 - step || x > x1 + step || y < y0 - step || y > y1 + step) continue;
        const k = ((x - ox) * dx + (y - oy) * dy) / span + 0.5;
        const rr = step * 0.5 * Math.max(0, Math.min(1, base + grow * k));
        if (rr < 0.4) continue;
        g.moveTo(x + rr, y);
        g.arc(x, y, rr, 0, TAU);
      }
    }
    g.fill();
  };
  if (kind === 'tom') {
    g.fillStyle = p.accent;
    g.fillRect(x0, y0, bw, bh);
    halftone(rgba(p.ink, 0.22), -0.1, 1.2, r() * TAU, cx, cy);
  } else if (kind === 'retícula') {
    g.fillStyle = p.paper;
    g.fillRect(x0, y0, bw, bh);
    halftone(p.accent, -0.2, 1.3, r() * TAU, cx, cy);
  } else if (kind === 'velocidade') {
    g.fillStyle = p.ink;
    g.fillRect(x0, y0, bw, bh);
    // linhas de velocidade convergindo para um foco fora do centro
    const fx = cx + (r() - 0.5) * bw * 0.4;
    const fy = cy + (r() - 0.5) * bh * 0.4;
    const R = Math.hypot(bw, bh);
    g.fillStyle = rgba(p.paper, 0.9);
    g.beginPath();
    for (let i = 0; i < 90; i++) {
      const a = r() * TAU;
      const wd = (0.004 + 0.02 * r() ** 2) * 1.2;
      const r0 = R * (0.12 + 0.25 * r());
      g.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
      g.lineTo(fx + Math.cos(a - wd) * R, fy + Math.sin(a - wd) * R);
      g.lineTo(fx + Math.cos(a + wd) * R, fy + Math.sin(a + wd) * R);
      g.closePath();
    }
    g.fill();
    g.fillStyle = p.accent;
    g.beginPath();
    g.arc(fx, fy, m * 0.012, 0, TAU);
    g.fill();
  } else if (kind === 'pow') {
    g.fillStyle = p.paper;
    g.fillRect(x0, y0, bw, bh);
    halftone(rgba(p.accent, 0.35), 0.15, 0.6, r() * TAU, cx, cy);
    // estouro: estrela irregular com contorno de tinta, palavra por cima
    const size = Math.min(bw, bh) * 0.5;
    const n = 14;
    const star = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU + (r() - 0.5) * 0.15;
      const rr = i % 2 ? size * (0.55 + 0.1 * r()) : size * (0.85 + 0.3 * r());
      star.push([cx + Math.cos(a) * rr * Math.max(1, bw / bh) ** 0.35, cy + Math.sin(a) * rr]);
    }
    g.lineJoin = 'miter';
    pathPoly(g, star);
    g.fillStyle = p.accent;
    g.fill();
    g.lineWidth = m * 0.008;
    g.strokeStyle = p.ink;
    g.stroke();
    const word = (p.word || '').trim();
    if (word) {
      g.save();
      g.translate(cx, cy);
      g.rotate(-0.12);
      g.transform(1, 0, -0.18, 1, 0, 0);
      let fs = size * 0.62;
      g.font = `900 ${fs}px Inter, system-ui, sans-serif`;
      const mw = g.measureText(word).width;
      if (mw > size * 1.5) fs *= (size * 1.5) / mw;
      g.font = `900 ${fs}px Inter, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = fs * 0.2;
      g.strokeStyle = p.ink;
      g.strokeText(word, 0, fs * 0.04);
      g.fillStyle = p.paper;
      g.fillText(word, 0, fs * 0.04);
      g.restore();
    }
  } else {
    // balão: fundo claro com retícula leve e um balão de fala com "!?"
    g.fillStyle = p.paper;
    g.fillRect(x0, y0, bw, bh);
    halftone(rgba(p.ink, 0.12), 0.05, 0.5, r() * TAU, cx, cy);
    const rx = Math.min(bw * 0.32, bh * 0.45);
    const ry = rx * 0.62;
    const bx = cx + (r() - 0.5) * bw * 0.15;
    const by = cy - bh * 0.05;
    g.beginPath();
    g.ellipse(bx, by, rx, ry, 0, 0, TAU);
    g.moveTo(bx - rx * 0.2, by + ry * 0.8);
    g.lineTo(bx - rx * 0.55, by + ry * 1.75);
    g.lineTo(bx + rx * 0.15, by + ry * 0.85);
    g.fillStyle = p.paper;
    g.lineWidth = m * 0.007;
    g.strokeStyle = p.ink;
    g.lineJoin = 'round';
    g.stroke();
    g.fill();
    g.fillStyle = p.ink;
    g.font = `900 ${ry * 0.9}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(BALLOONS[(r() * BALLOONS.length) | 0], bx, by + ry * 0.04);
  }
}

export default {
  id: 'comic-panels',
  title: 'Comic Panels',
  description: 'Comic book panels (halftone, speed lines, sound-effect bursts) pop in one by one to fill the page, then leave in the same order to reveal the next scene.',
  category: 'transicoes',
  tags: ['transition', 'shape', 'alpha'],
  duration: 1.8,
  poster: 0.5,

  params: {
    word: { type: 'text', label: 'Sound effect', default: 'POW!' },
    paper: { type: 'color', label: 'Paper', default: '#f4efe6' },
    ink: { type: 'color', label: 'Ink', default: '#141418' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    bounce: { type: 'range', label: 'Spring', min: 0, max: 0.6, step: 0.01, default: 0.28 },
    gutter: { type: 'range', label: 'Gutter', min: 0.005, max: 0.04, step: 0.001, default: 0.016 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  setup({ w, h, p, px }) {
    const r = rng(p.seed * 41 + 7);
    const m = Math.min(w, h);
    const { cells, pad } = layout(w, h, r);
    const gut = m * p.gutter;
    const border = m * 0.006;
    // Quadro maior ganha o estouro; os outros alternam os tipos restantes.
    const area = (P) => Math.abs(P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
    const out = [];
    let biggest = 0;
    const visArea = cells.map((c) => {
      const P = poly(c.L, c.outer.map((o) => (o ? pad : 0)));
      return area(P);
    });
    visArea.forEach((a, i) => { if (a > visArea[biggest]) biggest = i; });
    const others = KINDS.filter((k) => k !== 'pow');
    const shift = Math.floor(r() * others.length);
    let oi = 0;
    cells.forEach((c, i) => {
      const kind = i === biggest ? 'pow' : others[(shift + oi++) % others.length];
      const outerP = poly(c.L, [0, 0, 0, 0]);
      // recuo: metade da calha nas divisórias, calha inteira (mais a sobra fora da tela) nas bordas da página
      const inner = poly(c.L, c.outer.map((o) => (o ? pad + gut : gut / 2)));
      const xs = outerP.map((q) => q[0]);
      const ys = outerP.map((q) => q[1]);
      const bx0 = Math.floor(Math.max(-pad, Math.min(...xs)) * px - 3) / px;
      const by0 = Math.floor(Math.max(-pad, Math.min(...ys)) * px - 3) / px;
      const bx1 = Math.ceil(Math.min(w + pad, Math.max(...xs)) * px + 3) / px;
      const by1 = Math.ceil(Math.min(h + pad, Math.max(...ys)) * px + 3) / px;
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round((bx1 - bx0) * px));
      cv.height = Math.max(1, Math.round((by1 - by0) * px));
      const g = cv.getContext('2d');
      g.scale(px, px);
      g.translate(-bx0, -by0);
      // papel da calha (com 1,5 px de sobra para não deixar fresta entre vizinhos)
      pathPoly(g, outerP);
      g.fillStyle = p.paper;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = p.paper;
      g.lineJoin = 'miter';
      g.stroke();
      // conteúdo recortado no quadro
      const ix = inner.map((q) => q[0]);
      const iy = inner.map((q) => q[1]);
      g.save();
      pathPoly(g, inner);
      g.clip();
      drawContent(g, kind, inner, [Math.min(...ix), Math.min(...iy), Math.max(...ix), Math.max(...iy)], p, m, r);
      g.restore();
      pathPoly(g, inner);
      g.lineWidth = border;
      g.strokeStyle = p.ink;
      g.lineJoin = 'miter';
      g.stroke();
      // centro (pivô da animação) = centro do quadro visível
      const vis = inner.map(([x, y]) => [Math.min(w, Math.max(0, x)), Math.min(h, Math.max(0, y))]);
      const pcx = vis.reduce((s, q) => s + q[0], 0) / 4;
      const pcy = vis.reduce((s, q) => s + q[1], 0) / 4;
      // recorte do quadro "solto": só o quadro com uma borda fina de papel
      const loose = c.outer.map((o) => (o ? pad + gut * 0.35 : gut * 0.15));
      out.push({ cv, bx0, by0, bw: bx1 - bx0, bh: by1 - by0, L: c.L, loose, cx: pcx, cy: pcy, rot: (r() - 0.5) * 0.5, kind });
    });
    // Ordem de leitura (de cima para baixo, esquerda para direita) já é a ordem de criação.
    return { cells: out, border };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    preview(ctx, t, env);
    const mid = duration / 2;
    const m = Math.min(w, h);
    const { cells } = state;
    const n = cells.length;
    const closing = t < mid;
    const shadowOff = m * 0.014;
    for (let i = 0; i < n; i++) {
      const C = cells[i];
      let s;
      let rot;
      let q; // 0 = quadro solto, 1 = encaixado na página (calhas preenchidas)
      if (closing) {
        // entrada: pulo com mola, em sequência; todos assentados antes do corte
        const life = mid * 0.42;
        const a = mid * 0.03 + stagger(i, n, mid * 0.92 - life - mid * 0.03);
        s = springWin(t, a, a + life, p.bounce);
        rot = C.rot * (1 - ease.outCubic(seg(t, a, a + life * 0.7)));
        q = ease.inOutCubic(seg(t, a + life * 0.55, a + life));
      } else {
        // saída: na mesma ordem, encolhe com antecipação e gira
        const life = mid * 0.4;
        const a = mid + duration * 0.03 + stagger(i, n, duration * 0.97 - life - mid - duration * 0.03);
        const k = seg(t, a, a + life);
        s = 1 - ease.inBack(k);
        rot = -C.rot * ease.inCubic(k);
        q = 1 - ease.outCubic(seg(k, 0, 0.3));
        if (k >= 1) s = 0;
      }
      if (s <= 0.002) continue;
      const settled = q >= 1 && s === 1 && rot === 0;
      ctx.save();
      ctx.translate(C.cx, C.cy);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.translate(-C.cx, -C.cy);
      if (settled) {
        ctx.drawImage(C.cv, C.bx0, C.by0, C.bw, C.bh);
      } else {
        const P = poly(C.L, C.loose.map((v) => v * (1 - q)));
        // sombra dura de quadrinho enquanto o quadro está solto
        ctx.fillStyle = rgba(p.ink, 0.85 * (1 - q));
        ctx.save();
        ctx.translate(shadowOff, shadowOff);
        pathPoly(ctx, P);
        ctx.fill();
        ctx.restore();
        pathPoly(ctx, P);
        ctx.clip();
        ctx.drawImage(C.cv, C.bx0, C.by0, C.bw, C.bh);
      }
      ctx.restore();
    }
  },
};
