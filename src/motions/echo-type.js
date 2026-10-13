import { TAU, clamp, ease, mixHex } from '../lib/anim.js';

// Eco tipográfico: N cópias da palavra, desenhadas de trás para a frente. Cada cópia é contorno grosso
// + miolo pintado com a cor do fundo (esconde os contornos internos do Inter e faz a cópia da frente
// tapar as de trás, como camadas recortadas). Cópia k segue o mesmo caminho da frente com atraso k·lag
// — o rastro "chicoteia". Tudo em voltas inteiras de progress → loop perfeito.
const MODES = ['órbita', 'onda', 'giro', 'túnel'];

export default {
  id: 'echo-type',
  title: 'Echo Type',
  description: 'Uma palavra repetida em contornos empilhados que seguem a da frente com atraso, girando, ondulando ou em túnel.',
  category: 'tipografia',
  tags: ['tipografia', 'loop'],
  duration: 6,
  poster: 1.1,

  params: {
    text: { type: 'text', label: 'Texto', default: 'ECHO' },
    mode: { type: 'select', label: 'Movimento', options: MODES, default: 'órbita' },
    copies: { type: 'range', label: 'Cópias', min: 3, max: 30, step: 1, default: 14 },
    spread: { type: 'range', label: 'Distância do eco', min: 0.2, max: 2, step: 0.05, default: 1 },
    lag: { type: 'range', label: 'Atraso', min: 0, max: 2, step: 0.05, default: 1 },
    size: { type: 'range', label: 'Tamanho', min: 0.1, max: 0.5, step: 0.005, default: 0.3 },
    stroke: { type: 'range', label: 'Traço', min: 0.5, max: 4, step: 0.1, default: 1.6 },
    color: { type: 'color', label: 'Texto', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Destaque (fundo do eco)', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Fundo', default: '#0d0d10' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  render(ctx, t, { w, h, p, progress }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const text = p.text.trim();
    if (!text) return;
    const m = Math.min(w, h);
    const N = Math.round(p.copies);
    const mode = MODES.includes(p.mode) ? p.mode : MODES[0];

    const font = (z) => `900 ${z}px Inter, system-ui, sans-serif`;
    let fs = m * p.size;
    ctx.font = font(fs);
    ctx.letterSpacing = '0px';
    const tw = ctx.measureText(text).width;
    // a órbita/onda espalha as cópias para os lados: reserva espaço
    const room = mode === 'túnel' ? 0.8 : mode === 'giro' ? 0.7 : 0.72;
    if (tw > w * room) fs *= (w * room) / tw;
    ctx.font = font(fs);
    const capH = fs * 0.727;
    const cx = w / 2;
    const cy = h / 2;
    const lag = 0.012 * p.lag;
    const sp = p.spread;
    const lw = Math.max(1, m * 0.0016 * p.stroke);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw * 2; // metade fica sob o miolo
    const knock = p.transparent ? null : p.bg;

    // Transformação da cópia k (k = 0 é a da frente). Retorna {x, y, r, s}.
    const pose = (k) => {
      const ph = TAU * (progress - k * lag);
      const u = k / Math.max(1, N - 1);
      switch (mode) {
        case 'onda': {
          // pilha descendo na diagonal; o eixo x ondula com fase atrasada por cópia
          const step = fs * 0.07 * sp;
          return {
            x: Math.sin(ph) * fs * 0.4 * sp * u,
            y: k * step - ((N - 1) * step) / 2 + Math.cos(2 * ph) * fs * 0.05,
            r: 0.06 * Math.sin(ph - 0.6),
            s: 1,
          };
        }
        case 'giro': {
          // leque: cada cópia gira em torno do centro com o atraso; a da frente balança devagar
          const swing = ease.inOutSine(0.5 + 0.5 * Math.sin(ph));
          return { x: 0, y: 0, r: (swing - 0.5) * 0.5 * sp * (0.15 + u), s: 1 - u * 0.12 };
        }
        case 'túnel': {
          // camadas cada vez maiores atrás, respirando em onda que corre de dentro para fora
          const br = 0.5 + 0.5 * Math.cos(ph * 1);
          return { x: Math.sin(ph) * fs * 0.06 * k * 0.3, y: Math.cos(ph) * fs * 0.04 * k * 0.3, r: 0, s: 1 + k * (0.1 + 0.12 * br) * sp };
        }
        default: {
          // órbita: a direção do eco gira; com atraso, o rastro vira uma espiral
          const d = k * fs * 0.06 * sp;
          return { x: Math.cos(ph) * d, y: Math.sin(ph) * d * 0.75, r: 0, s: 1 - u * 0.04 };
        }
      }
    };

    const B = ctx.getTransform();
    for (let k = N - 1; k >= 0; k--) {
      const q = pose(k);
      const u = k / Math.max(1, N - 1);
      ctx.setTransform(B);
      ctx.translate(cx + q.x, cy + q.y);
      if (q.r) ctx.rotate(q.r);
      if (q.s !== 1) ctx.scale(q.s, q.s);
      const yb = capH / 2;
      if (k === 0) {
        ctx.fillStyle = p.color;
        ctx.fillText(text, 0, yb);
        break;
      }
      // cor do contorno: perto da frente = texto; no fundo do eco = destaque, apagando
      const fade = mode === 'túnel' ? clamp(1.25 - u * 1.1) : clamp(1.15 - u * 0.75);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = mixHex(p.color, p.accent, ease.outCubic(clamp(u * 1.6)));
      ctx.lineWidth = (lw * 2) / q.s;
      ctx.strokeText(text, 0, yb);
      ctx.globalAlpha = 1;
      if (knock) {
        ctx.fillStyle = knock;
        ctx.fillText(text, 0, yb);
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillText(text, 0, yb);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.setTransform(B);
    ctx.globalAlpha = 1;
  },
};
