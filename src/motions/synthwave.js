import { TAU, rng, rgba, fract, mixHex } from '../lib/anim.js';
import { project } from '../lib/space.js';
import { createNoise } from '../lib/noise.js';

export default {
  id: 'synthwave',
  title: 'Synthwave Grid',
  description: 'A neon perspective grid racing toward the horizon, with a striped sun and mountains. Seamless loop.',
  category: 'fundos',
  tags: ['background', 'loop', '3d', 'pattern'],
  duration: 8,

  params: {
    grid: { type: 'color', label: 'Grid', default: '#ff3ec8' },
    sunTop: { type: 'color', label: 'Sun (top)', default: '#ffd36b' },
    sunBottom: { type: 'color', label: 'Sun (bottom)', default: '#ff2d8a' },
    sky: { type: 'color', label: 'Sky', default: '#120726' },
    speed: { type: 'range', label: 'Speed', min: 1, max: 8, step: 1, default: 3 },
    sunSize: { type: 'range', label: 'Sun size', min: 0.15, max: 0.45, step: 0.01, default: 0.3 },
    mountains: { type: 'boolean', label: 'Mountains', default: true },
    stars: { type: 'boolean', label: 'Stars', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  setup({ p }) {
    const rand = rng(p.seed);
    const nz = createNoise(p.seed);
    // Perfis de montanha em coordenadas normalizadas (x 0..1 → altura 0..1), feitos uma vez.
    const ridge = (freq, sharp, off) =>
      Array.from({ length: 161 }, (_, i) => {
        const x = i / 160;
        const v = nz.fbm2(x * freq + off, off, 4) * 0.5 + 0.5;
        const valley = Math.pow(Math.abs(x - 0.5) * 2, 1.6); // vale no centro, deixa o sol aparecer
        return Math.max(0, Math.pow(v, sharp) * (0.25 + 0.75 * valley));
      });
    const stars = Array.from({ length: 140 }, () => ({ x: rand(), y: rand(), r: 0.4 + rand() * 1.1, a: 0.2 + rand() * 0.7 }));
    return { far: ridge(3.5, 1.4, 11), near: ridge(5, 1.8, 37), stars };
  },

  render(ctx, t, { w, h, p, px, progress: u, state }) {
    const m = Math.min(w, h);
    const hy = Math.round(h * (w > h ? 0.6 : 0.56)); // linha do horizonte
    const cx = w / 2;

    // Céu
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, p.sky);
    sky.addColorStop(0.65, mixHex(p.sky, p.sunBottom, 0.22));
    sky.addColorStop(1, mixHex(p.sky, p.sunBottom, 0.55));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, hy);

    if (p.stars) {
      ctx.fillStyle = '#ffffff';
      for (const s of state.stars) {
        if (s.y * hy > hy * 0.7) continue;
        ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(TAU * (2 * u + s.x * 7)));
        const r = s.r * m * 0.0018;
        ctx.fillRect(s.x * w - r / 2, s.y * hy * 0.75 - r / 2, r, r);
      }
      ctx.globalAlpha = 1;
    }

    // Sol listrado: clip com faixas visíveis; as frestas descem e engrossam até o horizonte.
    const R = m * p.sunSize;
    const sy = hy - R * 0.38;
    const halo = ctx.createRadialGradient(cx, sy, R * 0.6, cx, sy, R * 2.4);
    halo.addColorStop(0, rgba(p.sunBottom, 0.35));
    halo.addColorStop(1, rgba(p.sunBottom, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, hy);

    ctx.save();
    const top = sy - R;
    const bandStart = sy - R * 0.5;
    const span = hy - bandStart;
    const clip = new Path2D();
    clip.rect(cx - R, top, R * 2, R * 2);
    const N = 5;
    const f = fract(u * 2); // as frestas descem 2 posições por loop
    for (let i = 0; i < N; i++) {
      const k = (i + f) / N;
      const gap = R * 0.13 * k * k + R * 0.006; // fresta nasce fina e engrossa perto da base
      clip.rect(cx - R, bandStart + k * span - gap / 2, R * 2, gap);
    }
    ctx.clip(clip, 'evenodd');
    const sg = ctx.createLinearGradient(0, top, 0, sy + R * 0.4);
    sg.addColorStop(0, p.sunTop);
    sg.addColorStop(1, p.sunBottom);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, sy, R, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Montanhas
    if (p.mountains) {
      const drawRidge = (pts, height, fill, line) => {
        const path = new Path2D();
        path.moveTo(0, hy);
        pts.forEach((v, i) => path.lineTo((i / (pts.length - 1)) * w, hy - v * height));
        path.lineTo(w, hy);
        path.closePath();
        ctx.fillStyle = fill;
        ctx.fill(path);
        const edge = new Path2D();
        pts.forEach((v, i) => edge.lineTo((i / (pts.length - 1)) * w, hy - v * height));
        ctx.strokeStyle = line;
        ctx.lineWidth = m * 0.0025;
        ctx.stroke(edge);
      };
      drawRidge(state.far, m * 0.22, mixHex(p.sky, p.grid, 0.12), rgba(p.grid, 0.35));
      drawRidge(state.near, m * 0.13, mixHex(p.sky, '#000000', 0.25), rgba(p.grid, 0.7));
    }

    // Chão
    const floor = ctx.createLinearGradient(0, hy, 0, h);
    floor.addColorStop(0, mixHex(p.sky, p.grid, 0.18));
    floor.addColorStop(0.25, mixHex(p.sky, '#000000', 0.45));
    floor.addColorStop(1, mixHex(p.sky, '#000000', 0.7));
    ctx.fillStyle = floor;
    ctx.fillRect(0, hy, w, h - hy);

    // Grid em perspectiva com space.project. Câmera a camH acima do chão, olhando para +z.
    const cam = { cx, cy: hy, fov: m * 0.9, dist: 0 };
    const camH = 1;
    const cell = 1.6;
    const zFar = 160;
    const zNear = (camH * cam.fov) / (h - hy) * 0.95; // onde o chão sai pela base da tela
    const off = fract(u * p.speed) * cell;
    const lines = new Path2D();
    for (let k = 0; ; k++) {
      const z = zNear + k * cell - off + (cell - (zNear % cell)); // linhas alinhadas ao mundo
      if (z > zFar) break;
      const a = project([0, camH, z], cam);
      if (a.y > h + 2) continue;
      lines.moveTo(0, a.y);
      lines.lineTo(w, a.y);
    }
    const halfW = (w / 2 / cam.fov) * zNear + cell;
    const nCols = Math.ceil(halfW / cell);
    for (let i = -nCols; i <= nCols; i++) {
      const a = project([i * cell, camH, zNear], cam);
      const b = project([i * cell, camH, zFar], cam);
      lines.moveTo(a.x, a.y);
      lines.lineTo(b.x, b.y);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, hy, w, h - hy);
    ctx.clip();
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = m * 0.0028;
    ctx.shadowColor = p.grid;
    ctx.shadowBlur = m * 0.012 * px;
    ctx.stroke(lines);
    ctx.shadowBlur = 0;
    // névoa no horizonte esconde o serrilhado das linhas distantes
    const fog = ctx.createLinearGradient(0, hy, 0, hy + (h - hy) * 0.22);
    fog.addColorStop(0, rgba(p.sunBottom, 0.35));
    fog.addColorStop(0.3, rgba(p.sky, 0.45));
    fog.addColorStop(1, rgba(p.sky, 0));
    ctx.fillStyle = fog;
    ctx.fillRect(0, hy, w, h - hy);
    ctx.restore();

    // Linha do horizonte brilhante
    const hl = ctx.createLinearGradient(0, 0, w, 0);
    hl.addColorStop(0, rgba(p.grid, 0));
    hl.addColorStop(0.5, rgba(p.sunTop, 0.9));
    hl.addColorStop(1, rgba(p.grid, 0));
    ctx.fillStyle = hl;
    ctx.fillRect(0, hy - m * 0.0015, w, m * 0.003);
  },
};
