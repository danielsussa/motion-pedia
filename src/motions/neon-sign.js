import { clamp, seg, rng, hexToRgb } from '../lib/anim.js';
import { skeleton } from '../lib/skeleton.js';

// Hash determinístico 0..1 — as falhas do neon vêm daqui, nunca de Math.random.
function hash(a, b, c = 0) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440670441)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

const FONTS = {
  'serif itálico': (s) => `italic 400 ${s}px 'Instrument Serif', serif`,
  sans: (s) => `500 ${s}px Inter, system-ui, sans-serif`,
};

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

const rgbStr = ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mixArr = (A, B, k) => A.map((v, i) => v + (B[i] - v) * k);

const DUR = 6;
const ON_END = 5.35; // começo do desligamento

export default {
  id: 'neon-sign',
  title: 'Neon Sign',
  description: 'A neon sign on a brick wall: the tubes sputter on, one letter keeps flickering and the glow tints the wall.',
  category: 'tipografia',
  tags: ['typography', 'loop', 'intro'],
  duration: DUR,
  poster: 3.1,

  params: {
    text: { type: 'text', label: 'Text', default: 'open' },
    sub: { type: 'text', label: 'Bottom line', default: 'EVERY NIGHT' },
    font: { type: 'select', label: 'Font', options: ['serif itálico', 'sans'], default: 'serif itálico' },
    color: { type: 'color', label: 'Main neon', default: '#ff3d7f' },
    color2: { type: 'color', label: 'Secondary neon', default: '#5fd4ff' },
    frame: { type: 'boolean', label: 'Frame', default: true },
    flicker: { type: 'range', label: 'Flicker', min: 0, max: 1.5, step: 0.01, default: 1 },
    wall: { type: 'color', label: 'Wall', default: '#2a1d1c' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p, px }) {
    const m = Math.min(w, h);
    const R = rng(p.seed * 131 + 7);
    const W = w * px;
    const H = h * px;
    const c1 = hexToRgb(p.color);
    const c2 = hexToRgb(p.color2);

    // ---------- Layout ----------
    const meas = mk(4, 4).getContext('2d');
    const fontFn = FONTS[p.font] ?? FONTS['serif itálico'];
    const text = p.text || '';
    const sub = (p.sub || '').toUpperCase();
    let fs = m * (p.font === 'sans' ? 0.26 : 0.34);
    meas.font = fontFn(fs);
    const maxW = w * (p.frame ? 0.7 : 0.8);
    const w0 = meas.measureText(text).width;
    if (w0 > maxW) fs *= maxW / w0;
    meas.font = fontFn(fs);
    const mt = meas.measureText(text || 'x');
    const tw = mt.width;
    const asc = mt.actualBoundingBoxAscent;
    const desc = mt.actualBoundingBoxDescent;

    let fs2 = Math.max(fs * 0.17, m * 0.03);
    const subFont = (s) => `500 ${s}px Inter, system-ui, sans-serif`;
    meas.font = subFont(fs2);
    let track = fs2 * 0.42;
    const subW = () => [...sub].reduce((a, ch) => a + meas.measureText(ch).width + track, 0) - track;
    if (sub && subW() > maxW) {
      const k = maxW / subW();
      fs2 *= k;
      track *= k;
      meas.font = subFont(fs2);
    }
    const sw = sub ? subW() : 0;
    const gap = sub ? fs * 0.22 : 0;
    const blockH = asc + desc + (sub ? gap + fs2 * 0.75 : 0);
    const top = h / 2 - blockH / 2;
    const base1 = top + asc;
    const base2 = base1 + desc + gap + fs2 * 0.73;

    // ---------- Sprites dos tubos ----------
    // Cada elemento (letra, letra da linha 2, moldura) vira dois sprites: "apagado" (vidro + sombra na parede)
    // e "aceso" (halo largo + halo curto + núcleo quase branco). Blur só aqui no setup.
    const tube1 = Math.max(1, fs * 0.048);
    const els = [];
    const glowR = fs * 0.2;
    const makeGlyph = (draw, bx, by, bw, bh, col, tube, group) => {
      const pad = glowR * 2.2;
      const sx = bx - pad;
      const sy = by - pad;
      const cw = (bw + pad * 2) * px;
      const ch = (bh + pad * 2) * px;
      const off = mk(cw, ch);
      const on = mk(cw, ch);
      // Vidro apagado: cor do gás bem dessaturada, quase o cinza da parede.
      const gray = (col[0] + col[1] + col[2]) / 3;
      const glass = mixArr(mixArr(col, [gray, gray, gray], 0.55), hexToRgb(p.wall), 0.5).map((v) => v * 0.85);
      {
        const g = off.getContext('2d');
        const q = mk(cw / 3, ch / 3);
        const qg = q.getContext('2d');
        qg.scale(px / 3, px / 3);
        qg.translate(-sx + tube * 1.2, -sy + tube * 2.2);
        qg.filter = `blur(${(tube * 1.4 * px) / 3}px)`;
        draw(qg, 'rgba(0,0,0,0.55)', tube);
        g.drawImage(q, 0, 0, cw, ch);
        g.scale(px, px);
        g.translate(-sx, -sy);
        draw(g, rgbStr(glass), tube);
      }
      {
        // Halos borrados em resolução reduzida (blur é o que mais custa no setup) e ampliados no sprite.
        const g = on.getContext('2d');
        for (const [div, r, a, lwk] of [[5, glowR, 0.75, 2.5], [2, glowR * 0.28, 0.9, 1.6]]) {
          const q = mk(cw / div, ch / div);
          const qg = q.getContext('2d');
          qg.scale(px / div, px / div);
          qg.translate(-sx, -sy);
          qg.filter = `blur(${(r * px) / div}px)`;
          draw(qg, rgbStr(col, a), tube * lwk);
          g.drawImage(q, 0, 0, cw, ch);
        }
        g.scale(px, px);
        g.translate(-sx, -sy);
        draw(g, rgbStr(mixArr(col, [255, 255, 255], 0.35)), tube);
        draw(g, rgbStr(mixArr(col, [255, 255, 255], 0.82)), tube * 0.45);
      }
      els.push({ off, on, x: sx, y: sy, dw: cw / px, dh: ch / px, group });
    };

    // Linha 1: o tubo segue o esqueleto do texto (mesmo afinamento do motion handwriting), separado por letra
    // pelo centro de cada traço.
    meas.font = fontFn(fs);
    const chars = [...text];
    const x0 = w / 2 - tw / 2;
    const sk = skeleton(text, fontFn);
    const kr = fs / sk.raster;
    const ox = x0 - sk.pad * kr;
    const oy = base1 - sk.base * kr;
    const centers = chars.map((chr, i) => x0 + meas.measureText(chars.slice(0, i).join('')).width + meas.measureText(chr).width / 2);
    const per = chars.map(() => []);
    for (const st of sk.strokes) {
      const pts = st.map(([x, y]) => [ox + x * kr, oy + y * kr]);
      const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
      let bi = 0;
      centers.forEach((c, i) => {
        if (chars[i] !== ' ' && Math.abs(c - mx) < Math.abs(centers[bi] - mx)) bi = i;
      });
      per[bi].push(pts);
    }
    per.forEach((strokes) => {
      if (!strokes.length) return;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const st of strokes) for (const [x, y] of st) {
        x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
      }
      makeGlyph(
        (g, col, lw) => {
          g.strokeStyle = col;
          g.lineWidth = lw;
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.beginPath();
          for (const st of strokes) {
            g.moveTo(st[0][0], st[0][1]);
            for (let i = 1; i < st.length; i++) g.lineTo(st[i][0], st[i][1]);
          }
          g.stroke();
        },
        x1 - tube1, y1 - tube1, x2 - x1 + tube1 * 2, y2 - y1 + tube1 * 2,
        c1,
        tube1,
        0,
      );
    });
    const n1 = els.length;

    // Linha 2 (um sprite só: acende junto) e moldura.
    if (sub) {
      const font = subFont(fs2);
      meas.font = font;
      const adv = [...sub].map((ch) => meas.measureText(ch).width);
      const sx0 = w / 2 - sw / 2;
      makeGlyph(
        (g, col, lw) => {
          g.font = font;
          g.textBaseline = 'alphabetic';
          g.fillStyle = col;
          g.strokeStyle = col;
          g.lineWidth = lw;
          g.lineJoin = 'round';
          let x = sx0;
          [...sub].forEach((ch, i) => {
            g.fillText(ch, x, base2);
            if (lw > fs2 * 0.06) g.strokeText(ch, x, base2);
            x += adv[i] + track;
          });
        },
        sx0,
        base2 - fs2 * 0.75,
        sw,
        fs2 * 0.8,
        c2,
        Math.max(0.6, fs2 * 0.05),
        1,
      );
    }
    if (p.frame) {
      const fw = Math.min(w * 0.9, Math.max(tw, sw) + fs * 0.75);
      const fh = Math.min(h * 0.9, blockH + fs * 0.55);
      const fx = w / 2 - fw / 2;
      const fy = top + blockH / 2 - fh / 2;
      const rr = Math.min(fw, fh) * 0.22;
      const lwF = Math.max(1, fs * 0.022);
      makeGlyph(
        (g, col, lw) => {
          g.strokeStyle = col;
          g.lineWidth = lw * 1.4;
          g.beginPath();
          g.roundRect(fx, fy, fw, fh, rr);
          g.stroke();
        },
        fx - lwF,
        fy - lwF,
        fw + lwF * 2,
        fh + lwF * 2,
        c2,
        lwF,
        1,
      );
    }

    // ---------- Parede ----------
    let wall = null;
    const lits = [];
    if (!p.transparent) {
      wall = mk(W, H);
      const g = wall.getContext('2d');
      g.scale(px, px);
      const wc = hexToRgb(p.wall);
      g.fillStyle = rgbStr(wc.map((v) => v * 0.45));
      g.fillRect(0, 0, w, h);
      const bh = m * 0.06;
      const bw = bh * 2.7;
      const mort = Math.max(1, bh * 0.1);
      const rows = Math.ceil(h / bh) + 1;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * bw * 0.5 + (R() - 0.5) * bw * 0.04;
        for (let x = -bw + off; x < w + bw; x += bw) {
          const k = 0.82 + R() * 0.32;
          const tint = (R() - 0.5) * 0.12;
          const col = [wc[0] * k * (1 + tint), wc[1] * k, wc[2] * k * (1 - tint)];
          const y = r * bh;
          const gr = g.createLinearGradient(0, y, 0, y + bh);
          gr.addColorStop(0, rgbStr(col.map((v) => v * 1.12)));
          gr.addColorStop(1, rgbStr(col.map((v) => v * 0.86)));
          g.fillStyle = gr;
          g.beginPath();
          g.roundRect(x + mort / 2, y + mort / 2, bw - mort, bh - mort, mort * 0.6);
          g.fill();
        }
      }
      // Granulado da alvenaria: pontinhos claros/escuros agrupados (dois fills).
      for (const [a, n] of [['rgba(0,0,0,0.22)', 2600], ['rgba(255,255,255,0.05)', 1800]]) {
        g.fillStyle = a;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const s = m * (0.002 + R() * 0.004);
          g.rect(R() * w, R() * h, s, s);
        }
        g.fill();
      }
      // Vinheta (mesma cor, só alpha).
      const vg = g.createRadialGradient(w / 2, h / 2, m * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.7)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);

      // Luz do neon na parede: parede × mapa de luz (somado por cima com 'lighter', alpha = brilho do grupo).
      const cyL = [base1 - asc * 0.4, sub ? base2 : base1];
      [c1, c2].forEach((col, gi) => {
        const L = mk(W, H);
        const lg = L.getContext('2d');
        for (let i = 0; i < 3; i++) {
          lg.globalCompositeOperation = i ? 'lighter' : 'source-over';
          lg.drawImage(wall, 0, 0);
        }
        lg.globalCompositeOperation = 'multiply';
        lg.scale(px, px);
        const rx = Math.max(tw, sw) * 0.9 + fs * 0.6;
        lg.save();
        lg.translate(w / 2, gi ? (cyL[0] + cyL[1]) / 2 : cyL[0]);
        lg.scale(1, 0.6);
        const rg = lg.createRadialGradient(0, 0, 0, 0, 0, rx);
        rg.addColorStop(0, rgbStr(col));
        rg.addColorStop(0.45, rgbStr(col.map((v) => v * 0.45)));
        rg.addColorStop(1, 'rgb(0,0,0)');
        lg.fillStyle = rg;
        lg.fillRect(-w * 2, -h * 3, w * 4, h * 6);
        lg.restore();
        // Névoa do ar em volta do tubo (somada).
        lg.globalCompositeOperation = 'lighter';
        lg.save();
        lg.translate(w / 2, gi ? (cyL[0] + cyL[1]) / 2 : cyL[0]);
        lg.scale(1, 0.55);
        const hg = lg.createRadialGradient(0, 0, 0, 0, 0, rx * 0.8);
        hg.addColorStop(0, rgbStr(col, 0.12));
        hg.addColorStop(1, rgbStr(col, 0));
        lg.fillStyle = hg;
        lg.fillRect(-w * 2, -h * 3, w * 4, h * 6);
        lg.restore();
        lits.push(L);
      });
    }

    // ---------- Roteiro de acendimento ----------
    // Linha 1 acende letra a letra em ordem embaralhada; linha 2 e moldura acendem juntas depois.
    const order = [...Array(n1).keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    els.forEach((e, i) => {
      if (i < n1) e.on0 = 0.45 + (order.indexOf(i) / Math.max(1, n1 - 1)) * 0.9 + R() * 0.12;
      else e.on0 = 1.65 + (i - n1) * 0.06;
      e.sputter = 0.32 + R() * 0.25;
      e.id = i + 1;
    });
    const broken = n1 ? Math.floor(R() * n1) : -1;

    // Camadas prontas: "apagado" (parede + vidros) e "tudo aceso menos a letra com defeito" — a maior parte do
    // ciclo o letreiro está estável e o frame vira 1–2 drawImage.
    let dark = null;
    let litAll = null;
    if (wall) {
      dark = mk(W, H);
      const g = dark.getContext('2d');
      g.drawImage(wall, 0, 0);
      g.scale(px, px);
      for (const e of els) g.drawImage(e.off, e.x, e.y, e.dw, e.dh);
      litAll = mk(W, H);
      const l = litAll.getContext('2d');
      l.drawImage(dark, 0, 0);
      l.globalCompositeOperation = 'lighter';
      lits.forEach((L, gi) => {
        l.globalAlpha = gi ? 0.75 : 1;
        if (gi === 0 ? n1 : els.length > n1) l.drawImage(L, 0, 0);
      });
      l.globalAlpha = 1;
      l.scale(px, px);
      els.forEach((e, i) => i !== broken && l.drawImage(e.on, e.x, e.y, e.dw, e.dh));
    }
    const steady0 = Math.max(0, ...els.map((e) => e.on0));

    return { els, n1, broken, dark, litAll, lits, steady0, S: p.seed * 7919 };
  },

  render(ctx, t, { w, h, p, state }) {
    const { els, dark, litAll, lits, broken, S } = state;
    const fl = p.flicker;

    // Brilho de cada elemento em t (0..1), quantizado a 30 passos/s nas falhas.
    const f = Math.floor(t * 30);
    const bright = (e, i) => {
      if (t < e.on0 - e.sputter) return 0;
      let b = 1;
      if (t < e.on0) {
        // Ignição: liga e desliga cada vez mais vezes até firmar.
        const k = seg(t, e.on0 - e.sputter, e.on0);
        const r = hash(f + S, e.id, 1);
        b = r < 0.25 + 0.75 * k * k ? (r < 0.15 ? 0.45 : 1) : 0.04;
        if (fl < 0.01) b = k > 0.5 ? 1 : 0;
      }
      // Letra com defeito: rajadas de pisca-pisca e meia-luz.
      if (i === broken && t > 2.1 && t < ON_END) {
        const win = Math.floor(t * 2.2);
        const burst = hash(win + S, 77, 3) < 0.55 * fl;
        if (burst) {
          const r = hash(f + S, 91, 4);
          b *= r < 0.45 ? 0.05 : r < 0.7 ? 0.35 : 1;
        }
      }
      // Desligamento no fim do ciclo (volta ao escuro do início: loop sem emenda).
      if (t > ON_END) {
        const k = seg(t, ON_END + (e.id % 3) * 0.04, ON_END + 0.32 + (e.id % 3) * 0.04);
        const r = hash(f + S, e.id, 9);
        b *= k >= 1 ? 0 : r > k * (fl > 0.01 ? 1 : 2) ? 1 - 0.6 * k : 0.03;
      }
      return b;
    };

    // Estável: camada pronta + a letra com defeito.
    if (litAll && t >= state.steady0 && t <= ON_END) {
      ctx.drawImage(litAll, 0, 0, w, h);
      const e = els[broken];
      if (e) {
        const b = bright(e, broken);
        if (b > 0.01) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = clamp(b);
          ctx.drawImage(e.on, e.x, e.y, e.dw, e.dh);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      return;
    }
    const bs = els.map(bright);

    if (dark) {
      ctx.drawImage(dark, 0, 0, w, h);
      const g = [0, 0];
      const n = [0, 0];
      els.forEach((e, i) => {
        g[e.group] += bs[i];
        n[e.group]++;
      });
      ctx.globalCompositeOperation = 'lighter';
      lits.forEach((L, gi) => {
        const a = n[gi] ? g[gi] / n[gi] : 0;
        const a2 = gi === 0 && !n[0] ? 0 : a;
        if (a2 > 0.01) {
          ctx.globalAlpha = clamp(a2 * (gi ? 0.75 : 1));
          ctx.drawImage(L, 0, 0, w, h);
        }
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Tubos apagados (vidro + sombra; já estão na camada escura) e acesos por cima, somando luz.
    if (!dark) for (const e of els) ctx.drawImage(e.off, e.x, e.y, e.dw, e.dh);
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    els.forEach((e, i) => {
      const b = bs[i];
      if (b <= 0.01) return;
      ctx.globalAlpha = clamp(b);
      ctx.drawImage(e.on, e.x, e.y, e.dw, e.dh);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
};
