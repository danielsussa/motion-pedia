import { TAU, rng, clamp, smoothstep, hexToRgb } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Voo rasante por um vale low-poly. O relevo é uma malha com vértices tremidos, periódica em z
// (ruído num círculo do simplex 3D), e a câmera percorre um número inteiro de períodos por loop,
// seguindo um rio sinuoso também periódico. Cada face recebe luz chapada (Lambert) e névoa;
// as faces são agrupadas por cor (luz × névoa quantizadas) para preencher em lote.

const P = 64; // linhas da malha por período (em z)
const C = 52; // colunas para cada lado
const NC = C * 2 + 1;
const FAR = 40; // alcance da câmera (em células)
const Q = 16; // níveis de luz
const FQ = 24; // níveis de névoa

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const pathX = (z) => 6.5 * Math.sin((TAU * z) / P) + 2.6 * Math.sin((TAU * 2 * z) / P + 1.3);

export default {
  id: 'low-poly-terrain',
  title: 'Low-poly Terrain',
  description: 'A low flight through a valley of low-poly mountains, with flat per-face lighting, a river and haze on the horizon.',
  category: 'fundos',
  tags: ['background', 'loop', '3d'],
  duration: 16,
  poster: 5,

  params: {
    skyTop: { type: 'color', label: 'Sky (top)', default: '#2a2d52' },
    fog: { type: 'color', label: 'Fog / horizon', default: '#f0b99a' },
    land: { type: 'color', label: 'Terrain', default: '#4b4f7a' },
    light: { type: 'color', label: 'Sunlight', default: '#ffc58f' },
    water: { type: 'color', label: 'Water', default: '#7fb2c9' },
    relief: { type: 'range', label: 'Relief', min: 0.4, max: 1.8, step: 0.01, default: 1 },
    speed: { type: 'range', label: 'Speed', min: 1, max: 3, step: 1, default: 1 },
    river: { type: 'boolean', label: 'River', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ w, h, p, px }) {
    const nz = createNoise(p.seed);
    const rand = rng(p.seed * 7 + 3);
    const R = P / TAU; // raio do círculo: 1 unidade de ruído por célula
    const H = new Float32Array(P * NC);
    const JX = new Float32Array(P * NC);
    const JZ = new Float32Array(P * NC);
    const sea = p.river ? 0 : -99;
    for (let j = 0; j < P; j++) {
      const a = (TAU * j) / P;
      const cy = Math.cos(a);
      const sy = Math.sin(a);
      for (let i = 0; i < NC; i++) {
        const k = j * NC + i;
        JX[k] = (rand() - 0.5) * 0.55;
        JZ[k] = (rand() - 0.5) * 0.55;
        const x = i - C + JX[k];
        // distância ao rio (aproximada em z da linha)
        const d = Math.abs(x - pathX(j));
        const f = 0.09;
        let ridge = 0;
        let amp = 1;
        let fr = f;
        for (let o = 0; o < 4; o++) {
          const n = nz.noise3(x * fr + 31, cy * R * fr, sy * R * fr + o * 7.7);
          ridge += (1 - Math.abs(n)) * amp;
          amp *= 0.45;
          fr *= 2.1;
        }
        ridge /= 1.8;
        const hill = nz.noise3(x * 0.2, cy * R * 0.2 + 50, sy * R * 0.2);
        const v = smoothstep(0.9, 6, d);
        const v2 = smoothstep(6, 28, d);
        let y = -0.45 + 0.35 * hill + v * (0.8 + 4.5 * ridge * ridge) + v2 * 7 * ridge ** 3;
        y *= p.relief;
        H[k] = Math.max(sea, y);
      }
    }

    // Paleta: [névoa][luz]
    const land = hexToRgb(p.land);
    const lightC = hexToRgb(p.light);
    const fogC = hexToRgb(p.fog);
    const waterC = hexToRgb(p.water);
    const dark = mixc(land, [0, 0, 0], 0.55);
    const pal = [];
    const wpal = [];
    for (let f = 0; f < FQ; f++) {
      const fk = f / (FQ - 1);
      const row = [];
      for (let q = 0; q < Q; q++) {
        const l = q / (Q - 1);
        let c = mixc(dark, land, Math.min(1, l * 1.6));
        c = mixc(c, lightC, Math.max(0, l - 0.45) * 1.3);
        row.push(css(mixc(c, fogC, fk)));
      }
      pal.push(row);
      const wc = mixc(waterC, land, 0.15);
      wpal.push([0.975, 1, 1.025].map((s) => css(mixc(mixc(wc, [0, 0, 0], 1 - Math.min(1, s)).map((v) => Math.min(255, v * Math.max(1, s))), fogC, fk))));
    }

    // Céu pré-renderizado (maior que a tela, porque a câmera inclina).
    const S = 1.5;
    const sky = document.createElement('canvas');
    sky.width = Math.ceil(w * S * px);
    sky.height = Math.ceil(h * S * px);
    const g = sky.getContext('2d');
    g.scale(px, px);
    const hyS = (h * S) / 2 + (h * horizonK(w, h) - h / 2);
    const gr = g.createLinearGradient(0, 0, 0, hyS);
    gr.addColorStop(0, p.skyTop);
    gr.addColorStop(0.45, css(mixc(hexToRgb(p.skyTop), fogC, 0.35)));
    gr.addColorStop(0.82, css(mixc(hexToRgb(p.skyTop), fogC, 0.85)));
    gr.addColorStop(1, p.fog);
    g.fillStyle = gr;
    g.fillRect(0, 0, w * S, h * S);
    g.fillStyle = p.fog;
    g.fillRect(0, hyS, w * S, h * S - hyS);

    // brilho do sol
    const glow = document.createElement('canvas');
    glow.width = glow.height = 256;
    const gg = glow.getContext('2d');
    const sg = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
    sg.addColorStop(0, 'rgba(255,255,255,0.7)');
    sg.addColorStop(0.12, 'rgba(255,255,255,0.35)');
    sg.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = sg;
    gg.fillRect(0, 0, 256, 256);
    gg.globalCompositeOperation = 'source-in';
    gg.fillStyle = p.light;
    gg.fillRect(0, 0, 256, 256);

    return { H, JX, JZ, pal, wpal, sky, S, glow, sea };
  },

  render(ctx, t, { w, h, p, px, progress: u, state }) {
    const { H, JX, JZ, pal, wpal, sky, S, glow, sea } = state;
    const m = Math.min(w, h);
    const cx = w / 2;
    const hy = h * horizonK(w, h);
    const F = m * 0.9;

    // Câmera segue o rio
    const zc = u * P * p.speed;
    const camX = pathX(zc);
    const look = 7;
    const yaw = Math.atan2(pathX(zc + look) - camX, look);
    const yawB = Math.atan2(pathX(zc + look - 2) - pathX(zc - 2), look);
    const roll = clamp((yaw - yawB) * 2.2, -0.12, 0.12);
    const camY = 2.3 * Math.max(0.7, p.relief) + 0.25 * Math.sin(TAU * 2 * u);
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);

    ctx.save();
    ctx.translate(cx, hy);
    ctx.rotate(roll);
    ctx.translate(-cx, -hy);
    ctx.drawImage(sky, cx - (w * S) / 2, hy - (h * S) / 2 - (h * horizonK(w, h) - h / 2), w * S, h * S);

    // Sol: direção fixa no mundo, projetada na câmera
    const L = norm([-0.42, 0.28, 0.86]);
    const sz = L[0] * sn + L[2] * cs;
    const sxp = L[0] * cs - L[2] * sn;
    const sunX = cx + (sxp / sz) * F;
    const sunY = hy - (L[1] / sz) * F;
    const gR = m * 0.55;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glow, sunX - gR, sunY - gR, gR * 2, gR * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.arc(sunX, sunY, m * 0.035, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Vértices visíveis
    const j0 = Math.floor(zc) - 1;
    const rows = FAR + 4;
    const nV = (rows + 1) * NC;
    const VX = new Float32Array(nV);
    const VY = new Float32Array(nV);
    const VD = new Float32Array(nV);
    const WX = new Float32Array(nV);
    const WY = new Float32Array(nV);
    const WZ = new Float32Array(nV);
    for (let r = 0; r <= rows; r++) {
      const j = j0 + r;
      const jm = ((j % P) + P) % P;
      for (let i = 0; i < NC; i++) {
        const k = jm * NC + i;
        const v = r * NC + i;
        const x = i - C + JX[k];
        const z = j + JZ[k];
        const y = H[k];
        const dx = x - camX;
        const dz = z - zc;
        const fz = dx * sn + dz * cs;
        const fx = dx * cs - dz * sn;
        WX[v] = x;
        WY[v] = y;
        WZ[v] = z;
        VD[v] = fz;
        if (fz > 0.05) {
          VX[v] = cx + (fx / fz) * F;
          VY[v] = hy - ((y - camY) / fz) * F;
        }
      }
    }

    const pad = m * 0.25;
    const x0 = -pad;
    const x1 = w + pad;
    const y1 = h + pad;
    const grow = 0.7 / px;
    const fogNear = 6;
    const fadeA = FAR - 7;

    // Faixas de profundidade (finas perto, largas longe), pintadas de trás para frente;
    // dentro de cada faixa, um Path2D por nível de luz (+3 tons de água).
    const binOf = (d) => (d < 12 ? d | 0 : d < 24 ? 12 + (((d - 12) / 2) | 0) : 18 + (((d - 24) / 3) | 0));
    const binMid = (b) => (b < 12 ? b + 0.5 : b < 18 ? 12 + (b - 12) * 2 + 1 : 24 + (b - 18) * 3 + 1.5);
    const NB = binOf(FAR) + 1;
    const NK = Q + 3;
    const bins = new Array(NB * NK).fill(null);
    for (let r = rows - 1; r >= 0; r--) {
      for (let i = 0; i < NC - 1; i++) {
        const a = r * NC + i;
        const b = a + 1;
        const c = a + NC;
        const d = c + 1;
        const flip = ((i * 7 + (j0 + r) * 13) & 3) < 2;
        for (let q = 0; q < 2; q++) {
          const ta = flip ? a : q ? b : a;
          const tb = flip ? (q ? d : b) : q ? d : b;
          const td = flip ? (q ? c : d) : c;
          const dmin = Math.min(VD[ta], VD[tb], VD[td]);
          if (dmin < 0.35) continue;
          const dm = (VD[ta] + VD[tb] + VD[td]) / 3;
          if (dm >= FAR) continue;
          const ax = VX[ta];
          const bx = VX[tb];
          const dx2 = VX[td];
          if ((ax < x0 && bx < x0 && dx2 < x0) || (ax > x1 && bx > x1 && dx2 > x1)) continue;
          if (VY[ta] > y1 && VY[tb] > y1 && VY[td] > y1) continue;
          let k;
          if (WY[ta] <= sea + 1e-4 && WY[tb] <= sea + 1e-4 && WY[td] <= sea + 1e-4) k = Q + ((ta * 7 + tb * 3) % 3);
          else {
            // normal da face
            const ux = WX[tb] - WX[ta];
            const uy = WY[tb] - WY[ta];
            const uz = WZ[tb] - WZ[ta];
            const vx = WX[td] - WX[ta];
            const vy = WY[td] - WY[ta];
            const vz = WZ[td] - WZ[ta];
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nzz = ux * vy - uy * vx;
            if (ny < 0) {
              nx = -nx;
              ny = -ny;
              nzz = -nzz;
            }
            const nl = Math.hypot(nx, ny, nzz) || 1;
            const lam = Math.max(0, (nx * L[0] + ny * L[1] + nzz * L[2]) / nl);
            k = Math.round(Math.pow(lam, 1.2) * (Q - 1));
          }
          const slot = binOf(dm) * NK + k;
          let path = bins[slot];
          if (!path) path = bins[slot] = new Path2D();
          // cresce o triângulo ~0,7 px a partir do centróide: tapa as frestas de antialias sem stroke
          const ay = VY[ta];
          const by = VY[tb];
          const dy2 = VY[td];
          const gx = (ax + bx + dx2) / 3;
          const gy = (ay + by + dy2) / 3;
          const ea = 1 + grow / (Math.hypot(ax - gx, ay - gy) + 1e-3);
          const eb = 1 + grow / (Math.hypot(bx - gx, by - gy) + 1e-3);
          const ed = 1 + grow / (Math.hypot(dx2 - gx, dy2 - gy) + 1e-3);
          path.moveTo(gx + (ax - gx) * ea, gy + (ay - gy) * ea);
          path.lineTo(gx + (bx - gx) * eb, gy + (by - gy) * eb);
          path.lineTo(gx + (dx2 - gx) * ed, gy + (dy2 - gy) * ed);
          path.closePath();
        }
      }
    }
    for (let bi = NB - 1; bi >= 0; bi--) {
      const dm = binMid(bi);
      const fi = Math.round(Math.pow(clamp((dm - fogNear) / (fadeA + 2 - fogNear)), 0.8) * (FQ - 1));
      // alfa só nas faixas da borda do alcance (o relevo surge de dentro da névoa)
      const al = dm > fadeA ? 1 - smoothstep(fadeA, FAR, dm) : 1;
      ctx.globalAlpha = al;
      for (let k = 0; k < NK; k++) {
        const path = bins[bi * NK + k];
        if (!path) continue;
        const col = k >= Q ? wpal[fi][k - Q] : pal[fi][k];
        ctx.fillStyle = col;
        ctx.fill(path);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};

function horizonK(w, h) {
  return w > h ? 0.4 : w === h ? 0.42 : h / w > 1.5 ? 0.5 : 0.45;
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
