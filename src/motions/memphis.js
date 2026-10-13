import { TAU, rng } from '../lib/anim.js';

// Padrão Memphis (anos 80): zigue-zagues, ondas, confete, círculos, meias-luas, grades de pontos.
// As formas ficam numa grade com jitter que sobe devagar e dá a volta (período = altura + margem),
// cada uma balançando e girando com frequências inteiras do progresso — loop perfeito.
// Sombra chapada deslocada (cor da tinta) dá o ar de recorte de papel.

const TYPES = [
  // [tipo, peso, escala]
  ['circle', 3, 0.8],
  ['ring', 3, 0.8],
  ['zigzag', 4, 1.2],
  ['wave', 4, 1.2],
  ['triangle', 3, 0.95],
  ['tri-line', 2, 0.95],
  ['half', 3, 0.85],
  ['dots', 2, 0.9],
  ['lines', 2, 0.9],
  ['plus', 2, 0.6],
  ['square', 2, 0.75],
  ['pill', 6, 0.42],
  ['dot', 4, 0.22],
];
const WSUM = TYPES.reduce((s, x) => s + x[1], 0);

function pick(r) {
  let a = r * WSUM;
  for (const t of TYPES) {
    a -= t[1];
    if (a <= 0) return t;
  }
  return TYPES[0];
}

// Desenha a forma centrada em (0,0), tamanho s. `fill` = cor; `wave` = fase da onda.
function shape(ctx, type, s, col, wave) {
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  switch (type) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, TAU);
      ctx.fill();
      break;
    case 'ring':
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.42, 0, TAU);
      ctx.stroke();
      break;
    case 'zigzag': {
      ctx.lineWidth = s * 0.13;
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      ctx.beginPath();
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const x = -s * 0.5 + (s * i) / n;
        const y = (i % 2 ? -1 : 1) * s * 0.13;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'wave': {
      ctx.lineWidth = s * 0.12;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      const n = 28;
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const x = -s * 0.5 + s * k;
        const y = Math.sin(k * TAU * 1.5 + wave) * s * 0.14;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'triangle':
    case 'tri-line': {
      const r = s * 0.55;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 3;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + r * 0.2);
      }
      ctx.closePath();
      if (type === 'triangle') ctx.fill();
      else {
        ctx.lineWidth = s * 0.1;
        ctx.lineJoin = 'miter';
        ctx.stroke();
      }
      break;
    }
    case 'half':
      ctx.beginPath();
      ctx.arc(0, s * 0.15, s * 0.5, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      break;
    case 'dots': {
      const n = 4;
      const g = s / n;
      const r = g * 0.17;
      ctx.beginPath();
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const x = (i - (n - 1) / 2) * g;
          const y = (j - (n - 1) / 2) * g;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TAU);
        }
      ctx.fill();
      break;
    }
    case 'lines': {
      ctx.lineWidth = s * 0.07;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const y = (i - 2) * s * 0.18;
        ctx.moveTo(-s * 0.45, y);
        ctx.lineTo(s * 0.45, y);
      }
      ctx.stroke();
      break;
    }
    case 'plus': {
      const a = s * 0.5;
      const b = s * 0.16;
      ctx.beginPath();
      ctx.rect(-a, -b, a * 2, b * 2);
      ctx.rect(-b, -a, b * 2, a * 2);
      ctx.fill('nonzero');
      break;
    }
    case 'square':
      ctx.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
      break;
    case 'pill':
      ctx.lineWidth = s * 0.34;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, 0);
      ctx.lineTo(s * 0.5, 0);
      ctx.stroke();
      break;
    case 'dot':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, TAU);
      ctx.fill();
      break;
  }
}

