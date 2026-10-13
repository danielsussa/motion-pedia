import { seg, ease, rgba, clamp } from '../lib/anim.js';

// Zoom infinito: cada palavra mora dentro do "miolo" (contraforma) de uma letra da anterior.
// Precisão: nada é acumulado em coordenadas absolutas. A câmera é descrita em relação à palavra
// atual (k = floor(nível)) e as vizinhas são posicionadas por transformações relativas, com
// escala no máximo R (razão entre duas palavras) para fora e R^-3 para dentro.

const FONT = (s) => `900 ${s}px Inter, system-ui, sans-serif`;
const BASE = 200; // corpo de referência para medir/desenhar (escala via transform)

// Contraforma de um glifo: rasteriza e varre a partir do centro da caixa da tinta.
function counterOf(ch) {
  const S = 240;
  const c = document.createElement('canvas');
  c.width = S * 2;
  c.height = S * 2;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = FONT(S);
  g.textBaseline = 'alphabetic';
  const m = g.measureText(ch);
  const ox = S * 0.5;
  const oy = S * 1.4;
  g.fillText(ch, ox, oy);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const ink = (x, y) => d[(Math.round(y) * c.width + Math.round(x)) * 4 + 3] > 127;
  // Caixa da tinta.
  const x0 = ox - m.actualBoundingBoxLeft;
  const x1 = ox + m.actualBoundingBoxRight;
  const y0 = oy - m.actualBoundingBoxAscent;
  const y1 = oy + m.actualBoundingBoxDescent;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const sc = BASE / S;
  if (ink(cx, cy)) {
    // Sem miolo no centro (ex.: "I"): mergulha num círculo dentro da tinta.
    const r = Math.min(x1 - x0, y1 - y0) * 0.22;
    return { cx: (cx - ox) * sc, cy: (cy - oy) * sc, ix: r * sc, iy: r * sc, mx: r * sc * 1.15, my: r * sc * 1.15, solid: true };
  }
  const walk = (dx, dy) => {
    let k = 0;
    while (k < S && !ink(cx + dx * k, cy + dy * k)) k++;
    let j = k;
    while (j < S && ink(cx + dx * j, cy + dy * j)) j++; // espessura do traço
    return { inner: k, outer: j };
  };
  const L = walk(-1, 0);
  const R = walk(1, 0);
  const U = walk(0, -1);
  const D = walk(0, 1);
  const icx = cx + (R.inner - L.inner) / 2;
  const icy = cy + (D.inner - U.inner) / 2;
  const ix = (L.inner + R.inner) / 2;
  const iy = (U.inner + D.inner) / 2;
  // Meio do traço (para cobrir a contraforma por baixo da letra sem frestas).
  const mx = (L.inner + R.inner + (L.outer - L.inner + R.outer - R.inner) * 0.5) / 2;
  const my = (U.inner + D.inner + (U.outer - U.inner + D.outer - D.inner) * 0.5) / 2;
  return { cx: (icx - ox) * sc, cy: (icy - oy) * sc, ix: ix * sc, iy: iy * sc, mx: mx * sc, my: my * sc, solid: false };
}

