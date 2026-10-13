// Ruído simplex 2D/3D com seed (Stefan Gustavson), sem dependências. Saída em ~[-1, 1].
import { rng } from './anim.js';

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

export function createNoise(seed = 1) {
  const rand = rng(seed);
  const p = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  const pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    pm12[i] = perm[i] % 12;
  }

  function noise2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const c = (x, y, gi) => {
      let tt = 0.5 - x * x - y * y;
      if (tt < 0) return 0;
      tt *= tt;
      const g = GRAD3[gi];
      return tt * tt * (g[0] * x + g[1] * y);
    };
    return 70 * (c(x0, y0, pm12[ii + perm[jj]]) + c(x1, y1, pm12[ii + i1 + perm[jj + j1]]) + c(x2, y2, pm12[ii + 1 + perm[jj + 1]]));
  }

  function noise3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const c = (x, y, z, gi) => {
      let tt = 0.6 - x * x - y * y - z * z;
      if (tt < 0) return 0;
      tt *= tt;
      const g = GRAD3[gi];
      return tt * tt * (g[0] * x + g[1] * y + g[2] * z);
    };
    return (
      32 *
      (c(x0, y0, z0, pm12[ii + perm[jj + perm[kk]]]) +
        c(x1, y1, z1, pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]) +
        c(x2, y2, z2, pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]) +
        c(x3, y3, z3, pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]))
    );
  }

  // Soma de oitavas (fractal). Use poucas oitavas em laços grandes.
  const fbm2 = (x, y, oct = 4) => {
    let v = 0, a = 0.5, f = 1;
    for (let o = 0; o < oct; o++, a *= 0.5, f *= 2) v += a * noise2(x * f, y * f);
    return v;
  };
  const fbm3 = (x, y, z, oct = 4) => {
    let v = 0, a = 0.5, f = 1;
    for (let o = 0; o < oct; o++, a *= 0.5, f *= 2) v += a * noise3(x * f, y * f, z * f);
    return v;
  };

  // Campo 2D animado que fecha o loop: u = progress (0..1), speed = quanto "anda" por loop.
  // Mistura o ruído em z = u·speed com o de z = (u−1)·speed — em u=0 e u=1 o valor é idêntico.
  const loop2 = (x, y, u, speed = 1) => {
    const a = noise3(x, y, u * speed);
    const b = noise3(x, y, (u - 1) * speed);
    const k = u * u * (3 - 2 * u);
    return (a * (1 - k) + b * k) / Math.sqrt(k * k + (1 - k) * (1 - k)); // compensa a perda de contraste no meio
  };

  return { noise2, noise3, fbm2, fbm3, loop2 };
}
