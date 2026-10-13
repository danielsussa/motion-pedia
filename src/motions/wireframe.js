import { TAU, clamp, ease, mixHex, rgba, smoothstep } from '../lib/anim.js';
import { rotate, project } from '../lib/space.js';

// Sólidos platônicos em wireframe girando. Na troca, as arestas do sólido que sai se recolhem
// (cada uma encolhe até o seu ponto médio, em stagger) enquanto as do próximo crescem a partir do meio.
// Arestas da frente são claras e mais grossas, as de trás somem na névoa. Rotação inteira por loop.

const PHI = (1 + Math.sqrt(5)) / 2;

function solid(verts) {
  const v = verts.map((p) => {
    const l = Math.hypot(...p);
    return p.map((c) => c / l);
  });
  let min = Infinity;
  for (let a = 0; a < v.length; a++)
    for (let b = a + 1; b < v.length; b++) min = Math.min(min, Math.hypot(v[a][0] - v[b][0], v[a][1] - v[b][1], v[a][2] - v[b][2]));
  const e = [];
  for (let a = 0; a < v.length; a++)
    for (let b = a + 1; b < v.length; b++)
      if (Math.hypot(v[a][0] - v[b][0], v[a][1] - v[b][1], v[a][2] - v[b][2]) < min * 1.01) e.push([a, b]);
  return { v, e };
}

const perms = (x, y, z) => [[x, y, z], [y, z, x], [z, x, y]];
const signs = (pts) =>
  pts.flatMap(([x, y, z]) => {
    const out = [];
    for (const sx of x ? [-1, 1] : [1]) for (const sy of y ? [-1, 1] : [1]) for (const sz of z ? [-1, 1] : [1]) out.push([x * sx, y * sy, z * sz]);
    return out;
  });

const SOLIDS = [
  { name: 'TETRAHEDRON', ...solid([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]) },
  { name: 'CUBE', ...solid(signs([[1, 1, 1]])) },
  { name: 'OCTAHEDRON', ...solid(signs([[1, 0, 0], [0, 1, 0], [0, 0, 1]])) },
  { name: 'DODECAHEDRON', ...solid([...signs([[1, 1, 1]]), ...signs(perms(0, 1 / PHI, PHI))]) },
  { name: 'ICOSAHEDRON', ...solid(signs(perms(0, 1, PHI))) },
];

