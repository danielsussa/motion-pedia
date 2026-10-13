import { seg, ease } from '../lib/anim.js';

export default {
  id: 'lower-third',
  title: 'Lower Third',
  description: 'Name and title lower third for video: wipes in, holds and wipes out. Supports a transparent background.',
  category: 'dados',
  tags: ['typography', 'broadcast'],
  duration: 5,

  params: {
    name: { type: 'text', label: 'Name', default: 'Ana Ribeiro' },
    role: { type: 'text', label: 'Role', default: 'CREATIVE DIRECTOR' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    panel: { type: 'color', label: 'Panel', default: '#ffffff' },
    nameColor: { type: 'color', label: 'Name color', default: '#111114' },
    roleColor: { type: 'color', label: 'Role color', default: '#ffffff' },
    bg: { type: 'color', label: 'Background', default: '#2b3440' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    scale: { type: 'range', label: 'Scale', min: 0.5, max: 1.6, step: 0.01, default: 1 },
  },

  render(ctx, t, { w, h, p }) {
    if (!p.transparent) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, p.bg);
      g.addColorStop(1, '#0b0d11');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const fs = Math.min(w, h) * 0.06 * p.scale;
    const rs = fs * 0.42;
    const pad = fs * 0.45;
    const x = w * 0.07;
    const y = h * (h > w ? 0.74 : 0.7);

    ctx.font = `800 ${fs}px Inter, system-ui, sans-serif`;
    const nameW = ctx.measureText(p.name).width;
    ctx.font = `600 ${rs}px Inter, system-ui, sans-serif`;
    ctx.letterSpacing = `${rs * 0.12}px`;
    const roleW = ctx.measureText(p.role).width;

    const barW = fs * 0.16;
    const pX = x + barW;
    const pW = nameW + pad * 2;
    const pH = fs * 1.45;
    const rW = roleW + pad * 2;
    const rH = rs * 2.1;
    const totalH = pH + rH;

    // Entrada (0–1.4s) e saída (3.7–4.6s).
    const bar = ease.outExpo(seg(t, 0.1, 0.6)) - ease.inExpo(seg(t, 4.2, 4.6));
    const panelIn = ease.outExpo(seg(t, 0.35, 1.0));
    const panelOut = ease.inOutCubic(seg(t, 3.85, 4.4));
    const roleIn = ease.outExpo(seg(t, 0.6, 1.2));
    const roleOut = ease.inOutCubic(seg(t, 3.7, 4.2));
    const nameE = ease.outCubic(seg(t, 0.5, 1.2));
    const roleE = ease.outCubic(seg(t, 0.8, 1.4));

    ctx.fillStyle = p.accent;
    ctx.fillRect(x, y, barW, totalH * bar);

    const wipe = (inE, outE, x0, width, top, height, draw) => {
      const a = x0 + width * outE;
      const b = x0 + width * inE;
      if (b <= a) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(a, top, b - a, height);
      ctx.clip();
      draw();
      ctx.restore();
    };

    wipe(panelIn, panelOut, pX, pW, y, pH, () => {
      ctx.fillStyle = p.panel;
      ctx.fillRect(pX, y, pW, pH);
      ctx.font = `800 ${fs}px Inter, system-ui, sans-serif`;
      ctx.letterSpacing = '0px';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.nameColor;
      ctx.globalAlpha = nameE;
      ctx.fillText(p.name, pX + pad - (1 - nameE) * fs * 0.8, y + pH * 0.53);
    });

    wipe(roleIn, roleOut, pX, rW, y + pH, rH, () => {
      ctx.fillStyle = p.accent;
      ctx.fillRect(pX, y + pH, rW, rH);
      ctx.font = `600 ${rs}px Inter, system-ui, sans-serif`;
      ctx.letterSpacing = `${rs * 0.12}px`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.roleColor;
      ctx.globalAlpha = roleE;
      ctx.fillText(p.role, pX + pad, y + pH + rH * 0.52 + (1 - roleE) * rs);
    });
  },
};
