import { rng, rgba, mixHex } from '../lib/anim.js';

// Grade hexagonal escura; pulsos de luz correm pelas arestas em caminhos aleatórios (passeios no grafo
// de vértices, sem voltar nem repetir vértice), pré-calculados no setup. Cada pulso tem `cycles`
// passagens por loop, cada uma com caminho próprio; dentro do período ele entra, percorre e sai da
// tela antes do fim, então t=0 e t=duration coincidem. Ao passar, acende os hexágonos vizinhos.

const LEVELS = 6; // lotes de alpha (um stroke/fill por lote)
const FLASH = 0.9; // s de brilho da célula depois que o pulso passa

export default {
  id: 'hex-pulse',
  title: 'Hex Pulse',
  description: 'Grade hexagonal escura com pulsos de luz correndo pelas arestas e acendendo as células por onde passam.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'padrão', 'ui'],
  duration: 10,
  poster: 4.2,

  params: {
    bg: { type: 'color', label: 'Fundo', default: '#0a0c10' },
    grid: { type: 'color', label: 'Grade', default: '#232a35' },
    accent: { type: 'color', label: 'Luz', default: '#5ce1ff' },
    size: { type: 'range', label: 'Tamanho do hexágono', min: 0.02, max: 0.12, step: 0.005, default: 0.05 },
    pulses: { type: 'range', label: 'Pulsos', min: 2, max: 40, step: 1, default: 22 },
    speed: { type: 'range', label: 'Velocidade (arestas/s)', min: 2, max: 16, step: 0.5, default: 6 },
    tail: { type: 'range', label: 'Cauda (arestas)', min: 1, max: 10, step: 0.5, default: 5 },
    cells: { type: 'range', label: 'Brilho das células', min: 0, max: 1, step: 0.05, default: 0.5 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 21 },
  },

  setup({ w, h, p, duration }) {
    const m = Math.min(w, h);
    const s = m * p.size; // raio (centro → vértice), hexágono de topo plano
    const dx = s * 1.5;
    const dy = s * Math.sqrt(3);
    const cols = Math.ceil(w / dx) + 3;
    const rows = Math.ceil(h / dy) + 3;
    const ox = (w - (cols - 1) * dx) / 2;
    const oy = (h - (rows - 1) * dy) / 2;

    const verts = []; // {x, y, nb: Set, hexes: []}
    const index = new Map();
    const key = (x, y) => `${Math.round(x * 4)},${Math.round(y * 4)}`;
    const vert = (x, y) => {
      const k = key(x, y);
      let i = index.get(k);
      if (i === undefined) {
        i = verts.length;
        index.set(k, i);
        verts.push({ x, y, nb: new Set(), hexes: [] });
      }
      return i;
    };
    const hexes = [];
    const gridPath = new Path2D();
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cx = ox + c * dx;
        const cy = oy + r * dy + (c % 2 ? dy / 2 : 0) - dy / 4;
        const hi = hexes.length;
        const ids = [];
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          ids.push(vert(cx + s * Math.cos(a), cy + s * Math.sin(a)));
        }
        hexes.push({ x: cx, y: cy });
        for (let k = 0; k < 6; k++) {
          const a = ids[k];
          const b = ids[(k + 1) % 6];
          verts[a].hexes.push(hi);
          if (!verts[a].nb.has(b)) {
            verts[a].nb.add(b);
            verts[b].nb.add(a);
            gridPath.moveTo(verts[a].x, verts[a].y);
            gridPath.lineTo(verts[b].x, verts[b].y);
          }
        }
      }
    }
    for (const v of verts) v.nb = [...v.nb];

    const r = rng(p.seed);
    const inside = (v, mg) => v.x > -mg && v.x < w + mg && v.y > -mg && v.y < h + mg;
    // passeio aleatório: sem voltar e sem repetir vértice; prefere alternar a curva (trechos retos)
    const walk = (len) => {
      let cur;
      do cur = Math.floor(r() * verts.length); while (!inside(verts[cur], -s));
      const path = [cur];
      const seen = new Set(path);
      let lastTurn = r() < 0.5 ? 1 : -1;
      for (let i = 0; i < len; i++) {
        const v = verts[cur];
        const prev = path.length > 1 ? verts[path[path.length - 2]] : null;
        const opts = v.nb.filter((n) => !seen.has(n) && inside(verts[n], s));
        if (!opts.length) break;
        let next;
        if (prev && opts.length > 1) {
          const turn = (n) => Math.sign((v.x - prev.x) * (verts[n].y - v.y) - (v.y - prev.y) * (verts[n].x - v.x));
          const alt = opts.find((n) => turn(n) === -lastTurn);
          next = alt !== undefined && r() < 0.72 ? alt : opts[Math.floor(r() * opts.length)];
          lastTurn = turn(next);
        } else next = opts[Math.floor(r() * opts.length)];
        path.push(next);
        seen.add(next);
        cur = next;
      }
      return path;
    };

    const pulses = [];
    for (let i = 0; i < p.pulses; i++) {
      const cycles = r() < 0.4 ? 2 : 1;
      const T = duration / cycles;
      // cabe no período: percorre o caminho e a cauda sai antes do próximo ciclo
      const maxLen = Math.max(3, Math.floor(T * p.speed - Math.max(p.tail, FLASH * p.speed) - 1));
      const paths = [];
      for (let c = 0; c < cycles; c++) {
        const len = Math.max(3, Math.floor(maxLen * (0.45 + 0.55 * r())));
        paths.push(walk(len));
      }
      pulses.push({ cycles, T, offset: r(), paths });
    }
    return { verts, hexes, gridPath, pulses, s };
  },

  render(ctx, t, { w, h, p, state }) {
    const { verts, hexes, gridPath, pulses, s } = state;
    const m = Math.min(w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const tail = p.tail;
    const segs = Array.from({ length: LEVELS }, () => new Path2D());
    const cellA = new Map(); // hex → alpha
    const heads = [];

    for (const pu of pulses) {
      const u = t / pu.T + pu.offset;
      const cyc = Math.floor(u);
      const tau = (u - cyc) * pu.T; // segundos dentro do período
      const path = pu.paths[((cyc % pu.cycles) + pu.cycles) % pu.cycles];
      const L = path.length - 1;
      const head = tau * p.speed; // em arestas
      // células: vértices já visitados acendem os hexágonos em volta e apagam em `flash` s
      if (p.cells > 0) {
        const j0 = Math.max(0, Math.floor(head - FLASH * p.speed));
        const j1 = Math.min(L, Math.floor(head));
        for (let j = j0; j <= j1; j++) {
          const age = (head - j) / p.speed;
          if (age < 0 || age > FLASH) continue;
          const a = (1 - age / FLASH) ** 2 * Math.min(1, age / 0.12);
          for (const hi of verts[path[j]].hexes) cellA.set(hi, Math.max(cellA.get(hi) ?? 0, a));
        }
      }
      const a = Math.max(0, head - tail);
      const b = Math.min(L, head);
      if (b <= a) continue;
      const at = (x) => {
        const i = Math.min(L - 1, Math.floor(x));
        const f = x - i;
        const P = verts[path[i]];
        const Q = verts[path[i + 1]];
        return [P.x + (Q.x - P.x) * f, P.y + (Q.y - P.y) * f];
      };
      // cauda em pedaços de 1/3 de aresta, quebrando nos vértices; alpha cresce até a cabeça
      // pedaços seguidos do mesmo lote viram uma polilinha só (sem "contas" de cap/overlap no meio)
      let x0 = a;
      let p0 = at(x0);
      let last = -1;
      while (x0 < b - 1e-6) {
        const x1 = Math.min(b, Math.floor(x0 * 3 + 1e-6) / 3 + 1 / 3);
        const p1 = at(x1);
        const k = ((x0 + x1) / 2 - (head - tail)) / tail;
        const lvl = Math.min(LEVELS - 1, Math.max(0, Math.floor(k * LEVELS)));
        if (lvl !== last) segs[lvl].moveTo(p0[0], p0[1]);
        segs[lvl].lineTo(p1[0], p1[1]);
        last = lvl;
        x0 = x1;
        p0 = p1;
      }
      if (head <= L) heads.push(at(head));
    }

    // células acesas (lotes de alpha)
    if (cellA.size) {
      const cellPaths = Array.from({ length: LEVELS }, () => new Path2D());
      const rr = s * 0.9;
      for (const [hi, a] of cellA) {
        const lvl = Math.min(LEVELS - 1, Math.floor(a * LEVELS));
        const c = hexes[hi];
        const P = cellPaths[lvl];
        for (let k = 0; k < 6; k++) {
          const ang = (Math.PI / 3) * k;
          const x = c.x + rr * Math.cos(ang);
          const y = c.y + rr * Math.sin(ang);
          if (k) P.lineTo(x, y);
          else P.moveTo(x, y);
        }
        P.closePath();
      }
      for (let l = 0; l < LEVELS; l++) {
        ctx.fillStyle = rgba(p.accent, 0.32 * p.cells * ((l + 1) / LEVELS));
        ctx.fill(cellPaths[l]);
      }
    }

    // grade
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = Math.max(1, m * 0.0016);
    ctx.lineJoin = 'round';
    ctx.stroke(gridPath);

    // pulsos: halo largo + núcleo, cada lote com seu alpha
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    const core = mixHex(p.accent, '#ffffff', 0.35);
    for (let l = 0; l < LEVELS; l++) {
      const k = (l + 1) / LEVELS;
      ctx.strokeStyle = rgba(p.accent, 0.1 * k);
      ctx.lineWidth = m * 0.022;
      ctx.stroke(segs[l]);
      ctx.strokeStyle = rgba(p.accent, 0.3 * k);
      ctx.lineWidth = m * 0.008;
      ctx.stroke(segs[l]);
      ctx.strokeStyle = core;
      ctx.globalAlpha = k * k;
      ctx.lineWidth = m * 0.003;
      ctx.stroke(segs[l]);
      ctx.globalAlpha = 1;
    }
    // cabeças
    const glow = new Path2D();
    const glow2 = new Path2D();
    const dot = new Path2D();
    for (const [x, y] of heads) {
      glow.moveTo(x + m * 0.014, y);
      glow.arc(x, y, m * 0.014, 0, Math.PI * 2);
      glow2.moveTo(x + m * 0.008, y);
      glow2.arc(x, y, m * 0.008, 0, Math.PI * 2);
      dot.moveTo(x + m * 0.004, y);
      dot.arc(x, y, m * 0.004, 0, Math.PI * 2);
    }
    ctx.fillStyle = rgba(p.accent, 0.22);
    ctx.fill(glow);
    ctx.fill(glow2);
    ctx.fillStyle = '#ffffff';
    ctx.fill(dot);

    // vinheta (mesma cor do fundo variando só o alpha)
    const R = Math.hypot(w, h) / 2;
    const v = ctx.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, R);
    v.addColorStop(0, rgba(p.bg, 0));
    v.addColorStop(1, rgba(p.bg, 0.85));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  },
};
