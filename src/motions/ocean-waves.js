import { TAU, rng, hexToRgb } from '../lib/anim.js';

// Mar em faixas no estilo de xilogravura japonesa (ukiyo-e). Cada faixa é uma onda de Gerstner
// (crista aguda, vale largo) que anda um número inteiro de comprimentos de onda por loop.
// Na crista: traço de espuma e "dedos" enrolando para a frente; no corpo, estrias paralelas.
// Céu, sol, nuvens e o grão do papel são pintados uma vez no setup.

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function paintSky({ w, h, p, px, horizon }) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const g = c.getContext('2d');
  g.scale(px, px);
  const paper = hexToRgb(p.paper);
  const ink = hexToRgb(p.ink);
  const m = Math.min(w, h);
  const rand = rng(p.seed * 7 + 3);

  // papel: leve escurecimento no alto (como tinta passada em degradê, bokashi)
  const gr = g.createLinearGradient(0, 0, 0, horizon);
  gr.addColorStop(0, css(mix(paper, ink, 0.16)));
  gr.addColorStop(0.55, css(mix(paper, ink, 0.03)));
  gr.addColorStop(1, css(paper));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);

  // monte distante na linha do horizonte
  const fx = w * 0.26;
  const fh = m * 0.12;
  const fw = m * 0.34;
  g.fillStyle = css(mix(paper, ink, 0.22));
  g.beginPath();
  g.moveTo(fx - fw, horizon + 2);
  g.bezierCurveTo(fx - fw * 0.45, horizon - fh * 0.25, fx - fw * 0.2, horizon - fh * 0.92, fx - fw * 0.09, horizon - fh);
  g.lineTo(fx + fw * 0.09, horizon - fh);
  g.bezierCurveTo(fx + fw * 0.2, horizon - fh * 0.92, fx + fw * 0.45, horizon - fh * 0.25, fx + fw, horizon + 2);
  g.closePath();
  g.fill();
  // neve no topo
  g.fillStyle = css(paper);
  g.beginPath();
  g.moveTo(fx - fw * 0.09, horizon - fh);
  g.lineTo(fx + fw * 0.09, horizon - fh);
  g.lineTo(fx + fw * 0.17, horizon - fh * 0.8);
  g.lineTo(fx + fw * 0.07, horizon - fh * 0.86);
  g.lineTo(fx, horizon - fh * 0.76);
  g.lineTo(fx - fw * 0.08, horizon - fh * 0.87);
  g.lineTo(fx - fw * 0.17, horizon - fh * 0.8);
  g.closePath();
  g.fill();

  // nuvens: faixas horizontais arredondadas
  g.fillStyle = css(mix(paper, ink, 0.1));
  const nc = 5;
  for (let i = 0; i < nc; i++) {
    const y = horizon * (0.16 + 0.62 * (i / (nc - 1))) + (rand() - 0.5) * m * 0.03;
    const len = w * (0.12 + rand() * 0.22);
    const x = rand() * (w - len * 0.5) - len * 0.25;
    const th = m * (0.008 + rand() * 0.008);
    g.beginPath();
    g.roundRect(x, y - th, len, th * 2, th);
    g.fill();
    g.beginPath();
    g.roundRect(x + len * 0.18, y + th * 2.2, len * 0.55, th * 1.6, th * 0.8);
    g.fill();
  }

  // sol
  if (p.sun) {
    const sr = m * 0.085;
    g.fillStyle = p.sunColor;
    g.beginPath();
    g.arc(w * 0.72, horizon * 0.42, sr, 0, TAU);
    g.fill();
  }

  // mar ao longe (faixa lisa sob as ondas)
  g.fillStyle = css(mix(mix(hexToRgb(p.wave), paper, 0.5), ink, 0.08));
  g.fillRect(0, horizon, w, h - horizon);

  // grão do papel
  g.setTransform(1, 0, 0, 1, 0, 0);
  const W = c.width;
  const H = c.height;
  const dots = Math.round((W * H) / 70);
  g.fillStyle = css(ink, 0.05);
  g.beginPath();
  for (let i = 0; i < dots; i++) g.rect(rand() * W, rand() * H, 1, 1);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath();
  for (let i = 0; i < dots; i++) g.rect(rand() * W, rand() * H, 1, 1);
  g.fill();
  return c;
}

