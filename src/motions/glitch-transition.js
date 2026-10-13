import { seg, rng, smoothstep } from '../lib/anim.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, isA, { w, h, p }) {
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

// Hash determinístico (i, passo) → [0,1): sorteios que mudam a cada "quadro de glitch".
function hash(a, b) {
  let x = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const STEP = 24; // sorteios por segundo (o glitch "pula" em quadros, não desliza)

export default {
  id: 'glitch-transition',
  title: 'Glitch Cut',
  description: 'A cena quebra em fatias deslocadas com separação RGB, blocos de datamosh tomam a tela no corte e a próxima cena volta arrastando restos da anterior.',
  category: 'transicoes',
  tags: ['transição', 'overlay', 'alpha'],
  duration: 1.0,
  poster: 0.47,

  params: {
    color1: { type: 'color', label: 'Cor dos blocos', default: '#111114' },
    color2: { type: 'color', label: 'Destaque', default: '#ff4d2e' },
    color3: { type: 'color', label: 'Claro', default: '#f4f1ea' },
    fringeA: { type: 'color', label: 'Franja 1', default: '#00e1ff' },
    fringeB: { type: 'color', label: 'Franja 2', default: '#ff2fb9' },
    rgb: { type: 'range', label: 'Separação RGB', min: 0, max: 1, step: 0.01, default: 0.6 },
    shift: { type: 'range', label: 'Deslocamento', min: 0, max: 1, step: 0.01, default: 0.6 },
    block: { type: 'range', label: 'Tamanho dos blocos', min: 0.3, max: 2, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 12 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  setup({ w, h, p, px, duration }) {
    const m = Math.min(w, h);
    const r = rng(p.seed * 53 + 1);
    const mid = duration / 2;

    // Blocos: linhas de alturas variadas, cada linha cortada em larguras variadas (ladrilham a tela).
    const cells = [];
    let y = 0;
    while (y < h) {
      const rh = Math.min(h - y, m * p.block * (0.035 + 0.16 * r() ** 1.8));
      let x = 0;
      // a linha inteira tende a entrar junto (faixas horizontais, como num arquivo corrompido)
      const rowBias = r();
      while (x < w) {
        let cw = m * p.block * (0.12 + 1.1 * r() ** 2);
        if (w - x - cw < m * 0.08) cw = w - x; // sem tirinhas no fim da linha
        const k = 0.6 * rowBias + 0.4 * r();
        const k2 = 0.6 * rowBias + 0.4 * r();
        // a maioria entra perto do corte: a tela "quebra" de vez em poucos quadros
        cells.push({
          x, y, w: cw, h: rh,
          on: mid - duration * 0.3 * (0.03 + 0.97 * k ** 2.2),
          off: mid + duration * 0.3 * (0.03 + 0.97 * k2 ** 1.8),
          ghost: duration * (0.04 + 0.14 * r()),
          id: cells.length,
        });
        x += cw;
      }
      y += rh;
    }

    // Textura de datamosh em baixa resolução: rajadas verticais (pixels arrastados) e faixas.
    const TW = 64;
    const TH = 36;
    const tex = document.createElement('canvas');
    tex.width = TW;
    tex.height = TH;
    const g = tex.getContext('2d');
    const pal = [
      [p.color1, 0.52], ['#24262d', 0.17], ['#3a3d46', 0.09], [p.color2, 0.11], [p.color3, 0.07], [p.fringeA, 0.02], [p.fringeB, 0.02],
    ];
    const pick = () => {
      let v = r();
      for (const [c, wgt] of pal) if ((v -= wgt) <= 0) return c;
      return p.color1;
    };
    g.fillStyle = p.color1;
    g.fillRect(0, 0, TW, TH);
    for (let x = 0; x < TW; ) {
      const sw = 1 + Math.floor(r() ** 2 * 4);
      for (let yy = 0; yy < TH; ) {
        const run = 1 + Math.floor(r() ** 2 * 14);
        g.fillStyle = pick();
        g.fillRect(x, yy, sw, run);
        yy += run;
      }
      x += sw;
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle = pick();
      g.fillRect(Math.floor(r() * TW), Math.floor(r() * TH), Math.floor(3 + r() * 24), 1);
    }

    const st = { cells, tex, TW, TH };
    if (p.transparent) return st;

    // Prévias A e B prontas, mais as versões só-R, só-G, só-B (somadas com 'lighter' dão a imagem).
    const W = Math.max(1, Math.round(w * px));
    const H = Math.max(1, Math.round(h * px));
    const scene = (isA) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const cg = c.getContext('2d');
      cg.setTransform(px, 0, 0, px, 0, 0);
      preview(cg, isA, { w, h, p });
      const ch = ['#ff0000', '#00ff00', '#0000ff'].map((col) => {
        const cc = document.createElement('canvas');
        cc.width = W;
        cc.height = H;
        const g2 = cc.getContext('2d');
        g2.drawImage(c, 0, 0);
        g2.globalCompositeOperation = 'multiply';
        g2.fillStyle = col;
        g2.fillRect(0, 0, W, H);
        return cc;
      });
      return { full: c, ch };
    };
    st.A = scene(true);
    st.B = scene(false);
    st.W = W;
    st.H = H;
    return st;
  },

  render(ctx, t, env) {
    const { w, h, p, duration, px, state } = env;
    const { cells, tex, TW, TH } = state;
    const m = Math.min(w, h);
    const mid = duration / 2;
    const tq = Math.floor(t * STEP);
    const seed = p.seed * 7919;
    // intensidade do glitch: cresce até o corte e some depois
    const g = t < mid ? smoothstep(duration * 0.06, mid, t) : 1 - smoothstep(mid, duration * 0.94, t);

    // 1) Cena (só com prévia): fatias horizontais deslocadas e separação RGB.
    if (!p.transparent) {
      const S = t < mid ? state.A : state.B;
      const sx = state.W / w;
      // a separação RGB liga em alguns quadros (mais vezes perto do corte)
      const splitOn = g > 0.04 && hash(tq, seed + 1) < 0.3 + 0.7 * g;
      const split = m * 0.035 * p.rgb * g * (0.4 + hash(tq, seed + 2));
      if (!splitOn) ctx.drawImage(S.full, 0, 0, w, h);
      let y = 0;
      let i = 0;
      while (y < h && g > 0.04) {
        const sh = Math.min(h - y, m * (0.03 + 0.2 * hash(i, seed + 3) ** 2));
        const jump = hash(i, tq + seed) < g * 0.55;
        const dx = jump ? (hash(i + 99, tq + seed) - 0.5) * m * 0.7 * p.shift * g : 0;
        const sy0 = y * sx;
        const shh = sh * sx;
        // fatia deslocada com a sobra "dando a volta" pelo outro lado
        const xs = dx === 0 ? [0] : [dx, dx - Math.sign(dx) * w];
        if (splitOn) {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, y, w, sh);
          ctx.globalCompositeOperation = 'lighter';
          for (const x0 of xs)
            for (let c = 0; c < 3; c++) ctx.drawImage(S.ch[c], 0, sy0, state.W, shh, x0 + (c - 1) * split, y, w, sh);
          ctx.globalCompositeOperation = 'source-over';
        } else if (dx !== 0) {
          for (const x0 of xs) ctx.drawImage(S.full, 0, sy0, state.W, shh, x0, y, w, sh);
        }
        y += sh;
        i++;
      }
    }

    // 2) Blocos de datamosh: entram aos poucos, cobrem tudo no corte, saem aos poucos.
    //    Depois de saírem, (com prévia) ficam um instante mostrando a cena anterior arrastada.
    const fr = m * 0.01 * p.rgb;
    const fringeA = [];
    const fringeB = [];
    const live = [];
    const ghosts = [];
    for (const c of cells) {
      if (t >= c.on && t <= c.off) live.push(c);
      else if (!p.transparent && t > c.off && t < c.off + c.ghost) ghosts.push(c);
    }
    if (fr > 0.3) {
      for (const c of live) {
        const j = hash(c.id, tq + seed + 5);
        if (j < 0.7) continue;
        fringeA.push(c);
        fringeB.push(c);
      }
      ctx.fillStyle = p.fringeA;
      ctx.beginPath();
      for (const c of fringeA) ctx.rect(c.x - fr * (1 + hash(c.id, tq)), c.y, c.w, c.h);
      ctx.fill();
      ctx.fillStyle = p.fringeB;
      ctx.beginPath();
      for (const c of fringeB) ctx.rect(c.x + fr * (1 + hash(c.id + 3, tq)), c.y, c.w, c.h);
      ctx.fill();
    }
    ctx.imageSmoothingEnabled = false;
    const pad = 0.75; // sobreposição: sem frestas de anti-alias entre blocos
    const tw = TW / w; // texel por px lógico na escala "natural"
    for (const c of live) {
      // escala e origem na textura sorteadas a cada passo (o bloco "tremula")
      const z = 0.2 + 0.6 * hash(c.id, tq + seed + 9);
      const sw = Math.max(1, Math.min(TW, c.w * tw * z));
      const shh = Math.max(1, Math.min(TH, c.h * tw * z));
      const ox = hash(c.id + 7, tq + seed) * (TW - sw);
      const oy = hash(c.id + 11, tq + seed) * (TH - shh);
      ctx.drawImage(tex, ox, oy, sw, shh, c.x - pad, c.y - pad, c.w + pad * 2, c.h + pad * 2);
    }
    ctx.imageSmoothingEnabled = true;
    if (ghosts.length) {
      // datamosh: blocos da cena A persistem por cima da B, esticados na horizontal
      const A = state.A.full;
      const sx = state.W / w;
      for (const c of ghosts) {
        const col = c.x + hash(c.id, tq + seed + 13) * c.w;
        const drift = (seg(t, c.off, c.off + c.ghost) - 0.5) * m * 0.05 * (hash(c.id, 77) - 0.5);
        ctx.drawImage(A, col * sx, c.y * sx, Math.max(1, 2 * px), c.h * sx, c.x + drift, c.y, c.w, c.h);
      }
    }

    // 3) Linhas finas de varredura nas bordas do pico.
    if (g > 0.25) {
      const n = Math.floor(6 * g);
      ctx.fillStyle = p.color3;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (hash(i, tq + seed + 21) > 0.6) continue;
        const yy = hash(i + 40, tq + seed) * h;
        ctx.rect(hash(i + 80, tq + seed) * w * 0.5, yy, w * (0.2 + 0.6 * hash(i + 120, tq)), Math.max(1, m * 0.003));
      }
      ctx.fill();
    }
  },
};
