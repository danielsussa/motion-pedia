// Esqueleto de texto (linha central dos glifos), para escrever à mão ou desenhar tubos de neon. Use no setup().
// skeleton(texto, fontFn) → { strokes: [[{x,y}...]...], pad, base, tw, thick, raster }; fontFn(px) devolve a string de fonte.
// ---------------------------------------------------------------------------------------------
// Esqueleto do texto: rasteriza a linha, afina (Zhang-Suen) e percorre o esqueleto em traços,
// na ordem em que alguém escreveria (da esquerda para a direita, começando pelas pontas soltas).
// ---------------------------------------------------------------------------------------------

function thin(B, W, H) {
  // Zhang-Suen. B: Uint8Array 0/1 (com borda de 1 px vazia).
  const del = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!B[i]) continue;
          const p2 = B[i - W], p3 = B[i - W + 1], p4 = B[i + 1], p5 = B[i + W + 1];
          const p6 = B[i + W], p7 = B[i + W - 1], p8 = B[i - 1], p9 = B[i - W - 1];
          const n = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (n < 2 || n > 6) continue;
          const a = (!p2 & p3) + (!p3 & p4) + (!p4 & p5) + (!p5 & p6) + (!p6 & p7) + (!p7 & p8) + (!p8 & p9) + (!p9 & p2);
          if (a !== 1) continue;
          if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
          del.push(i);
        }
      }
      if (del.length) changed = true;
      for (const i of del) B[i] = 0;
    }
  }
  return B;
}

const NB = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function trace(S, W, H, win) {
  const pix = [];
  for (let i = 0; i < S.length; i++) if (S[i]) pix.push(i);
  pix.sort((a, b) => (a % W) - (b % W));
  const V = new Uint8Array(S.length);
  const free = (i) => S[i] && !V[i];
  const freeDeg = (i) => {
    let n = 0;
    for (const [dx, dy] of NB) if (free(i + dx + dy * W)) n++;
    return n;
  };
  const strokes = [];
  let pen = [0, H / 2];
  let lo = 0;
  for (;;) {
    while (lo < pix.length && V[pix[lo]]) lo++;
    if (lo >= pix.length) break;
    const xMin = pix[lo] % W;
    // Candidatos: pixels livres numa janela à esquerda; pontas soltas valem mais que o meio de um traço.
    let best = -1;
    let bestScore = Infinity;
    for (let k = lo; k < pix.length; k++) {
      const i = pix[k];
      const x = i % W;
      if (x > xMin + win) break;
      if (V[i]) continue;
      const y = (i / W) | 0;
      const d = freeDeg(i);
      const score = Math.hypot(x - pen[0], y - pen[1]) * 0.15 + (x - xMin) + (d <= 1 ? 0 : win * 0.6) + y * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    let cur = best;
    const path = [];
    // Se o traço sai de uma tinta já desenhada (galho), começa colado nela.
    for (const [dx, dy] of NB) {
      const j = cur + dx + dy * W;
      if (S[j] && V[j]) {
        path.push(j);
        break;
      }
    }
    V[cur] = 1;
    path.push(cur);
    let dir = null;
    for (;;) {
      let nx = -1;
      let bd = -Infinity;
      const cx = cur % W;
      const cy = (cur / W) | 0;
      for (const [dx, dy] of NB) {
        const j = cur + dx + dy * W;
        if (!free(j)) continue;
        const l = Math.hypot(dx, dy);
        // Prefere continuar na mesma direção; sem direção ainda, desce/avança como a mão.
        const s = dir ? (dx * dir[0] + dy * dir[1]) / l : (dx * 0.4 + dy * 0.6) / l - freeDeg(j) * 0.2;
        if (s > bd) {
          bd = s;
          nx = j;
        }
      }
      if (nx < 0) break;
      // Cantos redundantes da escada do esqueleto: marca como visitados.
      for (const [dx, dy] of NB) {
        const j = cur + dx + dy * W;
        if (j === nx || !free(j)) continue;
        const ex = Math.abs((j % W) - (nx % W));
        const ey = Math.abs(((j / W) | 0) - ((nx / W) | 0));
        if (ex <= 1 && ey <= 1 && freeDeg(j) <= 2) V[j] = 1;
      }
      const ndx = (nx % W) - cx;
      const ndy = ((nx / W) | 0) - cy;
      const nl = Math.hypot(ndx, ndy);
      dir = dir ? [dir[0] * 0.6 + (ndx / nl) * 0.4, dir[1] * 0.6 + (ndy / nl) * 0.4] : [ndx / nl, ndy / nl];
      const dl = Math.hypot(dir[0], dir[1]) || 1;
      dir = [dir[0] / dl, dir[1] / dl];
      V[nx] = 1;
      path.push(nx);
      cur = nx;
    }
    pen = [cur % W, (cur / W) | 0];
    if (path.length >= 3) strokes.push(path.map((i) => [i % W, (i / W) | 0]));
    else if (path.length) {
      // Pingo (do i, do j, ponto final): o esqueleto vira 1–2 pixels soltos — vira um traço curtinho.
      const [a] = path.slice(-1);
      const x = a % W;
      const y = (a / W) | 0;
      let touches = false;
      for (const q of path) {
        for (const [dx, dy] of NB) {
          const j = q + dx + dy * W;
          if (S[j] && V[j] && !path.includes(j)) touches = true;
        }
      }
      if (!touches) strokes.push([[x - 0.8, y + 0.8], [x, y], [x + 0.8, y - 0.8]]);
    }
  }
  return strokes;
}

function smooth(pts, passes = 6) {
  let a = pts;
  for (let k = 0; k < passes; k++) {
    const b = a.map((p) => p.slice());
    for (let i = 1; i < a.length - 1; i++) {
      b[i][0] = (a[i - 1][0] + a[i][0] * 2 + a[i + 1][0]) / 4;
      b[i][1] = (a[i - 1][1] + a[i][1] * 2 + a[i + 1][1]) / 4;
    }
    a = b;
  }
  // Reamostra a cada ~3 px do raster.
  const out = [a[0]];
  let acc = 0;
  for (let i = 1; i < a.length; i++) {
    acc += Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]);
    if (acc >= 3 || i === a.length - 1) {
      out.push(a[i]);
      acc = 0;
    }
  }
  return out;
}