export default {
  id: 'zoom-through',
  title: 'Zoom Through',
  description: 'Zoom infinito para dentro da letra "O" de cada palavra, que revela a palavra seguinte, em cadeia.',
  category: 'tipografia',
  tags: ['tipografia', 'loop', 'transição'],
  duration: 8,
  poster: 1.2,

  params: {
    words: { type: 'textarea', label: 'Palavras (uma por linha)', rows: 4, default: 'FOCO\nPROJETO\nMOVIMENTO\nMUNDO' },
    letter: { type: 'text', label: 'Letra do mergulho', default: 'O' },
    hold: { type: 'range', label: 'Pausa em cada palavra', min: 0, max: 0.8, step: 0.05, default: 0.4 },
    size: { type: 'range', label: 'Largura da palavra', min: 0.4, max: 0.95, step: 0.01, default: 0.78 },
    color: { type: 'color', label: 'Claro', default: '#f2ede4' },
    dark: { type: 'color', label: 'Escuro', default: '#111014' },
    accent: { type: 'color', label: 'Letra-portal', default: '#ff5a36' },
    alternate: { type: 'boolean', label: 'Alternar claro/escuro', default: true },
  },

  setup({ w, h, p }) {
    const list = String(p.words || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.length) list.push('O');
    const target = (p.letter || 'O').trim()[0] || 'O';
    const g = document.createElement('canvas').getContext('2d');
    g.font = FONT(BASE);
    const cache = {};
    const words = list.map((text) => {
      const chars = [...text];
      let i = chars.findIndex((c) => c.toLowerCase() === target.toLowerCase());
      if (i < 0) i = Math.floor((chars.length - 1) / 2);
      const W = g.measureText(text).width;
      const pre = g.measureText(chars.slice(0, i).join('')).width;
      const m = g.measureText(text);
      const asc = m.actualBoundingBoxAscent;
      const cnt = cache[chars[i]] || (cache[chars[i]] = counterOf(chars[i]));
      // Palavra centrada na origem do seu "mundo": baseline em y = asc/2 (centro óptico da caixa alta).
      const ox = -W / 2;
      const oy = asc / 2;
      return {
        text,
        before: chars.slice(0, i).join(''),
        ch: chars[i],
        after: chars.slice(i + 1).join(''),
        ox,
        oy,
        lx: ox + pre, // x da letra-portal
        W,
        asc,
        c: { x: ox + pre + cnt.cx, y: oy + cnt.cy, ix: cnt.ix, iy: cnt.iy, mx: cnt.mx, my: cnt.my, solid: cnt.solid },
      };
    });
    // Escala de cada palavra no seu mundo (cabe na largura) e razão para a próxima.
    const fit = (wd) => Math.min((w * p.size) / wd.W, (h * 0.5) / wd.asc);
    words.forEach((wd) => (wd.s = fit(wd)));
    const N = words.length;
    words.forEach((wd, k) => {
      const nx = words[(k + 1) % N];
      // Retângulo da próxima (na escala dela) precisa caber na elipse do miolo, com folga.
      const hw = (nx.W * nx.s) / 2;
      const hh = (nx.asc * nx.s) / 2;
      const ex = wd.c.ix * wd.s;
      const ey = wd.c.iy * wd.s;
      const q = 0.78 / Math.sqrt((hw / ex) ** 2 + (hh / ey) ** 2); // fator de encolhimento da próxima
      wd.q = q; // 1 unidade de tela da próxima = q unidades de tela desta (em escala 1)
    });
    return { words, N };
  },

  render(ctx, t, { w, h, p, progress, state }) {
    const { words, N } = state;
    const cols = [p.dark, p.color];
    const bgOf = (k) => (p.alternate ? cols[((k % N) + N) % N % 2] : p.dark);
    const fgOf = (k) => (p.alternate ? cols[(((k % N) + N) % N + 1) % 2] : p.color);
    const W = (k) => words[((k % N) + N) % N];

    // Nível contínuo: inteiro = parado numa palavra. Pausa + zoom com easing.
    const L = progress * N;
    const k = Math.floor(L) % N;
    const raw = L - Math.floor(L);
    // Deriva lenta durante a pausa (nunca para de todo) + mergulho com easing.
    const f = raw * 0.06 + 0.94 * ease.inOutCubic(seg(raw, p.hold, 1));
    const cur = W(k);
    const R = 1 / cur.q; // zoom total desta etapa
    const z = Math.pow(R, f);
    // Ponto fixo F (em coords de tela da palavra k, escala 1, origem no centro): zoom puro em torno dele
    // leva o miolo ao centro quando z = R.  C(z) = F (1 - 1/z), F = c / (1 - 1/R).
    const cx = cur.c.x * cur.s;
    const cy = cur.c.y * cur.s;
    const Fx = cx / (1 - 1 / R);
    const Fy = cy / (1 - 1 / R);
    const Cx = Fx * (1 - 1 / z);
    const Cy = Fy * (1 - 1 / z);

    // Transform da palavra j (relativa a k) em tela: centro (X, Y) e escala S (unidades de mundo → px).
    const frame = (j) => {
      // começa na k: origem do mundo k em tela
      let X = w / 2 - Cx * z;
      let Y = h / 2 - Cy * z;
      let Z = z; // px por unidade "de tela" da palavra k
      if (j < 0) {
        // palavra anterior: o miolo dela contém a k
        const pv = W(k - 1);
        const s = Z / pv.q; // escala da anterior
        X -= pv.c.x * pv.s * s;
        Y -= pv.c.y * pv.s * s;
        return { X, Y, Z: s, wd: pv, idx: k - 1 };
      }
      for (let i = 0; i < j; i++) {
        const a = W(k + i);
        X += a.c.x * a.s * Z;
        Y += a.c.y * a.s * Z;
        Z *= a.q;
      }
      return { X, Y, Z, wd: W(k + j), idx: k + j };
    };

    const ellipse = (fr, rx, ry) => {
      ctx.beginPath();
      ctx.ellipse(fr.X + fr.wd.c.x * fr.wd.s * fr.Z, fr.Y + fr.wd.c.y * fr.wd.s * fr.Z, rx * fr.wd.s * fr.Z, ry * fr.wd.s * fr.Z, 0, 0, Math.PI * 2);
    };
    // O miolo cobre a tela inteira? (então a palavra e as de fora não aparecem)
    const covers = (fr) => {
      const s = fr.wd.s * fr.Z;
      const ex = fr.wd.c.ix * s * 0.98;
      const ey = fr.wd.c.iy * s * 0.98;
      const ox = fr.X + fr.wd.c.x * s;
      const oy = fr.Y + fr.wd.c.y * s;
      for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) if (((x - ox) / ex) ** 2 + ((y - oy) / ey) ** 2 > 1) return false;
      return true;
    };

    // Primeira camada visível, de fora para dentro.
    let start = -1;
    while (start < 2 && covers(frame(start))) start++;
    const first = frame(start);
    ctx.fillStyle = bgOf(first.idx);
    ctx.fillRect(0, 0, w, h);

    let saves = 0;
    for (let j = start; j < start + 4; j++) {
      const fr = frame(j);
      const s = fr.wd.s * fr.Z;
      const wd = fr.wd;
      if (wd.W * s < 2) break; // pequena demais
      ctx.save();
      ctx.translate(fr.X, fr.Y);
      ctx.scale(s, s);
      ctx.font = FONT(BASE);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = fgOf(fr.idx);
      if (wd.before) ctx.fillText(wd.before, wd.ox, wd.oy);
      if (wd.after) ctx.fillText(wd.after, wd.lx + ctx.measureText(wd.ch).width, wd.oy);
      // Miolo com a cor do mundo seguinte (até o meio do traço) e a letra-portal por cima.
      const portal = () => {
        ctx.fillStyle = bgOf(fr.idx + 1);
        ctx.beginPath();
        ctx.ellipse(wd.c.x, wd.c.y, wd.c.mx, wd.c.my, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      ctx.fillStyle = p.accent;
      if (wd.c.solid) {
        ctx.fillText(wd.ch, wd.lx, wd.oy);
        portal();
      } else {
        portal();
        ctx.fillStyle = p.accent;
        ctx.fillText(wd.ch, wd.lx, wd.oy);
      }
      ctx.restore();
      // As próximas camadas ficam recortadas dentro do miolo.
      ellipse(fr, wd.c.ix * 1.002, wd.c.iy * 1.002);
      ctx.save();
      saves++;
      ctx.clip();
    }
    while (saves--) ctx.restore();
  },
};
