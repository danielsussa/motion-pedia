import { mixHex, clamp, smoothstep } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';
import { bake } from '../lib/bake.js';
import { verlet } from '../lib/physics.js';
import { asset } from '../lib/assets.js';

// Bandeira ao vento: malha NX×NY de pontos verlet em 3D (physics.js com z), presa no mastro pela coluna 0.
// Vento "aerodinâmico" por triângulo: força = C·(n̂·(vento − v))·n̂ — só a componente normal empurra, o que
// cria a instabilidade que faz a bandeira tremular. Vento base com rajadas (ruído no tempo) + turbulência em z.
// Tudo assado no setup (bake). Loop: a simulação é gravada de −FADE até a duração e, nos últimos FADE s,
// as POSIÇÕES fazem crossfade com o trecho [−FADE, 0] (as duas bandeiras estão presas no mesmo mastro,
// então a mistura continua sendo uma bandeira plausível). Desenho: textura (cor + logo + texto) mapeada
// por triângulos afins (clip + drawImage) e sombreamento por vértice, ampliado bilinear numa textura
// pequena NX×NY e composto sobre a textura a cada frame (dobras suaves, sem facetas).

const NX = 25;
const NY = 16;
const FPS = 30;
const SUB = 2;
const FADE = 1.6;
const WARM = 1.8;
const TW = 1024; // largura da textura

// O setup roda de novo quando o logo termina de carregar ou um parâmetro só de visual muda (cor, texto):
// a simulação só depende de tamanho/vento/seed, então guarda as últimas (determinística, sem efeito no resultado).
const simCache = new Map();

