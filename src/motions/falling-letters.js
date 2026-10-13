import { TAU, rng, rgba, clamp, lerp, seg, ease, smoothstep } from '../lib/anim.js';
import { bake } from '../lib/bake.js';
import { verlet } from '../lib/physics.js';

// Cada letra é uma caixa rígida simplificada: 4 cantos verlet + 4 arestas + 2 diagonais (physics.js).
// Colisão entre letras (aqui): canto de uma caixa dentro da outra é empurrado para fora pela aresta mais
// próxima, com atrito tangencial; sub-passos curtos deixam a pilha estável. Tudo pré-calculado (bake) no setup;
// o render lê (x, y, ângulo) por letra. Linha do tempo: parado → as letras soltam em ordem aleatória, caem,
// quicam e empilham → pausa → o próprio bake tocado ao contrário (rebobinado, com rastro) → parado de novo.

const FPS = 60; // frames gravados
const SUB = 4; // sub-passos por frame
const T_REL = 0.9; // primeira letra solta
const REL_SPREAD = 1.0; // janela de soltura
const SIM_END = 5.6; // fim da simulação (pilha já assentada)
const RW0 = 6.2; // início do rebobinado
const RW1 = 8.5; // fim do rebobinado

function layout(text, w, h, S) {
  const c = document.createElement('canvas').getContext('2d');
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  c.font = '800 100px Inter';
  const wordW = words.map((wd) => c.measureText(wd).width);
  const space = c.measureText(' ').width;
  // tenta 1..6 linhas (quebra gulosa com largura-alvo crescente) e fica com a que dá a maior fonte
  let best = null;
  const total = wordW.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  for (let n = 1; n <= Math.min(6, words.length); n++) {
    const target = total / n;
    const lines = [[]];
    let lw = 0;
    words.forEach((wd, i) => {
      const add = (lines.at(-1).length ? space : 0) + wordW[i];
      if (lines.at(-1).length && lw + add / 2 > target && lines.length < n) {
        lines.push([]);
        lw = 0;
      }
      lw += (lines.at(-1).length ? space : 0) + wordW[i];
      lines.at(-1).push(i);
    });
    const maxW = Math.max(...lines.map((L) => L.reduce((a, i, k) => a + wordW[i] + (k ? space : 0), 0)));
    const fs = Math.min((w * 0.84) / maxW, (h * 0.42) / (lines.length * 1.05)) * 100;
    const size = Math.min(fs, S * 0.3);
    if (!best || size > best.size * 1.08) best = { lines, size };
  }
  return { words, ...best };
}

