import { TAU, rng, rgba, mixHex, clamp } from '../lib/anim.js';

// Overlay de película (grão, arranhões, poeira, flicker, vinheta) ou de VHS (scanlines, faixa de tracking,
// ruído de linha, OSD). Tudo vem de hash determinístico do número do quadro (24 qps, módulo a duração),
// então render(t) é puro e o loop fecha. Com `transparent` só o overlay é desenhado (exporte com --alpha):
// o grão e o flicker usam preto/branco com alpha, sem modos de mescla que dependam do fundo.

const FPS = 24;

const hash = (a, b = 0, c = 0) => {
  let x = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

// Tile de grão com alpha: pixels pretos ou brancos, opacidade ~ |gauss|.
function grainTile(size, rand, strength) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rand() + rand() + rand() - 1.5) / 1.5; // ~gauss em [-1, 1]
    const on = v > 0 ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = on;
    img.data[i + 3] = Math.min(255, Math.abs(v) * 255 * strength);
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Cena de prévia (só quando transparent = false): pôr do sol simples, para ver o overlay agindo.
function preview(ctx, w, h, bg) {
  const S = Math.min(w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, mixHex(bg, '#1b2a4a', 0.6));
  sky.addColorStop(0.55, mixHex(bg, '#e08a5a', 0.75));
  sky.addColorStop(1, mixHex(bg, '#3a2430', 0.6));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sx = w * 0.62, sy = h * 0.6;
  const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, S * 0.5);
  sun.addColorStop(0, 'rgba(255,232,190,0.95)');
  sun.addColorStop(0.12, 'rgba(255,200,140,0.8)');
  sun.addColorStop(0.13, 'rgba(255,170,110,0.35)');
  sun.addColorStop(1, 'rgba(255,140,90,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  const hills = [
    [0.66, '#4a2c36', 0.05, 2.1],
    [0.74, '#2f1d27', 0.06, 3.3],
    [0.84, '#1a1118', 0.04, 1.4],
  ];
  for (const [y0, col, amp, f] of hills) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 48; i++) {
      const x = (i / 48) * w;
      ctx.lineTo(x, h * y0 + Math.sin((i / 48) * TAU * f + y0 * 9) * S * amp + Math.sin((i / 48) * TAU * f * 3.1) * S * amp * 0.3);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }
}

