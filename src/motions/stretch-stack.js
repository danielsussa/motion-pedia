import { clamp, lerp, seg, spring, ease, mixHex, rgba } from '../lib/anim.js';

// Pôster suíço: cada linha é esticada (scale X/Y) para a caixa da tinta preencher a largura e a sua
// fatia da altura. As fatias trocam entre si: todas iguais → uma linha domina → a próxima... A linha
// alta engorda (peso variável) e as achatadas afinam, para a mancha ficar equilibrada.
export default {
  id: 'stretch-stack',
  title: 'Stretch Stack',
  description: 'Palavras empilhadas esticam na vertical até preencher a tela e trocam de altura entre si, como num pôster suíço.',
  category: 'tipografia',
  tags: ['tipografia', 'loop'],
  duration: 8,
  poster: 2.6,

  params: {
    text: { type: 'textarea', label: 'Linhas', rows: 4, default: 'FORMA\nRITMO\nPAUSA' },
    caption: { type: 'text', label: 'Legenda', default: 'Estudo nº 3 — tipo esticado' },
    focus: { type: 'range', label: 'Altura da linha em foco', min: 0.4, max: 0.85, step: 0.01, default: 0.66 },
    minW: { type: 'range', label: 'Peso das linhas achatadas', min: 100, max: 900, step: 10, default: 400 },
    maxW: { type: 'range', label: 'Peso da linha alta', min: 100, max: 900, step: 10, default: 900 },
    bounce: { type: 'range', label: 'Mola', min: 0, max: 0.6, step: 0.01, default: 0.22 },
    color: { type: 'color', label: 'Texto', default: '#141414' },
    accent: { type: 'color', label: 'Destaque', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Fundo', default: '#eeebe3' },
  },

  render(ctx, t, { w, h, p, duration }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const lines = p.text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    const n = lines.length;
    if (!n) return;
    const m = Math.min(w, h);

    // Estados: 0 = todas iguais, j = linha j-1 em foco. Cada estado: pausa e depois a transição.
    const states = n + 1;
    const per = duration / states;
    const share = (state, i) => {
      if (state === 0 || n === 1) return 1 / n;
      const F = Math.max(p.focus, 1 / n);
      return i === state - 1 ? F : (1 - F) / (n - 1);
    };
    const st = Math.floor(t / per) % states;
    const nx = (st + 1) % states;
    const t0 = st * per + per * 0.42; // início da transição (antes: pausa)
    const trans = per * 0.5;
    const stg = Math.min(0.07, (per * 0.25) / n);
    const raw = lines.map((_, i) => {
      const k = spring(seg(t, t0 + i * stg, t0 + i * stg + trans), p.bounce);
      return Math.max(0.02, lerp(share(st, i), share(nx, i), k));
    });
    const sum = raw.reduce((a, b) => a + b, 0);
    const shares = raw.map((r) => r / sum);

    // Layout: margem, faixa de legenda no topo, vãos entre as linhas.
    const mg = m * 0.04;
    const capH = m * 0.05;
    const gap = m * 0.014;
    const top = mg + capH;
    const avail = h - top - mg - gap * (n - 1);
    const boxW = w - mg * 2;

    // Faixa de legenda: texto à esquerda, contador à direita, fio embaixo.
    const mono = Math.max(10, m * 0.017);
    ctx.font = `500 ${mono}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.color;
    ctx.fillText(p.caption, mg, mg + capH * 0.35);
    // foco atual (o maior) para o contador
    let big = 0;
    shares.forEach((s, i) => s > shares[big] && (big = i));
    const eq = Math.max(...shares) - Math.min(...shares) < 0.08;
    const label = eq ? `00 / ${String(n).padStart(2, '0')}` : `${String(big + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    ctx.textAlign = 'right';
    ctx.fillText(label, w - mg, mg + capH * 0.35);
    ctx.textAlign = 'left';
    ctx.fillStyle = p.accent;
    const dot = mono * 0.32;
    ctx.beginPath();
    ctx.arc(w - mg - ctx.measureText(label).width - mono * 0.9, mg + capH * 0.35, dot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(p.color, 0.85);
    ctx.fillRect(mg, mg + capH * 0.75, boxW, Math.max(1, m * 0.0018));

    // Linhas esticadas.
    const S = 200; // tamanho de referência para medir
    const sMin = n > 1 ? (1 - Math.max(p.focus, 1 / n)) / (n - 1) : 1;
    const sMax = Math.max(p.focus, 1 / n);
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = `${-S * 0.01}px`;
    let y = top;
    lines.forEach((line, i) => {
      const hh = avail * shares[i];
      const k = n > 1 ? clamp((shares[i] - sMin) / (sMax - sMin || 1), 0, 1) : 1;
      const wt = Math.round(lerp(p.minW, p.maxW, ease.inOutSine(k)));
      ctx.font = `${wt} ${S}px Inter, system-ui, sans-serif`;
      const mt = ctx.measureText(line);
      const inkW = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight;
      const inkH = mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent;
      if (inkW > 0 && inkH > 0 && hh > 0.5) {
        // destaque só para a linha que domina (relativo ao estado "todas iguais")
        const hl = n > 1 ? clamp((shares[i] - 1 / n) / (sMax - 1 / n), 0, 1) : 0;
        ctx.fillStyle = hl > 0.25 ? mixHex(p.color, p.accent, ease.inOutSine(clamp((hl - 0.25) / 0.45, 0, 1))) : p.color;
        ctx.save();
        ctx.translate(mg, y);
        ctx.scale(boxW / inkW, hh / inkH);
        ctx.fillText(line, mt.actualBoundingBoxLeft, mt.actualBoundingBoxAscent);
        ctx.restore();
      }
      y += hh + gap;
    });
    ctx.letterSpacing = '0px';
  },
};
