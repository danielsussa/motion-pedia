// 3D mínimo para Canvas 2D: rotação, projeção em perspectiva e isométrica. Pontos são [x, y, z].

export function rotate([x, y, z], { rx = 0, ry = 0, rz = 0 } = {}) {
  let c = Math.cos(rx), s = Math.sin(rx);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ry);
  s = Math.sin(ry);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rz);
  s = Math.sin(rz);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

// Perspectiva: câmera olhando para +z, a `dist` do ponto (0,0,0). `fov` = distância focal em px.
// Retorna posição na tela, escala (para tamanhos de linha/ponto) e profundidade (para ordenar/fog).
export function project([x, y, z], { cx = 960, cy = 540, fov = 1000, dist = 1000 } = {}) {
  const depth = z + dist;
  const s = depth > 1 ? fov / depth : 0;
  return { x: cx + x * s, y: cy + y * s, s, z: depth, visible: depth > 1 };
}

const C30 = Math.cos(Math.PI / 6);
// Isométrica: x para a direita-baixo, y para a esquerda-baixo, z para cima.
export const iso = (x, y, z, { cx = 960, cy = 540, scale = 1 } = {}) => ({
  x: cx + (x - y) * C30 * scale,
  y: cy + ((x + y) * 0.5 - z) * scale,
});

// Pinta de trás para frente (painter's algorithm).
export const byDepth = (items, key = (i) => i.z) => items.sort((a, b) => key(b) - key(a));

// Malhas prontas: { v: [[x,y,z]...], e: [[a,b]...] }
export function cube(r = 1) {
  const v = [];
  for (const x of [-r, r]) for (const y of [-r, r]) for (const z of [-r, r]) v.push([x, y, z]);
  const e = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
    const d = v[a].reduce((n, c, i) => n + (c !== v[b][i] ? 1 : 0), 0);
    if (d === 1) e.push([a, b]);
  }
  return { v, e };
}

export function sphereFib(n, r = 1) {
  // pontos espalhados uniformemente numa esfera (espiral de Fibonacci)
  const pts = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    pts.push([Math.cos(ga * i) * rad * r, y * r, Math.sin(ga * i) * rad * r]);
  }
  return pts;
}
