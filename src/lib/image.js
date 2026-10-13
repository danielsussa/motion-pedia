// Imagens como fonte (fotos): enquadramento "cover" e leitura de pixels numa grade. Leituras no setup().
// Fotos de exemplo: /samples/portrait.jpg (retrato vertical) e /samples/landscape.jpg (paisagem).

// Retângulo de destino para a imagem cobrir w×h (como object-fit: cover), com zoom e foco opcionais.
// fx/fy (0..1) = ponto da imagem que fica no centro quando sobra imagem (0.5 = centro).
export function coverRect(img, w, h, { zoom = 1, fx = 0.5, fy = 0.5 } = {}) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * s;
  const dh = ih * s;
  const x = Math.min(0, Math.max(w - dw, w / 2 - dw * fx));
  const y = Math.min(0, Math.max(h - dh, h / 2 - dh * fy));
  return { x, y, w: dw, h: dh, scale: s };
}

export function drawCover(ctx, img, w, h, opts) {
  const r = coverRect(img, w, h, opts);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  return r;
}

// Imagem enquadrada em cover numa grade cols×rows → cores e luminância por célula.
// Retorna { cols, rows, cell (lado em unidades lógicas), rgb: Uint8ClampedArray(cols*rows*3), lum: Float32Array (0..1) }.
// `cell` = tamanho da célula em unidades lógicas (ex.: Math.min(w, h) / 60).
export function imageGrid(img, { w, h, cell, zoom, fx, fy }) {
  const cols = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  // desenha a imagem em cover no espaço (cols*cell)×(rows*cell), reduzido para 1 px por célula
  g.scale(1 / cell, 1 / cell);
  drawCover(g, img, cols * cell, rows * cell, { zoom, fx, fy });
  const data = g.getImageData(0, 0, cols, rows).data;
  const n = cols * rows;
  const rgb = new Uint8ClampedArray(n * 3);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = gg;
    rgb[i * 3 + 2] = b;
    lum[i] = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
  }
  return { cols, rows, cell, rgb, lum };
}

// Pixels completos da imagem em cover numa resolução W×H (px reais) → ImageData. Para efeitos por pixel
// (pixel sort, duotone em CPU). Custo cresce com W×H: use a resolução de render (w*px, h*px), não mais.
export function imagePixels(img, W, H, opts) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W));
  c.height = Math.max(1, Math.round(H));
  const g = c.getContext('2d', { willReadFrequently: true });
  drawCover(g, img, c.width, c.height, opts);
  return g.getImageData(0, 0, c.width, c.height);
}
