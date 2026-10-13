import { TAU, rgba, clamp, ease, mixHex } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Show de laser na fumaça. Os feixes (linhas com 3 traços aditivos: halo, corpo, núcleo, com gradiente que
// apaga ao longo do comprimento) vão para um buffer preto; o buffer é multiplicado por duas camadas de
// fumaça — texturas de ruído periódicas no eixo x (x mapeado num círculo do simplex 3D), pintadas no setup
// e roladas uma volta inteira por loop em sentidos opostos — e somado à cena com 'lighter'. Assim o feixe
// só aparece onde há fumaça, como no palco. A coreografia é uma sequência de 4 quadros (leque, cruzado,
// estrela girando, onda), cada um com entrada/saída em blecaute curto; o loop fecha no blecaute.

const hash = (a, b) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const hazeCache = new Map();
function hazeTexture(TW, TH, seed, scale, lo) {
  const key = `${TW}x${TH}:${seed}:${scale}:${lo}`;
  if (hazeCache.has(key)) return hazeCache.get(key);
  const n = createNoise(seed);
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const g = c.getContext('2d');
  const img = g.createImageData(TW, TH);
  const R = ((TW / TH) * scale) / TAU; // circunferência = largura → ruído isotrópico e periódico em x
  for (let y = 0; y < TH; y++) {
    const v = (y / TH) * scale;
    for (let x = 0; x < TW; x++) {
      const th = (x / TW) * TAU;
      const cx = Math.cos(th) * R, cz = Math.sin(th) * R;
      let f = n.noise3(cx, v, cz) * 0.6 + n.noise3(cx * 2.1 + 7, v * 2.1, cz * 2.1) * 0.28 + n.noise3(cx * 4.3, v * 4.3 + 3, cz * 4.3) * 0.12;
      f = clamp(0.45 + 0.95 * f);
      f = f * f * (3 - 2 * f);
      f *= 0.7 + 0.3 * (y / TH);
      const val = Math.round(255 * (lo + (1 - lo) * f));
      const i = (y * TW + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  hazeCache.set(key, c);
  return c;
}

function softSprite(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (let i = 0; i <= 10; i++) {
    const x = i / 10;
    rg.addColorStop(x, rgba(color, Math.exp(-x * x * 5) * (1 - x)));
  }
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return c;
}

const DEG = Math.PI / 180;

// feixe "deitado" no eixo y: base (fonte) embaixo, apaga para cima; perfil transversal gaussiano
function beamSprite(color) {
  const BW = 32, BH = 256;
  const c = document.createElement('canvas');
  c.width = BW;
  c.height = BH;
  const g = c.getContext('2d');
  const img = g.createImageData(BW, BH);
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let y = 0; y < BH; y++) {
    const s = 1 - y / (BH - 1); // 1 na fonte (embaixo)… mas a fonte fica em y = BH
    const along = Math.pow(1 - s, 1.6) * 0.75 + 0.25 * Math.pow(1 - s, 6);
    for (let x = 0; x < BW; x++) {
      const d = (x + 0.5 - BW / 2) / (BW / 2);
      const cross = Math.exp(-d * d * 7) * (1 - d * d);
      const i = (y * BW + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(255 * cross * along);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export default {
  id: 'laser-show',
  title: 'Laser Show',
  description: 'Laser beams sweeping through stage haze in fans, crossings and spinning stars.',
  category: 'particulas',
  tags: ['background', 'loop', 'broadcast'],
  duration: 16,
  poster: 2.6,

  params: {
    color: { type: 'color', label: 'Laser', default: '#2bff88' },
    color2: { type: 'color', label: 'Laser 2', default: '#ff2fa8' },
    twoTone: { type: 'boolean', label: 'Two colors', default: false },
    bg: { type: 'color', label: 'Background', default: '#05060a' },
    beams: { type: 'range', label: 'Beams per cue', min: 3, max: 15, step: 1, default: 9 },
    haze: { type: 'range', label: 'Haze', min: 0, max: 1, step: 0.01, default: 0.6 },
    intensity: { type: 'range', label: 'Intensity', min: 0.3, max: 2, step: 0.01, default: 1 },
    width: { type: 'range', label: 'Thickness', min: 0.4, max: 3, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ w, h, px, p }) {
    const k = Math.min(1, px || 1) * 0.5; // buffer volumétrico em meia resolução
    const TH = 128;
    const TW = Math.max(64, Math.round((TH * w) / h));
    // duas camadas: grande e lenta / mais fina; contraste depende de "Fumaça"
    const lo = 0.5 - 0.5 * p.haze;
    const hazeA = hazeTexture(TW, TH, p.seed, 3.2, lo);
    const hazeB = hazeTexture(TW, TH, p.seed + 50, 7, Math.min(0.9, lo + 0.25));
    const buf = document.createElement('canvas');
    buf.width = Math.max(1, Math.round(w * k));
    buf.height = Math.max(1, Math.round(h * k));
    return { hazeA, hazeB, buf, k, beamA: beamSprite(p.color), beamB: beamSprite(p.color2), flareA: softSprite(p.color), flareB: softSprite(p.color2) };
  },

  render(ctx, t, { w, h, p, duration, progress, state: S }) {
    const m = Math.min(w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    // —— coreografia
    const NQ = 4;
    const Q = duration / NQ;
    const qi = Math.min(NQ - 1, Math.floor(t / Q));
    const u = t - qi * Q; // tempo local do quadro
    const env = Math.min(clamp(u / 0.18), clamp((Q - u) / 0.22)); // blecaute curto entre quadros
    const n = Math.round(p.beams);
    const beams = []; // [x, y, ângulo (0 = para cima, + = direita), intensidade, corB]
    const fanMax = Math.atan2(w * 0.5, h) * 0.95 + 8 * DEG;
    const bottom = h * 1.0;

    if (qi === 0) {
      // leque central que abre e balança
      const open = ease.outExpo(clamp(u / 1.4));
      const breathe = 0.82 + 0.18 * Math.cos((TAU * u) / Q * 2);
      const sway = Math.sin((TAU * u) / Q) * 9 * DEG * open;
      for (let i = 0; i < n; i++) {
        const s = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        beams.push([w / 2, bottom, s * fanMax * open * breathe + sway, 1, i % 2]);
      }
    } else if (qi === 1) {
      // dois projetores nos cantos varrendo e se cruzando
      const per = Math.ceil(n / 2);
      for (let side = 0; side < 2; side++) {
        const sx = side ? w * 0.94 : w * 0.06;
        const dir = side ? -1 : 1;
        const aim = Math.atan2(w * 0.88, h);
        const ph = Math.sin((TAU * u) / Q * 1.5 + side * Math.PI);
        const base = dir * (aim * 0.5 + aim * 0.45 * ph);
        for (let i = 0; i < per; i++) {
          const s = per === 1 ? 0 : (i / (per - 1)) * 2 - 1;
          beams.push([sx, bottom, base + s * 5 * DEG, 1, side]);
        }
      }
    } else if (qi === 2) {
      // estrela girando a partir de um espelho no alto
      const cx = w / 2, cy = h * 0.12;
      const N2 = n + 3;
      const rot = (u / Q) * Math.PI * 0.9;
      for (let i = 0; i < N2; i++) {
        const a = Math.PI + (i / N2) * Math.PI * 2 + rot;
        const gate = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos((TAU * u) / Q * 4 - i * 1.3));
        beams.push([cx, cy, a, gate, i % 2]);
      }
    } else {
      // fila de projetores com onda e perseguição, convergindo no fim
      const N3 = Math.max(3, Math.min(n, Math.round((5 * w) / m)));
      const conv = ease.inOutCubic(clamp((u - Q * 0.62) / (Q * 0.25)));
      const tx = w / 2, ty = h * 0.18;
      for (let i = 0; i < N3; i++) {
        const sx = w * (0.1 + (0.8 * i) / (N3 - 1));
        const wave = Math.sin((TAU * u) / Q * 2 - i * 0.7) * 22 * DEG;
        const toT = Math.atan2(tx - sx, bottom - ty);
        const a = wave * (1 - conv) + toT * conv;
        const chase = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.cos((TAU * u) / Q * 3 - i * 0.9), 2);
        beams.push([sx, bottom, a, chase * (1 - conv) + conv, i % 2]);
      }
    }

    // —— buffer dos feixes
    const B = S.buf.getContext('2d');
    const k = S.k;
    B.setTransform(1, 0, 0, 1, 0, 0);
    B.globalCompositeOperation = 'source-over';
    B.globalAlpha = 1;
    B.fillStyle = '#000';
    B.fillRect(0, 0, S.buf.width, S.buf.height);
    B.setTransform(k, 0, 0, k, 0, 0);
    B.globalCompositeOperation = 'lighter';
    B.lineCap = 'butt';
    const L = Math.hypot(w, h) * 1.15;
    const I = env * p.intensity;
    const fk = Math.floor(t * 30) % Math.round(duration * 30);
    const lw = m * 0.0022 * p.width;
    if (I > 0.002) {
      for (let bi = 0; bi < beams.length; bi++) {
        const [x, y, a, gi, cb] = beams[bi];
        const col = p.twoTone && cb ? p.color2 : p.color;
        const flick = 0.9 + 0.1 * hash(fk, bi + p.seed * 31);
        const ii = I * gi * flick;
        if (ii < 0.003) continue;
        const ex = x + Math.sin(a) * L, ey = y - Math.cos(a) * L;
        const spr = p.twoTone && cb ? S.beamB : S.beamA;
        // halo e corpo: sprite com perfil gaussiano (borda macia) que apaga ao longo do feixe
        B.save();
        B.translate(x, y);
        B.rotate(a);
        B.globalAlpha = Math.min(1, 0.35 * ii);
        const Wg = lw * 22;
        B.drawImage(spr, -Wg, -L, Wg * 2, L);
        B.globalAlpha = Math.min(1, 0.9 * ii);
        const Wb = lw * 3.2;
        B.drawImage(spr, -Wb, -L, Wb * 2, L);
        B.restore();
        B.globalAlpha = 1;
        // núcleo
        const gr = B.createLinearGradient(x, y, ex, ey);
        gr.addColorStop(0, `rgba(255,255,255,${Math.min(1, ii)})`);
        gr.addColorStop(0.25, rgba(col, Math.min(1, ii * 0.8)));
        gr.addColorStop(1, rgba(col, 0));
        B.strokeStyle = gr;
        B.lineWidth = lw * 1.4;
        B.beginPath();
        B.moveTo(x, y);
        B.lineTo(ex, ey);
        B.stroke();
      }
    }
    // fumaça multiplica (rola uma volta inteira por loop: A para a direita, B para a esquerda ×2)
    B.globalCompositeOperation = 'multiply';
    B.globalAlpha = 1;
    const drawRoll = (img, shift) => {
      const off = ((shift % 1) + 1) % 1 * w;
      B.drawImage(img, off - w, 0, w, h);
      B.drawImage(img, off, 0, w, h);
    };
    drawRoll(S.hazeA, progress);
    drawRoll(S.hazeB, -2 * progress);

    // —— compõe
    ctx.save();
    // fumaça ambiente quase invisível, acesa pela soma dos feixes
    const lit = I * Math.min(1, beams.length / 8);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.07 * p.haze * lit;
    const offA = (((progress % 1) + 1) % 1) * w;
    ctx.drawImage(S.hazeA, offA - w, 0, w, h);
    ctx.drawImage(S.hazeA, offA, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(S.buf, 0, 0, w, h);
    // linha nítida por cima (o buffer é meia resolução)
    if (I > 0.002) {
      ctx.lineWidth = Math.max(0.5, lw * 0.7);
      for (let bi = 0; bi < beams.length; bi++) {
        const [x, y, a, gi, cb] = beams[bi];
        const ii = I * gi;
        if (ii < 0.003) continue;
        const col = p.twoTone && cb ? p.color2 : p.color;
        const ex = x + Math.sin(a) * L * 0.6, ey = y - Math.cos(a) * L * 0.6;
        const gr = ctx.createLinearGradient(x, y, ex, ey);
        gr.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.5 * ii)})`);
        gr.addColorStop(0.2, rgba(col, Math.min(1, 0.12 * ii)));
        gr.addColorStop(1, rgba(col, 0));
        ctx.strokeStyle = gr;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }
    // brilho nas fontes (projetores)
    if (I > 0.002) {
      const seen = new Set();
      for (const [x, y, , gi, cb] of beams) {
        const key = `${Math.round(x)}:${Math.round(y)}:${p.twoTone ? cb : 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const spr = p.twoTone && cb ? S.flareB : S.flareA;
        const G = m * 0.09;
        ctx.globalAlpha = Math.min(1, 0.7 * I);
        ctx.drawImage(spr, x - G, y - G, G * 2, G * 2);
        const g2 = m * 0.022;
        ctx.globalAlpha = Math.min(1, I);
        ctx.drawImage(spr, x - g2, y - g2, g2 * 2, g2 * 2);
      }
    }
    ctx.restore();
  },
};
