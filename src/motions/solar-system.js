import { TAU, lerp, rng, hexToRgb } from '../lib/anim.js';

// Sistema solar estilizado, visto em ângulo: órbitas elípticas (achatadas pela inclinação), planetas com
// rastro que se apaga, terminador virado para o Sol, anéis de Saturno (metade de trás antes do planeta,
// metade da frente depois). Cada planeta dá um número inteiro de voltas por loop (mais perto = mais voltas,
// lembrando Kepler), então o loop fecha. Ordem de pintura: o que está "atrás" do Sol (metade de cima da
// elipse) vem antes do Sol. Fundo de estrelas e brilho do Sol pré-pintados no setup.

const PLANETS = [
  // nome, cor, raio relativo, voltas por loop
  ['Mercúrio', '#a59d95', 0.32, 12],
  ['Vênus', '#e3c48f', 0.52, 8],
  ['Terra', '#5b93d8', 0.55, 6],
  ['Marte', '#d06a42', 0.42, 4],
  ['Júpiter', '#d8ad80', 1.15, 3],
  ['Saturno', '#e4cc95', 0.95, 2],
  ['Urano', '#93d3dc', 0.72, 1],
  ['Netuno', '#5876d6', 0.7, 1],
];

const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;

export default {
  id: 'solar-system',
  title: 'Solar System',
  description: 'Planets on tilted orbits around the Sun, with trails, day-night shading and Saturn\'s rings. Seamless loop.',
  category: 'formas',
  tags: ['3d', 'loop', 'shape'],
  duration: 24,

  params: {
    planets: { type: 'range', label: 'Planets', min: 3, max: 8, step: 1, default: 8 },
    tilt: { type: 'range', label: 'Tilt', min: 0.15, max: 1, step: 0.01, default: 0.36 },
    palette: { type: 'select', label: 'Colors', options: ['realista', 'monocromática'], default: 'realista' },
    sun: { type: 'color', label: 'Sun', default: '#ffb547' },
    bg: { type: 'color', label: 'Background', default: '#07080d' },
    trail: { type: 'range', label: 'Trail', min: 0, max: 1, step: 0.01, default: 0.55 },
    size: { type: 'range', label: 'Planet size', min: 0.5, max: 2, step: 0.05, default: 1 },
    labels: { type: 'boolean', label: 'Names', default: true },
    stars: { type: 'boolean', label: 'Stars', default: true },
  },

  setup({ w, h, p, px }) {
    const m = Math.min(w, h);
    const n = Math.round(p.planets);
    const r = rng(11);
    const sunRgb = hexToRgb(p.sun);
    const planets = PLANETS.slice(0, n).map(([name, hex, rad, turns], i) => {
      let c = hexToRgb(hex);
      if (p.palette === 'monocromática') {
        const k = 0.45 + 0.55 * (lum(c) / 255);
        c = [lerp(200, sunRgb[0], 0.25) * k, lerp(205, sunRgb[1], 0.25) * k, lerp(215, sunRgb[2], 0.25) * k];
      }
      return { name, c, rad, turns, phase: r(), ring: name === 'Saturno', i };
    });

    // fundo: céu + estrelas + brilho do Sol, num buffer
    const bgc = document.createElement('canvas');
    bgc.width = Math.max(1, Math.round(w * px));
    bgc.height = Math.max(1, Math.round(h * px));
    const g = bgc.getContext('2d');
    g.scale(px, px);
    g.fillStyle = p.bg;
    g.fillRect(0, 0, w, h);
    if (p.stars) {
      const rs = rng(5);
      const N = Math.round((w * h) / 2600);
      for (let i = 0; i < N; i++) {
        const a = rs() ** 3 * 0.75 + 0.05;
        g.fillStyle = `rgba(255,255,255,${a})`;
        const s = (rs() < 0.92 ? 0.7 : 1.4) * (m / 1080);
        g.fillRect(rs() * w, rs() * h, s, s);
      }
    }
    const [sr, sg, sb] = sunRgb;
    const glow = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, m * 0.42);
    glow.addColorStop(0, `rgba(${sr},${sg},${sb},0.22)`);
    glow.addColorStop(0.25, `rgba(${sr},${sg},${sb},0.07)`);
    glow.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);

    // halo do Sol: sprite (mesma cor, só alpha)
    const halo = document.createElement('canvas');
    halo.width = halo.height = 256;
    const hg = halo.getContext('2d');
    const hr = hg.createRadialGradient(128, 128, 0, 128, 128, 128);
    hr.addColorStop(0, `rgba(${sr},${sg},${sb},0.55)`);
    hr.addColorStop(0.33, `rgba(${sr},${sg},${sb},0.32)`);
    hr.addColorStop(0.5, `rgba(${sr},${sg},${sb},0.1)`);
    hr.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
    hg.fillStyle = hr;
    hg.fillRect(0, 0, 256, 256);
    return { planets, bgc, halo };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const { planets, bgc } = state;
    ctx.drawImage(bgc, 0, 0, w, h);
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const n = planets.length;

    // retrato pede órbitas menos achatadas para ocupar a altura
    const squash = Math.min(0.9, p.tilt * Math.max(1, (h / w) * 1.45));
    const RX = Math.min(w * 0.46, (h * 0.44) / squash);
    const r0 = m * 0.12;
    const sunR = m * 0.044;
    const orbit = (i) => r0 + (RX - r0) * Math.pow((i + 0.6) / (n - 0.4), 0.92);
    const pr = (pl) => m * 0.016 * pl.rad * p.size * (0.85 + 0.15 * (8 / Math.max(4, n)));

    // órbitas
    ctx.lineWidth = Math.max(0.6, m * 0.0009);
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const R = orbit(i);
      ctx.moveTo(cx + R, cy);
      ctx.ellipse(cx, cy, R, R * squash, 0, 0, TAU);
    }
    ctx.stroke();

    // posições
    const items = planets.map((pl, i) => {
      const R = orbit(i);
      const a = TAU * (pl.phase + pl.turns * u);
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R * squash;
      return { pl, R, a, x, y, depth: Math.sin(a), rad: pr(pl) };
    });

    // rastros: arco atrás do planeta em segmentos com alpha decrescente
    if (p.trail > 0) {
      ctx.lineCap = 'butt';
      const SEG = 14;
      for (const it of items) {
        const len = Math.min(TAU * 0.45, (TAU * 0.1 * p.trail * 260) / it.R ** 0.5 / 10);
        const c = it.pl.c;
        ctx.lineWidth = Math.max(0.8, it.rad * 0.9);
        for (let k = 0; k < SEG; k++) {
          const a0 = it.a - (len * k) / SEG;
          const a1 = it.a - (len * (k + 1)) / SEG;
          ctx.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.5 * (1 - k / SEG) ** 1.6})`;
          ctx.beginPath();
          ctx.ellipse(cx, cy, it.R, it.R * squash, 0, a1, a0);
          ctx.stroke();
        }
      }
    }

    const drawPlanet = (it) => {
      const { x, y, rad, pl } = it;
      const c = pl.c;
      // anel: metade de trás
      const ringR = rad * 2.25;
      const ringK = Math.max(0.18, squash * 0.95);
      const ringW = Math.max(0.8, rad * 0.32);
      const ringCss = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0.75)`;
      if (pl.ring) {
        ctx.strokeStyle = ringCss;
        ctx.lineWidth = ringW;
        ctx.beginPath();
        ctx.ellipse(x, y, ringR, ringR * ringK, -0.18, Math.PI, TAU);
        ctx.stroke();
        ctx.lineWidth = ringW * 0.5;
        ctx.beginPath();
        ctx.ellipse(x, y, ringR * 1.25, ringR * 1.25 * ringK, -0.18, Math.PI, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();
      // terminador: gradiente escuro do lado oposto ao Sol
      const dx = x - cx;
      const dy = (y - cy) / squash;
      const dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl;
      const uy = (dy / dl) * squash;
      const gr = ctx.createLinearGradient(x - ux * rad, y - uy * rad, x + ux * rad, y + uy * rad);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.45, 'rgba(0,0,0,0.05)');
      gr.addColorStop(0.75, 'rgba(0,0,0,0.6)');
      gr.addColorStop(1, 'rgba(0,0,0,0.78)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();
      if (pl.ring) {
        ctx.strokeStyle = ringCss;
        ctx.lineWidth = ringW;
        ctx.beginPath();
        ctx.ellipse(x, y, ringR, ringR * ringK, -0.18, 0, Math.PI);
        ctx.stroke();
        ctx.lineWidth = ringW * 0.5;
        ctx.beginPath();
        ctx.ellipse(x, y, ringR * 1.25, ringR * 1.25 * ringK, -0.18, 0, Math.PI);
        ctx.stroke();
      }
      // Terra ganha a Lua
      if (pl.name === 'Terra') {
        const la = TAU * (pl.phase * 3 + 18 * u);
        const lr = rad * 2.6;
        const lx = x + Math.cos(la) * lr;
        const ly = y + Math.sin(la) * lr * squash;
        ctx.fillStyle = '#cfd2d8';
        ctx.beginPath();
        ctx.arc(lx, ly, Math.max(0.8, rad * 0.27), 0, TAU);
        ctx.fill();
      }
    };

    const drawLabel = (it) => {
      const fs = Math.max(8, m * 0.0135);
      ctx.font = `500 ${fs}px "JetBrains Mono"`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const off = it.rad * (it.pl.ring ? 2.9 : 1.6) + fs * 0.5;
      const label = it.pl.name.toUpperCase();
      // perto da borda direita o nome vai para a esquerda do planeta
      const left = it.x + off + ctx.measureText(label).width > w - m * 0.03;
      const sgn = left ? -1 : 1;
      ctx.textAlign = left ? 'right' : 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(it.x + sgn * (off - fs * 0.4) - (left ? fs * 0.25 : 0), it.y - 0.5, fs * 0.25, Math.max(0.6, m * 0.0008));
      ctx.fillStyle = 'rgba(235,238,245,0.62)';
      ctx.fillText(label, it.x + sgn * off, it.y);
    };

    const back = items.filter((it) => it.depth < 0).sort((a, b) => a.depth - b.depth);
    const front = items.filter((it) => it.depth >= 0).sort((a, b) => a.depth - b.depth);
    for (const it of back) drawPlanet(it);

    // Sol: halo em camadas (alpha) + disco
    const [sr, sg, sb] = hexToRgb(p.sun);
    ctx.drawImage(state.halo, cx - sunR * 3, cy - sunR * 3, sunR * 6, sunR * 6);
    const sgrad = ctx.createRadialGradient(cx - sunR * 0.3, cy - sunR * 0.3, 0, cx, cy, sunR);
    sgrad.addColorStop(0, `rgb(${Math.min(255, sr + 60)},${Math.min(255, sg + 70)},${Math.min(255, sb + 90)})`);
    sgrad.addColorStop(1, `rgb(${sr},${sg},${sb})`);
    ctx.fillStyle = sgrad;
    ctx.beginPath();
    ctx.arc(cx, cy, sunR, 0, TAU);
    ctx.fill();

    for (const it of front) drawPlanet(it);
    if (p.labels) for (const it of items) drawLabel(it);
  },
};
