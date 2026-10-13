import { TAU, clamp, lerp, seg, ease, spring, rng, hexToRgb, rgba } from '../lib/anim.js';
import { iso } from '../lib/space.js';

// Cidade isométrica numa grade n×n de lotes. Cada lote tem um prédio (altura, recuo e nº de andares
// sorteados no setup, mais altos perto do centro) ou fica vazio (praça). Linha do tempo:
//   chão aparece → prédios brotam em stagger do centro para fora, com mola → janelas acendem
//   aleatoriamente → pausa → janelas apagam e os prédios afundam (o loop fecha no chão vazio).
// Pintura de trás para frente pela diagonal i+j (lotes na mesma diagonal não se sobrepõem).

const C30 = Math.cos(Math.PI / 6);
const shade = (c, k) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

export default {
  id: 'iso-city',
  title: 'Iso City',
  description: 'Cidade isométrica: os prédios brotam do chão em stagger com mola e as janelas vão acendendo uma a uma.',
  category: 'formas',
  tags: ['3d', 'forma', 'intro', 'loop'],
  duration: 10,
  poster: 6.2,

  params: {
    grid: { type: 'range', label: 'Quadras', min: 4, max: 14, step: 1, default: 8 },
    height: { type: 'range', label: 'Altura', min: 0.5, max: 2.5, step: 0.05, default: 1.3 },
    density: { type: 'range', label: 'Densidade', min: 0.4, max: 1, step: 0.01, default: 0.8 },
    bounce: { type: 'range', label: 'Mola', min: 0, max: 0.6, step: 0.01, default: 0.25 },
    building: { type: 'color', label: 'Prédios', default: '#7a8296' },
    light: { type: 'color', label: 'Janelas', default: '#ffb84d' },
    bg: { type: 'color', label: 'Fundo', default: '#11131a' },
    zoom: { type: 'range', label: 'Zoom', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ p }) {
    const r = rng(p.seed);
    const n = p.grid;
    const half = (n - 1) / 2;
    const lots = [];
    for (let s = 0; s <= 2 * (n - 1); s++) {
      for (let i = Math.max(0, s - n + 1); i <= Math.min(n - 1, s); i++) {
        const j = s - i;
        const gx = i - half;
        const gy = j - half;
        const d = Math.hypot(gx, gy) / (half * Math.SQRT2 || 1); // 0 centro … 1 canto
        const empty = r() > p.density + (1 - d) * 0.2;
        const floors = Math.max(1, Math.round((2 + r() * 7) * (1.15 - 0.75 * d) * p.height + (r() < 0.12 ? 6 * p.height : 0)));
        const inset = 0.12 + r() * 0.12;
        const cols = r() < 0.5 ? 2 : 3;
        // momento de cada janela acender (por face, andar, coluna)
        const win = [];
        for (let k = 0; k < floors * cols * 2; k++) win.push(r() < 0.78 ? r() : 2);
        lots.push({
          gx, gy, d, empty, floors, inset, cols, win,
          roof: r() < 0.3, // caixa d'água/casa de máquinas no topo
          delay: d * 1.5 + r() * 0.35,
          tone: 0.86 + r() * 0.14,
        });
      }
    }
    return { lots, n };
  },

  render(ctx, t, { w, h, p, state, duration }) {
    const { lots, n } = state;
    const m = Math.min(w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    // brilho atrás da cidade (cor das janelas, só alpha), cresce quando acendem
    const lit = seg(t, 3.2, 6.5) * (1 - seg(t, duration - 1.6, duration - 0.6));
    const glow = ctx.createRadialGradient(w / 2, h * 0.52, 0, w / 2, h * 0.52, Math.max(w, h) * 0.55);
    glow.addColorStop(0, rgba(p.light, 0.03 + 0.07 * lit));
    glow.addColorStop(1, rgba(p.light, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const FH = 0.24; // altura de um andar (em lotes)
    const maxZ = Math.max(...lots.map((l) => l.floors)) * FH;
    // escala: largura do losango = 2·n·cos30; altura = n + prédio mais alto
    const S = Math.min((w * (w > h ? 0.8 : 0.96)) / (2 * n * C30), (h * 0.78) / (n + maxZ * 0.8)) * p.zoom;
    // câmera: leve aproximação e deriva ao longo do filme
    const z = 1 + 0.06 * ease.inOutSine(seg(t, 0, duration));
    const opt = { cx: w / 2, cy: h / 2 + (maxZ * S * 0.4), scale: S * z };
    const P = (x, y, zz) => iso(x, y, zz, opt);

    // chão: losango que abre do centro
    const g = ease.outExpo(seg(t, 0, 1.1)) * (1 - ease.inCubic(seg(t, duration - 0.7, duration)));
    const E = (n / 2 + 0.25) * g;
    if (g > 0.001) {
      const a = P(-E, -E, 0), b = P(E, -E, 0), c = P(E, E, 0), d = P(-E, E, 0);
      const base = hexToRgb(p.bg);
      ctx.fillStyle = shade(base.map((v) => v + 14), 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      // espessura da laje
      const th = S * z * 0.35;
      ctx.fillStyle = shade(base.map((v) => v + 4), 1);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y + th); ctx.lineTo(c.x, c.y + th); ctx.lineTo(d.x, d.y + th);
      ctx.closePath();
      ctx.fill();
      // ruas: linhas da grade
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = Math.max(1, m * 0.0008);
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const q = (k - n / 2) * g;
        let u = P(q, -E, 0), v = P(q, E, 0);
        ctx.moveTo(u.x, u.y); ctx.lineTo(v.x, v.y);
        u = P(-E, q, 0); v = P(E, q, 0);
        ctx.moveTo(u.x, u.y); ctx.lineTo(v.x, v.y);
      }
      ctx.stroke();
    }

    const col = hexToRgb(p.building);
    const lightRGB = hexToRgb(p.light);
    const off = shade(hexToRgb(p.bg), 1.6);
    const tEnd = duration - 1.2; // início da saída
    ctx.lineJoin = 'round';

    for (const L of lots) {
      if (L.empty) continue;
      // brota com mola; sai afundando (inBack) em ordem inversa
      const t0 = 0.7 + L.delay;
      const grow = spring(seg(t, t0, t0 + 1.1), p.bounce);
      const out = ease.inBack(seg(t, tEnd - (1 - L.d) * 0.4 + 0.0, tEnd + 0.5 - (1 - L.d) * 0.4));
      const k = grow * (1 - out);
      if (k <= 0.001) continue;
      const H = L.floors * FH * k;
      const f = 0.5 - L.inset;
      const x0 = L.gx - f, x1 = L.gx + f, y0 = L.gy - f, y1 = L.gy + f;
      const tA = P(x0, y0, H), tB = P(x1, y0, H), tC = P(x1, y1, H), tD = P(x0, y1, H);
      const bB = P(x1, y0, 0), bC = P(x1, y1, 0), bD = P(x0, y1, 0);

      // face direita (x = x1) e esquerda (y = y1)
      ctx.fillStyle = shade(col, 0.42 * L.tone);
      ctx.beginPath();
      ctx.moveTo(tB.x, tB.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(bC.x, bC.y); ctx.lineTo(bB.x, bB.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(col, 0.66 * L.tone);
      ctx.beginPath();
      ctx.moveTo(tD.x, tD.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(bC.x, bC.y); ctx.lineTo(bD.x, bD.y);
      ctx.closePath();
      ctx.fill();

      // janelas: o prédio sobe do chão, então só aparecem os andares acima de z = 0
      {
        const cols = L.cols;
        const span = 2 * f;
        const ww = (span / cols) * 0.42;
        const wh = FH * 0.42;
        const pathOn = new Path2D();
        const pathOff = new Path2D();
        let idx = 0;
        for (let face = 0; face < 2; face++) {
          for (let fz = 0; fz < L.floors; fz++) {
            for (let c = 0; c < cols; c++, idx++) {
              const zb = H - (L.floors - fz) * FH + FH * 0.3; // alinhado pelo topo
              if (zb < FH * 0.1) continue;
              const a0 = -f + (span / cols) * (c + 0.5) - ww / 2;
              const q = face === 0
                ? [[x1, L.gy + a0, zb], [x1, L.gy + a0 + ww, zb], [x1, L.gy + a0 + ww, zb + wh], [x1, L.gy + a0, zb + wh]]
                : [[L.gx + a0, y1, zb], [L.gx + a0 + ww, y1, zb], [L.gx + a0 + ww, y1, zb + wh], [L.gx + a0, y1, zb + wh]];
              // acende em stagger aleatório entre 3,2 s e 6,5 s; apaga antes da saída
              const on = L.win[idx] < 2 && t > lerp(3.2, 6.5, L.win[idx]) && t < tEnd - 0.5 + L.win[idx] * 0.4;
              const path = on ? pathOn : pathOff;
              const v0 = P(...q[0]);
              path.moveTo(v0.x, v0.y);
              for (let e = 1; e < 4; e++) {
                const v = P(...q[e]);
                path.lineTo(v.x, v.y);
              }
              path.closePath();
            }
          }
        }
        ctx.fillStyle = off;
        ctx.fill(pathOff);
        ctx.fillStyle = `rgb(${lightRGB.join(',')})`;
        ctx.fill(pathOn);
      }

      // topo
      ctx.fillStyle = shade(col, 1 * L.tone);
      ctx.beginPath();
      ctx.moveTo(tA.x, tA.y); ctx.lineTo(tB.x, tB.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(tD.x, tD.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(0.6, m * 0.0007);
      ctx.stroke();

      // casa de máquinas: cubo pequeno no topo, aparece depois do prédio
      if (L.roof && k > 0.6) {
        const rk = clamp((k - 0.6) / 0.4);
        const rf = f * 0.4, rh = FH * 0.7 * rk;
        const ox = L.gx - f * 0.25, oy = L.gy - f * 0.25;
        const A = P(ox - rf, oy - rf, H + rh), B = P(ox + rf, oy - rf, H + rh), C = P(ox + rf, oy + rf, H + rh), D = P(ox - rf, oy + rf, H + rh);
        const Bb = P(ox + rf, oy - rf, H), Cb = P(ox + rf, oy + rf, H), Db = P(ox - rf, oy + rf, H);
        ctx.fillStyle = shade(col, 0.42 * L.tone);
        ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(Cb.x, Cb.y); ctx.lineTo(Bb.x, Bb.y); ctx.fill();
        ctx.fillStyle = shade(col, 0.66 * L.tone);
        ctx.beginPath(); ctx.moveTo(D.x, D.y); ctx.lineTo(C.x, C.y); ctx.lineTo(Cb.x, Cb.y); ctx.lineTo(Db.x, Db.y); ctx.fill();
        ctx.fillStyle = shade(col, 0.92 * L.tone);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.fill();
      }
    }
  },
};