export default {
  id: 'memphis',
  title: 'Memphis',
  description: 'Padrão anos 80 de zigue-zagues, ondas, confete, círculos e grades de pontos flutuando com sombra chapada.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'padrão', 'forma'],
  duration: 20,

  params: {
    bg: { type: 'color', label: 'Fundo', default: '#f3ece0' },
    ink: { type: 'color', label: 'Tinta / sombra', default: '#1e1b2b' },
    colorA: { type: 'color', label: 'Cor 1', default: '#ff6b9a' },
    colorB: { type: 'color', label: 'Cor 2', default: '#ffc23d' },
    colorC: { type: 'color', label: 'Cor 3', default: '#2bb5a8' },
    density: { type: 'range', label: 'Densidade', min: 0.5, max: 1.8, step: 0.01, default: 1 },
    size: { type: 'range', label: 'Tamanho', min: 0.6, max: 1.6, step: 0.01, default: 1 },
    speed: { type: 'range', label: 'Velocidade', min: 0, max: 3, step: 1, default: 1 },
    shadow: { type: 'boolean', label: 'Sombra chapada', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p }) {
    const rand = rng(p.seed * 31 + 7);
    const m = Math.min(w, h);
    const base = m * 0.105 * p.size;
    const M = base * 1.3; // margem para a forma sair inteira antes de dar a volta
    const cell = (m * 0.17) / Math.sqrt(p.density);
    const PH = h + 2 * M;
    const rows = Math.max(3, Math.round(PH / cell));
    const ch = PH / rows;
    const cols = Math.max(3, Math.ceil((w + 2 * M) / cell));
    const cw = (w + 2 * M) / cols;
    const items = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // grade escalonada: linhas ímpares deslocadas meia célula
        const [type, , sc] = pick(rand());
        const x = (c + 0.5 + (r % 2) * 0.5 + (rand() - 0.5) * 0.55) * cw - M;
        const y = (r + 0.5 + (rand() - 0.5) * 0.5) * ch;
        const color = Math.floor(rand() * 3);
        const inkish = type === 'dots' || type === 'lines' || type === 'tri-line' || (type === 'zigzag' && rand() < 0.35);
        const spin = type === 'dot' || type === 'circle' || type === 'dots' ? 0 : rand() < 0.3 ? (rand() < 0.5 ? -1 : 1) : 0;
        items.push({
          type,
          x,
          y,
          s: base * sc * (0.8 + rand() * 0.45),
          color,
          inkish,
          rot: rand() * TAU,
          spin,
          wob: 0.15 + rand() * 0.35,
          wf: 1 + Math.floor(rand() * 3),
          bob: 0.12 + rand() * 0.2,
          bf: 1 + Math.floor(rand() * 3),
          ph: rand() * TAU,
          wv: rand() < 0.5 ? 2 : 3,
        });
      }
    }
    // pequenos itens primeiro (ficam por baixo)
    items.sort((a, b) => a.s - b.s);
    return { items, PH, M, ch };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const { items, PH, M, ch } = state;
    const m = Math.min(w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const cols = [p.colorA, p.colorB, p.colorC];
    const off = m * 0.009 * p.size;
    const lift = u * PH * p.speed;
    const B = ctx.getTransform();

    for (const it of items) {
      const bob = Math.sin(TAU * it.bf * u + it.ph) * ch * it.bob;
      let y = it.y - lift + bob;
      y = ((y % PH) + PH) % PH - M;
      const x = it.x + Math.cos(TAU * it.bf * u + it.ph * 1.3) * ch * it.bob * 0.5;
      if (y < -M || y > h + M || x < -M || x > w + M) continue;
      const rot = it.rot + it.spin * TAU * u + Math.sin(TAU * it.wf * u + it.ph) * it.wob;
      const wave = TAU * it.wv * u + it.ph;
      const col = it.inkish ? p.ink : cols[it.color];
      if (p.shadow && it.type !== 'dot' && it.type !== 'pill') {
        const sh = it.inkish ? cols[it.color] : p.ink;
        ctx.setTransform(B);
        ctx.translate(x + off, y + off);
        ctx.rotate(rot);
        shape(ctx, it.type, it.s, sh, wave);
      }
      ctx.setTransform(B);
      ctx.translate(x, y);
      ctx.rotate(rot);
      shape(ctx, it.type, it.s, col, wave);
    }
    ctx.setTransform(B);
  },
};
