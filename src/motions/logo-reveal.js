import { TAU, clamp, lerp, seg, ease, rng, rgba, mixHex } from '../lib/anim.js';
import { sampleImage } from '../lib/text-points.js';
import { asset } from '../lib/assets.js';

const F = 'Inter, system-ui, sans-serif';

export default {
  id: 'logo-reveal',
  title: 'Logo Reveal',
  description: 'Particles in the colors of your logo converge, a circular mask reveals the crisp logo, a glint passes and the tagline comes in.',
  category: 'dados',
  tags: ['intro', 'particles', 'alpha'],
  duration: 5,
  poster: 3.2,

  params: {
    image: { type: 'image', label: 'Logo (PNG/SVG)', default: '/samples/logo.svg' },
    tagline: { type: 'text', label: 'Tagline', default: 'motion·pedia' },
    accent: { type: 'color', label: 'Glow', default: '#ff4d2e' },
    textColor: { type: 'color', label: 'Text color', default: '#f4f1ea' },
    bg: { type: 'color', label: 'Background', default: '#0c0c10' },
    size: { type: 'range', label: 'Size', min: 0.2, max: 0.7, step: 0.01, default: 0.4 },
    density: { type: 'range', label: 'Particles', min: 30, max: 140, step: 1, default: 90 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p, px }) {
    const m = Math.min(w, h);
    const S = m * p.size;
    const hasText = !!p.tagline.trim();
    const cy = h / 2 - (hasText ? m * 0.06 : 0);
    const box = { x: w / 2 - S / 2, y: cy - S / 2, w: S, h: S };
    const img = asset(p.image);
    if (!img || !img.width) return { box, img: null, cy };

    const k = Math.min(S / img.width, S / img.height);
    const dw = img.width * k, dh = img.height * k;
    const rect = { x: w / 2 - dw / 2, y: cy - dh / 2, w: dw, h: dh };

    const step = Math.max(3, Math.round(S / p.density));
    const pts = sampleImage(img, { box, step, alphaMin: 100 });
    const R = rng(p.seed * 7919 + 13);
    const maxD = Math.hypot(dw, dh) / 2;
    // Cada partícula: alvo, origem espalhada, atraso e lote de cor (um fill por cor).
    const groups = new Map();
    const parts = pts.map((q) => {
      const ang = R() * TAU;
      const dist = m * (0.25 + R() * 0.75);
      const dx = q.x - w / 2, dy = q.y - cy;
      const radial = Math.hypot(dx, dy) / maxD;
      const o = {
        tx: q.x, ty: q.y,
        sx: q.x + Math.cos(ang) * dist,
        sy: q.y + Math.sin(ang) * dist * 0.8,
        swirl: (R() - 0.5) * 1.6,
        delay: 0.1 + radial * 0.35 + R() * 0.35,
        dur: 0.9 + R() * 0.4,
        rad: radial,
        tw: R(),
      };
      const key = `rgb(${q.r >> 3 << 3},${q.g >> 3 << 3},${q.b >> 3 << 3})`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
      return o;
    });

    // Logo rasterizado na resolução real (para o brilho com source-atop).
    const sc = Math.max(1, px);
    const logo = document.createElement('canvas');
    logo.width = Math.ceil(dw * sc);
    logo.height = Math.ceil(dh * sc);
    logo.getContext('2d').drawImage(img, 0, 0, logo.width, logo.height);
    const fx = document.createElement('canvas');
    fx.width = logo.width;
    fx.height = logo.height;

    return { box, img, cy, rect, step, groups: [...groups.entries()], count: parts.length, maxD, logo, fx, sc };
  },

  render(ctx, t, { w, h, p, px, state }) {
    const m = Math.min(w, h);
    const cx = w / 2;
    const { cy } = state;

    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const v = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * 0.6);
      v.addColorStop(0, mixHex(p.bg, '#ffffff', 0.05));
      v.addColorStop(1, mixHex(p.bg, '#000000', 0.5));
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    }

    // Saída global
    const outK = ease.inCubic(seg(t, 4.2, 4.85));
    const glowK = ease.outCubic(seg(t, 1.2, 2.6)) * (1 - outK);

    // Halo de destaque atrás do logo
    if (glowK > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * p.size * 1.25);
      g.addColorStop(0, rgba(p.accent, 0.22 * glowK));
      g.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Enquanto o logo carrega: moldura neutra pulsando.
    if (!state.img) {
      const { box } = state;
      const a = 0.25 + 0.15 * Math.sin(t * TAU * 0.8);
      ctx.strokeStyle = rgba(p.textColor, a);
      ctx.lineWidth = m * 0.003;
      ctx.setLineDash([m * 0.012, m * 0.012]);
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, box.w * 0.18);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const { rect, groups, maxD, step } = state;
    // Máscara circular que revela o logo nítido
    const maskK = ease.inOutCubic(seg(t, 1.55, 2.45));
    const maskR = maskK * maxD * 1.08;
    const sz = step * 0.78;

    // ---- partículas ----
    if (t < 2.6) {
      for (const [color, list] of groups) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const q of list) {
          const k = seg(t, q.delay, q.delay + q.dur);
          if (k <= 0) continue;
          // some quando a máscara passa por ela
          if (q.rad * maxD < maskR - step) continue;
          const e = ease.outQuart(k);
          const sw = q.swirl * (1 - e);
          const dx = q.sx - q.tx, dy = q.sy - q.ty;
          const x = q.tx + dx * (1 - e) * Math.cos(sw) - dy * (1 - e) * Math.sin(sw);
          const y = q.ty + dx * (1 - e) * Math.sin(sw) + dy * (1 - e) * Math.cos(sw);
          const s = sz * (0.35 + 0.65 * e) * (k < 1 ? 1 : 0.9 + 0.1 * Math.sin(t * 9 + q.tw * TAU));
          ctx.rect(x - s / 2, y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
        ctx.fill();
      }
    }

    // ---- logo nítido ----
    if (maskR > 0) {
      const sIn = lerp(1.05, 1, ease.outExpo(seg(t, 1.6, 2.9)));
      const sc = sIn * (1 - 0.05 * outK);
      ctx.save();
      ctx.globalAlpha = 1 - outK;
      if (outK > 0) ctx.filter = `blur(${outK * m * 0.012 * px}px)`;
      ctx.beginPath();
      ctx.arc(cx, cy, maskR, 0, TAU);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);

      // brilho diagonal (source-atop no canvas auxiliar)
      const shine = seg(t, 2.75, 3.55);
      let src = state.logo;
      if (shine > 0 && shine < 1) {
        const f = state.fx;
        const g2 = f.getContext('2d');
        g2.globalCompositeOperation = 'copy';
        g2.drawImage(state.logo, 0, 0);
        g2.globalCompositeOperation = 'source-atop';
        const W = f.width, H = f.height;
        const pos = lerp(-0.6, 1.6, ease.inOutSine(shine));
        const gr = g2.createLinearGradient(W * (pos - 0.35), H * (pos - 0.35) * 0.4, W * (pos + 0.35), H * (pos + 0.35) * 0.4);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.5, 'rgba(255,255,255,0.32)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g2.fillStyle = gr;
        g2.fillRect(0, 0, W, H);
        g2.globalCompositeOperation = 'source-over';
        src = f;
      }
      ctx.drawImage(src, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
      ctx.restore();
      ctx.filter = 'none';

      // anel na borda da máscara
      if (maskK > 0 && maskK < 1) {
        ctx.save();
        ctx.strokeStyle = rgba(p.accent, Math.sin(Math.PI * maskK) * 0.9);
        ctx.lineWidth = m * 0.004;
        ctx.shadowColor = p.accent;
        ctx.shadowBlur = m * 0.02 * px;
        ctx.beginPath();
        ctx.arc(cx, cy, maskR, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ---- assinatura ----
    const text = p.tagline.trim();
    if (text) {
      const fs = m * 0.05;
      const ty = cy + rect.h / 2 + m * 0.1;
      ctx.save();
      ctx.font = `700 ${fs}px ${F}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const chars = [...text];
      const spacing = fs * 0.04;
      const widths = chars.map((c) => ctx.measureText(c).width);
      const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
      let x = cx - total / 2;
      ctx.fillStyle = p.textColor;
      chars.forEach((c, i) => {
        const a0 = 2.55 + (i / Math.max(1, chars.length - 1)) * 0.45;
        const k = ease.outExpo(seg(t, a0, a0 + 0.7));
        const o = ease.inCubic(seg(t, 4.1 + i * 0.012, 4.55 + i * 0.012));
        const a = k * (1 - o);
        if (a > 0.001) {
          ctx.globalAlpha = a;
          ctx.fillText(c, x, ty + (1 - k) * fs * 0.6 - o * fs * 0.3);
        }
        x += widths[i] + spacing;
      });
      // traço de destaque
      const lk = ease.outExpo(seg(t, 2.9, 3.7)) * (1 - ease.inCubic(seg(t, 4.0, 4.5)));
      if (lk > 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.accent;
        const lw = fs * 1.6 * lk;
        ctx.fillRect(cx - lw / 2, ty + fs * 0.95, lw, Math.max(2, fs * 0.08));
      }
      ctx.restore();
    }
  },
};
