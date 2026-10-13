import { TAU, clamp, lerp, ease, spring, rgba } from '../lib/anim.js';

// Formas descritas por raios: para cada um dos N ângulos (a partir do topo, sentido horário) guardamos
// a distância do centro até o contorno. Todas as formas são "estreladas" em relação ao centro, então
// o morph é só uma interpolação de raios — sem torção e sem pontos cruzando.
const N = 360; // múltiplo de 8, 10 e 12: cantos do quadrado, triângulo e estrela caem em amostras exatas

function rayPolygon(verts) {
  const r = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * TAU;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Infinity;
    for (let k = 0; k < verts.length; k++) {
      const [x1, y1] = verts[k];
      const [x2, y2] = verts[(k + 1) % verts.length];
      const ex = x2 - x1;
      const ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const s = (x1 * ey - y1 * ex) / den; // distância ao longo do raio
      const u = (x1 * dy - y1 * dx) / den; // posição ao longo da aresta
      if (s > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, s);
    }
    r[i] = best;
  }
  return r;
}

const ngon = (n, R, a0 = -Math.PI / 2) =>
  Array.from({ length: n }, (_, k) => [R * Math.cos(a0 + (k * TAU) / n), R * Math.sin(a0 + (k * TAU) / n)]);

function starVerts(points, R, inner) {
  const v = [];
  for (let k = 0; k < points * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / points;
    const rr = k % 2 ? R * inner : R;
    v.push([rr * Math.cos(a), rr * Math.sin(a)]);
  }
  return v;
}

// Área parecida entre as formas para o "peso" visual não pular no morph.
function buildShapes(starPoints) {
  const circle = new Float32Array(N).fill(1);
  const square = rayPolygon(ngon(4, 1.18, -Math.PI / 4));
  const tri = rayPolygon(ngon(3, 1.32));
  const star = rayPolygon(starVerts(starPoints, 1.36, 0.5));
  const hex = rayPolygon(ngon(6, 1.08));
  return { circle, square, tri, star, hex };
}

const LABELS = { circle: 'CÍRCULO', square: 'QUADRADO', tri: 'TRIÂNGULO', star: 'ESTRELA', hex: 'HEXÁGONO' };
const SEQ = ['circle', 'square', 'tri', 'star', 'hex'];
// Rotação acumulada no início de cada forma (graus): 0, 90 (quadrado: sim. 90), 240 (triângulo: 120),
// 360 (estrela: 72), 420 (hexágono: 60), 540 (círculo).
const ROT = [0, 90, 240, 360, 420, 540].map((d) => (d * Math.PI) / 180);

