// Amostra texto ou imagem em pontos (para partículas que formam palavras/logos). Rode no setup().

function scratch(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Pontos dentro dos glifos, numa grade de `step` px, centralizados em (x, y) no espaço lógico w×h.
// maxWidth reduz a fonte se o texto não couber.
export function sampleText(text, { font = '800 220px Inter', w = 1920, h = 1080, x = w / 2, y = h / 2, step = 8, maxWidth = w * 0.9 } = {}) {
  const c = scratch(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = font;
  const m = g.measureText(text).width;
  if (m > maxWidth) {
    const size = parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]);
    g.font = font.replace(/\d+(\.\d+)?px/, `${(size * maxWidth) / m}px`);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  for (let py = 0; py < c.height; py += step)
    for (let px = 0; px < c.width; px += step) if (data[(py * c.width + px) * 4 + 3] > 128) pts.push({ x: px, y: py });
  return pts;
}

// Pontos de uma imagem (com cor), encaixada em `box` {x,y,w,h} mantendo proporção.
export function sampleImage(img, { box, step = 8, alphaMin = 128 } = {}) {
  const k = Math.min(box.w / img.width, box.h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  const ox = box.x + (box.w - dw) / 2;
  const oy = box.y + (box.h - dh) / 2;
  const c = scratch(dw, dh);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  for (let py = 0; py < c.height; py += step)
    for (let px = 0; px < c.width; px += step) {
      const i = (py * c.width + px) * 4;
      if (data[i + 3] >= alphaMin) pts.push({ x: ox + px, y: oy + py, r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  return pts;
}
