import { TAU, clamp, lerp, rng, hexToRgb } from '../lib/anim.js';

// Camadas de papel recortado com sombra macia, em loop.
//  • túnel: folhas com um furo orgânico, uma atrás da outra; a câmera avança e cada folha passa por ela.
//    O loop avança exatamente `layers` folhas e os furos repetem com esse período (forma = f(g mod layers)).
//    A cor depende da profundidade (claro perto → destaque → fundo lá longe), então a folha nova nasce
//    da mesma cor do fundo e não "pisca".
//  • paisagem: morros recortados empilhados, cada camada desliza um número inteiro de períodos por loop.
// Sombra: a folha (furada) é pintada em preto num buffer pequeno fixo (128 px) mapeado sobre a caixa do
// furo e ampliada com drawImage — a interpolação bilinear vira um desfoque proporcional ao tamanho do furo
// (perspectiva de graça), sem shadowBlur nem ctx.filter.

const SB = 128; // resolução do buffer de sombra
const NP = 120; // pontos por contorno

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

export default {
  id: 'paper-layers',
  title: 'Paper Layers',
  description: 'Camadas de papel recortado com sombra macia em parallax: um túnel de folhas furadas que a câmera atravessa, ou morros empilhados.',
  category: 'fundos',
  tags: ['fundo', 'loop', '3d'],
  duration: 16,

  params: {
    mode: { type: 'select', label: 'Cena', options: ['túnel', 'paisagem'], default: 'túnel' },
    near: { type: 'color', label: 'Papel claro', default: '#f2e8da' },
    accent: { type: 'color', label: 'Destaque', default: '#e8664a' },
    deep: { type: 'color', label: 'Fundo', default: '#2a1620' },
    layers: { type: 'range', label: 'Camadas', min: 5, max: 12, step: 1, default: 8 },
    wobble: { type: 'range', label: 'Recorte', min: 0, max: 1, step: 0.01, default: 0.55 },
    shadow: { type: 'range', label: 'Sombra', min: 0, max: 1, step: 0.01, default: 0.6 },
    curve: { type: 'range', label: 'Curva', min: 0, max: 1, step: 0.01, default: 0.45 },
    grain: { type: 'boolean', label: 'Textura', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, p, px }) {
    const M = Math.round(p.layers);
    const r = rng(p.seed);
    // furos (túnel): harmônicos de baixa ordem
    const holes = Array.from({ length: M }, () => ({
      harm: [2, 3, 4, 5, 7].map((k, i) => ({ k, a: (0.11 / (1 + i * 0.6)) * (0.4 + r() * 0.6), ph: r() * TAU })),
      rot: r() * TAU,
      spin: (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.4),
    }));
    // morros (paisagem): harmônicos inteiros de x/w → periódicos na largura
    const hills = Array.from({ length: M }, (_, i) => ({
      harm: [1, 2, 3, 5].map((k, j) => ({ k, a: (1 / (1 + j * 1.6)) * (0.5 + r() * 0.5), ph: r() * TAU })),
      base: lerp(0.38, 0.86, M > 1 ? i / (M - 1) : 0),
      amp: lerp(0.15, 0.07, M > 1 ? i / (M - 1) : 0),
      speed: i + 1,
    }));

    const sh = document.createElement('canvas');
    sh.width = SB;
    sh.height = SB;

    let grain = null;
    if (p.grain) {
      // textura de papel: ruído fino + fibras, num buffer de meia resolução
      const gw = Math.max(1, Math.round((w * px) / 2));
      const gh = Math.max(1, Math.round((h * px) / 2));
      grain = document.createElement('canvas');
      grain.width = gw;
      grain.height = gh;
      const g = grain.getContext('2d');
      const img = g.createImageData(gw, gh);
      const rr = rng(p.seed * 31 + 5);
      for (let i = 0; i < gw * gh; i++) {
        const v = rr();
        const o = i * 4;
        const c = v < 0.5 ? 0 : 255;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = c;
        img.data[o + 3] = Math.abs(v - 0.5) * 2 * 40;
      }
      g.putImageData(img, 0, 0);
    }

    return {
      M,
      holes,
      hills,
      sh,
      grain,
      near: hexToRgb(p.near),
      acc: hexToRgb(p.accent),
      deep: hexToRgb(p.deep),
      pts: new Float32Array(NP * 2 * M),
    };
  },

  render(ctx, t, { w, h, p, px, progress: u, state }) {
    const { M, sh, near, acc, deep, pts } = state;
    const sg = sh.getContext('2d');
    const m = Math.min(w, h);
    ctx.fillStyle = css(deep);
    ctx.fillRect(0, 0, w, h);

    // cor por profundidade f (0 perto … 1 longe): claro → destaque → fundo
    const tone = (f) => (f < 0.45 ? mix3(near, acc, f / 0.45) : mix3(acc, deep, Math.pow((f - 0.45) / 0.55, 1.25)));
    const shA = 0.55 * p.shadow;

    // desenha a sombra (folha furada em preto, desfocada pelo buffer) e depois a folha
    const drawSheet = (path, bx0, by0, bx1, by1, dx, dy, color, alpha, rim) => {
      if (shA > 0 && alpha > 0) {
        sg.setTransform(1, 0, 0, 1, 0, 0);
        sg.clearRect(0, 0, SB, SB);
        const sx = SB / (bx1 - bx0);
        const sy = SB / (by1 - by0);
        sg.setTransform(sx, 0, 0, sy, -bx0 * sx, -by0 * sy);
        sg.fillStyle = '#000';
        sg.fill(path(true), 'evenodd');
        ctx.globalAlpha = shA * alpha;
        ctx.drawImage(sh, bx0 + dx, by0 + dy, bx1 - bx0, by1 - by0);
        ctx.globalAlpha = 1;
      }
      const P = path(false);
      ctx.fillStyle = css(color);
      ctx.fill(P, 'evenodd');
      if (rim > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${rim})`;
        ctx.stroke(P);
      }
    };

    if (p.mode === 'paisagem') {
      // céu: o fundo; sol de papel
      const sunR = m * 0.11;
      const sunX = w * 0.68;
      const sunY = h * 0.3;
      ctx.fillStyle = css(mix3(near, acc, 0.25));
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, TAU);
      ctx.fill();
      const N = 96;
      for (let i = 0; i < M; i++) {
        const L = state.hills[i];
        const f = 1 - (M > 1 ? i / (M - 1) : 0); // 1 = mais longe
        const color = tone(clamp(f * 0.85 + 0.05));
        const off = L.speed * u; // períodos inteiros por loop
        const yAt = (x) => {
          let v = 0;
          for (const hm of L.harm) v += hm.a * Math.sin(TAU * hm.k * (x / w + off) + hm.ph);
          return h * L.base - h * L.amp * v * (0.4 + p.wobble);
        };
        const ys = new Float32Array(N + 1);
        let top = h;
        for (let j = 0; j <= N; j++) {
          ys[j] = yAt((j / N) * w);
          top = Math.min(top, ys[j]);
        }
        const blur = m * (0.012 + 0.02 * (1 - f));
        const path = (forShadow) => {
          const P = new Path2D();
          const pad = forShadow ? blur * 3 : 2;
          P.moveTo(-pad, h + pad);
          for (let j = 0; j <= N; j++) P.lineTo(-pad + (j / N) * (w + pad * 2), ys[j]);
          P.lineTo(w + pad, h + pad);
          P.closePath();
          return P;
        };
        const by0 = top - blur * 4;
        drawSheet(path, -blur * 4, by0, w + blur * 4, h + blur * 2, 0, -blur * 0.4, color, 1, 0.12);
      }
    } else {
      // túnel — 1º passo: geometria de cada folha (perto → longe)
      const c = 1.35;
      const aspect = Math.pow(w / h, 0.45);
      const R0 = Math.hypot(w, h) * 0.62 * 0.62;
      const adv = u * M;
      const base = Math.floor(adv);
      const fr = adv - base;
      const L = [];
      for (let s = 0; s < M; s++) {
        // profundidade contínua z ∈ (0, M]; a folha global g repete com período M
        const z = s + 1 - fr;
        const g = (s + base + 1) % M;
        const H = state.holes[g];
        const sc = c / (z + c - 0.65);
        const a = clamp((M - z) / 0.8); // nasce no fundo com a cor do fundo
        const col = mix3(deep, tone(clamp(z / M)), a);
        const k = Math.pow(z / M, 1.4) * p.curve;
        const ox = w / 2 + Math.sin(TAU * u + z * 0.5) * m * 0.32 * k;
        const oy = h / 2 + Math.cos(TAU * u + z * 0.4) * m * 0.2 * k;
        const rad = R0 * sc;
        const rot = H.rot + H.spin * (z / M) * 0.8;
        const o = s * NP * 2;
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (let i = 0; i < NP; i++) {
          const th = (i / NP) * TAU;
          let rr = 1;
          for (const hm of H.harm) rr += hm.a * p.wobble * 1.6 * Math.sin(hm.k * th + hm.ph);
          const x = ox + Math.cos(th + rot) * rad * rr * aspect;
          const y = oy + Math.sin(th + rot) * rad * rr;
          pts[o + i * 2] = x;
          pts[o + i * 2 + 1] = y;
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
        // folha cujo furo engole a tela inteira (as 4 quinas dentro) não aparece
        let gone = bx0 < 0 && bx1 > w && by0 < 0 && by1 > h;
        if (gone) {
          for (const [qx, qy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
            let inside = false;
            for (let i = 0, j = NP - 1; i < NP; j = i++) {
              const xi = pts[o + i * 2], yi = pts[o + i * 2 + 1], xj = pts[o + j * 2], yj = pts[o + j * 2 + 1];
              if (yi > qy !== yj > qy && qx < ((xj - xi) * (qy - yi)) / (yj - yi) + xi) inside = !inside;
            }
            if (!inside) gone = false;
          }
        }
        L.push({ o, a, col, sc, gone, bx0, by0, bx1, by1 });
      }
      // 2º passo: pinta do fundo para a frente; cada folha só aparece dentro do furo da folha da frente,
      // então o retângulo dela se limita à caixa desse furo (as folhas do fundo ficam baratas)
      for (let s = M - 1; s >= 0; s--) {
        const Ls = L[s];
        if (Ls.gone || Ls.a <= 0) continue;
        const { o, bx0, by0, bx1, by1 } = Ls;
        let clip = [-4, -4, w + 8, h + 8];
        for (let q = s - 1; q >= 0; q--) {
          if (L[q].gone) continue;
          const Q = L[q];
          const e = 4;
          const x0 = Math.max(-4, Q.bx0 - e), y0 = Math.max(-4, Q.by0 - e);
          clip = [x0, y0, Math.min(w + 4, Q.bx1 + e) - x0, Math.min(h + 4, Q.by1 + e) - y0];
          break;
        }
        const blur = Math.max(2, (bx1 - bx0) / SB);
        const mg = blur * 5;
        const holePath = (forShadow) => {
          const P = new Path2D();
          if (forShadow) P.rect(bx0 - mg * 2, by0 - mg * 2, bx1 - bx0 + mg * 4, by1 - by0 + mg * 4);
          else P.rect(clip[0], clip[1], clip[2], clip[3]);
          P.moveTo(pts[o], pts[o + 1]);
          for (let i = 1; i < NP; i++) P.lineTo(pts[o + i * 2], pts[o + i * 2 + 1]);
          P.closePath();
          return P;
        };
        ctx.lineWidth = Math.max(0.8, m * 0.0016 * Ls.sc);
        drawSheet(holePath, bx0 - mg, by0 - mg, bx1 + mg, by1 + mg, blur * 0.9, blur * 1.3, Ls.col, Ls.a, 0.1 * Ls.a);
      }
    }

    if (state.grain) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(state.grain, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  },
};
