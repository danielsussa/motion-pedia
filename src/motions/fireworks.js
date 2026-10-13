import { TAU, rng, mixHex, rgba, smoothstep, clamp } from '../lib/anim.js';

// Fogos em fórmula fechada e loop perfeito: cada foguete tem um horário de lançamento e a idade é
// (t − lançamento) mod duração. Estrelas com arrasto exponencial + velocidade terminal:
//   p(e) = c + v·E(e) + (0, vt·(e − E(e))),  E(e) = (1 − e^{−k·e}) / k
// Rastro = segmentos entre posições passadas (também fechadas). Um stroke por (foguete, fatia do rastro).

const hash = (a, b) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const TYPES = ['peony', 'peony', 'willow', 'ring', 'peony', 'palm'];

export default {
  id: 'fireworks',
  title: 'Fireworks',
  description: 'Looping fireworks: a rocket climbs, bursts with a flash, and trailing stars fall and twinkle.',
  category: 'particulas',
  tags: ['particles', 'loop', 'alpha'],
  duration: 8,
  poster: 2.2,

  params: {
    c1: { type: 'color', label: 'Color 1', default: '#ff4f6d' },
    c2: { type: 'color', label: 'Color 2', default: '#5cc8ff' },
    c3: { type: 'color', label: 'Color 3', default: '#ffd27a' },
    bg: { type: 'color', label: 'Sky', default: '#060814' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    shells: { type: 'range', label: 'Fireworks per loop', min: 3, max: 16, step: 1, default: 7 },
    stars: { type: 'range', label: 'Stars per firework', min: 30, max: 200, step: 5, default: 90 },
    size: { type: 'range', label: 'Size', min: 0.5, max: 1.6, step: 0.01, default: 1 },
    trail: { type: 'range', label: 'Trail', min: 0.05, max: 0.6, step: 0.01, default: 0.3 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 11 },
  },

  setup({ w, h, p, duration }) {
    const rand = rng(p.seed);
    const R = (a, b) => a + (b - a) * rand();
    const n = p.shells;
    const shells = [];
    let lastX = 0.5;
    for (let i = 0; i < n; i++) {
      const type = TYPES[Math.floor(rand() * TYPES.length)];
      // posições espalhadas, evitando repetir a vizinha
      let fx = R(0.18, 0.82);
      if (Math.abs(fx - lastX) < 0.18) fx = fx > 0.5 ? fx - 0.3 : fx + 0.3;
      lastX = fx;
      const sh = {
        type,
        launch: ((i + R(-0.25, 0.25)) / n) * duration,
        rise: R(0.85, 1.25),
        x0: fx + R(-0.06, 0.06),
        xa: fx,
        ya: R(0.2, 0.42),
        radius: R(0.22, 0.32) * (type === 'willow' ? 1.1 : 1),
        color: type === 'willow' ? 'c3' : ['c1', 'c2', 'c3'][i % 3],
        color2: rand() < 0.35 ? ['c1', 'c2', 'c3'][(i + 1) % 3] : null, // núcleo de outra cor
        life: type === 'willow' ? R(2.8, 3.3) : R(1.9, 2.5),
        tilt: R(-0.5, 0.5),
        stars: [],
      };
      const m = type === 'ring' ? Math.round(p.stars * 0.6) : type === 'palm' ? 9 : p.stars;
      for (let j = 0; j < m; j++) {
        let dx, dy;
        if (type === 'ring') {
          const a = (j / m) * TAU;
          dx = Math.cos(a);
          dy = Math.sin(a) * 0.45;
          const c = Math.cos(sh.tilt), s = Math.sin(sh.tilt);
          [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
        } else if (type === 'palm') {
          const a = (j / m) * TAU + R(-0.15, 0.15);
          dx = Math.cos(a);
          dy = Math.sin(a) - 0.25;
        } else {
          // ponto na esfera projetado: preenche o disco como um estouro de verdade
          const z = R(-1, 1), a = R(0, TAU), r = Math.sqrt(1 - z * z);
          dx = Math.cos(a) * r;
          dy = Math.sin(a) * r;
        }
        const jit = type === 'ring' ? R(0.97, 1.03) : R(0.92, 1.05);
        sh.stars.push({ dx: dx * jit, dy: dy * jit, tw: rand(), inner: sh.color2 && rand() < 0.4, life: R(0.8, 1.05) });
      }
      shells.push(sh);
    }
    return { shells };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const S = Math.min(w, h);
    const D = duration;
    const k = 2.6; // arrasto
    const frame = Math.floor(t * 30) % Math.round(duration * 30); // cintilação também fecha o loop

    // clarão total no céu (para iluminar o fundo)
    let skyFlash = 0;
    let skyColor = p.c1;
    for (const sh of state.shells) {
      const age = (((t - sh.launch) % D) + D) % D;
      const e = age - sh.rise;
      if (e > 0 && e < 1.2) {
        const f = Math.exp(-e * 4);
        if (f > skyFlash) (skyFlash = f), (skyColor = p[sh.color]);
      }
    }

    if (!p.transparent) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, p.bg);
      g.addColorStop(1, mixHex(p.bg, '#3a2a55', 0.35));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (skyFlash > 0.01) {
        ctx.fillStyle = rgba(skyColor, 0.05 * skyFlash);
        ctx.fillRect(0, 0, w, h);
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const lw = S * 0.0038 * p.size;

    for (const sh of state.shells) {
      const age = (((t - sh.launch) % D) + D) % D;
      const total = sh.rise + sh.life + p.trail + 0.2;
      if (age > total) continue;
      const col = p[sh.color];
      const x0 = sh.x0 * w, y0 = h + S * 0.02;
      const cx = sh.xa * w, cy = h * 0.33 + (sh.ya - 0.31) * S * 1.2;

      // —— subida
      if (age < sh.rise) {
        const pos = (a) => {
          const s = clamp(a / sh.rise);
          const q = 1 - (1 - s) * (1 - s);
          return [x0 + (cx - x0) * q + Math.sin(s * 9 + sh.tilt * 10) * S * 0.004 * s, y0 + (cy - y0) * q];
        };
        const [hx, hy] = pos(age);
        const [tx, ty] = pos(Math.max(0, age - 0.28));
        const g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, rgba(p.c3, 0));
        g.addColorStop(1, rgba(p.c3, 0.85));
        ctx.strokeStyle = g;
        ctx.lineWidth = lw * 0.9;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,245,225,0.95)';
        ctx.beginPath();
        ctx.arc(hx, hy, lw * 1.1, 0, TAU);
        ctx.fill();
        continue;
      }

      // —— estouro
      const e = age - sh.rise;
      const rad = sh.radius * S * p.size;
      const sp = rad * k; // alcance = v/k
      const willow = sh.type === 'willow';
      const kk = willow ? k * 0.9 : k;
      const vt = S * (willow ? 0.16 : 0.1);
      const E = (x) => (1 - Math.exp(-kk * x)) / kk;
      const at = (st, x) => {
        const Ex = E(x);
        return [cx + st.dx * sp * Ex, cy + st.dy * sp * Ex + vt * (x - Ex)];
      };

      // clarão do estouro
      const flash = Math.exp(-e * 7);
      if (flash > 0.01) {
        const r = rad * (0.5 + 0.6 * (1 - flash));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,250,240,${0.55 * flash})`);
        g.addColorStop(0.25, rgba(col, 0.25 * flash));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      // brilho ambiente persistente do fogo
      const amb = smoothstep(0, 0.15, e) * (1 - smoothstep(0.2, sh.life, e));
      if (amb > 0.01) {
        const r = rad * 1.3;
        const g = ctx.createRadialGradient(cx, cy + vt * e * 0.5, 0, cx, cy + vt * e * 0.5, r);
        g.addColorStop(0, rgba(col, 0.08 * amb));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r + vt * e * 0.5, r * 2, r * 2);
      }

      const trailLen = p.trail * (willow ? 2.6 : sh.type === 'palm' ? 1.8 : 1);
      const SL = 4; // fatias do rastro
      for (const inner of [false, true]) {
        const c = inner ? p[sh.color2 ?? sh.color] : col;
        const hot = mixHex(c, '#ffffff', clamp(0.75 - e * 2.5, 0, 0.75));
        for (let sI = 0; sI < SL; sI++) {
          const a0 = e - trailLen * (1 - sI / SL);
          const a1 = e - trailLen * (1 - (sI + 1) / SL);
          if (a1 <= 0) continue;
          const path = new Path2D();
          const glow = new Path2D();
          let any = false;
          for (let j = 0; j < sh.stars.length; j++) {
            const st = sh.stars[j];
            if (!!st.inner !== inner) continue;
            const L = sh.life * st.life;
            if (e > L) continue;
            const [ax, ay] = at(st, Math.max(0, a0));
            const [bx, by] = at(st, a1);
            path.moveTo(ax, ay);
            path.lineTo(bx, by);
            any = true;
          }
          if (!any) continue;
          const fade = (sI + 1) / SL;
          const life = 1 - smoothstep(sh.life * 0.55, sh.life, e);
          ctx.strokeStyle = hot;
          ctx.globalAlpha = 0.12 * fade * life;
          ctx.lineWidth = lw * 4.5;
          ctx.stroke(path);
          ctx.globalAlpha = 0.9 * fade * fade * life;
          ctx.lineWidth = lw * (willow ? 0.8 : 1) * (0.5 + 0.5 * fade);
          ctx.stroke(path);
        }
        // cabeças das estrelas, com cintilação no fim
        const heads = new Path2D();
        let any = false;
        for (let j = 0; j < sh.stars.length; j++) {
          const st = sh.stars[j];
          if (!!st.inner !== inner) continue;
          const L = sh.life * st.life;
          if (e > L) continue;
          if (e > L * 0.55 && hash(j * 7 + 1, frame + Math.floor(st.tw * 97)) < 0.45) continue; // cintila
          const [bx, by] = at(st, e);
          const r = lw * (willow ? 0.7 : 1.05);
          heads.moveTo(bx + r, by);
          heads.arc(bx, by, r, 0, TAU);
          any = true;
        }
        if (any) {
          ctx.globalAlpha = 1 - smoothstep(sh.life * 0.75, sh.life, e);
          ctx.fillStyle = mixHex(c, '#ffffff', 0.55);
          ctx.fill(heads);
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  },
};