export default {
  id: 'ocean-waves',
  title: 'Ocean Waves',
  description: 'Banded waves in Japanese woodblock style, with curling foam crests and streaks, in a loop.',
  category: 'fundos',
  tags: ['background', 'loop', 'pattern'],
  duration: 10,

  params: {
    paper: { type: 'color', label: 'Paper', default: '#efe6d2' },
    ink: { type: 'color', label: 'Ink', default: '#1c3557' },
    wave: { type: 'color', label: 'Wave', default: '#4d7396' },
    foam: { type: 'color', label: 'Foam', default: '#f7f1e3' },
    sunColor: { type: 'color', label: 'Sun color', default: '#d4452c' },
    bands: { type: 'range', label: 'Bands', min: 3, max: 9, step: 1, default: 6 },
    height: { type: 'range', label: 'Wave height', min: 0.4, max: 1.8, step: 0.01, default: 1 },
    speed: { type: 'range', label: 'Speed', min: 1, max: 3, step: 1, default: 1 },
    sun: { type: 'boolean', label: 'Sun', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p, px }) {
    const horizon = h * 0.4;
    const rand = rng(p.seed);
    const n = p.bands;
    const bands = [];
    for (let i = 0; i < n; i++) {
      const d = n === 1 ? 1 : i / (n - 1);
      // spray por crista (repete a cada `k` cristas para o loop emendar)
      const k = 2 + Math.round(d * 2);
      const spray = Array.from({ length: k }, () =>
        Array.from({ length: 5 }, () => [rand() * 2 - 1.4, rand() * 1.4 + 0.35, 0.3 + rand() * 0.7]),
      );
      bands.push({ d, k, ph: rand(), env: rand() * TAU, spray });
    }
    return { horizon, bands, sky: paintSky({ w, h, p, px, horizon }) };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const m = Math.min(w, h);
    ctx.drawImage(state.sky, 0, 0, w, h);

    const paper = hexToRgb(p.paper);
    const ink = hexToRgb(p.ink);
    const wave = hexToRgb(p.wave);
    const foamC = hexToRgb(p.foam);
    const { horizon, bands } = state;
    const n = bands.length;
    const xs = new Float32Array(400);
    const ys = new Float32Array(400);

    for (let i = 0; i < n; i++) {
      const b = bands[i];
      const d = b.d;
      const lam = m * (0.2 + 0.42 * d * d) + w * 0.04; // comprimento de onda
      const A = lam * 0.11 * p.height; // amplitude
      const base = horizon + (h - horizon) * (0.06 + 0.86 * Math.pow(d, 1.15)) + Math.sin(TAU * (u + b.ph)) * A * 0.12;
      const laps = b.k * p.speed; // comprimentos de onda por loop
      const phase = TAU * (laps * u + b.ph);
      const Q = 0.82; // agudeza da crista
      const env = (x) => 0.72 + 0.28 * Math.sin((TAU * x) / (w * 1.1 + lam) + b.env + TAU * u);

      // curva da crista
      const N = Math.min(399, Math.ceil(((w + 2 * lam) / lam) * 36));
      for (let j = 0; j <= N; j++) {
        const s = -lam + (j / N) * (w + 2 * lam);
        const a = A * env(s);
        const ph = (TAU * s) / lam + phase;
        xs[j] = s - ((Q * lam) / TAU) * Math.sin(ph) * (a / A);
        ys[j] = base - a * Math.cos(ph);
      }

      // corpo
      const col = mix(mix(wave, paper, 0.42 * (1 - d)), ink, 0.12 + 0.55 * d);
      const deep = mix(col, ink, 0.45);
      const body = ctx.createLinearGradient(0, base - A, 0, base + (h - horizon) * 0.28);
      body.addColorStop(0, css(col));
      body.addColorStop(1, css(deep));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let j = 1; j <= N; j++) ctx.lineTo(xs[j], ys[j]);
      ctx.lineTo(w + lam, h + 2);
      ctx.lineTo(-lam, h + 2);
      ctx.closePath();
      ctx.fill();

      // estrias paralelas (seguem a crista, achatando para baixo)
      ctx.strokeStyle = css(mix(col, foamC, 0.35), 0.55);
      ctx.lineWidth = Math.max(1, m * 0.0016 * (0.6 + d));
      ctx.lineCap = 'round';
      ctx.beginPath();
      const rows = 3;
      for (let r = 1; r <= rows; r++) {
        const dy = A * (0.42 + r * 0.42);
        const k = 1 - r * 0.24;
        for (let j = 0; j <= N; j++) {
          const yy = base + (ys[j] - base) * k + dy;
          // traço interrompido: só nas encostas da frente (onde o seno é negativo)
          const s = -lam + (j / N) * (w + 2 * lam);
          const on = Math.sin((TAU * s) / lam + phase + r * 0.5) < 0.2;
          if (!on) continue;
          const prevOn = j > 0 && Math.sin((TAU * (-lam + ((j - 1) / N) * (w + 2 * lam))) / lam + phase + r * 0.5) < 0.2;
          if (prevOn) ctx.lineTo(xs[j], yy);
          else ctx.moveTo(xs[j], yy);
        }
      }
      ctx.stroke();

      // contorno da crista em tinta
      ctx.strokeStyle = css(ink, 0.85);
      ctx.lineWidth = Math.max(1, m * 0.0022 * (0.6 + d));
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let j = 1; j <= N; j++) ctx.lineTo(xs[j], ys[j]);
      ctx.stroke();

      // espuma: capa na crista + dedos enrolando + borrifo
      const pt = (s) => {
        const a = A * env(s);
        const ph = (TAU * s) / lam + phase;
        return [s - ((Q * lam) / TAU) * Math.sin(ph) * (a / A), base - a * Math.cos(ph)];
      };
      const foam = new Path2D();
      const c0 = Math.floor(phase / TAU) - 1;
      for (let c = c0 - 1; c < c0 + (w + 2 * lam) / lam + 2; c++) {
        // crista onde ph = TAU·c → s = (TAU·c − phase)·lam/TAU
        const s = ((TAU * c - phase) * lam) / TAU;
        if (s < -lam * 0.6 || s > w + lam * 0.6) continue;
        const e = env(s);
        const a = A * e;
        const curl = Math.max(0, (e - 0.72) / 0.28); // ondas maiores quebram mais
        // capa de espuma: borda de cima = a própria onda; borda de baixo recortada em dedos
        const sA = s - lam * (0.22 + 0.14 * curl);
        const sB = s + lam * 0.07;
        const M = 26;
        const thick = a * (0.34 + 0.36 * curl);
        const fingers = 3.5 + curl * 2;
        for (let q = 0; q <= M; q++) {
          const [x, y] = pt(sA + ((sB - sA) * q) / M);
          if (q === 0) foam.moveTo(x, y);
          else foam.lineTo(x, y);
        }
        for (let q = M; q >= 0; q--) {
          const f = q / M;
          const [x, y] = pt(sA + (sB - sA) * f);
          const T = thick * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.08)), 0.7) * (1 - 0.6 * Math.abs(Math.sin(Math.PI * f * fingers)));
          foam.lineTo(x - T * 0.25, y + T);
        }
        foam.closePath();
        // dedos soltos à frente da capa
        const [fx, fy] = pt(sA);
        const nb = 2 + Math.round(curl * 3);
        for (let q = 0; q < nb; q++) {
          const br = a * (0.09 - q * 0.012) * (0.8 + 0.6 * curl);
          if (br <= 0) break;
          const bx = fx - a * (0.12 + q * 0.2);
          const by = fy + a * (0.05 + q * 0.1 + q * q * 0.04);
          foam.moveTo(bx + br, by);
          foam.arc(bx, by, br, 0, TAU);
        }
        const tx = s;
        const ty = base - a;
        // borrifo
        const sp = b.spray[(((c % b.k) + b.k) % b.k)];
        for (const [ox, oy, sz] of sp) {
          const sr = a * 0.05 * sz * (0.5 + curl);
          const sx = tx + ox * a * 0.6;
          const sy = ty - oy * a * 0.28 * (0.4 + curl);
          foam.moveTo(sx + sr, sy);
          foam.arc(sx, sy, sr, 0, TAU);
        }
      }
      ctx.fillStyle = css(foamC);
      ctx.fill(foam);
      ctx.strokeStyle = css(ink, 0.55);
      ctx.lineWidth = Math.max(1, m * 0.0012);
      ctx.stroke(foam);
    }
  },
};
