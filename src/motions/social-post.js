import { TAU, clamp, seg, ease, spring, rgba, rng } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';

// ---------- helpers locais ----------

function parseCount(raw) {
  const s = String(raw).toLowerCase().replace(/\s/g, '');
  const m = s.match(/^([\d.,]+)(mil|k|mi|m)?$/);
  if (!m) return Math.max(0, Number(s.replace(/\D/g, '')) || 0);
  let n = m[1];
  // "12,5" ou "12.5" com sufixo = decimal; sem sufixo, ponto = milhar
  if (m[2]) n = Number(n.replace(',', '.'));
  else n = Number(n.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  const mult = m[2] === 'mil' || m[2] === 'k' ? 1e3 : m[2] === 'mi' || m[2] === 'm' ? 1e6 : 1;
  return Math.max(0, Math.round((n || 0) * mult));
}

const fmtFull = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmtComp = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const fmtN = (v) => (v >= 10000 ? fmtComp.format(v) : fmtFull.format(v));

function wrap(ctx, text, maxW, maxLines) {
  const out = [];
  for (const para of String(text).split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const wd of words) {
      const test = cur ? `${cur} ${wd}` : wd;
      if (ctx.measureText(test).width <= maxW || !cur) cur = test;
      else {
        out.push(cur);
        cur = wd;
      }
    }
    out.push(cur);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  const cut = out.length > maxLines;
  if (cut) out.length = maxLines;
  return out.map((s, i) => {
    if (!(cut && i === maxLines - 1) && ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  });
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// coração em caixa unitária centrada em (0,0), raio ~1
function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.85);
  ctx.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 0.95, y - s * 0.95, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.95, y - s * 0.95, x + s * 1.25, y + s * 0.05, x, y + s * 0.85);
  ctx.closePath();
}

// ícone de repost: duas setas em loop
function repostPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.75, y + s * 0.15);
  ctx.lineTo(x - s * 0.75, y - s * 0.35);
  ctx.quadraticCurveTo(x - s * 0.75, y - s * 0.55, x - s * 0.5, y - s * 0.55);
  ctx.lineTo(x + s * 0.55, y - s * 0.55);
  ctx.moveTo(x + s * 0.35, y - s * 0.78);
  ctx.lineTo(x + s * 0.6, y - s * 0.55);
  ctx.lineTo(x + s * 0.35, y - s * 0.32);
  ctx.moveTo(x + s * 0.75, y - s * 0.15);
  ctx.lineTo(x + s * 0.75, y + s * 0.35);
  ctx.quadraticCurveTo(x + s * 0.75, y + s * 0.55, x + s * 0.5, y + s * 0.55);
  ctx.lineTo(x - s * 0.55, y + s * 0.55);
  ctx.moveTo(x - s * 0.35, y + s * 0.78);
  ctx.lineTo(x - s * 0.6, y + s * 0.55);
  ctx.lineTo(x - s * 0.35, y + s * 0.32);
}

function bubblePath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.15, y + s * 0.6);
  ctx.lineTo(x - s * 0.55, y + s * 0.85);
  ctx.lineTo(x - s * 0.5, y + s * 0.55);
  ctx.bezierCurveTo(x - s * 1.05, y + s * 0.35, x - s * 0.95, y - s * 0.75, x, y - s * 0.72);
  ctx.bezierCurveTo(x + s * 1.0, y - s * 0.72, x + s * 1.0, y + s * 0.6, x - s * 0.15, y + s * 0.6);
}

const T_LIKE = 2.0; // instante do "curtir"
const T_REPOST = 2.9;

