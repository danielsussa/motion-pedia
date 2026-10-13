import { TAU, clamp, seg, ease, rgba } from '../lib/anim.js';

// Bolinhas descendo trilhos em zigue-zague num painel de pinos. A física é simulada no setup para UMA
// bolinha (passo de 1/1200 s): rola nos trilhos (segmentos com ponta arredondada), voa na ponta, bate
// no sino pendurado ali e cai no trilho de baixo; no meio dos trilhos há portinholas (pêndulos) que a
// bola empurra. Os pêndulos dos sinos e das portinholas também são simulados e gravados.
// Como sem atrito dependente de velocidade a trajetória não depende de g (só o tempo escala por √g),
// a viagem inteira é esticada para caber na duração: N bolinhas defasadas de 1/N fazem o loop ∞, e
// cada sino/portinhola soma o efeito de cada bolinha no seu tempo de viagem.

const REC = 240; // amostras por segundo de simulação

export default {
  id: 'marble-run',
  title: 'Marble Run',
  description: 'Bolinhas descendo trilhos em zigue-zague, empurrando portinholas e tocando sinos no caminho.',
  category: 'formas',
  tags: ['forma', 'loop', 'simulação'],
  duration: 10,
  poster: 4.1,

  params: {
    bg: { type: 'color', label: 'Fundo', default: '#ece6db' },
    ink: { type: 'color', label: 'Trilhos', default: '#1d1c22' },
    accent: { type: 'color', label: 'Bolinhas', default: '#ff5a36' },
    count: { type: 'range', label: 'Bolinhas', min: 1, max: 5, step: 1, default: 3 },
    rails: { type: 'range', label: 'Densidade de trilhos', min: 0.6, max: 1.5, step: 0.05, default: 1 },
    size: { type: 'range', label: 'Tamanho da bolinha', min: 0.6, max: 1.5, step: 0.05, default: 1 },
    flaps: { type: 'boolean', label: 'Portinholas', default: true },
    pegboard: { type: 'boolean', label: 'Painel de pinos', default: true },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const r = m * 0.021 * p.size;
    const th = m * 0.0055; // meia espessura do trilho
    const rb = m * 0.036; // raio do sino
    const gap = Math.max(m * 0.075, r * 3.2); // recuo do trilho na ponta do sino
    const L = Math.max(w * 0.12, m * 0.1);
    const Rx = w - L;
    const top = h * 0.13;
    const bot = h * 0.9;
    const nR = clamp(Math.round(((bot - top) / (m * 0.2)) * p.rails) + 1, 3, 12);
    const dy = (bot - top) / (nR - 1);
    const drop = Math.min(dy * 0.34, (Rx - L) * 0.07);

    // trilhos
    const rails = [];
    for (let i = 0; i < nR; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const y = top + i * dy - drop / 2;
      const xa = dir > 0 ? L : L + gap;
      const xb = dir > 0 ? Rx - gap : Rx;
      // alto na ponta de onde vem a bola
      const ax = dir > 0 ? xa : xb;
      const bx = dir > 0 ? xb : xa;
      rails.push({ dir, ax, ay: y, bx, by: y + drop });
    }
    // sinos na ponta baixa de cada trilho (menos o último: ali a bola sai do quadro)
    const bells = [];
    for (let i = 0; i < nR - 1; i++) {
      const R = rails[i];
      const cx = R.dir > 0 ? Rx + rb * 0.15 : L - rb * 0.15;
      const cy = R.by - th - r - rb * 0.35;
      bells.push({ cx, cy, px: cx, py: cy - rb * 2.1, a: 0, w: 0, side: R.dir });
    }
    // portinholas: pêndulos no meio dos trilhos (alternando a posição)
    const flaps = [];
    if (p.flaps) {
      for (let i = 0; i < nR; i++) {
        if (i % 2 === 1 && nR > 4) continue;
        const R = rails[i];
        const f = i % 4 === 0 ? 0.42 : 0.6;
        const x = R.ax + (R.bx - R.ax) * f;
        const ys = R.ay + (R.by - R.ay) * f - th;
        const len = r * 2.15;
        flaps.push({ x, y: ys - r * 3.1, len, dir: R.dir, a: 0, w: 0 });
      }
    }

    // simulação (unidades lógicas)
    const g = 2400;
    const dt = 1 / 1200;
    const recEvery = 1200 / REC;
    let x = rails[0].ax + r * 1.6;
    let y = -r * 2;
    let vx = 0;
    let vy = 0;
    let phi = 0;
    let spin = 0;
    const X = [];
    const Y = [];
    const PHI = [];
    const BELL = bells.map(() => []);
    const FLAP = flaps.map(() => []);
    const hits = []; // { tau, b, k (força 0..1) }
    const segDist = (sx, sy, ex, ey, qx, qy) => {
      const ux = ex - sx;
      const uy = ey - sy;
      const l2 = ux * ux + uy * uy;
      const s = clamp(((qx - sx) * ux + (qy - sy) * uy) / l2);
      const cx = sx + ux * s;
      const cy = sy + uy * s;
      return [Math.hypot(qx - cx, qy - cy), cx, cy];
    };
    const maxSteps = 1200 * 80;
    let step = 0;
    let rest = 0;
    for (; step < maxSteps; step++) {
      if (step % recEvery === 0) {
        X.push(x);
        Y.push(y);
        PHI.push(phi);
        bells.forEach((b, i) => BELL[i].push(b.a));
        flaps.forEach((f, i) => FLAP[i].push(f.a));
      }
      if (y > h + r * 3 && rest++ > REC * 0.6) break; // saiu e os pêndulos acalmaram um pouco
      vy += g * dt;
      x += vx * dt;
      y += vy * dt;
      let onRail = false;
      for (const R of rails) {
        const [d, cx, cy] = segDist(R.ax, R.ay, R.bx, R.by, x, y);
        const lim = r + th;
        if (d < lim && d > 1e-6) {
          const nx = (x - cx) / d;
          const ny = (y - cy) / d;
          x = cx + nx * lim;
          y = cy + ny * lim;
          const vn = vx * nx + vy * ny;
          if (vn < 0) {
            const e = -vn > 260 ? 0.28 : 0;
            vx -= (1 + e) * vn * nx;
            vy -= (1 + e) * vn * ny;
          }
          // rolando: giro = velocidade tangencial / r
          const tx = -ny;
          const ty = nx;
          spin = (vx * tx + vy * ty) / r;
          onRail = true;
        }
      }
      if (onRail) {
        // atrito de rolamento leve
        vx *= 1 - 0.05 * dt;
        vy *= 1 - 0.05 * dt;
      }
      phi += spin * dt;
      bells.forEach((b, i) => {
        // corpo do sino acompanha a balançada (pivô acima)
        const bx = b.px + Math.sin(b.a) * (b.cy - b.py);
        const by = b.py + Math.cos(b.a) * (b.cy - b.py);
        const d = Math.hypot(x - bx, y - by);
        const lim = r + rb * 0.92;
        if (d < lim) {
          const nx = (x - bx) / d;
          const ny = (y - by) / d;
          x = bx + nx * lim;
          y = by + ny * lim;
          const vn = vx * nx + vy * ny;
          if (vn < 0) {
            vx -= 1.42 * vn * nx;
            vy -= 1.42 * vn * ny;
            b.w += (vn * nx) * 0.0045; // empurra o sino para fora
            if (-vn > 120) hits.push({ tau: step * dt, b: i, k: clamp(-vn / 1400) });
          }
        }
        b.w += (-(g / ((b.cy - b.py) * 1.3)) * Math.sin(b.a) - 2.2 * b.w) * dt;
        b.a += b.w * dt;
      });
      flaps.forEach((f, i) => {
        // pêndulo amortecido; se encosta na bola, gira para o lado do movimento até ficar livre
        f.w += (-(g / (f.len * 0.75)) * Math.sin(f.a) - 4.5 * f.w) * dt;
        f.a += f.w * dt;
        const tipx = () => f.x + Math.sin(f.a) * f.len * f.dir;
        const tipy = () => f.y + Math.cos(f.a) * f.len;
        if (Math.abs(x - f.x) < f.len + r * 2 && Math.abs(y - f.y) < f.len + r * 2) {
          let [d] = segDist(f.x, f.y, tipx(), tipy(), x, y);
          if (d < r) {
            const a0 = f.a;
            let k = 0;
            while (d < r && k++ < 200) {
              f.a += 0.006;
              [d] = segDist(f.x, f.y, tipx(), tipy(), x, y);
            }
            f.w = Math.max(f.w, (f.a - a0) / dt * 0.5);
          }
        }
      });
    }
    const Tn = step * dt;
    // tom do sino: um pouco mais escuro na batida
    return { r, th, rb, rails, bells, flaps, X, Y, PHI, BELL, FLAP, hits, Tn, n: X.length, L, Rx, top, bot, dy, m };
  },

  render(ctx, t, { w, h, p, progress, duration, state: S }) {
    const { r, th, rb, rails, bells, flaps, Tn, n, m } = S;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const N = Math.round(p.count);
    const scale = Tn / duration; // segundos de simulação por segundo real
    const taus = [];
    for (let k = 0; k < N; k++) taus.push((((progress + k / N) % 1) + 1) % 1 * Tn);
    const sample = (arr, tau) => {
      const q = clamp(tau * REC, 0, n - 1);
      const a = Math.floor(q);
      const b = Math.min(n - 1, a + 1);
      return arr[a] + (arr[b] - arr[a]) * (q - a);
    };

    // painel de pinos
    if (p.pegboard) {
      const step = m * 0.05;
      const d = Math.max(1, m * 0.0034);
      ctx.fillStyle = rgba(p.ink, 0.12);
      ctx.beginPath();
      const ox = (w % step) / 2;
      const oy = (h % step) / 2;
      for (let y = oy + step / 2; y < h; y += step) for (let x = ox + step / 2; x < w; x += step) ctx.rect(x - d / 2, y - d / 2, d, d);
      ctx.fill();
    }

    // trilhos: suporte (sombra leve), barra e parafusos
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(p.ink, 0.1);
    ctx.lineWidth = th * 2;
    ctx.beginPath();
    for (const R of rails) {
      ctx.moveTo(R.ax, R.ay + th * 2.4);
      ctx.lineTo(R.bx, R.by + th * 2.4);
    }
    ctx.stroke();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = th * 2;
    ctx.beginPath();
    for (const R of rails) {
      ctx.moveTo(R.ax, R.ay);
      ctx.lineTo(R.bx, R.by);
    }
    ctx.stroke();
    // parafusos nas pontas do trilho
    ctx.fillStyle = rgba(p.bg, 0.9);
    ctx.beginPath();
    for (const R of rails) {
      for (const f of [0.1, 0.9]) {
        const x = R.ax + (R.bx - R.ax) * f;
        const y = R.ay + (R.by - R.ay) * f;
        ctx.moveTo(x + th * 0.55, y);
        ctx.arc(x, y, th * 0.55, 0, TAU);
      }
    }
    ctx.fill();

    // portinholas
    for (let i = 0; i < flaps.length; i++) {
      const f = flaps[i];
      let a = 0;
      for (const tau of taus) a += sample(S.FLAP[i], tau);
      const tx = f.x + Math.sin(a) * f.len * f.dir;
      const ty = f.y + Math.cos(a) * f.len;
      // braço do pivô
      ctx.strokeStyle = rgba(p.ink, 0.55);
      ctx.lineWidth = Math.max(1, th * 0.8);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x, f.y - r * 0.9);
      ctx.moveTo(f.x - r * 0.7, f.y - r * 0.9);
      ctx.lineTo(f.x + r * 0.7, f.y - r * 0.9);
      ctx.stroke();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = th * 2.6;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = p.bg;
      ctx.beginPath();
      ctx.arc(f.x, f.y, th * 1.5, 0, TAU);
      ctx.fill();
      ctx.lineWidth = Math.max(1, th * 0.8);
      ctx.stroke();
    }

    // sinos
    for (let i = 0; i < bells.length; i++) {
      const b = bells[i];
      let a = 0;
      for (const tau of taus) a += sample(S.BELL[i], tau);
      // tempo real desde a última batida (de qualquer bolinha) → brilho e ondas
      let since = Infinity;
      let kk = 0;
      for (const hh of S.hits) {
        if (hh.b !== i) continue;
        for (const tau of taus) {
          const d = (tau - hh.tau) / scale;
          if (d >= 0 && d < since) { since = d; kk = hh.k; }
        }
      }
      const glow = since < 2 ? Math.exp(-since * 3.5) * (0.5 + 0.5 * kk) : 0;
      const len = b.cy - b.py;
      // ondas de som (arcos para fora do sino)
      if (since < 1.1) {
        ctx.lineWidth = Math.max(1, th * 0.9);
        for (let j = 0; j < 3; j++) {
          const q = seg(since, j * 0.09, j * 0.09 + 0.8);
          if (q <= 0 || q >= 1) continue;
          ctx.strokeStyle = rgba(p.accent, 0.55 * (1 - q) * (0.4 + 0.6 * kk));
          ctx.beginPath();
          const R0 = rb * (1.2 + 1.6 * ease.outCubic(q));
          const ang = b.side > 0 ? 0 : Math.PI;
          ctx.arc(b.cx, b.cy, R0, ang - 0.7, ang + 0.7);
          ctx.stroke();
        }
      }
      ctx.save();
      ctx.translate(b.px, b.py);
      ctx.rotate(-a);
      // haste
      ctx.strokeStyle = rgba(p.ink, 0.55);
      ctx.lineWidth = Math.max(1, th * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, len - rb * 0.95);
      ctx.moveTo(-rb * 0.5, 0);
      ctx.lineTo(rb * 0.5, 0);
      ctx.stroke();
      // corpo do sino: cúpula + boca
      ctx.translate(0, len);
      if (glow > 0.01) {
        // halo de destaque (mesma cor, só alpha)
        ctx.fillStyle = rgba(p.accent, 0.16 * glow);
        ctx.beginPath();
        ctx.arc(0, 0, rb * 1.55, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba(p.accent, 0.14 * glow);
        ctx.beginPath();
        ctx.arc(0, 0, rb * 2.1, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.moveTo(-rb * 1.05, rb * 0.62);
      ctx.bezierCurveTo(-rb * 0.85, rb * 0.3, -rb * 0.8, -rb * 0.15, -rb * 0.62, -rb * 0.55);
      ctx.bezierCurveTo(-rb * 0.4, -rb * 1.05, rb * 0.4, -rb * 1.05, rb * 0.62, -rb * 0.55);
      ctx.bezierCurveTo(rb * 0.8, -rb * 0.15, rb * 0.85, rb * 0.3, rb * 1.05, rb * 0.62);
      ctx.quadraticCurveTo(0, rb * 0.8, -rb * 1.05, rb * 0.62);
      ctx.fill();
      // badalo (destaque) e reflexo
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(Math.sin(a * 2.2) * rb * 0.25, rb * 0.82, rb * 0.17, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.22);
      ctx.lineWidth = rb * 0.12;
      ctx.beginPath();
      ctx.arc(0, rb * 0.1, rb * 0.62, Math.PI * 1.12, Math.PI * 1.36);
      ctx.stroke();
      ctx.restore();
    }

    // bolinhas
    for (const tau of taus) {
      const x = sample(S.X, tau);
      const y = sample(S.Y, tau);
      if (y < -r * 2 || y > h + r * 2) continue;
      const phi = sample(S.PHI, tau);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      // faixa que gira (mostra o rolamento)
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.clip();
      ctx.translate(x, y);
      ctx.rotate(phi);
      ctx.fillStyle = rgba(p.ink, 0.22);
      ctx.fillRect(-r, -r * 0.16, r * 2, r * 0.32);
      ctx.restore();
      // sombra embaixo e brilho em cima (fixos, a luz não gira)
      ctx.fillStyle = rgba(p.ink, 0.18);
      ctx.beginPath();
      ctx.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.arc(x, y - r * 0.35, r * 0.9, 0.82 * Math.PI, 0.18 * Math.PI, true);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.75);
      ctx.beginPath();
      ctx.arc(x - r * 0.36, y - r * 0.38, r * 0.2, 0, TAU);
      ctx.fill();
    }
  },
};
