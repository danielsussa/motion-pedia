import { seg, ease } from '../lib/anim.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, t, { w, h, p, duration }) {
  if (p.transparent) return;
  const isA = t < duration / 2;
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

// Para onde a folha viaja. Matriz que leva o referencial (folha entra pela esquerda e sai pela direita,
// eixo X = viagem, Y = transversal) para a tela; a translação depende de w/h.
const DIRS = {
  direita: (w, h) => [1, 0, 0, 1, 0, 0],
  esquerda: (w, h) => [-1, 0, 0, 1, w, 0],
  baixo: (w, h) => [0, 1, 1, 0, 0, 0],
  cima: (w, h) => [0, -1, 1, 0, 0, h],
};

const MAXA = Math.PI / 2 - 0.02; // dobra quase fechada (a folha some de perfil)

export default {
  id: 'fold-transition',
  title: 'Fold Transition',
  description: 'Uma folha sanfonada entra desdobrando painel por painel em perspectiva, cobre a tela lisa no corte e se dobra de novo para o outro lado revelando a próxima cena.',
  category: 'transicoes',
  tags: ['transição', '3d', 'forma', 'alpha'],
  duration: 1.6,
  poster: 0.36,

  params: {
    direction: { type: 'select', label: 'A folha vai para', options: Object.keys(DIRS), default: 'direita' },
    paper: { type: 'color', label: 'Folha', default: '#ff4d2e' },
    accent: { type: 'color', label: 'Faixa', default: '#f4efe6' },
    band: { type: 'range', label: 'Largura da faixa', min: 0, max: 0.6, step: 0.01, default: 0.05 },
    panels: { type: 'range', label: 'Painéis', min: 2, max: 14, step: 1, default: 6 },
    depth: { type: 'range', label: 'Perspectiva', min: 0, max: 1, step: 0.01, default: 0.75 },
    shade: { type: 'range', label: 'Sombreado', min: 0, max: 1, step: 0.01, default: 0.7 },
    stagger: { type: 'range', label: 'Cascata', min: 0, max: 0.8, step: 0.01, default: 0.25 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  render(ctx, t, env) {
    const { w, h, p, duration } = env;
    preview(ctx, t, env);
    const mid = duration / 2;
    const closing = t < mid;
    const u = closing ? seg(t, mid * 0.04, mid * 0.95) : seg(t, mid + duration * 0.03, duration * 0.97);
    if (closing && u <= 0) return;
    if (!closing && u >= 1) return;

    const dir = DIRS[p.direction] ?? DIRS.direita;
    const vertical = p.direction === 'baixo' || p.direction === 'cima';
    const W = vertical ? h : w;
    const H = vertical ? w : h;
    const N = Math.max(2, Math.round(p.panels));
    const P = W / N;
    const D = Math.min(0.8, p.stagger);

    // Ângulo de cada painel (0 = liso). Painel 0 fica preso na âncora.
    // Fechando: âncora à esquerda, desdobra a partir dela. Abrindo: âncora à direita, a ponta solta dobra primeiro.
    const ang = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const d = N > 1 ? (D * i) / (N - 1) : 0;
      const k = seg(u, d, d + 1 - D);
      ang[i] = closing ? MAXA * (1 - ease.inOutCubic(k)) : MAXA * ease.inOutCubic(seg(u, D - d, D - d + 1 - D));
    }
    // Vincos no referencial da âncora (x cresce para longe dela; z negativo = para longe da câmera).
    const xs = new Float64Array(N + 1);
    const zs = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) {
      xs[i + 1] = xs[i] + P * Math.cos(ang[i]);
      zs[i + 1] = zs[i] + (i % 2 ? 1 : -1) * P * Math.sin(ang[i]);
    }
    const f = W * (2.4 - 1.7 * p.depth); // distância da câmera
    const cx = W / 2;
    const cy = H / 2;
    // Abrindo: espelha (âncora em x = W).
    const X = (x) => (closing ? x : W - x);
    const proj = (i) => {
      const s = f / (f - zs[i]);
      return [cx + (X(xs[i]) - cx) * s, s];
    };

    ctx.save();
    ctx.transform(...dir(w, h));

    // Sombra projetada na cena à frente da ponta solta.
    const tipX = X(xs[N]);
    const tipFold = Math.sin(ang[N - 1]);
    const shA = 0.38 * p.shade * Math.min(1, tipFold * 3) * (closing ? seg(u, 0, 0.12) : 1 - seg(u, 0.85, 1));
    if (shA > 0.002) {
      const len = P * (0.35 + 0.5 * tipFold);
      const sgn = closing ? 1 : -1;
      const g = ctx.createLinearGradient(tipX, 0, tipX + sgn * len, 0);
      g.addColorStop(0, `rgba(0,0,0,${shA})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(tipX, tipX + sgn * len), 0, len, H);
    }

    // Painéis: quadriláteros em perspectiva (borda perto da câmera mais alta), 1 px de sobra entre vizinhos.
    const bandH = (H * p.band) / 2;
    const pad = 1;
    const quad = (xa, sa, xb, sb, half) => {
      const o = xb > xa ? pad : -pad;
      ctx.beginPath();
      ctx.moveTo(xa - o, cy - half * sa - pad);
      ctx.lineTo(xb + o, cy - half * sb - pad);
      ctx.lineTo(xb + o, cy + half * sb + pad);
      ctx.lineTo(xa - o, cy + half * sa + pad);
      ctx.closePath();
    };
    let prev = proj(0);
    for (let i = 0; i < N; i++) {
      const next = proj(i + 1);
      const [xa, sa] = prev;
      const [xb, sb] = next;
      prev = next;
      if (Math.abs(xb - xa) < 0.05 && !(closing ? u >= 1 : u <= 0)) continue;
      ctx.fillStyle = p.paper;
      quad(xa, sa, xb, sb, H / 2);
      ctx.fill();
      if (bandH > 0) {
        ctx.fillStyle = p.accent;
        quad(xa, sa, xb, sb, bandH);
        ctx.fill();
      }
      // Luz: painéis que se afastam (vale) escurecem em direção ao vinco do fundo; os que vêm de volta ficam claros.
      const fold = Math.sin(ang[i]);
      if (fold > 0.001 && p.shade > 0) {
        const away = zs[i + 1] < zs[i]; // desce para o fundo
        const facingLight = away !== !closing; // luz vem do lado da âncora de entrada
        const ridgeFirst = away; // o vinco de cima (perto) é xa quando o painel desce
        const g = ctx.createLinearGradient(xa, 0, xb, 0);
        if (facingLight) {
          // face iluminada: brilho perto do vinco de cima, leve sombra no vale
          const hi = p.shade * fold * 0.16;
          const lo = p.shade * fold * 0.12;
          g.addColorStop(ridgeFirst ? 0 : 1, `rgba(255,255,255,${hi})`);
          g.addColorStop(0.55, 'rgba(255,255,255,0)');
          g.addColorStop(ridgeFirst ? 1 : 0, `rgba(0,0,0,${lo})`);
        } else {
          const dark = p.shade * fold * 0.62;
          g.addColorStop(ridgeFirst ? 0 : 1, `rgba(0,0,0,${dark * 0.45})`);
          g.addColorStop(ridgeFirst ? 1 : 0, `rgba(0,0,0,${dark})`);
        }
        ctx.fillStyle = g;
        quad(xa, sa, xb, sb, H / 2);
        ctx.fill();
        // Filete de luz no vinco mais próximo da câmera.
        const rx = ridgeFirst ? xa : xb;
        const rs = ridgeFirst ? sa : sb;
        const lw = Math.max(1, P * 0.012) * fold;
        ctx.fillStyle = `rgba(255,255,255,${0.35 * p.shade * fold})`;
        ctx.fillRect(rx - lw / 2, cy - (H / 2) * rs, lw, H * rs);
      }
    }
    ctx.restore();
  },
};