export default {
  id: 'film-overlay',
  title: 'Film / VHS',
  description: 'A film overlay (grain, scratches, dust, flicker, vignette) or a VHS tape look with scanlines, tracking and OSD.',
  category: 'transicoes',
  tags: ['overlay', 'alpha', 'loop'],
  duration: 4,

  params: {
    style: { type: 'select', label: 'Style', options: ['filme', 'vhs'], default: 'filme' },
    transparent: { type: 'boolean', label: 'Transparent background', default: true },
    grain: { type: 'range', label: 'Grain', min: 0, max: 1, step: 0.01, default: 0.5 },
    damage: { type: 'range', label: 'Scratches and dust', min: 0, max: 1, step: 0.01, default: 0.5 },
    flicker: { type: 'range', label: 'Flicker', min: 0, max: 1, step: 0.01, default: 0.5 },
    vignette: { type: 'range', label: 'Vignette', min: 0, max: 1, step: 0.01, default: 0.55 },
    tint: { type: 'color', label: 'Tint', default: '#ffb36b' },
    osd: { type: 'boolean', label: 'OSD (VHS)', default: true },
    bg: { type: 'color', label: 'Preview', default: '#806050' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 9 },
  },

  setup({ p }) {
    const rand = rng(p.seed);
    return { tiles: [0, 1, 2].map(() => grainTile(192, rand, 0.9)), patterns: new WeakMap() };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    if (!p.transparent) preview(ctx, w, h, p.bg);
    const S = Math.min(w, h);
    const nF = Math.round(duration * FPS);
    const frame = ((Math.floor(t * FPS) % nF) + nF) % nF;
    const seed = p.seed * 7919;
    const vhs = p.style === 'vhs';

    // —— tom (leve) e flicker de exposição
    ctx.fillStyle = rgba(p.tint, vhs ? 0.03 : 0.07);
    ctx.fillRect(0, 0, w, h);
    if (p.flicker > 0) {
      const slow = Math.sin(TAU * 2 * (frame / nF)) * 0.3 + Math.sin(TAU * 5 * (frame / nF) + 1) * 0.2;
      const f = ((hash(frame, seed, 1) - 0.5) * 1.6 + slow) * p.flicker;
      ctx.fillStyle = f > 0 ? `rgba(255,248,235,${0.05 * f})` : `rgba(0,0,0,${-0.09 * f})`;
      ctx.fillRect(0, 0, w, h);
    }

    // —— grão
    if (p.grain > 0) {
      let pats = state.patterns.get(ctx);
      if (!pats) state.patterns.set(ctx, (pats = state.tiles.map((c) => ctx.createPattern(c, 'repeat'))));
      const sc = (S / 1080) * (vhs ? 1.6 : 1.25);
      const ox = Math.floor(hash(frame, seed, 2) * 192), oy = Math.floor(hash(frame, seed, 3) * 192);
      ctx.save();
      ctx.globalAlpha = clamp(p.grain * (vhs ? 0.55 : 0.7));
      ctx.scale(sc, sc);
      ctx.translate(-ox, -oy);
      ctx.fillStyle = pats[frame % 3];
      ctx.fillRect(0, 0, w / sc + 192, h / sc + 192);
      ctx.restore();
    }

    if (!vhs) {
      // —— arranhões verticais: até 4 "vagas", cada uma vive alguns quadros e anda pouco
      const dmg = p.damage;
      for (let sI = 0; sI < 4; sI++) {
        const life = 5 + Math.floor(hash(sI, seed, 4) * 10);
        const ep = Math.floor((frame + sI * 13) / life);
        if (hash(sI, ep, seed) > dmg * 0.75) continue;
        const k = ((frame + sI * 13) % life) / life;
        const x = (0.05 + 0.9 * hash(sI, ep, seed + 1)) * w + k * S * 0.01 * (hash(ep, sI) - 0.5);
        const light = hash(sI, ep, seed + 2) < 0.55;
        const y0 = hash(sI, ep, seed + 3) < 0.5 ? 0 : h * hash(sI, ep, seed + 5) * 0.6;
        const y1 = y0 + h * (0.4 + hash(sI, ep, seed + 6) * 0.8);
        ctx.strokeStyle = light ? 'rgba(255,250,240,0.32)' : 'rgba(0,0,0,0.38)';
        ctx.lineWidth = S * (0.0011 + hash(sI, ep, 7) * 0.0012);
        ctx.beginPath();
        const segs = 10;
        for (let i = 0; i <= segs; i++) {
          const yy = y0 + ((y1 - y0) * i) / segs;
          const xx = x + (hash(sI, ep * 31 + i, seed) - 0.5) * S * 0.0025;
          i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }

      // —— poeira e fios: um quadro só cada (como na projeção real)
      const n = Math.round(dmg * 9 * (0.4 + hash(frame, seed, 8)));
      const dark = new Path2D();
      const hairs = new Path2D();
      const lightP = new Path2D();
      for (let i = 0; i < n; i++) {
        const x = hash(frame, i, seed + 10) * w;
        const y = hash(frame, i, seed + 11) * h;
        const r = S * (0.0012 + hash(frame, i, seed + 12) ** 3 * 0.006);
        const kind = hash(frame, i, seed + 13);
        if (kind < 0.18) {
          // fio de cabelo: curva
          const L = S * (0.02 + hash(frame, i, 14) * 0.05);
          const a = hash(frame, i, 15) * TAU;
          hairs.moveTo(x, y);
          hairs.bezierCurveTo(
            x + Math.cos(a) * L * 0.5 + L * 0.3, y + Math.sin(a) * L * 0.5 - L * 0.2,
            x + Math.cos(a + 1) * L * 0.8, y + Math.sin(a + 1) * L * 0.8,
            x + Math.cos(a + 0.4) * L, y + Math.sin(a + 0.4) * L,
          );
        } else {
          const P = kind < 0.8 ? dark : lightP;
          // mancha irregular: 2 círculos sobrepostos
          P.moveTo(x + r, y);
          P.arc(x, y, r, 0, TAU);
          const r2 = r * 0.7;
          const dx = (hash(frame, i, 16) - 0.5) * r * 1.6, dy = (hash(frame, i, 17) - 0.5) * r * 1.6;
          P.moveTo(x + dx + r2, y + dy);
          P.arc(x + dx, y + dy, r2, 0, TAU);
        }
      }
      ctx.fillStyle = 'rgba(10,8,6,0.75)';
      ctx.fill(dark);
      ctx.fillStyle = 'rgba(255,250,240,0.55)';
      ctx.fill(lightP);
      ctx.strokeStyle = 'rgba(10,8,6,0.6)';
      ctx.lineWidth = S * 0.0012;
      ctx.stroke(hairs);
    } else {
      // —— VHS: scanlines
      const gap = Math.max(2, Math.round(S / 360));
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      const lines = new Path2D();
      for (let y = 0; y < h; y += gap * 2) lines.rect(0, y, w, gap);
      ctx.fill(lines);

      // faixa de tracking rolando de baixo para cima (1 volta por loop)
      const u = frame / nF;
      const bandY = (1 - u) * (h * 1.3) - h * 0.15;
      const bandH = S * (0.05 + 0.03 * p.damage);
      const g = ctx.createLinearGradient(0, bandY - bandH, 0, bandY + bandH);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${0.07 + 0.08 * p.damage})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, bandY - bandH, w, bandH * 2);
      // ruído de linha dentro da faixa e algumas linhas soltas
      const streaks = new Path2D();
      const colored = [new Path2D(), new Path2D()];
      const nS = Math.round(10 + 30 * p.damage);
      for (let i = 0; i < nS; i++) {
        const inBand = i < nS * 0.7;
        const y = inBand ? bandY + (hash(frame, i, seed + 20) - 0.5) * bandH * 2 : hash(frame, i, seed + 21) * h;
        if (!inBand && hash(frame, i, seed + 22) > p.damage * 0.5) continue;
        const x = hash(frame, i, seed + 23) * w;
        const L = S * (0.02 + hash(frame, i, seed + 24) * (inBand ? 0.5 : 0.25));
        const th = Math.max(1, S * 0.0018);
        if (hash(frame, i, seed + 25) < 0.2) colored[i % 2].rect(x, y, L, th * 1.4);
        else streaks.rect(x, y, L, th);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill(streaks);
      ctx.fillStyle = 'rgba(255,40,140,0.35)';
      ctx.fill(colored[0]);
      ctx.fillStyle = 'rgba(40,220,255,0.35)';
      ctx.fill(colored[1]);
      // faixa de ruído forte no rodapé (head switching)
      const hsH = S * 0.018;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, h - hsH, w, hsH);
      const hs = new Path2D();
      for (let i = 0; i < 18; i++) {
        hs.rect(hash(frame, i, 40) * w, h - hsH + hash(frame, i, 41) * hsH, S * (0.03 + hash(frame, i, 42) * 0.2), Math.max(1, S * 0.002));
      }
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill(hs);

      if (p.osd) {
        const fs = S * 0.042;
        const m = S * 0.06;
        ctx.font = `700 ${fs}px "JetBrains Mono", monospace`;
        ctx.textBaseline = 'top';
        const sec = Math.floor(t);
        const tc = `0:00:${String(sec).padStart(2, '0')}`;
        const items = [
          ['PLAY ▶', m, m, 'left'],
          ['SP', w - m, m, 'right'],
          [tc, m, h - m - fs, 'left'],
        ];
        const blink = frame % 24 < 16; // "PLAY" pisca devagar
        for (const [txt, x, y, al] of items) {
          if (txt.startsWith('PLAY') && !blink) continue;
          ctx.textAlign = al;
          ctx.fillStyle = 'rgba(255,40,120,0.55)';
          ctx.fillText(txt, x - fs * 0.06, y);
          ctx.fillStyle = 'rgba(40,220,255,0.55)';
          ctx.fillText(txt, x + fs * 0.06, y);
          ctx.fillStyle = 'rgba(245,245,245,0.92)';
          ctx.fillText(txt, x, y);
        }
        ctx.textAlign = 'left';
      }
    }

    // —— vinheta
    if (p.vignette > 0) {
      const R = Math.hypot(w, h) / 2;
      const g = ctx.createRadialGradient(w / 2, h / 2, R * (vhs ? 0.55 : 0.45), w / 2, h / 2, R);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, `rgba(0,0,0,${0.35 * p.vignette})`);
      g.addColorStop(1, `rgba(0,0,0,${0.85 * p.vignette})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  },
};
