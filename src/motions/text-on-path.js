import { TAU, clamp, fract, ease, rgba } from '../lib/anim.js';

// Texto sobre um caminho. Cada letra é posicionada pelo comprimento de arco e girada pela tangente.
// Loop perfeito: o texto anda um número inteiro de repetições por loop (no círculo, o espaçamento é
// ajustado para caber um número inteiro de repetições na circunferência).

// Polilinha amostrada com comprimento acumulado → at(s) = { x, y, a } (posição e ângulo da tangente).
function polyline(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = acc[acc.length - 1];
  return {
    len,
    at(s) {
      s = clamp(s, 0, len);
      let lo = 0;
      let hi = acc.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (acc[mid] <= s) lo = mid;
        else hi = mid;
      }
      const [x0, y0] = pts[lo];
      const [x1, y1] = pts[hi];
      const k = (s - acc[lo]) / (acc[hi] - acc[lo] || 1);
      return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, a: Math.atan2(y1 - y0, x1 - x0) };
    },
  };
}

// Mede uma repetição: "TEXTO • " → lista de { ch, w, sep } e a largura total.
function unitOf(ctx, text, sep, track) {
  const items = [];
  const add = (ch, isSep) => items.push({ ch, w: ctx.measureText(ch).width + track, sep: isSep });
  for (const ch of text) add(ch, false);
  add(' ', false);
  if (sep) {
    add(sep, true);
    add(' ', false);
  }
  return { items, w: items.reduce((s, it) => s + it.w, 0) };
}

