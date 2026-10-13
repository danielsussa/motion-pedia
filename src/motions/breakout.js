import { TAU, clamp, seg, ease, rng, rgba, mixHex, lerp } from '../lib/anim.js';

// Breakout jogando sozinho. A partida é simulada no setup (120 Hz, subpassos) e gravada: posição da
// bola, x da raquete e a lista de blocos quebrados (tempo + velocidade da bola). A raquete é uma IA
// simples: prevê onde a bola chega (rebatendo nas paredes) e escolhe com que ponto bater para mirar
// na coluna mais "aberta" — então acaba cavando um túnel e a bola passa a quicar por cima dos blocos.
// Partículas são analíticas (posição = p0 + v·dt + g·dt²/2 com sementes fixas por bloco), então o
// render é função pura de t. Loop ∞: os blocos surgem no começo e caem no fim; a raquete volta ao
// centro com a bola em cima.

const HZ = 120;
const SUB = 4;
const NP = 12; // partículas por bloco
const LIFE = 1.0;

export default {
  id: 'breakout',
  title: 'Breakout',
  description: 'Demo de Breakout jogando sozinho: a raquete mira, a bola cava um túnel e os blocos quebram em partículas.',
  category: 'formas',
  tags: ['forma', 'loop', 'simulação', 'partículas'],
  duration: 16,
  poster: 12.2,

  params: {
    bg: { type: 'color', label: 'Fundo', default: '#101114' },
    ink: { type: 'color', label: 'Blocos', default: '#e9e4da' },
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    rows: { type: 'range', label: 'Fileiras', min: 3, max: 9, step: 1, default: 5 },
    speed: { type: 'range', label: 'Velocidade da bola', min: 0.6, max: 1.8, step: 0.05, default: 1 },
    particles: { type: 'range', label: 'Partículas', min: 0, max: 1.5, step: 0.05, default: 1 },
    hud: { type: 'boolean', label: 'Placar', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 1 },
  },

  setup({ w, h, p, duration }) {
    const m = Math.min(w, h);
    const R = rng(Math.round(p.seed) * 7577 + 3);
    const mg = m * 0.065;
    const hudH = p.hud ? m * 0.07 : 0;
    const x0 = mg;
    const x1 = w - mg;
    const fw = x1 - x0;
    // campo no máximo 1,6× mais alto que largo (no vertical sobra respiro em cima e embaixo)
    const fh = Math.min(h - mg * 1.6 - hudH, fw * 1.6);
    const y0 = (h - fh - hudH) / 2 + hudH;
    const y1 = y0 + fh;
    const cols = clamp(Math.round(fw / (m * 0.105)), 7, 16);
    const nRows = Math.round(p.rows) + (h > w * 1.4 ? 2 : 0); // no vertical cabem mais fileiras
    const bw = fw / cols;
    const bh = Math.min(bw * 0.42, (fh * 0.36) / nRows);
    const bTop = y0 + Math.max(bh * 2.4, fh * 0.1);
    const r = m * 0.0125;
    const pw = Math.min(m * 0.17, fw * 0.3);
    const ph = m * 0.018;
    const py = y1 - m * 0.06; // topo da raquete
    const nB = cols * nRows;
    const alive = new Uint8Array(nB).fill(1);
    const bx = (i) => x0 + (i % cols) * bw;
    const by = (i) => bTop + Math.floor(i / cols) * bh;

    const T_IN = 1.2;
    const T_OUT = duration - 1.7;
    const v0 = (fh * 0.85 + m * 0.6) * p.speed;
    const n = Math.ceil(duration * HZ) + 1;
    const ballX = new Float32Array(n);
    const ballY = new Float32Array(n);
    const padX = new Float32Array(n);
    const breaks = []; // { i, t, vx, vy }
    const padHits = [];

    let X = (x0 + x1) / 2;
    let Y = py - r;
    let vx = 0;
    let vy = 0;
    let P = X;
    let launched = false;
    const tunnel = R() < 0.5 ? 1 + Math.floor(R() * 2) : cols - 2 - Math.floor(R() * 2); // coluna preferida para o túnel
    let descending = false;
    let aimO = -0.35 + R() * 0.7; // ponto da raquete para o próximo rebote (-1..1)

    // x onde a bola chega na linha y, rebatendo nas paredes (dobra)
    const fold = (x) => {
      const L = fw - 2 * r;
      let u = (x - x0 - r) % (2 * L);
      if (u < 0) u += 2 * L;
      return x0 + r + (u > L ? 2 * L - u : u);
    };
    const colOpen = (c) => {
      let k = 0;
      for (let rr = 0; rr < nRows; rr++) if (alive[rr * cols + c]) k++;
      return k;
    };
    const chooseAim = (XL) => {
      // para cada ponto candidato, onde a bola cruza a base dos blocos → coluna
      let best = 0;
      let bestS = -Infinity;
      const yb = bTop + nRows * bh;
      for (let o = -0.85; o <= 0.86; o += 0.1) {
        const a = o * 1.05;
        const sx = Math.sin(a);
        const sy = Math.cos(a);
        const xr = fold(XL + (sx / sy) * (py - r - yb));
        const c = clamp(Math.floor((xr - x0) / bw), 0, cols - 1);
        const k = colOpen(c);
        // prefere colunas já abertas (túnel), mas não vazias; evita rebote muito reto
        const s = (k > 0 ? 4 - Math.abs(k - 1.2) : -3) - Math.abs(c - tunnel) * 0.22 + R() * 0.5 - Math.abs(o) * 0.6 + (Math.abs(o) < 0.12 ? -1.5 : 0);
        if (s > bestS) { bestS = s; best = o; }
      }
      return best;
    };

    const dt = 1 / HZ / SUB;
    for (let f = 0; f < n; f++) {
      const t = f / HZ;
      ballX[f] = X;
      ballY[f] = Y;
      padX[f] = P;
      if (f === n - 1) break;
      for (let s = 0; s < SUB; s++) {
        const ts = t + s * dt;
        if (!launched) {
          if (ts >= T_IN + 0.35 && ts < T_OUT) {
            launched = true;
            const a = (R() < 0.5 ? -1 : 1) * (0.35 + R() * 0.25);
            vx = Math.sin(a) * v0;
            vy = -Math.cos(a) * v0;
          } else {
            P += (((x0 + x1) / 2) - P) * (1 - Math.exp(-dt * 6));
            X = P;
            Y = py - r;
            continue;
          }
        }
        if (ts >= T_OUT) {
          // fim: bola congelada (some no render), raquete volta ao centro
          P += (((x0 + x1) / 2) - P) * (1 - Math.exp(-dt * 5));
          continue;
        }
        const sp = v0 * (1 + 0.28 * clamp((ts - T_IN) / (T_OUT - T_IN)));
        const vm = Math.hypot(vx, vy);
        vx *= sp / vm;
        vy *= sp / vm;
        const pxp = X;
        const pyp = Y;
        X += vx * dt;
        Y += vy * dt;
        // paredes
        if (X < x0 + r) { X = 2 * (x0 + r) - X; vx = Math.abs(vx); }
        if (X > x1 - r) { X = 2 * (x1 - r) - X; vx = -Math.abs(vx); }
        if (Y < y0 + r) { Y = 2 * (y0 + r) - Y; vy = Math.abs(vy); }
        // blocos (um por subpasso)
        if (Y - r < bTop + nRows * bh && Y + r > bTop) {
          const c0 = clamp(Math.floor((X - r - x0) / bw), 0, cols - 1);
          const c1 = clamp(Math.floor((X + r - x0) / bw), 0, cols - 1);
          const r0 = clamp(Math.floor((Y - r - bTop) / bh), 0, nRows - 1);
          const r1 = clamp(Math.floor((Y + r - bTop) / bh), 0, nRows - 1);
          let hit = -1;
          let bestD = Infinity;
          for (let rr = r0; rr <= r1; rr++) {
            for (let cc = c0; cc <= c1; cc++) {
              const i = rr * cols + cc;
              if (!alive[i]) continue;
              const qx = clamp(X, bx(i), bx(i) + bw);
              const qy = clamp(Y, by(i), by(i) + bh);
              const d = Math.hypot(X - qx, Y - qy);
              if (d < r && d < bestD) { bestD = d; hit = i; }
            }
          }
          if (hit >= 0) {
            alive[hit] = 0;
            breaks.push({ i: hit, t: ts, vx, vy });
            const inX = pxp > bx(hit) - r * 0.3 && pxp < bx(hit) + bw + r * 0.3;
            if (inX) { vy = -vy; Y = pyp; } else { vx = -vx; X = pxp; }
          }
        }
        // raquete: IA (ao começar a descer, decide com que ponto bater)
        if (vy > 0 && !descending) {
          descending = true;
          aimO = chooseAim(fold(X + (vx / vy) * (py - r - Y)));
        } else if (vy < 0) descending = false;
        const target = vy > 0 && Y < py ? fold(X + (vx / vy) * (py - r - Y)) - aimO * (pw / 2) : lerp(P, X, 0.5);
        // descendo: chega no alvo um pouco antes da bola (taxa ∝ 1/tempo restante)
        const tRem = vy > 0 ? (py - r - Y) / vy : Infinity;
        const rate = vy > 0 ? Math.min(1, (dt * 3.2) / Math.max(0.02, tRem - 0.07)) : 1 - Math.exp(-dt * 2.5);
        const dP = (target - P) * rate;
        P = clamp(P + dP, x0 + pw / 2, x1 - pw / 2);
        // rebote na raquete
        if (vy > 0 && Y + r >= py && pyp + r < py + ph) {
          let o = (X - P) / (pw / 2 + r);
          if (Math.abs(o) > 1.15) o = clamp(o, -1, 1); // errou: rebate mesmo assim pela beirada (raro)
          o = clamp(o, -1, 1);
          const a = o * 1.05;
          vx = Math.sin(a) * sp;
          vy = -Math.cos(a) * sp;
          Y = py - r;
          padHits.push(ts);
        }
      }
    }

    // partículas: sementes fixas
    const parts = new Float32Array(nB * NP * 5); // ox, oy, vx, vy, size
    for (let i = 0; i < nB * NP; i++) {
      parts[i * 5] = R();
      parts[i * 5 + 1] = R();
      const a = R() * TAU;
      const s = 0.3 + R() * 0.9;
      parts[i * 5 + 2] = Math.cos(a) * s;
      parts[i * 5 + 3] = Math.sin(a) * s - 0.5;
      parts[i * 5 + 4] = 0.5 + R() * 0.8;
    }
    const breakT = new Float32Array(nB).fill(Infinity);
    for (const b of breaks) breakT[b.i] = b.t;

    const rowColor = [];
    for (let rr = 0; rr < nRows; rr++) rowColor.push(rr === 0 ? p.accent : mixHex(p.bg, p.ink, lerp(0.95, 0.5, (rr - 1) / Math.max(1, nRows - 2))));

    return { x0, x1, y0, y1, cols, nRows, bw, bh, bTop, r, pw, ph, py, ballX, ballY, padX, breaks, breakT, padHits, parts, rowColor, T_IN, T_OUT, n, m };
  },

  render(ctx, t, { w, h, p, duration, state: S }) {
    const { x0, x1, y0, cols, nRows, bw, bh, bTop, r, pw, ph, py, breaks, breakT, parts, rowColor, T_IN, T_OUT, m } = S;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const fi = clamp(t * HZ, 0, S.n - 1);
    const f0 = Math.floor(fi);
    const f1 = Math.min(S.n - 1, f0 + 1);
    const fr = fi - f0;
    const at = (arr, tt) => {
      const q = clamp(tt * HZ, 0, S.n - 1);
      const a = Math.floor(q);
      const b = Math.min(S.n - 1, a + 1);
      return arr[a] + (arr[b] - arr[a]) * (q - a);
    };
    const BX = S.ballX[f0] + (S.ballX[f1] - S.ballX[f0]) * fr;
    const BY = S.ballY[f0] + (S.ballY[f1] - S.ballY[f0]) * fr;
    const PX = S.padX[f0] + (S.padX[f1] - S.padX[f0]) * fr;

    // paredes
    const lw = Math.max(1.5, m * 0.003);
    ctx.fillStyle = rgba(p.ink, 0.22);
    ctx.fillRect(x0 - lw * 3, y0 - lw * 3, x1 - x0 + lw * 6, lw);
    ctx.fillRect(x0 - lw * 3, y0 - lw * 3, lw, S.y1 - y0 + lw * 3);
    ctx.fillRect(x1 + lw * 2, y0 - lw * 3, lw, S.y1 - y0 + lw * 3);

    // blocos: entram com mola (stagger diagonal) e caem no fim
    const g = m * 2.4;
    const ins = Math.max(1, bw * 0.045);
    const rad = Math.min(bh * 0.18, bw * 0.08);
    for (let rr = 0; rr < nRows; rr++) {
      ctx.fillStyle = rowColor[rr];
      ctx.beginPath();
      let any = false;
      for (let c = 0; c < cols; c++) {
        const i = rr * cols + c;
        const tb = breakT[i];
        if (t >= tb + 0.12) continue;
        const d0 = 0.05 + (c / cols) * 0.45 + rr * 0.07;
        const pin = ease.outBack(seg(t, d0, d0 + 0.42));
        if (pin <= 0) continue;
        let x = x0 + c * bw;
        let y = bTop + rr * bh;
        let s = pin;
        // saída: cai com stagger
        if (t > T_OUT) {
          const d1 = T_OUT + 0.15 + ((cols - 1 - c) / cols) * 0.3 + (nRows - 1 - rr) * 0.04;
          const q = Math.max(0, t - d1);
          y += 0.5 * h * 4.5 * q * q;
          if (y > h + bh) continue;
          s = 1;
        }
        if (t >= tb) continue; // quebrando: desenhado abaixo em branco
        const ww = (bw - 2 * ins) * s;
        const hh = (bh - 2 * ins) * s;
        ctx.roundRect(x + bw / 2 - ww / 2, y + bh / 2 - hh / 2, ww, hh, rad);
        any = true;
      }
      if (any) ctx.fill();
    }
    // flash dos blocos quebrando (branco, cresce e some)
    ctx.fillStyle = '#ffffff';
    for (const b of breaks) {
      if (b.t > t) break;
      const k = (t - b.t) / 0.12;
      if (k >= 1) continue;
      const c = b.i % cols;
      const rr = Math.floor(b.i / cols);
      const s = 1 + 0.25 * ease.outCubic(k);
      const ww = (bw - 2 * ins) * s;
      const hh = (bh - 2 * ins) * s;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.roundRect(x0 + c * bw + bw / 2 - ww / 2, bTop + rr * bh + bh / 2 - hh / 2, ww, hh, rad);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // partículas
    if (p.particles > 0) {
      const np = Math.round(NP * Math.min(1, p.particles));
      const ps = Math.max(1, bh * 0.26) * Math.max(0.6, p.particles);
      const spd = m * 0.55;
      for (const b of breaks) {
        if (b.t > t) break;
        const dtb = t - b.t;
        if (dtb > LIFE) continue;
        const c = b.i % cols;
        const rr = Math.floor(b.i / cols);
        const life = 1 - dtb / LIFE;
        ctx.fillStyle = rowColor[rr];
        ctx.globalAlpha = Math.min(1, life * 1.6);
        ctx.beginPath();
        const bvx = (b.vx / (Math.hypot(b.vx, b.vy) || 1)) * 0.35;
        const bvy = (b.vy / (Math.hypot(b.vx, b.vy) || 1)) * 0.35;
        for (let j = 0; j < np; j++) {
          const o = (b.i * NP + j) * 5;
          const drag = (1 - Math.exp(-3 * dtb)) / 3;
          const px = x0 + c * bw + parts[o] * bw + (parts[o + 2] + bvx) * spd * drag;
          const pyy = bTop + rr * bh + parts[o + 1] * bh + (parts[o + 3] + bvy) * spd * drag + 0.5 * g * 0.5 * dtb * dtb;
          const s = ps * parts[o + 4] * (0.4 + 0.6 * life);
          ctx.rect(px - s / 2, pyy - s / 2, s, s);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // raquete (squash rápido a cada rebote)
    let hitK = 0;
    for (let i = S.padHits.length - 1; i >= 0; i--) {
      const d = t - S.padHits[i];
      if (d < 0) continue;
      if (d < 0.3) hitK = Math.exp(-d * 14) * Math.cos(d * 40);
      break;
    }
    const PW = pw * (1 + 0.08 * hitK);
    const PH = ph * (1 - 0.25 * hitK);
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.roundRect(PX - PW / 2, py + (ph - PH), PW, PH, PH / 2);
    ctx.fill();

    // bola: some na saída e reaparece na raquete no fim; rastro com posições passadas
    const ballA = t < T_OUT ? 1 : t < T_OUT + 0.25 ? 1 - ease.inCubic((t - T_OUT) / 0.25) : 0;
    const ballBack = ease.outBack(seg(t, duration - 0.45, duration - 0.05));
    const launched = t > T_IN + 0.35 && t < T_OUT;
    if (launched) {
      const TR = 9;
      for (let k = TR; k >= 1; k--) {
        const tt = t - k * 0.012;
        const q = 1 - k / (TR + 1);
        ctx.fillStyle = rgba(p.accent, 0.22 * q);
        ctx.beginPath();
        ctx.arc(at(S.ballX, tt), at(S.ballY, tt), r * (0.4 + 0.6 * q), 0, TAU);
        ctx.fill();
      }
    }
    const drawBall = (x, y, s) => {
      if (s <= 0) return;
      ctx.fillStyle = rgba(p.ink, 0.12);
      ctx.beginPath();
      ctx.arc(x, y, r * 2.1 * s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(x, y, r * s, 0, TAU);
      ctx.fill();
    };
    if (t < T_OUT) drawBall(BX, BY, 1);
    else {
      if (ballA > 0) drawBall(BX, BY, ballA);
      drawBall(PX, py - r, ballBack);
    }

    // placar
    if (p.hud) {
      let broken = 0;
      for (const b of breaks) if (b.t <= t) broken++;
      const score = t > T_OUT + 0.9 ? 0 : broken * 10;
      const a = t < T_OUT ? 1 : Math.abs(1 - 2 * seg(t, T_OUT + 0.6, T_OUT + 1.2));
      const fs = Math.round(m * 0.03);
      const yy = y0 - S.m * 0.07 * 0.5;
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(fs * 0.58)}px Inter`;
      ctx.letterSpacing = `${(fs * 0.1).toFixed(1)}px`;
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'left';
      ctx.fillText('PONTOS', x0, yy);
      const lw2 = ctx.measureText('PONTOS  ').width;
      ctx.textAlign = 'right';
      ctx.fillText('BLOCOS', x1 - ctx.measureText(' 00/00').width * 1.55, yy);
      ctx.letterSpacing = '0px';
      ctx.font = `500 ${fs}px "JetBrains Mono"`;
      ctx.globalAlpha = a;
      // pulso de cor a cada ponto
      let last = -1;
      for (const b of breaks) if (b.t <= t) last = b.t;
      const pulse = last >= 0 ? Math.exp(-(t - last) * 8) : 0;
      ctx.fillStyle = mixHex(p.ink, p.accent, clamp(pulse));
      ctx.textAlign = 'left';
      ctx.fillText(String(score).padStart(4, '0'), x0 + lw2, yy);
      ctx.fillStyle = p.ink;
      ctx.textAlign = 'right';
      const total = cols * nRows;
      ctx.fillText(`${String(t > T_OUT + 0.9 ? total : total - broken).padStart(2, '0')}/${total}`, x1, yy);
      ctx.globalAlpha = 1;
    }
  },
};
