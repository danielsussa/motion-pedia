import { TAU, clamp, lerp, seg, ease, spring, rgba, mixHex } from '../lib/anim.js';

// "App | título | mensagem" por linha. Com 2 partes: "título | mensagem"; com 1: só a mensagem.
function parse(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const parts = l.split('|').map((s) => s.trim());
    let app = '', title = '', body = '';
    if (parts.length >= 3) [app, title, body] = [parts[0], parts[1], parts.slice(2).join(' | ')];
    else if (parts.length === 2) [title, body] = parts;
    else body = parts[0];
    if (!app && !title && !body) continue;
    out.push({ app: app || title || 'App', title, body });
  }
  return out;
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else {
      lines.push(cur);
      cur = wd;
    }
  }
  if (cur) lines.push(cur);
  const cut = lines.length > maxLines;
  if (cut) lines.length = maxLines;
  return lines.map((s, i) => {
    const last = cut && i === maxLines - 1;
    if (!last && ctx.measureText(s).width <= maxW) return s;
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

const F = 'Inter, system-ui, sans-serif';
const hueOf = (s) => [...s].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360;

const DEFAULT = `Loja | Nova venda | Você vendeu R$ 249,90 · Camiseta Oversized Preta
Pix | Pagamento recebido | R$ 1.200,00 de Marina Souza
Loja | Nova venda | Você vendeu R$ 89,00 · Boné Clássico
Loja | Meta do dia batida | 100 vendas hoje, 32% acima de ontem
Pix | Pagamento recebido | R$ 349,90 de Rafael Lima`;

export default {
  id: 'notifications',
  title: 'Notifications',
  description: 'Notificações no estilo iOS, em vidro translúcido, caindo do topo e empilhando com mola.',
  category: 'dados',
  tags: ['ui', 'dados', 'overlay', 'alpha'],
  duration: 8,
  poster: 5.2,

  params: {
    data: { type: 'textarea', label: 'Notificações (app | título | texto)', rows: 6, default: DEFAULT },
    time: { type: 'text', label: 'Horário', default: 'agora' },
    theme: { type: 'select', label: 'Tema', options: ['claro', 'escuro'], default: 'claro' },
    align: { type: 'select', label: 'Posição', options: ['auto', 'centro', 'direita', 'esquerda'], default: 'auto' },
    icons: { type: 'select', label: 'Ícones', options: ['destaque', 'coloridos'], default: 'destaque' },
    visible: { type: 'range', label: 'Máx. visíveis', min: 1, max: 6, step: 1, default: 4 },
    accent: { type: 'color', label: 'Destaque (ícone)', default: '#ff5a36' },
    bg: { type: 'color', label: 'Fundo', default: '#1d2a3a' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, p, duration }) {
    const items = parse(p.data);
    const n = items.length;
    const T0 = 0.4;
    const T1 = duration - 1.6;
    const gap = n > 1 ? Math.min(1.35, (T1 - T0) / (n - 1)) : 0;
    items.forEach((it, i) => (it.at = T0 + i * gap));
    // app → cor do ícone (estável)
    const apps = [...new Set(items.map((it) => it.app))];
    // wallpaper de prévia: gradientes radiais grandes custam caro por frame → 1/8 da resolução, no setup
    let wall = null;
    if (!p.transparent) {
      wall = document.createElement('canvas');
      wall.width = Math.max(8, Math.round(w / 8));
      wall.height = Math.max(8, Math.round(h / 8));
      const g = wall.getContext('2d');
      const W = wall.width, H = wall.height;
      g.fillStyle = p.bg;
      g.fillRect(0, 0, W, H);
      const blobs = [
        [0.2, 0.25, 0.7, mixHex(p.bg, '#7aa7ff', 0.55)],
        [0.85, 0.35, 0.6, mixHex(p.bg, p.accent, 0.55)],
        [0.55, 0.95, 0.8, mixHex(p.bg, '#b48cff', 0.4)],
      ];
      for (const [bx, by, br, c] of blobs) {
        const rg = g.createRadialGradient(bx * W, by * H, 0, bx * W, by * H, br * Math.max(W, H));
        const rgb = c.slice(4, -1);
        rg.addColorStop(0, `rgba(${rgb},0.85)`);
        rg.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = rg;
        g.fillRect(0, 0, W, H);
      }
    }
    return { items, apps, wall };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    const m = Math.min(w, h);
    const dark = p.theme === 'escuro';
    // ---------- fundo de prévia (wallpaper) ----------
    if (!p.transparent && state.wall) {
      // wallpaper pré-renderizado em baixa resolução (é todo desfocado); deriva lenta de escala
      const z = 1.04 + 0.03 * Math.sin((TAU * t) / duration);
      ctx.drawImage(state.wall, (w - w * z) / 2, (h - h * z) / 2, w * z, h * z);
    }

    const { items, apps } = state;
    const n = items.length;
    if (!n) return;

    // ---------- geometria ----------
    const portrait = h > w * 1.1;
    const align = p.align === 'auto' ? (portrait || Math.abs(w - h) < w * 0.15 ? 'centro' : 'direita') : p.align;
    const CW = portrait ? w * 0.9 : w < h * 1.3 ? w * 0.84 : Math.min(w * 0.42, m * 0.78);
    const u = CW / 720; // unidade: card de referência com 720 de largura
    const marginX = w < h * 1.3 ? (w - CW) / 2 : w * 0.035;
    const x0 = align === 'centro' ? (w - CW) / 2 : align === 'esquerda' ? marginX : w - marginX - CW;
    const y0 = portrait ? h * 0.06 : h * 0.06;
    const gapY = 14 * u;
    const pad = 26 * u;
    const icon = 76 * u;
    const R = 40 * u;
    const titleSize = 27 * u;
    const bodySize = 26 * u;
    const lh = bodySize * 1.3;
    const textX = pad + icon + 22 * u;
    const textW = CW - textX - pad;

    // altura de cada card (texto quebrado)
    ctx.font = `500 ${bodySize}px ${F}`;
    const lay = items.map((it) => {
      const lines = it.body ? wrap(ctx, it.body, textW, 2) : [];
      const H = Math.max(icon + pad * 2, pad * 2 + titleSize * 1.25 + lines.length * lh);
      return { lines, H };
    });

    const OUT = duration - 0.8;
    const outK = ease.inCubic(seg(t, OUT, duration - 0.05));
    const maxVis = Math.round(p.visible);

    // ---------- pilha: o mais novo no topo, os antigos descem ----------
    // deslocamento de cada card = soma (animada) das alturas dos que chegaram depois dele
    const arrive = (j) => spring(seg(t, items[j].at, items[j].at + 0.9), 0.14);
    const draws = [];
    for (let i = 0; i < n; i++) {
      const a = items[i].at;
      if (t < a) continue;
      const k = arrive(i);
      let off = 0;
      let depth = 0; // quantos chegaram depois (contínuo)
      for (let j = i + 1; j < n; j++) {
        if (t < items[j].at) break;
        const kj = clamp(arrive(j), 0, 1.2);
        off += (lay[j].H + gapY) * kj;
        depth += clamp(kj);
      }
      // além do limite: encolhe, recolhe atrás do anterior e some
      const over = clamp(depth - (maxVis - 1), 0, 2);
      const sc = 1 - 0.06 * over;
      const fade = clamp(1 - over * 0.8);
      if (fade <= 0.001) continue;
      // cards além do limite param de descer: ficam sob a pilha
      if (over > 0) {
        let offVis = 0;
        let cnt = 0;
        for (let j = i + 1; j < n && cnt < maxVis - 1; j++) {
          if (t < items[j].at) break;
          offVis += (lay[j].H + gapY) * clamp(arrive(j), 0, 1.2);
          cnt++;
        }
        off = lerp(off, offVis + 16 * u * over, clamp(over));
      }
      const yIn = (1 - k) * -(lay[i].H + y0 + 40 * u); // cai do topo
      draws.push({ i, y: y0 + off + yIn, sc, alpha: fade * clamp(seg(t, a, a + 0.25)), k, txt: clamp(1 - over * 3) });
    }

    const outY = -outK * h * 1.1;
    // desenha do mais antigo (embaixo) para o mais novo (em cima)
    for (const d of draws) {
      const it = items[d.i];
      const L = lay[d.i];
      const x = x0;
      const y = d.y + outY;
      if (y + L.H < -10) continue;
      ctx.save();
      ctx.globalAlpha = d.alpha * (1 - outK);
      ctx.translate(x + CW / 2, y);
      ctx.scale(d.sc, d.sc);
      ctx.translate(-CW / 2, 0);

      // sombra suave e barata: camadas escuras com alpha baixo (shadowBlur em cards grandes custa caro)
      for (const [e, a] of [[22, 0.04], [12, 0.05], [5, 0.06]]) {
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.beginPath();
        ctx.roundRect(-e * u * 0.6, e * u * 0.5, CW + e * u * 1.2, L.H + e * u * 0.6, R + e * u);
        ctx.fill();
      }
      ctx.fillStyle = dark ? 'rgba(28,28,32,0.72)' : 'rgba(250,250,252,0.7)';
      ctx.beginPath();
      ctx.roundRect(0, 0, CW, L.H, R);
      ctx.fill();
      // "vidro": véu + brilho de cima + borda clara
      const g = ctx.createLinearGradient(0, 0, 0, L.H);
      g.addColorStop(0, rgba('#ffffff', dark ? 0.08 : 0.28));
      g.addColorStop(1, rgba('#ffffff', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(0, 0, CW, L.H, R);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', dark ? 0.12 : 0.45);
      ctx.lineWidth = Math.max(1, 1.5 * u);
      ctx.stroke();

      if (d.txt <= 0.001) {
        ctx.restore();
        continue;
      }
      ctx.globalAlpha *= d.txt;
      // ícone
      const iy = (L.H - icon) / 2;
      let ic;
      if (p.icons === 'coloridos') {
        const hue = hueOf(it.app);
        ic = ctx.createLinearGradient(pad, iy, pad, iy + icon);
        ic.addColorStop(0, `hsl(${hue} 75% 60%)`);
        ic.addColorStop(1, `hsl(${(hue + 25) % 360} 70% 48%)`);
      } else {
        const ai = apps.indexOf(it.app);
        const base = ai === 0 ? p.accent : mixHex(p.accent, ai % 2 ? '#1c1c22' : '#ffffff', 0.35 + 0.1 * (ai >> 1));
        ic = base;
      }
      ctx.fillStyle = ic;
      ctx.beginPath();
      ctx.roundRect(pad, iy, icon, icon, icon * 0.24);
      ctx.fill();
      // brilho no ícone
      const ig = ctx.createLinearGradient(0, iy, 0, iy + icon);
      ig.addColorStop(0, 'rgba(255,255,255,0.22)');
      ig.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = ig;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${icon * 0.46}px ${F}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.app.charAt(0).toUpperCase(), pad + icon / 2, iy + icon / 2 + icon * 0.02);

      // textos
      const ink = dark ? '#f5f5f7' : '#111114';
      const muted = dark ? 'rgba(235,235,245,0.55)' : 'rgba(60,60,67,0.6)';
      const blockH = titleSize * 1.25 + L.lines.length * lh;
      let ty = (L.H - blockH) / 2;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.font = `500 ${22 * u}px ${F}`;
      ctx.fillStyle = muted;
      const tw = ctx.measureText(p.time).width;
      ctx.fillText(p.time, CW - pad, ty + 3 * u);
      ctx.textAlign = 'left';
      ctx.font = `700 ${titleSize}px ${F}`;
      ctx.fillStyle = ink;
      ctx.fillText(ellipsize(ctx, it.title || it.app, textW - tw - 16 * u), textX, ty);
      ty += titleSize * 1.25;
      ctx.font = `500 ${bodySize}px ${F}`;
      ctx.fillStyle = dark ? 'rgba(245,245,247,0.86)' : 'rgba(17,17,20,0.86)';
      L.lines.forEach((l, j) => ctx.fillText(l, textX, ty + j * lh));
      ctx.restore();
    }
  },
};
