import { TAU, rng, clamp, smoothstep } from '../lib/anim.js';

// Overlay de fita VHS: scanlines, chuvisco, faixa de tracking que sobe a tela num "surto" a cada loop,
// ruído de troca de cabeça no rodapé, riscos de croma (magenta/ciano) e o OSD do videocassete.
// Tudo vem de hash determinístico do quadro (30 qps, módulo a duração) → render puro e loop fechado.
// Com `transparent` só o overlay é desenhado (exporte com --alpha). Sem ele, uma cena de prévia (pôr do sol
// de vídeo caseiro) é pré-renderizada no setup separada em dois canais (R e GB): cada quadro ela é redesenhada
// em faixas horizontais deslocadas (tremido e tracking) e com os canais desalinhados ('lighter') — o
// sangramento de cor de verdade, que um overlay sozinho não consegue fazer.

const FPS = 30;
const STRIPS = 48;

const hash = (a, b = 0, c = 0) => {
  let x = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

// Tile de chuvisco: pontos claros esparsos (o "snow" da fita), alpha ~ intensidade.
function snowTile(size, rand) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand();
    const lum = v > 0.5 ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = lum;
    img.data[i + 3] = Math.pow(Math.abs(v - 0.5) * 2, 2.2) * 200;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Cena de prévia em px reais: céu de fim de tarde, sol com faixas, mar com reflexo.
function previewScene(w, h, px) {
  const W = Math.max(1, Math.round(w * px)), H = Math.max(1, Math.round(h * px));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.scale(W / w, H / h);
  const S = Math.min(w, h);
  const hor = h * 0.62;
  const sky = g.createLinearGradient(0, 0, 0, hor);
  sky.addColorStop(0, '#1d1638');
  sky.addColorStop(0.55, '#7a3a63');
  sky.addColorStop(0.85, '#e0765a');
  sky.addColorStop(1, '#f6b979');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hor + 1);
  // sol com cortes horizontais
  const sx = w * 0.5, sr = S * 0.2, sy = hor - sr * 0.35;
  g.save();
  g.beginPath();
  g.rect(0, 0, w, hor);
  g.clip();
  const sun = g.createLinearGradient(0, sy - sr, 0, sy + sr);
  sun.addColorStop(0, '#ffe6a6');
  sun.addColorStop(1, '#ff7a59');
  g.fillStyle = sun;
  g.beginPath();
  g.arc(sx, sy, sr, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) {
    const y = sy + sr * (0.05 + i * 0.16);
    g.fillRect(sx - sr, y, sr * 2, sr * (0.02 + i * 0.018));
  }
  g.restore();
  // re-pinta o céu atrás dos cortes (destination-out furou o canvas)
  g.save();
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hor + 1);
  g.restore();
  // mar
  const sea = g.createLinearGradient(0, hor, 0, h);
  sea.addColorStop(0, '#3a2a55');
  sea.addColorStop(1, '#120e22');
  g.fillStyle = sea;
  g.fillRect(0, hor, w, h - hor);
  // reflexo do sol: traços horizontais que afinam com a distância
  const r = rng(5);
  g.fillStyle = 'rgba(255,190,130,0.75)';
  for (let i = 0; i < 26; i++) {
    const k = i / 26;
    const y = hor + (h - hor) * (k * k * 0.9 + 0.02);
    const half = sr * (1.1 - k * 0.6) * (0.5 + r() * 0.6);
    g.globalAlpha = 0.85 - k * 0.6;
    g.fillRect(sx - half + (r() - 0.5) * sr * 0.3, y, half * 2, Math.max(1, S * (0.003 + k * 0.006)));
  }
  g.globalAlpha = 1;
  // separa canais: R e GB
  const data = g.getImageData(0, 0, W, H);
  const red = new ImageData(new Uint8ClampedArray(data.data), W, H);
  const gb = new ImageData(new Uint8ClampedArray(data.data), W, H);
  for (let i = 0; i < data.data.length; i += 4) {
    red.data[i + 1] = red.data[i + 2] = 0;
    gb.data[i] = 0;
  }
  const mk = (img) => {
    const cc = document.createElement('canvas');
    cc.width = W;
    cc.height = H;
    cc.getContext('2d').putImageData(img, 0, 0);
    return cc;
  };
  return { red: mk(red), gb: mk(gb), W, H };
}

