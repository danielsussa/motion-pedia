import { TAU, rng, rgba, mixHex, smoothstep } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Aurora: cada cortina é uma fileira de "raios" verticais (um sprite de gradiente pré-renderizado)
// apoiados numa curva de ruído. Tudo é desenhado num canvas em baixa resolução e ampliado:
// a ampliação faz o papel do blur sem custo de ctx.filter.
const LOW = 0.3; // resolução do buffer da aurora em relação ao tamanho lógico

function raySprite(base, top) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, rgba(top, 0));
  grad.addColorStop(0.4, rgba(top, 0.2));
  grad.addColorStop(0.7, rgba(mixHexHex(top, base, 0.7), 0.45));
  grad.addColorStop(0.8, rgba(base, 0.95));
  grad.addColorStop(0.83, rgba(mixHexHex(base, '#ffffff', 0.25), 1)); // borda inferior mais quente
  grad.addColorStop(0.9, rgba(base, 0.28));
  grad.addColorStop(1, rgba(base, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return c;
}

// mixHex do anim.js devolve "rgb(...)"; aqui precisamos de hex para passar ao rgba().
function mixHexHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let out = 0;
  for (const s of [16, 8, 0]) {
    const va = (pa >> s) & 255;
    const vb = (pb >> s) & 255;
    out |= Math.round(va + (vb - va) * t) << s;
  }
  return '#' + out.toString(16).padStart(6, '0');
}

export default {
  id: 'aurora',
  title: 'Aurora',
  description: 'Cortinas de luz verde e violeta ondulando num céu estrelado, sobre um horizonte escuro. Loop perfeito.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'gradiente'],
  duration: 12,

  params: {
    c1: { type: 'color', label: 'Cor da base', default: '#3dffa8' },
    c2: { type: 'color', label: 'Cor do topo', default: '#8a5cff' },
    sky: { type: 'color', label: 'Céu', default: '#040814' },
    curtains: { type: 'range', label: 'Cortinas', min: 1, max: 4, step: 1, default: 3 },
    intensity: { type: 'range', label: 'Intensidade', min: 0.2, max: 1.6, step: 0.01, default: 1 },
    speed: { type: 'range', label: 'Movimento', min: 1, max: 4, step: 1, default: 2 },
    ground: { type: 'boolean', label: 'Horizonte', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p }) {
    const rand = rng(p.seed);
    const nz = createNoise(p.seed);
    const buf = document.createElement('canvas');
    buf.width = Math.max(8, Math.round(w * LOW));
    buf.height = Math.max(8, Math.round(h * LOW));
    const sprites = [
      raySprite(p.c1, p.c2),
      raySprite(mixHexHex(p.c1, '#7dfcff', 0.35), p.c2),
      raySprite(mixHexHex(p.c1, p.c2, 0.35), p.c2),
      raySprite(p.c1, mixHexHex(p.c2, '#ff4fa0', 0.4)),
    ];
    const stars = Array.from({ length: 220 }, () => ({ x: rand(), y: rand(), r: 0.5 + rand() * 1.3, a: 0.15 + rand() * 0.75, f: 1 + Math.floor(rand() * 3), ph: rand() * TAU }));
    const ridge = Array.from({ length: 121 }, (_, i) => nz.fbm2(i / 120 * 4 + 3, 7, 4));
    return { nz, buf, sprites, stars, ridge };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const m = Math.min(w, h);
    const { nz, buf, sprites } = state;
    const port = h > w;

    // Céu
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, p.sky);
    sky.addColorStop(0.7, mixHex(p.sky, p.c1, 0.035));
    sky.addColorStop(1, mixHex(p.sky, p.c2, 0.12));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Estrelas (cintilam com frequência inteira por loop)
    ctx.fillStyle = '#ffffff';
    for (const s of state.stars) {
      ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(TAU * s.f * u + s.ph));
      const r = s.r * m * 0.0014;
      ctx.fillRect(s.x * w, s.y * h * 0.85, r, r);
    }
    ctx.globalAlpha = 1;

    // Cortinas no buffer de baixa resolução
    const bw = buf.width;
    const bh = buf.height;
    const g = buf.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, bw, bh);
    g.globalCompositeOperation = 'lighter';
    const cols = Math.round(bw / 2.2);
    const colW = bw / cols;
    const n = p.curtains;
    for (let i = 0; i < n; i++) {
      const k = n > 1 ? i / (n - 1) : 0.5;
      const baseY = (port ? 0.54 : 0.5) + (k - 0.5) * (port ? 0.3 : 0.2); // altura da borda inferior
      const sprite = sprites[i % sprites.length];
      for (let c = 0; c <= cols; c++) {
        const xn = (c / cols) * (w / m); // coordenada em unidades de min(w,h)
        const fold = nz.loop2(xn * 0.9 + i * 13.1, i * 3.7, u, p.speed * 0.6);
        const y = (baseY + fold * 0.09 + nz.loop2(xn * 2.6, i * 5.3 + 40, u, p.speed) * 0.025) * bh;
        const env = smoothstep(-0.35, 0.55, nz.loop2(xn * 0.7 + 30, i * 9.1, u, p.speed * 0.5));
        const stri = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * (0.6 * nz.loop2(xn * 38 + i * 2.1, 60 + i, u, p.speed * 2) + 0.4 * nz.loop2(xn * 9, 80 + i, u, p.speed)), 1.4);
        const a = env * stri * p.intensity * (0.85 - 0.25 * k);
        if (a < 0.004) continue;
        const H = bh * (0.2 + 0.16 * (0.5 + 0.5 * nz.loop2(xn * 1.1 + 90, i * 2.2, u, p.speed * 0.5)));
        g.globalAlpha = Math.min(1, a);
        g.drawImage(sprite, c * colW - colW, y - H * 0.83, colW * 2.2, H);
      }
    }
    g.globalAlpha = 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buf, 0, 0, w, h);
    ctx.restore();

    // Horizonte: silhueta de morros com leve brilho refletido da aurora
    if (p.ground) {
      const gy = h * (port ? 0.86 : 0.84);
      const path = new Path2D();
      path.moveTo(0, h);
      state.ridge.forEach((v, i) => path.lineTo((i / (state.ridge.length - 1)) * w, gy - (v * 0.5 + 0.35) * m * 0.12));
      path.lineTo(w, h);
      path.closePath();
      const gg = ctx.createLinearGradient(0, gy - m * 0.1, 0, h);
      gg.addColorStop(0, mixHex(p.sky, p.c1, 0.06));
      gg.addColorStop(0.4, mixHex(p.sky, '#000000', 0.5));
      gg.addColorStop(1, '#000000');
      ctx.fillStyle = gg;
      ctx.fill(path);
    }
  },
};
