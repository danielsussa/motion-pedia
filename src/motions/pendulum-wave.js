import { TAU, clamp, lerp, rgba, hexToRgb } from '../lib/anim.js';
import { rotate, project } from '../lib/space.js';

// Pendulum wave: o pêndulo k faz exatamente (base + k) oscilações na duração T do loop, então todos
// realinham em t = T (e em T/2 formam duas fileiras opostas). Comprimento estilizado L ∝ 1/f.
// Ângulo: θ_k(t) = A·cos(2π·(base + k)·t/T) — analítico, função pura de t.
// Vistas: 'perspectiva' (barra em 3D, câmera orbitando de leve, sombras no chão) e 'topo'
// (de cima: cada bolinha num trilho, a "serpente" fica evidente).

const T = 30;

export default {
  id: 'pendulum-wave',
  title: 'Pendulum Wave',
  description: 'A row of pendulums of different lengths drifting in and out of phase, drawing snakes, waves and braids until they realign.',
  category: 'formas',
  tags: ['3d', 'simulation', 'loop', 'pattern'],
  duration: T,
  poster: 6.4,

  params: {
    count: { type: 'range', label: 'Pendulums', min: 6, max: 30, step: 1, default: 18 },
    base: { type: 'range', label: 'Swings of the slowest', min: 12, max: 40, step: 1, default: 21 },
    amp: { type: 'range', label: 'Amplitude', min: 0.1, max: 0.7, step: 0.01, default: 0.42 },
    view: { type: 'select', label: 'View', options: ['perspectiva', 'topo'], default: 'perspectiva' },
    snake: { type: 'boolean', label: 'Snake line', default: true },
    trail: { type: 'range', label: 'Trail', min: 0, max: 1, step: 0.01, default: 0.6 },
    accent: { type: 'color', label: 'Balls', default: '#ff6a3d' },
    ink: { type: 'color', label: 'Strings', default: '#ece6da' },
    bg: { type: 'color', label: 'Background', default: '#0e0f13' },
  },

  render(ctx, t, { w, h, p, progress: u, px }) {
    const m = Math.min(w, h);
    const N = p.count;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const omega = (k) => (TAU * (p.base + k)) / T;
    const theta = (k, tt) => p.amp * Math.cos(omega(k) * tt);
    const [ar, ag, ab] = hexToRgb(p.accent);
    const trailN = Math.round(p.trail * 14);
    const DT = 0.022;
    // rastro: segmentos entre amostras passadas (função pura de t), agrupados por idade → 1 stroke por grupo
    const drawTrail = (pos, width) => {
      ctx.lineCap = 'butt'; // 'round' sobrepõe as pontas com alpha e vira contas
      for (let s = trailN; s >= 1; s--) {
        const k1 = 1 - s / (trailN + 1);
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.3 * k1})`;
        ctx.lineWidth = width * (0.35 + 0.65 * k1);
        ctx.beginPath();
        for (let k = 0; k < N; k++) {
          const a = pos(k, t - (s - 1) * DT);
          const b = pos(k, t - s * DT);
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        }
        ctx.stroke();
      }
    };

    if (p.view === 'topo') {
      // de cima: x = posição na fileira, y = deslocamento horizontal L·sinθ (normalizado)
      const vertical = h > w;
      const span = (vertical ? h : w) * 0.78;
      const across = (vertical ? w : h) * 0.36;
      const pos = (k, tt) => {
        const a = lerp(-span / 2, span / 2, N > 1 ? k / (N - 1) : 0.5);
        const b = (Math.sin(theta(k, tt)) / Math.sin(p.amp)) * across;
        return vertical ? [w / 2 + b, h / 2 + a] : [w / 2 + a, h / 2 + b];
      };
      const R = Math.min(m * 0.022, (span / N) * 0.36);
      // trilhos
      ctx.strokeStyle = rgba(p.ink, 0.09);
      ctx.lineWidth = Math.max(1, m * 0.0012);
      ctx.beginPath();
      for (let k = 0; k < N; k++) {
        const a = lerp(-span / 2, span / 2, N > 1 ? k / (N - 1) : 0.5);
        if (vertical) { ctx.moveTo(w / 2 - across, h / 2 + a); ctx.lineTo(w / 2 + across, h / 2 + a); }
        else { ctx.moveTo(w / 2 + a, h / 2 - across); ctx.lineTo(w / 2 + a, h / 2 + across); }
      }
      ctx.stroke();
      // eixo central
      ctx.strokeStyle = rgba(p.ink, 0.18);
      ctx.beginPath();
      if (vertical) { ctx.moveTo(w / 2, h / 2 - span / 2 - R * 3); ctx.lineTo(w / 2, h / 2 + span / 2 + R * 3); }
      else { ctx.moveTo(w / 2 - span / 2 - R * 3, h / 2); ctx.lineTo(w / 2 + span / 2 + R * 3, h / 2); }
      ctx.stroke();
      drawTrail(pos, R * 1.4);
      const pts = Array.from({ length: N }, (_, k) => pos(k, t));
      if (p.snake) {
        ctx.strokeStyle = rgba(p.ink, 0.55);
        ctx.lineWidth = Math.max(1, m * 0.0018);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      for (const [x, y] of pts) { ctx.moveTo(x + R, y); ctx.arc(x, y, R, 0, TAU); }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      for (const [x, y] of pts) { ctx.moveTo(x - R * 0.3 + R * 0.32, y - R * 0.3); ctx.arc(x - R * 0.3, y - R * 0.3, R * 0.32, 0, TAU); }
      ctx.fill();
      return;
    }

    // ---- perspectiva ----
    // mundo: x ao longo da barra, y para baixo, z profundidade. O pêndulo balança no plano y-z.
    const fMin = p.base / T;
    const Lmax = 1;
    // comprimento estilizado (∝ 1/f em vez de 1/f²): a diferença física (3×) deixaria os curtos minúsculos
    const Lk = (k) => Lmax * (fMin / ((p.base + k) / T));
    const wide = w > h * 1.1;
    const span = 1.9 * (wide ? 1.25 : 0.8);
    const xk = (k) => lerp(-span / 2, span / 2, N > 1 ? k / (N - 1) : 0.5);
    const floorY = Lmax + 0.22;
    const cam = { rx: (wide ? 0.62 : 0.95) + 0.06 * Math.sin(TAU * 2 * u), ry: 0.32 * Math.sin(TAU * u), rz: 0 };
    const unit = (wide ? m * 0.56 : (w * 0.72) / span);
    // centro do mundo no meio da altura do pêndulo mais longo; s ≈ unit px por unidade
    const P = (x, y, z) => project(rotate([x, y - 0.5, z], cam), { cx: w / 2, cy: h / 2, fov: unit * 5, dist: 5 });
    const R = 0.045 * Math.min(1, 18 / N) * (w > h ? 1 : 0.8);
    const bob = (k, tt) => {
      const th = theta(k, tt);
      return [xk(k), Lk(k) * Math.cos(th), Lk(k) * Math.sin(th)];
    };

    // chão: sombras suaves das bolas (mesma cor, só alpha)
    for (let k = 0; k < N; k++) {
      const b = bob(k, t);
      const s = P(b[0], floorY, b[2]);
      const lift = (floorY - b[1]) / floorY;
      const rr = R * s.s * (1.6 + lift * 0.8);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(1, 0.42);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr * 1.6);
      g.addColorStop(0, `rgba(0,0,0,${0.5 - lift * 0.25})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-rr * 1.6, -rr * 1.6, rr * 3.2, rr * 3.2);
      ctx.restore();
    }

    // barra de suporte
    const b0 = P(-span / 2 - 0.12, 0, 0);
    const b1 = P(span / 2 + 0.12, 0, 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(p.ink, 0.85);
    ctx.lineWidth = Math.max(2, m * 0.006);
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.stroke();

    // itens ordenados por profundidade (bola + fio juntos)
    const items = [];
    for (let k = 0; k < N; k++) {
      const b = bob(k, t);
      const s = P(...b);
      items.push({ k, b, s, piv: P(b[0], 0, 0), z: s.z });
    }
    // rastro primeiro (fica atrás de tudo)
    drawTrail((k, tt) => {
      const q = P(...bob(k, tt));
      return [q.x, q.y];
    }, R * unit * 1.3);
    if (p.snake) {
      ctx.strokeStyle = rgba(p.ink, 0.35);
      ctx.lineWidth = Math.max(1, m * 0.0016);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      items.forEach(({ s }, k) => (k ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y)));
      ctx.stroke();
    }
    items.sort((a, b) => b.z - a.z);
    const fogFar = Math.max(...items.map((i) => i.z));
    const fogNear = Math.min(...items.map((i) => i.z));
    ctx.lineWidth = Math.max(1, m * 0.0012);
    for (const it of items) {
      const fog = fogFar > fogNear ? (it.z - fogNear) / (fogFar - fogNear) : 0;
      ctx.strokeStyle = rgba(p.ink, 0.5 - 0.2 * fog);
      ctx.beginPath();
      ctx.moveTo(it.piv.x, it.piv.y);
      ctx.lineTo(it.s.x, it.s.y);
      ctx.stroke();
      const rr = R * it.s.s;
      const g = ctx.createRadialGradient(it.s.x - rr * 0.35, it.s.y - rr * 0.4, rr * 0.05, it.s.x, it.s.y, rr);
      g.addColorStop(0, `rgb(${clamp(ar + 90, 0, 255)},${clamp(ag + 90, 0, 255)},${clamp(ab + 90, 0, 255)})`);
      g.addColorStop(0.45, p.accent);
      g.addColorStop(1, `rgb(${Math.round(ar * 0.45)},${Math.round(ag * 0.45)},${Math.round(ab * 0.45)})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(it.s.x, it.s.y, rr, 0, TAU);
      ctx.fill();
    }
  },
};