export default {
  id: 'vhs',
  title: 'VHS',
  description: 'A VHS tape overlay: scanlines, static, a tracking band, head-switching noise, color bleed and a date in the corner.',
  category: 'transicoes',
  tags: ['overlay', 'alpha', 'loop'],
  duration: 6,

  params: {
    transparent: { type: 'boolean', label: 'Transparent background', default: true },
    tracking: { type: 'range', label: 'Tracking', min: 0, max: 1, step: 0.01, default: 0.6 },
    noise: { type: 'range', label: 'Static', min: 0, max: 1, step: 0.01, default: 0.45 },
    bleed: { type: 'range', label: 'Color bleed', min: 0, max: 1, step: 0.01, default: 0.5 },
    scanlines: { type: 'range', label: 'Scanlines', min: 0, max: 1, step: 0.01, default: 0.5 },
    osd: { type: 'boolean', label: 'OSD (date and PLAY)', default: true },
    date: { type: 'text', label: 'Date', default: 'OCT. 12 1996' },
    time: { type: 'text', label: 'Time', default: 'PM 3:47' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p, px }) {
    const rand = rng(p.seed);
    return {
      tiles: [0, 1, 2].map(() => snowTile(160, rand)),
      patterns: new WeakMap(),
      scene: p.transparent ? null : previewScene(w, h, px),
    };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const S = Math.min(w, h);
    const nF = Math.max(1, Math.round(duration * FPS));
    const frame = ((Math.floor(t * FPS) % nF) + nF) % nF;
    const u = frame / nF;
    const seed = p.seed * 7919;

    // —— surto de tracking: a faixa sobe de baixo para cima entre 45% e 85% do loop, com entrada/saída suaves
    const burst = smoothstep(0.42, 0.52, u) * (1 - smoothstep(0.78, 0.88, u)) * p.tracking;
    const bandY = h * (1.15 - 1.3 * clamp((u - 0.42) / 0.46));
    const bandH = S * (0.06 + 0.06 * p.tracking);
    // deslocamento horizontal de uma faixa da imagem em y (para a prévia e para os riscos)
    const shiftAt = (y, i) => {
      const jitter = (hash(frame, i, seed + 1) - 0.5) * S * 0.0025;               // tremido do cabeçote
      const wob = Math.sin(TAU * (y / h) * 3 + TAU * 4 * u) * S * 0.0015;           // ondulação lenta
      const d = (y - bandY) / bandH;
      const tr = burst * Math.exp(-d * d) * S * 0.08 * (0.4 + hash(frame, i, seed + 2)); // rasgo na faixa
      return jitter + wob + tr;
    };

    // —— prévia (só sem transparent): canais R e GB em faixas, desalinhados
    if (!p.transparent && state.scene) {
      const { red, gb, W, H } = state.scene;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      // faixas com altura inteira em px reais: com 'lighter', qualquer sobreposição vira uma linha clara
      const rows = Math.ceil(H / STRIPS), n = Math.ceil(H / rows);
      const sH = rows, sh = rows * (h / H);
      const b = S * 0.006 * p.bleed;
      const rollY = Math.round((burst * Math.sin(TAU * 3 * u) * S * 0.006 * H) / h) * (h / H); // pulo vertical no surto (px inteiro)
      const passes = [
        [red, 0.7, b * 0.5],
        [red, 0.3, b * 2.2],
        [gb, 0.75, -b * 0.5],
        [gb, 0.25, -b * 2],
      ];
      for (let k = 0; k < passes.length; k++) {
        const [src, a, off] = passes[k];
        ctx.globalCompositeOperation = k === 0 ? 'source-over' : 'lighter';
        ctx.globalAlpha = a;
        for (let i = 0; i < n; i++) {
          const y = i * sh;
          const hh = Math.min(sH, H - i * sH);
          const dx = shiftAt(y + sh / 2, i) + off;
          ctx.drawImage(src, 0, i * sH, W, hh, dx, y + rollY, w, hh * (h / H));
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // leve desbotado (fita gasta): véu claro e baixo contraste
      ctx.fillStyle = 'rgba(40,30,60,0.12)';
      ctx.fillRect(0, 0, w, h);
    }

    // —— scanlines
    if (p.scanlines > 0) {
      const gap = Math.max(2, Math.round(S / 360));
      const lines = new Path2D();
      for (let y = 0; y < h; y += gap * 2) lines.rect(0, y, w, gap);
      ctx.fillStyle = `rgba(0,0,0,${0.22 * p.scanlines})`;
      ctx.fill(lines);
    }

    // —— chuvisco (mais forte dentro da faixa de tracking)
    if (p.noise > 0) {
      let pats = state.patterns.get(ctx);
      if (!pats) state.patterns.set(ctx, (pats = state.tiles.map((c) => ctx.createPattern(c, 'repeat'))));
      const sc = (S / 1080) * 1.8;
      const ox = Math.floor(hash(frame, seed, 3) * 160), oy = Math.floor(hash(frame, seed, 4) * 160);
      ctx.save();
      ctx.globalAlpha = clamp(p.noise * 0.5);
      ctx.scale(sc * 1.6, sc); // pontos levemente esticados na horizontal, como no sinal analógico
      ctx.translate(-ox, -oy);
      ctx.fillStyle = pats[frame % 3];
      ctx.fillRect(0, 0, w / (sc * 1.6) + 160, h / sc + 160);
      ctx.restore();
    }

    // —— faixa de tracking: véu claro, riscos brancos e de croma, e o rasgo escuro no meio
    const streaks = new Path2D();
    const mag = new Path2D();
    const cya = new Path2D();
    const th = Math.max(1, S * 0.0018);
    if (burst > 0.01) {
      const g = ctx.createLinearGradient(0, bandY - bandH, 0, bandY + bandH);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${0.22 * burst})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, bandY - bandH, w, bandH * 2);
      ctx.fillStyle = `rgba(0,0,0,${0.35 * burst})`;
      ctx.fillRect(0, bandY - bandH * 0.08, w, bandH * 0.16);
      const n = Math.round(60 * burst);
      for (let i = 0; i < n; i++) {
        const y = bandY + (hash(frame, i, seed + 10) - 0.5) * bandH * 1.8;
        const x = hash(frame, i, seed + 11) * w * 1.1 - w * 0.05;
        const L = S * (0.03 + hash(frame, i, seed + 12) * 0.45);
        const kind = hash(frame, i, seed + 13);
        (kind < 0.12 ? mag : kind < 0.24 ? cya : streaks).rect(x, y, L, th * (1 + hash(frame, i, 14) * 1.5));
      }
    }
    // riscos soltos pela tela (poucos por quadro) e riscos de croma (sangramento) seguindo o tremido
    const loose = Math.round(4 + 10 * p.noise);
    for (let i = 0; i < loose; i++) {
      if (hash(frame, i, seed + 20) > 0.55) continue;
      const y = hash(frame, i, seed + 21) * h;
      const x = hash(frame, i, seed + 22) * w;
      streaks.rect(x, y, S * (0.01 + hash(frame, i, seed + 23) * 0.12), th);
    }
    const nb = Math.round(14 * p.bleed);
    for (let i = 0; i < nb; i++) {
      const y = hash(frame, i, seed + 30) * h;
      const x = hash(frame, i, seed + 31) * w + shiftAt(y, i);
      const L = S * (0.04 + hash(frame, i, seed + 32) * 0.18);
      (i % 2 ? mag : cya).rect(x, y, L, th * 1.6);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill(streaks);
    ctx.fillStyle = 'rgba(255,40,150,0.32)';
    ctx.fill(mag);
    ctx.fillStyle = 'rgba(40,220,255,0.32)';
    ctx.fill(cya);

    // —— troca de cabeça no rodapé: faixa escura com serrilhado claro, sempre presente
    const hsH = S * 0.022;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, h - hsH, w, hsH);
    const hs = new Path2D();
    for (let i = 0; i < 22; i++) {
      hs.rect(hash(frame, i, 40) * w * 1.1 - w * 0.05, h - hsH + hash(frame, i, 41) * hsH, S * (0.02 + hash(frame, i, 42) * 0.22), Math.max(1, S * 0.0022));
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill(hs);

    // —— OSD do videocassete
    if (p.osd) {
      const fs = S * 0.046;
      const mx = Math.max(S * 0.07, w * 0.05), my = S * 0.07;
      ctx.font = `700 ${fs}px "JetBrains Mono", monospace`;
      ctx.textBaseline = 'alphabetic';
      const blink = frame % 30 < 20;
      const jx = (hash(frame, 7, seed) - 0.5) * S * 0.0015; // o OSD também treme um pouco
      const items = [
        [blink ? 'PLAY ▶' : 'PLAY', mx, my + fs, 'left'],
        ['SP', w - mx, my + fs, 'right'],
        [p.time, mx, h - my - fs * 1.25, 'left'],
        [p.date, mx, h - my, 'left'],
      ];
      for (const [txt, x, y, al] of items) {
        if (!txt) continue;
        ctx.textAlign = al;
        // sombra dura + franjas de croma + branco
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillText(txt, x + jx + fs * 0.07, y + fs * 0.07);
        ctx.fillStyle = 'rgba(255,40,140,0.5)';
        ctx.fillText(txt, x + jx - fs * 0.06, y);
        ctx.fillStyle = 'rgba(40,220,255,0.5)';
        ctx.fillText(txt, x + jx + fs * 0.06, y);
        ctx.fillStyle = 'rgba(250,250,245,0.94)';
        ctx.fillText(txt, x + jx, y);
      }
      ctx.textAlign = 'left';
    }

    // —— vinheta de tubo
    const R = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(w / 2, h / 2, R * 0.55, w / 2, h / 2, R);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
};