export default {
  id: 'text-on-path',
  title: 'Text on Path',
  description: 'Text running around a circle like a spinning badge, or along crossing S-shaped ribbons.',
  category: 'tipografia',
  tags: ['typography', 'loop', 'alpha', 'overlay'],
  duration: 8,

  params: {
    text: { type: 'text', label: 'Text', default: 'NEW' },
    sep: { type: 'text', label: 'Separator', default: '•' },
    shape: { type: 'select', label: 'Path', options: ['círculo', 'curva S'], default: 'círculo' },
    size: { type: 'range', label: 'Size', min: 0.2, max: 0.9, step: 0.01, default: 0.56 },
    speed: { type: 'range', label: 'Turns per loop', min: 1, max: 4, step: 1, default: 1 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    color: { type: 'color', label: 'Text', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Background', default: '#0d0d10' },
  },

  render(ctx, t, { w, h, p, progress }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const m = Math.min(w, h);
    const k = Math.max(1, Math.round(p.speed));
    const text = p.text || ' ';
    const font = (s) => `800 ${s}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const B = ctx.getTransform(); // escala do player (px); as letras compõem por cima dela

    // Uma letra no caminho (s = comprimento de arco do centro da letra). up = lado do "topo" da letra.
    const glyph = (path, it, s, flip, M = B) => {
      const q = path.at(s);
      const a = q.a + (flip ? Math.PI : 0);
      ctx.setTransform(M);
      ctx.translate(q.x, q.y);
      ctx.rotate(a);
      ctx.fillText(it.ch, 0, 0);
    };

    if (p.shape === 'círculo') {
      const R = (m * p.size) / 2;
      const fs = R * 0.24;
      const r = R - fs * 0.62; // raio da linha de base do texto
      const cx = w / 2;
      const cy = h / 2;
      ctx.font = font(fs);
      const u = unitOf(ctx, text, p.sep, fs * 0.04);
      const circ = TAU * r;
      const reps = Math.max(1, Math.round(circ / u.w));
      const stretch = circ / (reps * u.w); // espaçamento extra para fechar o círculo exato

      // aros finos e disco central
      const lw = Math.max(1, m * 0.0022);
      ctx.strokeStyle = rgba(p.color, 0.28);
      ctx.lineWidth = lw;
      for (const rr of [R, R - fs * 1.24]) {
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, TAU);
        ctx.stroke();
      }
      const disc = R - fs * 1.62;
      // pulso do disco: respira duas vezes por loop
      const pulse = 1 + 0.025 * Math.sin(TAU * 2 * progress);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, disc * pulse, 0, TAU);
      ctx.fill();

      // estrela central: gira em passos de 45° com mola (pausa entre os passos)
      const steps = 4;
      const st = progress * steps;
      const rot = (Math.floor(st) + ease.outBack(clamp(fract(st) / 0.35, 0, 1))) * (Math.PI / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-rot);
      ctx.fillStyle = p.bg;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const aa = (i * Math.PI) / 4 - Math.PI / 2;
        const rr = i % 2 ? disc * 0.16 : disc * 0.56;
        ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // texto: começa no topo, gira k voltas por loop
      const turn = -Math.PI / 2 + TAU * k * progress;
      const ring = {
        at(s) {
          const a = turn + s / r;
          return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a: a + Math.PI / 2 };
        },
      };
      ctx.font = font(fs);
      for (const sepPass of [false, true]) {
        ctx.fillStyle = sepPass ? p.accent : p.color;
        let s = 0;
        for (let i = 0; i < reps; i++) {
          for (const it of u.items) {
            const iw = it.w * stretch;
            if (it.sep === sepPass && it.ch !== ' ') glyph(ring, it, s + iw / 2, false);
            s += iw;
          }
        }
      }
      ctx.setTransform(B);
      ctx.textAlign = 'start';
      return;
    }

    // Curva S: duas fitas em senoide que se cruzam (por cima / por baixo alternado), correndo em
    // sentidos opostos. Num eixo levemente inclinado; em telas altas o eixo fica na vertical.
    const tall = h > w * 1.2;
    const fs = m * 0.085 * (p.size / 0.56);
    const band = fs * 1.5;
    ctx.font = font(fs);
    const u = unitOf(ctx, text, p.sep, fs * 0.04);
    const th = tall ? -Math.PI / 2 + 0.12 : -0.1;
    const L = Math.abs(w * Math.cos(th)) + Math.abs(h * Math.sin(th)) + band * 4;
    const across = Math.abs(w * Math.sin(th)) + Math.abs(h * Math.cos(th));
    const A = Math.min(across * 0.26, m * 0.25);
    const periods = 1.25; // cruzamentos no centro e a ±0,4·L
    const mk = (sign) => {
      const pts = [];
      const N = 200;
      for (let i = 0; i <= N; i++) {
        const x = -L / 2 + (L * i) / N;
        pts.push([x, sign * A * Math.sin((TAU * periods * x) / L)]);
      }
      return polyline(pts);
    };
    ctx.setTransform(B);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(th);
    const F = ctx.getTransform(); // referencial do eixo
    const ribbons = [
      { path: mk(-1), fill: p.color, ink: p.bg, sepInk: p.accent, dir: -1 },
      { path: mk(1), fill: p.accent, ink: p.bg, sepInk: p.color, dir: 1 },
    ];
    const drawRibbon = (rb) => {
      const { path } = rb;
      ctx.setTransform(F);
      ctx.strokeStyle = rb.fill;
      ctx.lineWidth = band;
      ctx.beginPath();
      for (let s = 0; s <= path.len; s += 6) {
        const q = path.at(s);
        if (s === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      // texto: anda 3·k repetições por loop
      const shift = fract(progress * k * 3) * u.w * rb.dir;
      const start = -u.w + (((shift % u.w) + u.w) % u.w);
      for (const sepPass of [false, true]) {
        ctx.fillStyle = sepPass ? rb.sepInk : rb.ink;
        let s = start;
        while (s < path.len) {
          for (const it of u.items) {
            if (it.sep === sepPass && it.ch !== ' ' && s + it.w > 0 && s < path.len) glyph(path, it, s + it.w / 2, false, F);
            s += it.w;
          }
        }
      }
    };
    drawRibbon(ribbons[0]);
    drawRibbon(ribbons[1]);
    // cruzamento central: a fita clara passa por cima
    ctx.save();
    ctx.setTransform(F);
    ctx.beginPath();
    ctx.rect(-band * 1.6, -A, band * 3.2, A * 2);
    ctx.clip();
    drawRibbon(ribbons[0]);
    ctx.restore();
    ctx.setTransform(B);
    ctx.textAlign = 'start';
  },
};