export default {
  id: 'social-post',
  title: 'Social Post',
  description: 'A social post card with avatar, text and photo; likes and reposts count up and the heart pops with a burst.',
  category: 'dados',
  tags: ['ui', 'data', 'alpha'],
  duration: 7,
  poster: 3.2,

  params: {
    avatar: { type: 'image', label: 'Avatar', default: '/samples/portrait.jpg' },
    name: { type: 'text', label: 'Name', default: 'Ana Ribeiro' },
    handle: { type: 'text', label: '@', default: '@anaribeiro' },
    text: {
      type: 'textarea',
      label: 'Text',
      rows: 4,
      default: 'Three years animating frame by frame, and today we released the whole library for free. Thank you to everyone who followed every frame.',
    },
    showMedia: { type: 'boolean', label: 'Show photo', default: true },
    media: { type: 'image', label: 'Post photo', default: '/samples/landscape.jpg' },
    likes: { type: 'text', label: 'Likes', default: '12.480' },
    reposts: { type: 'text', label: 'Reposts', default: '1.930' },
    theme: { type: 'select', label: 'Theme', options: ['escuro', 'claro'], default: 'escuro' },
    accent: { type: 'color', label: 'Heart', default: '#f91880' },
    bg: { type: 'color', label: 'Background', default: '#0e0f12' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ p }) {
    const r = rng(7);
    const burst = Array.from({ length: 14 }, (_, i) => ({
      a: (i / 14) * TAU + (r() - 0.5) * 0.3,
      d: 0.75 + r() * 0.5,
      s: 0.5 + r() * 0.6,
      c: i % 3,
    }));
    return { likes: parseCount(p.likes), reposts: parseCount(p.reposts), burst };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const dark = p.theme !== 'claro';
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      vg.addColorStop(0, rgba(p.accent, 0.1));
      vg.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    const portrait = h > w * 1.1;
    const CW = portrait ? w * 0.88 : w < h * 1.3 ? w * 0.8 : Math.min(w * 0.46, h * 0.95, 900);
    const u = CW / 800; // unidade: card de referência com 800 de largura
    const pad = 40 * u;
    const avR = 46 * u;
    const nameS = 32 * u;
    const textS = 34 * u;
    const lh = textS * 1.38;
    const innerW = CW - pad * 2;

    // medidas
    ctx.font = `500 ${textS}px Inter, system-ui, sans-serif`;
    const maxLines = portrait ? 7 : 5;
    const lines = wrap(ctx, String(p.text || '').trim().replace(/\n\s*\n\s*\n+/g, '\n\n'), innerW, maxLines);
    const img = p.showMedia ? asset(p.media) : null;
    const wantMedia = p.showMedia && p.media;
    let mediaH = wantMedia ? innerW * (portrait ? 0.62 : 0.5) : 0;
    const headH = avR * 2;
    const actH = 60 * u;
    let CH = pad + headH + 26 * u + lines.length * lh + (wantMedia ? 22 * u + mediaH : 0) + 24 * u + actH + pad * 0.6;
    // garante que cabe na altura
    const maxH = h * 0.9;
    if (CH > maxH && mediaH) {
      const cut = Math.min(mediaH * 0.6, CH - maxH);
      mediaH -= cut;
      CH -= cut;
    }
    const sc0 = CH > maxH ? maxH / CH : 1;

    // ---------- entrada / saída ----------
    const inK = spring(seg(t, 0.1, 1.1), 0.12);
    const OUT = duration - 0.8;
    const outK = ease.inCubic(seg(t, OUT, duration - 0.05));
    if (outK >= 1) return;
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.globalAlpha = clamp(seg(t, 0.1, 0.4)) * (1 - outK);
    ctx.translate(cx, cy + (1 - inK) * h * 0.08 + outK * h * 0.06);
    const sc = sc0 * (0.94 + 0.06 * inK) * (1 - 0.04 * outK);
    ctx.scale(sc, sc);
    ctx.translate(-CW / 2, -CH / 2);

    // card
    const panel = dark ? '#16181c' : '#ffffff';
    const ink = dark ? '#e7e9ea' : '#0f1419';
    const muted = dark ? '#71767b' : '#536471';
    const line = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    for (const [e, a] of [[34, 0.05], [18, 0.07], [7, 0.08]]) {
      ctx.fillStyle = `rgba(0,0,0,${a * (dark ? 1.4 : 1)})`;
      ctx.beginPath();
      ctx.roundRect(-e * u * 0.5, e * u * 0.6, CW + e * u, CH + e * u * 0.5, 32 * u + e * u);
      ctx.fill();
    }
    ctx.fillStyle = panel;
    ctx.beginPath();
    ctx.roundRect(0, 0, CW, CH, 32 * u);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.stroke();

    // avatar (recorte circular, cover)
    const ax = pad + avR;
    const ay = pad + avR;
    const av = asset(p.avatar);
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, avR, 0, TAU);
    ctx.clip();
    if (av) {
      const r = coverRect(av, avR * 2, avR * 2, { fy: 0.35 });
      ctx.drawImage(av, ax - avR + r.x, ay - avR + r.y, r.w, r.h);
    } else {
      ctx.fillStyle = dark ? '#2f3336' : '#e1e8ed';
      ctx.fillRect(ax - avR, ay - avR, avR * 2, avR * 2);
    }
    ctx.restore();

    // nome, selo, @handle
    const tx = ax + avR + 20 * u;
    const nameW = CW - tx - pad - 60 * u;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${nameS}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = ink;
    const nm = ellipsize(ctx, p.name, nameW - 40 * u);
    ctx.fillText(nm, tx, ay - 4 * u);
    const nw = ctx.measureText(nm).width;
    // selo de verificado
    const bx = tx + nw + 20 * u;
    const by = ay - 4 * u - nameS * 0.36;
    const bR = 15 * u;
    ctx.fillStyle = '#1d9bf0';
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const rr = k % 2 ? bR * 0.86 : bR;
      ctx[k ? 'lineTo' : 'moveTo'](bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * u;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bx - bR * 0.42, by + bR * 0.02);
    ctx.lineTo(bx - bR * 0.1, by + bR * 0.34);
    ctx.lineTo(bx + bR * 0.45, by - bR * 0.3);
    ctx.stroke();
    ctx.font = `500 ${nameS * 0.85}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = muted;
    ctx.fillText(ellipsize(ctx, `${p.handle} · 2 h`, nameW), tx, ay + nameS * 0.95);
    // "…" no canto
    ctx.fillStyle = muted;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.arc(CW - pad - 12 * u + k * 10 * u, pad + 16 * u, 3.2 * u, 0, TAU);
      ctx.fill();
    }

    // texto: linhas surgem em sequência
    let y = pad + headH + 26 * u;
    ctx.font = `500 ${textS}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => {
      const e = ease.outCubic(seg(t, 0.5 + i * 0.09, 1.1 + i * 0.09));
      ctx.fillStyle = rgba(ink, e);
      ctx.fillText(l, pad, y + i * lh + (1 - e) * textS * 0.4);
    });
    y += lines.length * lh;

    // foto
    if (wantMedia) {
      y += 22 * u;
      const mIn = ease.outExpo(seg(t, 0.8, 1.8));
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(pad, y, innerW, mediaH, 22 * u);
      ctx.clip();
      ctx.fillStyle = dark ? '#202327' : '#eef1f3';
      ctx.fillRect(pad, y, innerW, mediaH);
      if (img) {
        const z = 1.12 - 0.08 * mIn + 0.02 * seg(t, 1.8, duration);
        const r = coverRect(img, innerW, mediaH, { zoom: z });
        ctx.globalAlpha *= mIn;
        ctx.drawImage(img, pad + r.x, y + r.y, r.w, r.h);
      }
      ctx.restore();
      ctx.strokeStyle = line;
      ctx.lineWidth = Math.max(1, 1.5 * u);
      ctx.beginPath();
      ctx.roundRect(pad, y, innerW, mediaH, 22 * u);
      ctx.stroke();
      y += mediaH;
    }

    // ---------- ações ----------
    y += 24 * u;
    ctx.fillStyle = line;
    ctx.fillRect(pad, y - 2 * u, innerW, Math.max(1, 1.5 * u));
    const ay2 = y + actH / 2 + 4 * u;
    const iconS = 20 * u;
    const numS = 27 * u;
    const slots = [pad, pad + innerW * 0.27, pad + innerW * 0.54, pad + innerW - iconS * 2];
    const cntK = (a) => ease.outCubic(seg(t, a, duration - 1.2));
    const likeK = cntK(T_LIKE - 0.6);
    const likes = Math.round(state.likes * (0.82 + 0.18 * likeK)) + (t >= T_LIKE ? 1 : 0);
    const reps = Math.round(state.reposts * (0.8 + 0.2 * cntK(T_REPOST - 0.4))) + (t >= T_REPOST ? 1 : 0);
    const comments = Math.max(1, Math.round(state.likes * 0.021));

    ctx.lineWidth = 2.6 * u;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const numFont = `500 ${numS}px Inter, system-ui, sans-serif`;

    // comentários
    ctx.strokeStyle = muted;
    bubblePath(ctx, slots[0] + iconS, ay2, iconS);
    ctx.stroke();
    ctx.font = numFont;
    ctx.fillStyle = muted;
    ctx.fillText(fmtN(comments), slots[0] + iconS * 2.6, ay2);

    // repost: gira e fica verde
    const rOn = t >= T_REPOST;
    const rSpin = ease.outCubic(seg(t, T_REPOST, T_REPOST + 0.6));
    const green = '#00ba7c';
    ctx.save();
    ctx.translate(slots[1] + iconS, ay2);
    ctx.rotate(rSpin * Math.PI);
    const rPop = 1 + 0.25 * Math.sin(Math.PI * seg(t, T_REPOST, T_REPOST + 0.35));
    ctx.scale(rPop, rPop);
    ctx.strokeStyle = rOn ? green : muted;
    repostPath(ctx, 0, 0, iconS * 1.05);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = rOn ? green : muted;
    ctx.fillText(fmtN(reps), slots[1] + iconS * 2.6, ay2);

    // coração: curtir com burst, depois batidas suaves
    const hx = slots[2] + iconS;
    const liked = t >= T_LIKE;
    const pressK = seg(t, T_LIKE - 0.18, T_LIKE); // aperta antes
    const popK = seg(t, T_LIKE, T_LIKE + 0.9);
    let hs = 1 - 0.18 * Math.sin((Math.PI / 2) * pressK) * (liked ? 0 : 1);
    if (liked) hs = 0.82 + 0.18 * spring(popK, 0.55) + 0.2 * Math.sin(Math.PI * clamp(popK * 2.2));
    // batimento a cada 1,1 s depois do like (pura de t)
    if (t > T_LIKE + 1.0) {
      const bt = ((t - T_LIKE - 1.0) % 1.1) / 1.1;
      hs *= 1 + 0.14 * Math.max(0, Math.sin(bt * TAU * 2)) * (bt < 0.5 ? 1 : 0);
    }
    // anel + partículas
    if (popK > 0 && popK < 1) {
      const rk = ease.outCubic(clamp(popK * 1.8));
      ctx.strokeStyle = rgba(p.accent, 0.55 * (1 - rk));
      ctx.lineWidth = iconS * 0.5 * (1 - rk) + 0.5 * u;
      ctx.beginPath();
      ctx.arc(hx, ay2, iconS * (0.6 + 1.5 * rk), 0, TAU);
      ctx.stroke();
      const cols = [p.accent, '#ffb020', '#7c5cff'];
      const pk = ease.outExpo(popK);
      for (const b of state.burst) {
        const dist = iconS * (1.2 + 2.2 * b.d * pk);
        const sz = iconS * 0.2 * b.s * (1 - popK * 0.9);
        if (sz <= 0.05) continue;
        ctx.fillStyle = cols[b.c];
        ctx.beginPath();
        ctx.arc(hx + Math.cos(b.a) * dist, ay2 + Math.sin(b.a) * dist, sz, 0, TAU);
        ctx.fill();
      }
    }
    ctx.lineWidth = 2.6 * u;
    if (liked) {
      ctx.fillStyle = p.accent;
      heartPath(ctx, hx, ay2, iconS * hs);
      ctx.fill();
    } else {
      ctx.strokeStyle = muted;
      heartPath(ctx, hx, ay2, iconS * hs);
      ctx.stroke();
    }
    ctx.fillStyle = liked ? p.accent : muted;
    ctx.font = numFont;
    ctx.fillText(fmtN(likes), slots[2] + iconS * 2.6, ay2);

    // compartilhar
    const sx = slots[3] + iconS;
    ctx.strokeStyle = muted;
    ctx.lineWidth = 2.6 * u;
    ctx.beginPath();
    ctx.moveTo(sx, ay2 + iconS * 0.35);
    ctx.lineTo(sx, ay2 - iconS * 0.75);
    ctx.moveTo(sx - iconS * 0.45, ay2 - iconS * 0.32);
    ctx.lineTo(sx, ay2 - iconS * 0.78);
    ctx.lineTo(sx + iconS * 0.45, ay2 - iconS * 0.32);
    ctx.moveTo(sx - iconS * 0.75, ay2);
    ctx.lineTo(sx - iconS * 0.75, ay2 + iconS * 0.75);
    ctx.lineTo(sx + iconS * 0.75, ay2 + iconS * 0.75);
    ctx.lineTo(sx + iconS * 0.75, ay2);
    ctx.stroke();

    ctx.restore();
  },
};