export default {
  id: 'falling-letters',
  title: 'Falling Letters',
  description: 'The letters of a phrase break loose, fall with physics, bounce and pile up on the floor — then rewind back into place.',
  category: 'tipografia',
  tags: ['typography', 'simulation', 'loop', 'intro'],
  duration: 9.2,
  poster: 5.8,

  params: {
    text: { type: 'text', label: 'Text', default: 'CATCH THIS' },
    color: { type: 'color', label: 'Letters', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Accent (last word)', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Background', default: '#111114' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    bounce: { type: 'range', label: 'Bounce', min: 0, max: 0.7, step: 0.01, default: 0.35 },
    kick: { type: 'range', label: 'Mess', min: 0, max: 2, step: 0.05, default: 1 },
    trail: { type: 'boolean', label: 'Rewind trail', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ w, h, p }) {
    const S = Math.min(w, h);
    const L = layout(p.text, w, h, S);
    if (!L) return { letters: [] };
    const rand = rng(p.seed);
    const fs = L.size;
    const font = `800 ${fs}px Inter`;
    const c = document.createElement('canvas').getContext('2d');
    c.font = font;
    const space = c.measureText(' ').width;
    const lineH = fs * 1.02;
    const top = h * 0.42 - (L.lines.length * lineH) / 2;

    // letras: posição do pen (x, baseline) e caixa da tinta
    const letters = [];
    L.lines.forEach((line, li) => {
      const str = line.map((i) => L.words[i]).join(' ');
      let x = w / 2 - c.measureText(str).width / 2;
      const base = top + li * lineH + fs * 0.8;
      line.forEach((wi, k) => {
        const wd = L.words[wi];
        if (k) x += space;
        for (let j = 0; j < wd.length; j++) {
          const ch = wd[j];
          const pen = x + c.measureText(wd.slice(0, j)).width;
          const m = c.measureText(ch);
          const x0 = pen - m.actualBoundingBoxLeft, x1 = pen + m.actualBoundingBoxRight;
          const y0 = base - m.actualBoundingBoxAscent, y1 = base + m.actualBoundingBoxDescent;
          if (x1 - x0 < 1) continue;
          letters.push({
            ch, pen, base, x0, x1, y0, y1,
            cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
            accent: wi === L.words.length - 1 && L.words.length > 1,
            line: li,
          });
        }
        x += c.measureText(wd).width;
      });
    });
    // caixas vizinhas não podem nascer sobrepostas (pares com kerning apertado, tipo "AV")
    for (let i = 0; i + 1 < letters.length; i++) {
      const a = letters[i], b2 = letters[i + 1];
      if (a.base !== b2.base || a.x1 < b2.x0) continue;
      const mid = (a.x1 + b2.x0) / 2;
      a.x1 = mid - 0.5;
      b2.x0 = mid + 0.5;
    }
    for (const Lt of letters) Lt.cx = (Lt.x0 + Lt.x1) / 2;
    const n = letters.length;

    // ordem de soltura aleatória + chute inicial (velocidade e giro)
    // aleatória, mas as linhas de baixo tendem a soltar antes (as de cima caem sobre a pilha)
    const order = letters.map((Lt, i) => [rand() - Lt.line * 0.45, i]).sort((a, b) => a[0] - b[0]);
    order.forEach(([, i], k) => {
      const L0 = letters[i];
      L0.rel = T_REL + (k / Math.max(1, n - 1)) * REL_SPREAD + rand() * 0.08;
      L0.vx = (rand() - 0.5) * S * 0.35 * p.kick;
      L0.vy = -rand() * S * 0.25 * p.kick;
      L0.w = (rand() - 0.5) * 7 * p.kick; // rad/s
    });

    const floor = h - S * 0.07;
    const wall = S * 0.03;
    const G = S * 3.4;

    const world = verlet({
      gravity: [0, G],
      damping: 0.999,
      iterations: 4,
      bounds: { x0: wall, x1: w - wall, y1: floor, bounce: p.bounce, friction: 0.55 },
    });
    const bodies = letters.map((Lt) => {
      const pts = [
        world.point(Lt.x0, Lt.y0, { pinned: true }),
        world.point(Lt.x1, Lt.y0, { pinned: true }),
        world.point(Lt.x1, Lt.y1, { pinned: true }),
        world.point(Lt.x0, Lt.y1, { pinned: true }),
      ];
      for (let k = 0; k < 4; k++) world.link(pts[k], pts[(k + 1) % 4]);
      world.link(pts[0], pts[2]);
      world.link(pts[1], pts[3]);
      return { pts, L: Lt, live: false };
    });

    const relax = () => {
      for (const l of world.links) {
        const { a, b } = l;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const k = ((d - l.length) / d) * 0.5;
        if (a.pinned || b.pinned) continue;
        a.x += dx * k; a.y += dy * k;
        b.x -= dx * k; b.y -= dy * k;
      }
      for (const q of world.points) {
        if (q.pinned) continue;
        if (q.y > floor) q.y = floor;
        if (q.x < wall) q.x = wall;
        if (q.x > w - wall) q.x = w - wall;
      }
    };

    // Ponto de teste q = lerp(aresta k de A, s) dentro da caixa B (cantos em sentido horário na tela) →
    // empurra pela aresta mais rasa de B. Testar também pontos no meio das arestas (não só os cantos)
    // pega o caso "em X", em que duas caixas se cruzam sem nenhum canto dentro da outra.
    const MU = 0.6;
    const SAMPLES = [0, 0.25, 0.5, 0.75];
    // mede a penetração do ponto de teste; devolve o contato (ou null)
    const probe = (A, ka, sa, B) => {
      const q0 = A.pts[ka], q1 = A.pts[(ka + 1) % 4];
      const qx = lerp(q0.x, q1.x, sa), qy = lerp(q0.y, q1.y, sa);
      let best = -Infinity, bk = -1, bt = 0, nx = 0, ny = 0;
      for (let k = 0; k < 4; k++) {
        const e0 = B.pts[k], e1 = B.pts[(k + 1) % 4];
        const ex = e1.x - e0.x, ey = e1.y - e0.y;
        const el = Math.hypot(ex, ey) || 1e-6;
        // normal para fora (horário na tela, y para baixo): (ey, -ex)
        const ux = ey / el, uy = -ex / el;
        const d = (qx - e0.x) * ux + (qy - e0.y) * uy;
        if (d > 0) return null; // fora
        if (d > best) {
          best = d; bk = k; nx = ux; ny = uy;
          bt = clamp(((qx - e0.x) * ex + (qy - e0.y) * ey) / (el * el));
        }
      }
      return { A, ka, sa, B, bk, bt, nx, ny, depth: -best };
    };
    const resolve = ({ A, ka, sa, B, bk, bt, nx, ny, depth }) => {
      const q0 = A.pts[ka], q1 = A.pts[(ka + 1) % 4];
      const e0 = B.pts[bk], e1 = B.pts[(bk + 1) % 4];
      // letra ainda presa = corpo estático (massa infinita): o outro lado leva a correção toda
      const wa = A.live ? (B.live ? 0.5 : 1) : 0;
      const wb = B.live ? (A.live ? 0.5 : 1) : 0;
      const la = 1 / (sa * sa + (1 - sa) * (1 - sa));
      const lb = 1 / (bt * bt + (1 - bt) * (1 - bt));
      const a0 = (1 - sa) * la * depth * wa, a1 = sa * la * depth * wa;
      const b0 = (1 - bt) * lb * depth * wb, b1 = bt * lb * depth * wb;
      q0.x += nx * a0; q0.y += ny * a0;
      q1.x += nx * a1; q1.y += ny * a1;
      e0.x -= nx * b0; e0.y -= ny * b0;
      e1.x -= nx * b1; e1.y -= ny * b1;
      // atrito: reduz a velocidade tangencial relativa
      const tx = -ny, ty = nx;
      const vt = (P) => (P.x - P.px) * tx + (P.y - P.py) * ty;
      const rel = (lerp(vt(q0), vt(q1), sa) - lerp(vt(e0), vt(e1), bt)) * MU;
      const ra = rel * wa, rb = rel * wb;
      q0.px += tx * ra * (1 - sa); q0.py += ty * ra * (1 - sa);
      q1.px += tx * ra * sa; q1.py += ty * ra * sa;
      e0.px -= tx * rb * (1 - bt); e0.py -= ty * rb * (1 - bt);
      e1.px -= tx * rb * bt; e1.py -= ty * rb * bt;
    };
    // só o contato mais fundo por par e sentido em cada rodada: aplicar todos os pontos de uma vez
    // sobrecorrige (vários empurrões somados na mesma aresta) e injeta energia — letras saíam voando
    const pushAll = (A, B) => {
      let deep = null;
      for (let k = 0; k < 4; k++) {
        for (const sa of SAMPLES) {
          const c = probe(A, k, sa, B);
          if (c && (!deep || c.depth > deep.depth)) deep = c;
        }
      }
      if (deep) resolve(deep);
    };

    const aabb = (B) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of B.pts) {
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
        if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
      }
      B.bb = [x0, y0, x1, y1];
    };

    const collide = () => {
      // letras soltas colidem entre si e com as que ainda estão presas no lugar (estáticas)
      const all = bodies;
      for (const B of all) if (B.live || !B.bb) aabb(B);
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const A = all[i], B = all[j];
          if (!A.live && !B.live) continue;
          if (A.bb[2] < B.bb[0] || B.bb[2] < A.bb[0] || A.bb[3] < B.bb[1] || B.bb[3] < A.bb[1]) continue;
          pushAll(A, B);
          pushAll(B, A);
        }
      }
    };

    const snap = () => {
      const s = new Float32Array(n * 3);
      bodies.forEach((B, i) => {
        const [a, b, c2, d] = B.pts;
        s[i * 3] = (a.x + b.x + c2.x + d.x) / 4;
        s[i * 3 + 1] = (a.y + b.y + c2.y + d.y) / 4;
        s[i * 3 + 2] = Math.atan2(b.y - a.y + c2.y - d.y, b.x - a.x + c2.x - d.x);
      });
      return s;
    };

    const dt = 1 / FPS / SUB;
    const VMAX = S * 4.5 * dt;
    const b = bake({
      duration: SIM_END,
      fps: FPS,
      init: () => null,
      step: (_, __, i) => {
        for (let k = 0; k < SUB; k++) {
          const time = (i + k / SUB) / FPS;
          // solta as letras na hora delas, com o chute inicial (velocidade + giro em torno do centro)
          for (const B of bodies) {
            if (B.live || time < B.L.rel) continue;
            B.live = true;
            const { cx, cy, vx, vy, w: om } = B.L;
            for (const q of B.pts) {
              q.pinned = false;
              const rx = q.x - cx, ry = q.y - cy;
              q.px = q.x - (vx - om * ry) * dt;
              q.py = q.y - (vy + om * rx) * dt;
            }
          }
          world.step(dt);
          for (let r = 0; r < 4; r++) {
            collide();
            relax();
          }
          // trava de segurança: velocidade máxima (nenhuma letra sai disparada por um contato ruim)
          for (const q of world.points) {
            const vx = q.x - q.px, vy = q.y - q.py, v = Math.hypot(vx, vy);
            if (v > VMAX) {
              q.px = q.x - (vx / v) * VMAX;
              q.py = q.y - (vy / v) * VMAX;
            }
          }
        }
      },
      snapshot: snap,
    });

    // deslocamento do pen (x, baseline) em relação ao centro da caixa
    for (const Lt of letters) {
      Lt.ox = Lt.pen - Lt.cx;
      Lt.oy = Lt.base - Lt.cy;
    }
    return { letters, b, font, floor, fs };
  },

  render(ctx, t, { w, h, p, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const { letters, b, font, floor, fs } = state;
    if (!letters.length) return;
    const S = Math.min(w, h);
    const n = letters.length;

    // tempo da simulação: avança, segura, rebobina (in-out) e segura
    const rw = seg(t, RW0, RW1);
    const simT = (tt) => (tt < RW0 ? Math.min(tt, SIM_END) : SIM_END * (1 - ease.inOutCubic(seg(tt, RW0, RW1))));
    const s = simT(t);

    // chão: linha sutil que aparece enquanto há letras caídas
    const away = smoothstep(T_REL, T_REL + 0.6, t) * (1 - smoothstep(RW1 - 0.4, RW1, t));
    if (away > 0) {
      ctx.fillStyle = rgba(p.color, 0.1 * away);
      ctx.fillRect(S * 0.03, floor + S * 0.004, w - S * 0.06, Math.max(1, S * 0.0018));
    }

    ctx.font = font;
    ctx.textBaseline = 'alphabetic';

    const draw = (sim, alpha) => {
      const fi = b.index(sim);
      const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, b.frames.length - 1), f = fi - i0;
      const A = b.frames[i0], B = b.frames[i1];
      for (const pass of [false, true]) {
        ctx.fillStyle = pass ? p.accent : p.color;
        ctx.globalAlpha = alpha;
        for (let i = 0; i < n; i++) {
          const Lt = letters[i];
          if (Lt.accent !== pass) continue;
          const x = lerp(A[i * 3], B[i * 3], f);
          const y = lerp(A[i * 3 + 1], B[i * 3 + 1], f);
          let da = B[i * 3 + 2] - A[i * 3 + 2];
          da -= Math.round(da / TAU) * TAU;
          let ang = A[i * 3 + 2] + da * f;
          // tremidinha antes de soltar (zera no instante da soltura → sem salto)
          if (t < RW0) {
            const k = seg(t, Lt.rel - 0.45, Lt.rel);
            if (k > 0 && k < 1) ang += Math.sin(k * TAU * 3) * Math.sin(Math.PI * k) * 0.06;
          }
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ang);
          ctx.fillText(Lt.ch, Lt.ox, Lt.oy);
          ctx.restore();
        }
      }
    };

    // rastro do rebobinado: cópias "do futuro" da simulação, esmaecidas
    if (p.trail && rw > 0 && rw < 1) {
      const k = Math.sin(Math.PI * rw);
      for (let j = 3; j >= 1; j--) draw(simT(t - j * 0.035), 0.16 * k * (1 - j / 4));
    }
    draw(s, 1);
    ctx.globalAlpha = 1;
  },
};
