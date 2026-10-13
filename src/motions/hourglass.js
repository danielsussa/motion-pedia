import { TAU, clamp, lerp, ease, seg, smoothstep, rgba, mixHex } from '../lib/anim.js';

// Ampulheta: a areia do bulbo de cima escoa a vazão constante (área 2D conservada via tabela
// acumulada do perfil do vidro), forma uma cratera em cima e um monte embaixo; no fim a ampulheta
// vira 180° com mola. Durante o giro a areia (no referencial do vidro) escorrega da tampa para o
// gargalo — ao terminar, o estado é idêntico ao de t = 0 (vidro simétrico), então o loop fecha.

const PROF_N = 160;

// meia-largura do vidro (fração da meia-largura do bulbo) em u ∈ [0,1] (0 = gargalo, 1 = tampa)
function profile(u, neck) {
  const e = Math.max(0, 1 - ((u - 0.56) / 0.47) ** 2);
  const b = Math.sqrt(e);
  return Math.sqrt(neck * neck + b * b * (1 - neck * neck)) * (1 - 0.06 * smoothstep(0.9, 1, u));
}

export default {
  id: 'hourglass',
  title: 'Hourglass',
  description: 'An hourglass with sand trickling in a thin stream, a crater on top and a mound below, flipping with a spring at the end.',
  category: 'formas',
  tags: ['shape', 'loop', 'simulation'],
  duration: 8,
  poster: 3.2,

  params: {
    fill: { type: 'range', label: 'Sand amount', min: 0.3, max: 0.85, step: 0.01, default: 0.62 },
    neck: { type: 'range', label: 'Neck', min: 0.03, max: 0.2, step: 0.005, default: 0.07 },
    flip: { type: 'range', label: 'Flip duration (s)', min: 0.6, max: 2.4, step: 0.05, default: 1.4 },
    sand: { type: 'color', label: 'Sand', default: '#f2a541' },
    ink: { type: 'color', label: 'Frame', default: '#ece6da' },
    bg: { type: 'color', label: 'Background', default: '#0e0f13' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p }) {
    const H = Math.min(h * 0.3, w * 0.36); // meia altura do vidro
    const B = H * 0.62; // meia largura do bulbo
    const g = new Float32Array(PROF_N + 1);
    const cum = new Float32Array(PROF_N + 1); // área (unidades de H·B) de 0 a u
    for (let i = 0; i <= PROF_N; i++) {
      g[i] = profile(i / PROF_N, p.neck);
      if (i) cum[i] = cum[i - 1] + (g[i] + g[i - 1]) / PROF_N; // 2·g·du (trapézio: (g0+g1)/2·2)
    }
    const total = cum[PROF_N];
    const V = total * p.fill;
    const level = (a) => {
      // u tal que cum(u) = a
      if (a <= 0) return 0;
      for (let i = 1; i <= PROF_N; i++) {
        if (cum[i] >= a) return (i - 1 + (a - cum[i - 1]) / (cum[i] - cum[i - 1])) / PROF_N;
      }
      return 1;
    };
    const fromCap = (a) => level(total - a); // u da superfície quando a área a repousa na tampa
    const gw = (u) => {
      const x = clamp(u) * PROF_N;
      const i = Math.min(PROF_N - 1, Math.floor(x));
      return lerp(g[i], g[i + 1], x - i);
    };
    // contorno do vidro (meia de cima e de baixo), em coordenadas locais
    const glass = new Path2D();
    const K = 90;
    for (let i = 0; i <= K; i++) {
      const y = lerp(-1, 1, i / K);
      const x = gw(Math.abs(y)) * B;
      i ? glass.lineTo(x, y * H) : glass.moveTo(x, y * H);
    }
    for (let i = K; i >= 0; i--) {
      const y = lerp(-1, 1, i / K);
      glass.lineTo(-gw(Math.abs(y)) * B, y * H);
    }
    glass.closePath();
    const bulb = [];
    for (let i = 0; i <= 60; i++) bulb.push([gw(i / 60) * B, (i / 60) * H]);
    for (let i = 60; i >= 0; i--) bulb.push([-gw(i / 60) * B, (i / 60) * H]);
    return { H, B, V, level, fromCap, gw, glass, bulb, L1: fromCap(V) };
  },

  render(ctx, t, { w, h, p, duration, state: S, px }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const { H, B, V, level, fromCap, gw, glass, bulb, L1 } = S;
    const flipDur = Math.min(p.flip, duration * 0.4);
    const flip0 = duration - flipDur - 0.15;
    const drain0 = 0.25;
    const drain1 = flip0 - 0.35;
    const f = 1 - seg(t, drain0, drain1); // fração ainda em cima
    const fk = seg(t, flip0, flip0 + flipDur);
    // giro: começa devagar, passa um pouco de 180° e assenta (back suave sobre inOutSine)
    const ek = ease.inOutSine(fk);
    const rot = Math.PI * (1 + 2 * (ek - 1) ** 3 + (ek - 1) ** 2);
    const lift = Math.sin(Math.PI * ease.inOutSine(fk)) * H * 0.12;

    const cx = w / 2;
    const cy = h / 2 - lift;
    const capH = H * 0.11;
    const capW = B * 1.32;
    const postX = B * 1.13;

    // sombra no chão
    const floorY = h / 2 + H + capH * 1.9;
    {
      const sw = (Math.abs(Math.cos(rot)) * capW + Math.abs(Math.sin(rot)) * (H + capH)) * (1.1 - lift / H);
      ctx.save();
      ctx.translate(cx, floorY);
      ctx.scale(1, 0.12);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, sw);
      gr.addColorStop(0, 'rgba(0,0,0,0.5)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(-sw, -sw, sw * 2, sw * 2);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    // vidro: preenchimento leve
    ctx.fillStyle = rgba(p.ink, 0.045);
    ctx.fill(glass);

    // areia (recortada no vidro)
    ctx.save();
    ctx.clip(glass);
    ctx.fillStyle = p.sand;
    const SAMP = 28;
    const W2 = B * 1.2;
    const surface = (y0, depth, spread, sign) => {
      // superfície de -W2 a W2 com bacia (sign=+1 desce no centro) ou monte (sign=-1 sobe)
      for (let i = 0; i <= SAMP; i++) {
        const x = lerp(-W2, W2, i / SAMP);
        const k = Math.max(0, 1 - Math.abs(x) / spread);
        const y = y0 + sign * depth * k * k * (3 - 2 * k);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
    };
    if (fk <= 0) {
      // bulbo de cima: de uTop até o gargalo
      const uTop = level(f * V);
      if (f > 0.002) {
        const wTop = gw(uTop) * B;
        const dip = Math.min(uTop * H * 0.85, H * 0.16 * Math.sqrt(1 - f) * smoothstep(0, 0.08, 1 - f));
        ctx.beginPath();
        surface(-uTop * H, dip, wTop * 0.95, 1);
        ctx.lineTo(W2, 0);
        ctx.lineTo(-W2, 0);
        ctx.closePath();
        ctx.fill();
      }
      // bulbo de baixo: monte
      const uBot = fromCap((1 - f) * V);
      if (f < 0.998) {
        const wBot = gw(uBot) * B;
        const mound = Math.min(H * 0.16, (1 - uBot) * H * 1.2) * smoothstep(0, 0.1, 1 - f);
        ctx.beginPath();
        surface(uBot * H + mound * 0.35, mound, wBot * 0.95, -1);
        ctx.lineTo(W2, H);
        ctx.lineTo(-W2, H);
        ctx.closePath();
        ctx.fill();
      }
      // filete: cabeça cai no início, cauda cai no fim
      const vFall = H * 4.5;
      const bottomY = uBot * H - (f < 0.998 ? Math.min(H * 0.16, (1 - uBot) * H * 1.2) * 0.65 * smoothstep(0, 0.1, 1 - f) : 0);
      const head = Math.min(bottomY, (t - drain0) * vFall);
      const tail = Math.max(0, (t - drain1) * vFall);
      if (t > drain0 && tail < bottomY) {
        const sw = Math.max(B * p.neck * 0.55, 1.2);
        ctx.fillRect(-sw / 2, tail, sw, head - tail);
        // grãos soltos ao redor do filete (determinísticos)
        ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          const q = ((t * 1.7 + i * 0.6180339) % 1 + 1) % 1;
          const y = q * bottomY;
          if (y < tail || y > head) continue;
          const x = Math.sin(i * 12.9898 + Math.floor(t * 1.7 + i * 0.618) * 4.1) * sw * 1.6;
          const r = sw * 0.32;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TAU);
        }
        ctx.fill();
      }
    } else {
      // girando: a areia está toda no bulbo de baixo (referencial do vidro) e fica com a superfície
      // horizontal NA TELA. Nível achado por bisseção da área (bulbo ∩ semiplano). Em rot = π ela
      // repousa no gargalo = estado de t = 0 visto de cabeça para baixo.
      const gx = Math.sin(rot);
      const gy = Math.cos(rot);
      const area = (c) => {
        // Sutherland–Hodgman do bulbo contra dot(q, g) >= c, depois shoelace
        let a = 0;
        let prev = bulb[bulb.length - 1];
        let pin = prev[0] * gx + prev[1] * gy >= c;
        let first = null;
        let last = null;
        const push = (q) => {
          if (last) a += last[0] * q[1] - q[0] * last[1];
          else first = q;
          last = q;
        };
        for (const q of bulb) {
          const qin = q[0] * gx + q[1] * gy >= c;
          if (qin !== pin) {
            const dp = prev[0] * gx + prev[1] * gy;
            const dq = q[0] * gx + q[1] * gy;
            const k = (c - dp) / (dq - dp);
            push([prev[0] + (q[0] - prev[0]) * k, prev[1] + (q[1] - prev[1]) * k]);
          }
          if (qin) push(q);
          prev = q;
          pin = qin;
        }
        if (first && last) a += last[0] * first[1] - first[0] * last[1];
        return Math.abs(a) / 2;
      };
      let lo = -2 * H;
      let hi = 2 * H;
      const target = V * H * B;
      for (let it = 0; it < 26; it++) {
        const mid = (lo + hi) / 2;
        if (area(mid) > target) lo = mid;
        else hi = mid;
      }
      const c = (lo + hi) / 2;
      const mound = Math.min(H * 0.16, (1 - L1) * H * 1.2) * (1 - smoothstep(0, 0.4, fk));
      const dx = Math.cos(rot);
      const dy = -Math.sin(rot);
      const Wd = H * 1.6;
      ctx.beginPath();
      ctx.rect(-W2, 0, W2 * 2, H * 1.01);
      ctx.clip();
      ctx.beginPath();
      for (let i = 0; i <= SAMP; i++) {
        const sx = lerp(-Wd, Wd, i / SAMP);
        const k = Math.max(0, 1 - Math.abs(sx) / (B * 0.95));
        const off = mound * 0.35 - mound * k * k * (3 - 2 * k);
        const x = (c + off) * gx + sx * dx;
        const y = (c + off) * gy + sx * dy;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.lineTo((c + 3 * H) * gx + Wd * dx, (c + 3 * H) * gy + Wd * dy);
      ctx.lineTo((c + 3 * H) * gx - Wd * dx, (c + 3 * H) * gy - Wd * dy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // vidro: contorno e reflexos
    ctx.strokeStyle = rgba(p.ink, 0.5);
    ctx.lineWidth = Math.max(1, H * 0.009);
    ctx.lineJoin = 'round';
    ctx.stroke(glass);
    ctx.save();
    ctx.clip(glass);
    ctx.lineCap = 'round';
    ctx.lineWidth = B * 0.06;
    // reflexo sempre do lado esquerdo da tela: cruza entre os lados locais conforme gira
    for (const [side, sgn] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const a = 0.16 * (1 - side * Math.cos(rot)) / 2;
      if (a < 0.004) continue;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const u = lerp(0.3, 0.85, i / 20);
        const x = side * gw(u) * B * 0.72;
        const y = sgn * u * H;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // estrutura: colunas e tampas
    const ink = p.ink;
    ctx.fillStyle = mixHex(p.bg, ink, 0.78);
    const postW = B * 0.075;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(sx * postX - postW / 2, -H - capH * 0.2, postW, 2 * H + capH * 0.4, postW / 2);
      ctx.fill();
    }
    ctx.fillStyle = ink;
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(-capW, sy > 0 ? H : -H - capH, capW * 2, capH, capH * 0.35);
      ctx.fill();
    }
    // filete de luz nas tampas
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (const sy of [-1, 1]) ctx.fillRect(-capW * 0.94, sy > 0 ? H + capH * 0.62 : -H - capH * 0.76, capW * 1.88, capH * 0.14);
    ctx.restore();
  },
};