export const FONT = (s) => `italic 400 ${s}px 'Instrument Serif', serif`;
export const RASTER = 150; // tamanho da fonte no raster do esqueleto

// Cache de módulo: o esqueleto só depende do texto e das linhas.
// Exportado: o neon-sign usa o mesmo esqueleto para desenhar os tubos.
const cache = new Map();
export function skeleton(line, font = FONT) {
  const key = `${font(RASTER)}|${line}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font(RASTER);
  const tw = Math.ceil(g.measureText(line).width);
  const pad = Math.round(RASTER * 0.35);
  const W = tw + pad * 2;
  const H = Math.round(RASTER * 1.5);
  c.width = W;
  c.height = H;
  g.font = font(RASTER);
  g.fillStyle = '#000';
  const base = Math.round(RASTER * 1.05);
  g.fillText(line, pad, base);
  const d = g.getImageData(0, 0, W, H).data;
  const B = new Uint8Array(W * H);
  let ink = 0;
  for (let i = 0; i < W * H; i++) {
    if (d[i * 4 + 3] > 110) {
      B[i] = 1;
      ink++;
    }
  }
  for (let x = 0; x < W; x++) B[x] = B[(H - 1) * W + x] = 0;
  for (let y = 0; y < H; y++) B[y * W] = B[y * W + W - 1] = 0;
  // Componentes do desenho (para recuperar pingos que o afinamento apaga: Zhang-Suen some com blocos 2×2).
  const lab = new Int32Array(W * H);
  const comps = [];
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!B[i] || lab[i]) continue;
    const id = comps.length + 1;
    let sx = 0, sy = 0, n = 0;
    lab[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      sx += j % W;
      sy += (j / W) | 0;
      n++;
      for (const [dx, dy] of NB) {
        const k = j + dx + dy * W;
        if (B[k] && !lab[k]) {
          lab[k] = id;
          stack.push(k);
        }
      }
    }
    comps.push({ x: Math.round(sx / n), y: Math.round(sy / n), n });
  }
  thin(B, W, H);
  const alive = new Uint8Array(comps.length + 1);
  for (let i = 0; i < W * H; i++) if (B[i]) alive[lab[i]] = 1;
  comps.forEach((c, k) => {
    if (!alive[k + 1] && c.n > 12) B[c.y * W + c.x] = 1;
  });
  let sk = 0;
  for (let i = 0; i < W * H; i++) sk += B[i];
  const strokes = trace(B, W, H, RASTER * 0.32).map((s) => smooth(s));
  const res = { strokes, pad, base, tw, thick: ink / Math.max(1, sk), raster: RASTER };
  cache.set(key, res);
  return res;
}