function simulate({ w, h, S, FW, FH, x0, y0, windK, seed, duration }) {
  const noise = createNoise(seed);
  const dx = FW / (NX - 1), dy = FH / (NY - 1);
  const world = verlet({ gravity: [0, S * 1.6, 0], damping: 0.992, iterations: 6 });
  const P = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      // começa um pouco caída, para o aquecimento já ter movimento
      P.push(world.point(x0 + i * dx * 0.9, y0 + j * dy + i * dx * 0.15, { pinned: i === 0, z: 0 }));
    }
  }
  const id = (i, j) => j * NX + i;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = P[id(i, j)];
      if (i + 1 < NX) world.link(a, P[id(i + 1, j)], { length: dx });
      if (j + 1 < NY) world.link(a, P[id(i, j + 1)], { length: dy });
      if (i + 1 < NX && j + 1 < NY) {
        const dd = Math.hypot(dx, dy);
        world.link(a, P[id(i + 1, j + 1)], { length: dd, stiffness: 0.6 });
        world.link(P[id(i + 1, j)], P[id(i, j + 1)], { length: dd, stiffness: 0.6 });
      }
      // dobra: resistência leve a vincos de um ponto só
      if (i + 2 < NX) world.link(a, P[id(i + 2, j)], { length: dx * 2, stiffness: 0.15 });
      if (j + 2 < NY) world.link(a, P[id(i, j + 2)], { length: dy * 2, stiffness: 0.15 });
    }
  }

  const N = P.length;
  const fx = new Float32Array(N), fy = new Float32Array(N), fz = new Float32Array(N);
  const out = [0, 0, 0];
  const turbZ = new Float32Array(N), turbY = new Float32Array(N);
  const U = S * 2.4 * windK; // velocidade do vento (px/s)
  const C = 5.5; // arrasto normal (1/s)
  const CT = 0.25; // arrasto tangencial (estica a bandeira)
  const cellA = dx * dy;
  const dt = 1 / FPS / SUB;
  const t0 = -FADE - WARM;

  const tri = (a, b, c, wx, wy, wz) => {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
    const area = nl / 2;
    nx /= nl; ny /= nl; nz /= nl;
    // velocidade média do triângulo
    const rx = wx - (a.x - a.px + b.x - b.px + c.x - c.px) / (3 * dt);
    const ry = wy - (a.y - a.py + b.y - b.py + c.y - c.py) / (3 * dt);
    const rz = wz - (a.z - a.pz + b.z - b.pz + c.z - c.pz) / (3 * dt);
    const dn = rx * nx + ry * ny + rz * nz;
    const k = (area / cellA) / 3;
    const Fx = (C * dn * nx + CT * (rx - dn * nx)) * k;
    const Fy = (C * dn * ny + CT * (ry - dn * ny)) * k;
    const Fz = (C * dn * nz + CT * (rz - dn * nz)) * k;
    fx[a.i] += Fx; fy[a.i] += Fy; fz[a.i] += Fz;
    fx[b.i] += Fx; fy[b.i] += Fy; fz[b.i] += Fz;
    fx[c.i] += Fx; fy[c.i] += Fy; fz[c.i] += Fz;
  };

  const b = bake({
    duration: duration + FADE + WARM,
    fps: FPS,
    init: () => null,
    step: (_, __, f) => {
      // turbulência local (em z e y) uma vez por frame; viaja com o vento
      const tf = t0 + f / FPS;
      for (let j = 0; j + 1 < NY; j++) {
        for (let i = 0; i + 1 < NX; i++) {
          turbZ[j * NX + i] = noise.noise3(i * 0.18 - tf * 1.6, j * 0.18, tf * 0.5);
          turbY[j * NX + i] = noise.noise3(i * 0.15 - tf * 1.2, j * 0.15 + 40, tf * 0.4);
        }
      }
      for (let s = 0; s < SUB; s++) {
        const time = t0 + (f + s / SUB) / FPS;
        // rajadas: intensidade e direção variam devagar
        const gust = 0.75 + 0.45 * noise.noise2(time * 0.22, 3.1) + 0.15 * noise.noise2(time * 0.9, 7.7);
        const dir = 0.12 * noise.noise2(time * 0.17, 11.3);
        fx.fill(0); fy.fill(0); fz.fill(0);
        for (let j = 0; j + 1 < NY; j++) {
          for (let i = 0; i + 1 < NX; i++) {
            const a = P[id(i, j)], bb = P[id(i + 1, j)], c = P[id(i + 1, j + 1)], d = P[id(i, j + 1)];
            const tz = turbZ[j * NX + i], ty = turbY[j * NX + i];
            const wx = U * gust, wy = U * (dir + 0.12 * ty), wz = U * 0.35 * tz;
            tri(a, bb, c, wx, wy, wz);
            tri(a, c, d, wx, wy, wz);
          }
        }
        world.step(dt, (p) => {
          out[0] = fx[p.i]; out[1] = fy[p.i]; out[2] = fz[p.i];
          return out;
        });
      }
    },
    snapshot: () => {
      const s = new Float32Array(N * 3);
      for (let k = 0; k < N; k++) {
        s[k * 3] = P[k].x;
        s[k * 3 + 1] = P[k].y;
        s[k * 3 + 2] = P[k].z;
      }
      return s;
    },
  });
  return b;
}