export default {
  id: 'wireframe',
  title: 'Wireframe Solids',
  description: 'The five Platonic solids spinning in wireframe perspective; the edges retract and regrow with every swap.',
  category: 'formas',
  tags: ['3d', 'shape', 'loop'],
  duration: 12.5,

  params: {
    color: { type: 'color', label: 'Line', default: '#e9f1ff' },
    accent: { type: 'color', label: 'Accent', default: '#6c8cff' },
    bg: { type: 'color', label: 'Background', default: '#07080c' },
    size: { type: 'range', label: 'Size', min: 0.15, max: 0.45, step: 0.01, default: 0.32 },
    width: { type: 'range', label: 'Thickness', min: 0.5, max: 8, step: 0.1, default: 3 },
    inner: { type: 'boolean', label: 'Inner solid', default: true },
    glow: { type: 'boolean', label: 'Glow', default: true },
    label: { type: 'boolean', label: 'Caption', default: true },
  },

  render(ctx, t, { w, h, p, px, duration, progress: u }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;

    // halo atrás
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.6);
    g.addColorStop(0, rgba(p.accent, 0.16));
    g.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const n = SOLIDS.length;
    const segLen = duration / n;
    const tl = ((t % duration) + duration) % duration;
    const i = Math.floor(tl / segLen);
    const f = (tl - i * segLen) / segLen;

    const R = m * p.size;
    const rot = {
      rx: 0.45 + 0.25 * Math.sin(TAU * u),
      ry: TAU * 2 * u,
      rz: 0.15 * Math.sin(TAU * 2 * u),
    };
    const cam = { cx, cy, fov: m * 2.2, dist: m * 2.2 };
    const lw = (p.width * m) / 1080;

    const drawSolid = (S, scale, grow, alphaMul, rotExtra) => {
      // grow: 1 = completo, 0 = sumido (cada aresta tem atraso próprio)
      const P = S.v.map((v) => {
        const r = rotate(rotate(v, rot), rotExtra);
        return [r[0] * scale, r[1] * scale, r[2] * scale];
      });
      const ne = S.e.length;
      const items = S.e.map(([a, b], k) => {
        const delay = ne > 1 ? (k / (ne - 1)) * 0.5 : 0;
        const gk = ease.outCubic(clamp((grow - delay) / 0.5));
        const A = P[a];
        const B = P[b];
        const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
        const a3 = [M[0] + (A[0] - M[0]) * gk, M[1] + (A[1] - M[1]) * gk, M[2] + (A[2] - M[2]) * gk];
        const b3 = [M[0] + (B[0] - M[0]) * gk, M[1] + (B[1] - M[1]) * gk, M[2] + (B[2] - M[2]) * gk];
        return { a: project(a3, cam), b: project(b3, cam), z: M[2] / scale, gk };
      });
      // 3 camadas de profundidade (de trás para frente), um stroke por camada
      const bands = [[], [], []];
      for (const it of items) {
        if (it.gk <= 0.001) continue;
        const d = (it.z + 1) / 2; // 0 = frente, 1 = fundo (z positivo é longe)
        bands[d > 0.62 ? 0 : d > 0.38 ? 1 : 2].push(it);
      }
      bands.forEach((band, bi) => {
        if (!band.length) return;
        const front = bi / 2; // 0 fundo … 1 frente
        ctx.strokeStyle = mixHex(p.accent, p.color, 0.25 + 0.75 * front);
        ctx.globalAlpha = alphaMul * (0.25 + 0.75 * front);
        ctx.lineWidth = lw * (0.55 + 0.6 * front);
        ctx.shadowColor = p.accent;
        ctx.shadowBlur = p.glow && bi === 2 ? lw * 5 * px : 0;
        ctx.beginPath();
        for (const it of band) {
          ctx.moveTo(it.a.x, it.a.y);
          ctx.lineTo(it.b.x, it.b.y);
        }
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
      // vértices
      ctx.globalAlpha = alphaMul;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      const vr = ease.outCubic(clamp(grow * 1.4 - 0.4));
      if (vr > 0) {
        for (const q of P) {
          const pr = project(q, cam);
          const d = (q[2] / scale + 1) / 2;
          const r = lw * (1.7 - 0.9 * d) * vr;
          ctx.moveTo(pr.x + r, pr.y);
          ctx.arc(pr.x, pr.y, r, 0, TAU);
        }
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    ctx.lineCap = 'round';
    const S = SOLIDS[i];
    const N = SOLIDS[(i + 1) % n];
    const k = ease.inOutCubic(smoothstep(0.62, 1, f)); // progresso da troca
    const seedRot = { ry: -TAU * 4 * u, rx: TAU * u };
    const scaleRot = (r, s) => ({ rx: r.rx * s, ry: r.ry * s });
    // atual: completo, depois recolhe as arestas
    if (k < 1) drawSolid(S, R * (1 + 0.08 * k), 1 - k, 1, {});
    if (p.inner) {
      // o próximo cresce da "semente" interna até o tamanho cheio
      drawSolid(N, R * (0.36 + 0.64 * k), 1, 0.45 + 0.55 * k, scaleRot(seedRot, 1 - k));
      // e uma nova semente nasce no centro
      const NN = SOLIDS[(i + 2) % n];
      if (k > 0) drawSolid(NN, R * 0.36, k, 0.45, seedRot);
    } else if (k > 0) {
      drawSolid(N, R, k, 1, {});
    }

    if (p.label) {
      const fs = Math.round(m * 0.02);
      ctx.font = `500 ${fs}px "JetBrains Mono"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const vis = 1 - Math.sin(Math.PI * k);
      ctx.fillStyle = rgba(p.color, 0.35);
      const ly = Math.min(h - m * 0.07, cy + R * 1.55);
      const L = k < 0.5 ? S : N;
      ctx.fillText(`${L.v.length} V · ${L.e.length} E`, cx, ly + fs * 1.7);
      ctx.fillStyle = rgba(p.color, 0.85 * vis);
      ctx.fillText(L.name.split('').join(' '), cx, ly);
    }
  },
};