export default {
  id: 'shape-morph',
  title: 'Shape Morph',
  description: 'Uma forma central vira círculo, quadrado, triângulo, estrela e hexágono com mola, cercada por ecos e satélites em stagger.',
  category: 'formas',
  tags: ['forma', 'loop'],
  duration: 10,
  poster: 3.1,

  params: {
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    ink: { type: 'color', label: 'Traço', default: '#f1ede4' },
    bg: { type: 'color', label: 'Fundo', default: '#0f0f13' },
    size: { type: 'range', label: 'Tamanho', min: 0.12, max: 0.34, step: 0.01, default: 0.22 },
    satellites: { type: 'range', label: 'Satélites', min: 0, max: 16, step: 1, default: 10 },
    echoes: { type: 'range', label: 'Ecos', min: 0, max: 5, step: 1, default: 3 },
    starPoints: { type: 'range', label: 'Pontas da estrela', min: 4, max: 8, step: 1, default: 5 },
    bounce: { type: 'range', label: 'Mola', min: 0, max: 0.6, step: 0.01, default: 0.22 },
    label: { type: 'boolean', label: 'Legenda', default: true },
  },

  setup({ p }) {
    return buildShapes(p.starPoints);
  },

  render(ctx, t, { w, h, p, duration, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const n = SEQ.length;
    const segLen = duration / n;
    const hold = 0.38; // fração do segmento parada antes do morph

    // Estado do morph num tempo qualquer (com atraso, para ecos e satélites). Retorna raios + rotação.
    const buf = new Float32Array(N);
    const at = (tt) => {
      const tl = ((tt % duration) + duration) % duration;
      const i = Math.floor(tl / segLen);
      const f = (tl - i * segLen) / segLen;
      const x = clamp((f - hold) / (1 - hold));
      const k = spring(x, p.bounce);
      const A = state[SEQ[i]];
      const B = state[SEQ[(i + 1) % n]];
      for (let j = 0; j < N; j++) buf[j] = lerp(A[j], B[j], k);
      // giro durante o morph: cada forma pousa "de pé" (múltiplo da sua simetria); o círculo fecha o loop.
      const rot = lerp(ROT[i], ROT[i + 1], ease.inOutExpo(x));
      const squash = 1 - 0.07 * Math.sin(Math.PI * x);
      return { rot, squash, x, i };
    };

    const path = (x0, y0, R, rot) => {
      ctx.beginPath();
      for (let j = 0; j < N; j++) {
        const a = -Math.PI / 2 + (j / N) * TAU + rot;
        const r = R * buf[j];
        const x = x0 + r * Math.cos(a);
        const y = y0 + r * Math.sin(a);
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    };

    const R = m * p.size;

    // Trilho da órbita dos satélites
    const orbit = Math.min(R * 1.9, m * 0.42);
    if (p.satellites > 0) {
      ctx.strokeStyle = rgba(p.ink, 0.1);
      ctx.lineWidth = m * 0.0015;
      ctx.setLineDash([m * 0.004, m * 0.01]);
      ctx.beginPath();
      ctx.arc(cx, cy, orbit, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ecos: contornos maiores que seguem a forma com atraso crescente
    ctx.lineJoin = 'round';
    for (let e = p.echoes; e >= 1; e--) {
      const s = at(t - e * 0.05);
      path(cx, cy, R * (1 + e * 0.17) * s.squash, s.rot);
      ctx.strokeStyle = rgba(p.ink, 0.42 / (e + 0.4));
      ctx.lineWidth = m * 0.0022;
      ctx.stroke();
    }

    // Forma principal
    const main = at(t);
    path(cx, cy, R * main.squash, main.rot);
    ctx.fillStyle = p.accent;
    ctx.fill();
    // brilho interno sutil: mesma forma menor, um pouco mais clara
    path(cx, cy, R * main.squash * 0.62, main.rot);
    ctx.fillStyle = rgba('#ffffff', 0.07);
    ctx.fill();

    // Satélites: mini-formas na órbita, cada uma com o morph atrasado (stagger)
    const ns = p.satellites;
    for (let k = 0; k < ns; k++) {
      const delay = 0.06 + k * 0.045;
      const s = at(t - delay);
      const ang = -Math.PI / 2 + (k / ns) * TAU + (t / duration) * TAU; // 1 volta por loop
      const pulse = 1 + 0.35 * Math.sin(Math.PI * s.x);
      const sr = m * 0.022 * pulse;
      const x = cx + orbit * Math.cos(ang);
      const y = cy + orbit * Math.sin(ang);
      path(x, y, sr, s.rot * 2 + ang);
      if (k % 3 === 0) {
        ctx.fillStyle = p.accent;
        ctx.fill();
      } else {
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = m * 0.0022;
        ctx.stroke();
      }
    }

    // Legenda (troca no meio do morph)
    if (p.label) {
      const tl = ((t % duration) + duration) % duration;
      const i = Math.floor(tl / segLen);
      const f = (tl - i * segLen) / segLen;
      const x = clamp((f - hold) / (1 - hold));
      const idx = x < 0.5 ? i : (i + 1) % n;
      const vis = x < 0.5 ? 1 - ease.inCubic(clamp(x / 0.25)) : ease.outCubic(clamp((x - 0.5) / 0.3));
      const fs = Math.round(m * 0.022);
      ctx.font = `500 ${fs}px "JetBrains Mono"`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const lx = m * 0.07;
      const ly = h - m * 0.07;
      ctx.fillStyle = rgba(p.ink, 0.4);
      ctx.fillText(`${String(idx + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, lx, ly - fs * 1.7);
      ctx.fillStyle = rgba(p.ink, 0.9 * vis);
      ctx.fillText(LABELS[SEQ[idx]].split('').join(' '), lx, ly + (1 - vis) * fs * 0.6);
    }
  },
};
