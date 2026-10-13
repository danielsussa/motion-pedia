import { TAU, clamp, spring, rng, rgba } from '../lib/anim.js';

// Azulejos de Truchet (variante de Smith): cada azulejo liga os pontos médios das bordas com dois
// quartos de arco. Girar 90° troca as ligações e os caminhos se reconectam. A cada batida uma onda
// (radial, a partir do centro) gira parte dos azulejos com mola. Cada azulejo gira um número par de
// vezes por loop e a soma dos sentidos é par → ângulo final ≡ 0 (mod 180°), simetria do azulejo.

const BEATS = 6;

export default {
  id: 'truchet',
  title: 'Truchet Tiles',
  description: 'Azulejos de arcos girando em ondas radiais, reconectando os caminhos da grade a cada batida.',
  category: 'formas',
  tags: ['padrão', 'loop', 'fundo'],
  duration: 9,
  poster: 2.2,

  params: {
    style: { type: 'select', label: 'Estilo', options: ['arcos', 'preenchido'], default: 'arcos' },
    rows: { type: 'range', label: 'Linhas (lado menor)', min: 4, max: 24, step: 1, default: 10 },
    line: { type: 'range', label: 'Espessura', min: 0.05, max: 0.6, step: 0.01, default: 0.26 },
    amount: { type: 'range', label: 'Quantos giram', min: 0.1, max: 1, step: 0.05, default: 0.6 },
    spread: { type: 'range', label: 'Stagger (s)', min: 0, max: 1.4, step: 0.05, default: 0.8 },
    colorA: { type: 'color', label: 'Cor A', default: '#f5f1e8' },
    colorB: { type: 'color', label: 'Cor B', default: '#ff5a36' },
    bg: { type: 'color', label: 'Fundo', default: '#111216' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 11 },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const size = m / p.rows;
    const cols = Math.ceil(w / size) + 1;
    const rows = Math.ceil(h / size) + 1;
    const ox = (w - cols * size) / 2;
    const oy = (h - rows * size) / 2;
    const r = rng(p.seed);
    const tiles = [];
    const cx = w / 2;
    const cy = h / 2;
    const maxD = Math.hypot(w, h) / 2;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = ox + (i + 0.5) * size;
        const y = oy + (j + 0.5) * size;
        // giros por batida: 0 ou ±1, com quantidade par de giros e soma par
        const steps = [];
        for (let b = 0; b < BEATS; b++) steps.push(r() < p.amount ? (r() < 0.5 ? -1 : 1) : 0);
        let cnt = steps.filter(Boolean).length;
        if (cnt % 2) {
          const k = steps.findIndex((s) => s !== 0);
          steps[k] = 0;
          cnt--;
        }
        const prefix = [0];
        for (const s of steps) prefix.push(prefix[prefix.length - 1] + s);
        tiles.push({ x, y, o: r() < 0.5 ? 0 : 1, steps, prefix, d: Math.hypot(x - cx, y - cy) / maxD, par: (i + j) % 2 });
      }
    }
    return { tiles, size };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const { tiles, size } = state;
    const a = size / 2;
    const bl = duration / BEATS;
    const trans = 0.7; // fração da batida ocupada pelo giro

    const angleOf = (tile) => {
      const tc = t - tile.d * p.spread;
      const bf = tc / bl;
      const jb = Math.floor(bf);
      const q = Math.floor(jb / BEATS);
      const rb = jb - q * BEATS;
      const total = tile.prefix[BEATS];
      const done = q * total + tile.prefix[rb];
      const act = clamp((bf - jb) / trans);
      const cur = tile.steps[rb] * spring(act, 0.22);
      return { ang: ((tile.o + done + cur) * Math.PI) / 2, moving: tile.steps[rb] !== 0 && act > 0 && act < 1, act };
    };

    // gradiente diagonal aplicado de uma vez a todos os arcos (um stroke só)
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, p.colorA);
    grad.addColorStop(1, p.colorB);

    if (p.style === 'preenchido') {
      // duas cores em xadrez: fundo do azulejo numa cor, quartos de disco na outra.
      // Azulejos parados vão num lote só; os que giram são recortados no próprio quadrado.
      const bgA = new Path2D();
      const bgB = new Path2D();
      const A = new Path2D();
      const B = new Path2D();
      const movers = [];
      const discs = (path, tile, ang) => {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        for (const [kx, ky, a0] of [[-1, -1, 0], [1, 1, Math.PI]]) {
          const px = tile.x + (kx * a * c - ky * a * s);
          const py = tile.y + (kx * a * s + ky * a * c);
          path.moveTo(px, py);
          path.arc(px, py, a, a0 + ang, a0 + ang + Math.PI / 2);
          path.closePath();
        }
      };
      for (const tile of tiles) {
        const st = angleOf(tile);
        (tile.par ? bgA : bgB).rect(tile.x - a, tile.y - a, size, size);
        if (st.moving) movers.push([tile, st.ang]);
        else discs(tile.par ? A : B, tile, st.ang);
      }
      ctx.fillStyle = p.colorA;
      ctx.fill(bgA);
      ctx.fill(B);
      ctx.fillStyle = p.colorB;
      ctx.fill(bgB);
      ctx.fill(A);
      for (const [tile, ang] of movers) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(tile.x - a, tile.y - a, size, size);
        ctx.clip();
        ctx.fillStyle = tile.par ? p.colorA : p.colorB;
        ctx.fillRect(tile.x - a, tile.y - a, size, size);
        const d = new Path2D();
        discs(d, tile, ang);
        ctx.fillStyle = tile.par ? p.colorB : p.colorA;
        ctx.fill(d);
        ctx.restore();
      }
      return;
    }

    // estilo "arcos": pontos nos cantos (acabamento) + arcos grossos
    ctx.fillStyle = rgba(p.colorA, 0.12);
    ctx.beginPath();
    for (const tile of tiles) {
      ctx.moveTo(tile.x - a + size * 0.03, tile.y - a);
      ctx.arc(tile.x - a, tile.y - a, size * 0.03, 0, TAU);
    }
    ctx.fill();

    const still = new Path2D();
    const moving = new Path2D();
    for (const tile of tiles) {
      const { ang, moving: mv, act } = angleOf(tile);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const k = mv ? 1 - 0.14 * Math.sin(Math.PI * act) : 1; // encolhe um pouco enquanto gira
      const path = mv ? moving : still;
      for (const [kx, ky, a0] of [[-1, -1, 0], [1, 1, Math.PI]]) {
        const px = tile.x + (kx * a * c - ky * a * s) * k;
        const py = tile.y + (kx * a * s + ky * a * c) * k;
        const ov = mv ? 0 : 0.03; // sobreposição mínima nas emendas (evita fio de antialias)
        const st = a0 + ang - ov;
        path.moveTo(px + a * k * Math.cos(st), py + a * k * Math.sin(st));
        path.arc(px, py, a * k, st, st + Math.PI / 2 + 2 * ov);
      }
    }
    ctx.lineCap = 'butt';
    ctx.lineWidth = size * p.line;
    ctx.strokeStyle = grad;
    ctx.stroke(still);
    ctx.globalAlpha = 0.85;
    ctx.stroke(moving);
    ctx.globalAlpha = 1;
  },
};