export default {
  id: 'cloth',
  title: 'Cloth',
  description: 'Bandeira presa no mastro tremulando ao vento, com o logo e o texto estampados e sombra nas dobras.',
  category: 'particulas',
  tags: ['simulação', '3d', 'loop', 'forma'],
  duration: 10,
  poster: 4,

  params: {
    image: { type: 'image', label: 'Logo', default: '/samples/logo.svg' },
    text: { type: 'text', label: 'Texto', default: 'motion·pedia' },
    flag: { type: 'color', label: 'Tecido', default: '#f4f1ea' },
    ink: { type: 'color', label: 'Texto', default: '#111114' },
    bg: { type: 'color', label: 'Fundo', default: '#0e1014' },
    wind: { type: 'range', label: 'Vento', min: 0.4, max: 1.8, step: 0.05, default: 1 },
    size: { type: 'range', label: 'Tamanho', min: 0.5, max: 1.2, step: 0.01, default: 0.9 },
    shading: { type: 'range', label: 'Sombra das dobras', min: 0, max: 1.5, step: 0.05, default: 1 },
    pole: { type: 'boolean', label: 'Mastro', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  setup({ w, h, p, duration }) {
    const S = Math.min(w, h);
    const FW = Math.min(w * 0.7, S * 1.02) * p.size;
    const FH = FW * 0.62;
    const x0 = w / 2 - FW * 0.44;
    const y0 = h / 2 - FH * 0.62;

    const key = [w, h, p.wind, p.size, p.seed, duration].join('|');
    let b = simCache.get(key);
    if (!b) {
      b = simulate({ w, h, S, FW, FH, x0, y0, windK: p.wind, seed: p.seed, duration });
      simCache.set(key, b);
      if (simCache.size > 4) simCache.delete(simCache.keys().next().value);
    }

    // textura: tecido + logo + texto
    const TH = Math.round((TW * FH) / FW);
    const tex = document.createElement('canvas');
    tex.width = TW;
    tex.height = TH;
    const g = tex.getContext('2d');
    g.fillStyle = p.flag;
    g.fillRect(0, 0, TW, TH);
    // bainha do lado do mastro
    g.fillStyle = mixHex(p.flag, '#000000', 0.12);
    g.fillRect(0, 0, TW * 0.035, TH);
    const img = asset(p.image);
    const hasText = !!p.text.trim();
    const lh = TH * (hasText ? 0.46 : 0.6);
    const ly = TH * (hasText ? 0.4 : 0.5);
    if (img) {
      const iw = img.naturalWidth || img.width || 1, ih = img.naturalHeight || img.height || 1;
      const sc = lh / Math.max(iw, ih);
      g.drawImage(img, TW * 0.5 - (iw * sc) / 2, ly - (ih * sc) / 2, iw * sc, ih * sc);
    }
    if (hasText) {
      let fs = TH * 0.11;
      g.font = `800 ${fs}px Inter`;
      const tw = g.measureText(p.text).width;
      if (tw > TW * 0.8) {
        fs *= (TW * 0.8) / tw;
        g.font = `800 ${fs}px Inter`;
      }
      g.fillStyle = p.ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(p.text, TW * 0.5, TH * 0.81);
    }

    // textura composta por frame (tecido + sombreamento) e mapa de sombra NX×NY
    const comp = document.createElement('canvas');
    comp.width = TW;
    comp.height = TH;
    const shade = document.createElement('canvas');
    shade.width = NX;
    shade.height = NY;
    const sctx = shade.getContext('2d');
    return {
      b, tex, comp, cctx: comp.getContext('2d'), shade, sctx, simg: sctx.createImageData(NX, NY), TH,
      pos: new Float32Array(NX * NY * 3), lum: new Float32Array(NX * NY), scr: new Float32Array(NX * NY * 2), FW, FH, x0, y0, S,
    };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { b, tex, comp, cctx, shade, sctx, simg, TH, pos, scr, FW, FH, x0, y0, S } = state;

    // fundo: vertical suave (mesma família de cor)
    const bgG = ctx.createLinearGradient(0, 0, 0, h);
    bgG.addColorStop(0, mixHex(p.bg, '#ffffff', 0.06));
    bgG.addColorStop(1, p.bg);
    ctx.fillStyle = bgG;
    ctx.fillRect(0, 0, w, h);

    // posições: frame interpolado + crossfade do loop
    const N = NX * NY;
    const sample = (s, k) => {
      const fi = clamp((s + FADE + WARM) * FPS, 0, b.frames.length - 1);
      const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, b.frames.length - 1), f = fi - i0;
      const A = b.frames[i0], B = b.frames[i1];
      for (let q = 0; q < N * 3; q++) {
        const v = A[q] + (B[q] - A[q]) * f;
        pos[q] = k === 0 ? v : pos[q] + (v - pos[q]) * k;
      }
    };
    sample(t, 0);
    const k = smoothstep(duration - FADE, duration, t);
    if (k > 0) sample(t - duration, k);

    // vista levemente de 3/4: gira em torno do mastro (eixo vertical) + perspectiva
    const yaw = -0.32, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cam = S * 3.2;
    const midY = y0 + FH / 2;
    for (let q = 0; q < N; q++) {
      const X = pos[q * 3] - x0, Y = pos[q * 3 + 1], Z = pos[q * 3 + 2];
      const rx = X * cy + Z * sy;
      const rz = -X * sy + Z * cy;
      const sc = cam / (cam - rz);
      scr[q * 2] = x0 + rx * sc;
      scr[q * 2 + 1] = midY + (Y - midY) * sc;
      // guarda o z girado para as normais
      pos[q * 3] = rx;
      pos[q * 3 + 2] = rz;
    }

    // mastro (atrás da bandeira só no topo; desenhado antes)
    if (p.pole) {
      const pw = S * 0.013;
      const top = y0 - S * 0.06;
      const pg = ctx.createLinearGradient(x0 - pw, 0, x0 + pw, 0);
      pg.addColorStop(0, '#5d616b');
      pg.addColorStop(0.4, '#d9dce2');
      pg.addColorStop(1, '#3b3e46');
      ctx.fillStyle = pg;
      ctx.fillRect(x0 - pw / 2, top, pw, h - top + 2);
      const ball = ctx.createRadialGradient(x0 - pw * 0.4, top - pw * 0.4, 0, x0, top, pw * 1.3);
      ball.addColorStop(0, '#f2f3f6');
      ball.addColorStop(1, '#6b6f78');
      ctx.fillStyle = ball;
      ctx.beginPath();
      ctx.arc(x0, top, pw * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }

    // sombreamento por vértice → imagem NX×NY
    const L = [-0.45, -0.55, 0.7];
    const Ll = Math.hypot(...L);
    const d = simg.data;
    const lum = state.lum;
    const P = (i, j) => (j * NX + i) * 3;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = P(Math.max(0, i - 1), j), bb = P(Math.min(NX - 1, i + 1), j);
        const c = P(i, Math.max(0, j - 1)), e = P(i, Math.min(NY - 1, j + 1));
        const ux = pos[bb] - pos[a], uy = pos[bb + 1] - pos[a + 1], uz = pos[bb + 2] - pos[a + 2];
        const vx = pos[e] - pos[c], vy = pos[e + 1] - pos[c + 1], vz = pos[e + 2] - pos[c + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; } // dupla face: a face que vemos
        const lam = (nx * L[0] + ny * L[1] + nz * L[2]) / Ll;
        // 0.78 ≈ tecido plano; abaixo escurece, acima clareia
        lum[j * NX + i] = (lam - 0.78) * p.shading;
      }
    }
    // suaviza 3×3: a malha tem rugas do tamanho de uma célula que viram "azulejos" no sombreamento
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        let acc = 0, wsum = 0;
        for (let oj = -1; oj <= 1; oj++) {
          const jj = j + oj;
          if (jj < 0 || jj >= NY) continue;
          for (let oi = -1; oi <= 1; oi++) {
            const ii = i + oi;
            if (ii < 0 || ii >= NX) continue;
            const wgt = oi === 0 && oj === 0 ? 4 : oi === 0 || oj === 0 ? 2 : 1;
            acc += lum[jj * NX + ii] * wgt;
            wsum += wgt;
          }
        }
        const v = acc / wsum;
        const o = (j * NX + i) * 4;
        if (v < 0) {
          d[o] = d[o + 1] = d[o + 2] = 0;
          d[o + 3] = clamp(-v * 1.25) * 255;
        } else {
          d[o] = d[o + 1] = d[o + 2] = 255;
          d[o + 3] = clamp(v * 1.6) * 255;
        }
      }
    }
    sctx.putImageData(simg, 0, 0);
    cctx.globalCompositeOperation = 'copy';
    cctx.drawImage(tex, 0, 0);
    cctx.globalCompositeOperation = 'source-over';
    // pixel (i, j) centrado no vértice (i, j): estende meia célula para cada lado
    const cw = TW / (NX - 1), ch = TH / (NY - 1);
    cctx.drawImage(shade, -cw / 2, -ch / 2, cw * NX, ch * NY);

    // triângulos texturizados
    const M = ctx.getTransform();
    const du = cw, dv = ch;
    const S2 = (q) => q * 2;
    const drawTri = (ia, ib, ic, eu, ev, u0, v0) => {
      const ax = scr[S2(ia)], ay = scr[S2(ia) + 1];
      const bx = scr[S2(ib)], by = scr[S2(ib) + 1];
      const cx = scr[S2(ic)], cy2 = scr[S2(ic) + 1];
      // infla ~1,6 px a partir do centroide (esconde as costuras do antialias do clip)
      const gx = (ax + bx + cx) / 3, gy = (ay + by + cy2) / 3;
      const inf = (x, y) => {
        const l = Math.hypot(x - gx, y - gy) || 1;
        return [x + ((x - gx) / l) * 1.6, y + ((y - gy) / l) * 1.6];
      };
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(...inf(ax, ay));
      ctx.lineTo(...inf(bx, by));
      ctx.lineTo(...inf(cx, cy2));
      ctx.closePath();
      ctx.clip();
      const [ux, uy] = eu, [vx, vy] = ev;
      const tx = ax - ux * u0 - vx * v0, ty = ay - uy * u0 - vy * v0;
      ctx.setTransform(
        M.a * ux + M.c * uy, M.b * ux + M.d * uy, M.a * vx + M.c * vy, M.b * vx + M.d * vy,
        M.a * tx + M.c * ty + M.e, M.b * tx + M.d * ty + M.f,
      );
      const su = Math.max(0, u0 - 2), sv = Math.max(0, v0 - 2);
      const sw = Math.min(TW - su, du + 4), sh = Math.min(TH - sv, dv + 4);
      ctx.drawImage(comp, su, sv, sw, sh, su, sv, sw, sh);
      ctx.restore();
    };
    // base lisa na cor do tecido por baixo: as frestas de antialias entre triângulos mostram tecido, não fundo
    const under = new Path2D();
    for (let j = 0; j + 1 < NY; j++) {
      for (let i = 0; i + 1 < NX; i++) {
        const a = j * NX + i;
        under.moveTo(scr[S2(a)], scr[S2(a) + 1]);
        under.lineTo(scr[S2(a + 1)], scr[S2(a + 1) + 1]);
        under.lineTo(scr[S2(a + NX + 1)], scr[S2(a + NX + 1) + 1]);
        under.lineTo(scr[S2(a + NX)], scr[S2(a + NX) + 1]);
        under.closePath();
      }
    }
    ctx.fillStyle = p.flag;
    ctx.fill(under, 'nonzero');
    for (let j = 0; j + 1 < NY; j++) {
      for (let i = 0; i + 1 < NX; i++) {
        const a = j * NX + i, bq = a + 1, c = a + NX + 1, dq = a + NX;
        const u0 = i * du, v0 = j * dv;
        // tri 1: a(u0,v0) b(u0+du,v0) c(u0+du,v0+dv)
        drawTri(a, bq, c,
          [(scr[S2(bq)] - scr[S2(a)]) / du, (scr[S2(bq) + 1] - scr[S2(a) + 1]) / du],
          [(scr[S2(c)] - scr[S2(bq)]) / dv, (scr[S2(c) + 1] - scr[S2(bq) + 1]) / dv], u0, v0);
        // tri 2: a(u0,v0) c(u0+du,v0+dv) d(u0,v0+dv)
        drawTri(a, c, dq,
          [(scr[S2(c)] - scr[S2(dq)]) / du, (scr[S2(c) + 1] - scr[S2(dq) + 1]) / du],
          [(scr[S2(dq)] - scr[S2(a)]) / dv, (scr[S2(dq) + 1] - scr[S2(a) + 1]) / dv], u0, v0);
      }
    }
  },
};
