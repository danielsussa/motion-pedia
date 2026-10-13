import { TAU, clamp, lerp, seg, ease, spring, rgba, mixHex, rng } from '../lib/anim.js';

const F = 'Inter, system-ui, sans-serif';

const DEF_SUG = `motion graphics in javascript
motion graphics for beginners
motion graphics with canvas 2d
motion graphics in after effects`;

const DEF_RES = `motion·pedia — motion graphics library | motionpedia.dev | Over 150 Canvas 2D effects, ready to export as video, with live parameters.
Animating with Canvas 2D: the complete guide | developer.mozilla.org › canvas | From your first rectangle to animations with requestAnimationFrame, gradients and layer compositing.
Easing in practice: curves that bring things to life | easings.net | Compare outExpo, springs and overshoot, and learn when to use each curve in UIs and videos.`;

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

// lupa centrada em (x, y), tamanho s
function lens(ctx, x, y, s, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x - s * 0.12, y - s * 0.12, s * 0.38, 0, TAU);
  ctx.moveTo(x + s * 0.17, y + s * 0.17);
  ctx.lineTo(x + s * 0.48, y + s * 0.48);
  ctx.stroke();
}

// Linha do tempo (s)
const T_IN = 0.1;
const T_TYPE = 1.0;
const T_SEL = 3.05; // seta para baixo até a sugestão
const T_ENTER = 3.45;
const T_MOVE = 3.65;
const T_RES = 4.25;

export default {
  id: 'search-bar',
  title: 'Search Bar',
  description: 'A search bar opens, gets typed into with suggestions, picks one and lets the results cascade in.',
  category: 'dados',
  tags: ['ui', 'data', 'alpha'],
  duration: 8,
  poster: 5.6,

  params: {
    query: { type: 'text', label: 'Typed query', default: 'motion graphics' },
    suggestions: { type: 'textarea', label: 'Suggestions (one per line)', rows: 4, default: DEF_SUG },
    pick: { type: 'range', label: 'Picked suggestion', min: 1, max: 6, step: 1, default: 1 },
    results: { type: 'textarea', label: 'Results (title | site | description)', rows: 5, default: DEF_RES },
    theme: { type: 'select', label: 'Theme', options: ['claro', 'escuro'], default: 'claro' },
    accent: { type: 'color', label: 'Accent', default: '#3b6cff' },
    bg: { type: 'color', label: 'Background', default: '#14161b' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p, px }) {
    const sugs = String(p.suggestions || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6);
    const pick = sugs.length ? clamp(Math.round(p.pick) - 1, 0, sugs.length - 1) : -1;
    const results = String(p.results || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((l) => {
        const [title = '', site = '', desc = ''] = l.split('|').map((s) => s.trim());
        return { title, site, desc };
      });
    // tempos de cada tecla (ritmo humano, determinístico)
    const q = String(p.query || '');
    const r = rng(5);
    const keyT = [];
    let tt = T_TYPE;
    const span = 1.55;
    const base = q.length ? span / q.length : 0;
    for (let i = 0; i < q.length; i++) {
      tt += base * (0.6 + r() * 0.8) * (q[i] === ' ' ? 1.4 : 1);
      keyT.push(Math.min(tt, T_TYPE + span + 0.2));
    }
    let wall = null;
    if (!p.transparent) {
      wall = document.createElement('canvas');
      wall.width = Math.max(4, Math.round(w * px));
      wall.height = Math.max(4, Math.round(h * px));
      const g = wall.getContext('2d');
      g.scale(px, px);
      g.fillStyle = p.bg;
      g.fillRect(0, 0, w, h);
      const rg = g.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.4, Math.max(w, h) * 0.75);
      rg.addColorStop(0, rgba(p.accent, 0.16));
      rg.addColorStop(0.55, rgba(p.accent, 0.04));
      rg.addColorStop(1, rgba(p.accent, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    }
    return { sugs, pick, results, keyT, q, wall };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    const { sugs, pick, results, keyT, q, wall } = state;
    if (wall) ctx.drawImage(wall, 0, 0, w, h);
    const dark = p.theme === 'escuro';
    const PANEL = dark ? '#1c1e24' : '#ffffff';
    const INK = dark ? '#eceef2' : '#14161b';
    const MUTED = dark ? '#8d919c' : '#6b6f7a';
    const LINE = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
    const HOVER = dark ? 'rgba(255,255,255,0.06)' : rgba(p.accent, 0.08);

    const portrait = h > w * 1.15;
    let BW = portrait ? w * 0.88 : w > h * 1.3 ? Math.min(w * 0.58, h * 1.12) : w * 0.84;
    const REF = portrait ? 800 : 1000; // no vertical, tudo um pouco maior em relação à largura
    // mede tudo numa unidade de referência e encolhe a largura se a pilha não couber na altura
    const layout = (u) => {
      const pad = 34 * u, titleS = 31 * u, descS = 25 * u, descLH = descS * 1.42;
      ctx.font = `400 ${descS}px ${F}`;
      const cards = results.map((r) => {
        const lines = wrap(ctx, r.desc, BW - pad * 2, 2);
        const ch = pad * 0.85 + 46 * u + 12 * u + titleS * 1.25 + (lines.length ? 10 * u + lines.length * descLH : 0) + pad * 0.85;
        return { ...r, lines, ch };
      });
      const resH = 44 * u + cards.reduce((a, c) => a + c.ch + 22 * u, 0);
      return { cards, resH, total: 100 * u + 26 * u + resH };
    };
    let L = layout(BW / REF);
    if (L.total > h * 0.92) {
      BW *= (h * 0.92) / L.total;
      L = layout(BW / REF);
    }
    const { cards, resH } = L;
    const fitK = 1;
    const u = BW / REF;
    const BH = 100 * u;
    const rowH = 70 * u;
    const dropPad = 14 * u;
    const dropH = sugs.length ? sugs.length * rowH + dropPad * 2 : 0;
    const cardGap = 22 * u;
    const pad = 34 * u;
    const titleS = 31 * u;
    const descS = 25 * u;
    const descLH = descS * 1.42;
    const siteS = 23 * u;
    const innerW = BW - pad * 2;
    const statsH = 44 * u;
    // posições da barra: centro (com sugestões) → topo (com resultados)
    const y0 = (h - (BH + dropH * 0.75)) / 2;
    const y1 = (h - (BH + 26 * u + resH) * fitK) / 2;

    // ---------- tempos ----------
    const inK = spring(seg(t, T_IN, T_IN + 1.0), 0.18);
    const outK = ease.inCubic(seg(t, duration - 0.7, duration - 0.05));
    if (outK >= 1) return;
    const moveK = ease.outExpo(seg(t, T_MOVE, T_MOVE + 1.0));
    const nTyped = keyT.reduce((a, k) => a + (t >= k ? 1 : 0), 0);
    const typed = q.slice(0, nTyped);
    const doneTyping = nTyped >= q.length;
    const chosen = pick >= 0 ? sugs[pick] : q;
    const entered = t >= T_ENTER;
    const dropOpen = sugs.length ? ease.outExpo(seg(t, keyT[Math.min(2, keyT.length - 1)] ?? T_TYPE, (keyT[Math.min(2, keyT.length - 1)] ?? T_TYPE) + 0.6)) * (1 - ease.inOutCubic(seg(t, T_ENTER, T_ENTER + 0.35))) : 0;
    const selK = ease.outCubic(seg(t, T_SEL, T_SEL + 0.25));

    ctx.save();
    ctx.globalAlpha = clamp(seg(t, T_IN, T_IN + 0.3)) * (1 - outK);
    ctx.translate(w / 2, h / 2 + outK * h * 0.03);
    const sc = 1 - 0.03 * outK;
    ctx.scale(sc, sc);
    ctx.translate(-w / 2, -h / 2);
    const bx = (w - BW) / 2;
    const by = lerp(y0, y1, moveK);

    // ---------- resultados (desenhados antes: ficam sob a barra) ----------
    if (t >= T_RES - 0.1 && cards.length) {
      ctx.save();
      ctx.translate(w / 2, by + BH);
      ctx.scale(fitK, fitK);
      ctx.translate(-w / 2, -(by + BH));
      let cy = by + BH + 26 * u;
      // linha de estatística
      const sk = ease.outCubic(seg(t, T_RES - 0.1, T_RES + 0.4));
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * sk;
      ctx.font = `500 ${siteS}px ${F}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = p.transparent ? MUTED : '#8d919c';
      const total = Math.round(1240 * ease.outCubic(seg(t, T_RES, T_RES + 1.2)));
      ctx.fillText(`About ${total.toLocaleString('en-US')} results (0.42 s)`, bx + 8 * u, cy + statsH * 0.4);
      ctx.globalAlpha = ga;
      cy += statsH;
      cards.forEach((c, i) => {
        const a = T_RES + 0.12 + i * 0.16;
        const k = spring(seg(t, a, a + 0.9), 0.22);
        const al = clamp(seg(t, a, a + 0.25));
        if (al <= 0) {
          cy += c.ch + cardGap;
          return;
        }
        ctx.save();
        ctx.globalAlpha = ga * al;
        ctx.translate(0, (1 - k) * -60 * u);
        const x = bx;
        // sombra em camadas
        for (const [e, sa] of [[18, 0.05], [6, 0.07]]) {
          ctx.fillStyle = `rgba(0,0,0,${sa * (dark ? 2 : 1.4)})`;
          ctx.beginPath();
          ctx.roundRect(x - e * u * 0.3, cy + e * u * 0.5, BW + e * u * 0.6, c.ch, 24 * u + e * u * 0.3);
          ctx.fill();
        }
        ctx.fillStyle = PANEL;
        ctx.beginPath();
        ctx.roundRect(x, cy, BW, c.ch, 24 * u);
        ctx.fill();
        // favicon + site
        let yy = cy + pad * 0.85;
        const fr = 23 * u;
        const hue = [...c.site].reduce((s, ch) => s + ch.charCodeAt(0) * 31, 0) % 360;
        ctx.fillStyle = i === 0 ? p.accent : dark ? `hsl(${hue} 18% 30%)` : `hsl(${hue} 30% 92%)`;
        ctx.beginPath();
        ctx.arc(x + pad + fr, yy + fr, fr, 0, TAU);
        ctx.fill();
        ctx.fillStyle = i === 0 ? '#ffffff' : dark ? '#e8eaee' : `hsl(${hue} 35% 35%)`;
        ctx.font = `700 ${fr * 0.95}px ${F}`;
        ctx.textAlign = 'center';
        ctx.fillText((c.site.replace(/^www\./, '')[0] || '•').toUpperCase(), x + pad + fr, yy + fr + 1 * u);
        ctx.textAlign = 'left';
        const site = c.site.split('›')[0].trim();
        ctx.font = `600 ${siteS}px ${F}`;
        ctx.fillStyle = INK;
        ctx.fillText(ellipsize(ctx, site.split('.')[0] || site, innerW - fr * 3), x + pad + fr * 2 + 14 * u, yy + fr * 0.3);
        ctx.font = `400 ${siteS * 0.95}px ${F}`;
        ctx.fillStyle = MUTED;
        ctx.fillText(ellipsize(ctx, `https://${c.site}`, innerW - fr * 3), x + pad + fr * 2 + 14 * u, yy + fr * 1.7);
        yy += 46 * u + 12 * u;
        // título
        ctx.font = `600 ${titleS}px ${F}`;
        ctx.fillStyle = dark ? mixHex(p.accent, '#ffffff', 0.35) : p.accent;
        ctx.textBaseline = 'top';
        ctx.fillText(ellipsize(ctx, c.title, innerW), x + pad, yy);
        yy += titleS * 1.25 + 10 * u;
        ctx.font = `400 ${descS}px ${F}`;
        ctx.fillStyle = MUTED;
        c.lines.forEach((l, li) => ctx.fillText(l, x + pad, yy + li * descLH + (descLH - descS) / 2));
        ctx.textBaseline = 'middle';
        ctx.restore();
        cy += c.ch + cardGap;
      });
      ctx.restore();
    }

    // ---------- barra ----------
    const bw = lerp(BH, BW, clamp(inK, 0, 1.05));
    const barX = w / 2 - bw / 2;
    const focus = clamp(seg(t, T_TYPE - 0.4, T_TYPE)) * (1 - 0.5 * moveK);
    const dropHH = dropH * dropOpen;
    // sombra
    for (const [e, sa] of [[30, 0.06], [12, 0.08], [4, 0.08]]) {
      ctx.fillStyle = `rgba(0,0,0,${sa * (dark ? 2 : 1.5)})`;
      ctx.beginPath();
      ctx.roundRect(barX - e * u * 0.4, by + e * u * 0.6, bw + e * u * 0.8, BH + dropHH, Math.min(BH / 2, 30 * u + e * u * 0.4));
      ctx.fill();
    }
    // anel de foco (accent)
    if (focus > 0.01) {
      ctx.strokeStyle = rgba(p.accent, 0.35 * focus);
      ctx.lineWidth = 7 * u;
      ctx.beginPath();
      ctx.roundRect(barX - 4 * u, by - 4 * u, bw + 8 * u, BH + dropHH + 8 * u, dropHH > 1 ? [BH / 2 + 4 * u, BH / 2 + 4 * u, 34 * u, 34 * u] : BH / 2 + 4 * u);
      ctx.stroke();
    }
    ctx.fillStyle = PANEL;
    ctx.beginPath();
    ctx.roundRect(barX, by, bw, BH + dropHH, dropHH > 1 ? [BH / 2, BH / 2, 30 * u, 30 * u] : BH / 2);
    ctx.fill();

    // sugestões
    if (dropHH > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(barX, by + BH, bw, dropHH);
      ctx.clip();
      ctx.fillStyle = LINE;
      ctx.fillRect(barX + 30 * u, by + BH, bw - 60 * u, Math.max(1, 1.5 * u));
      const top = by + BH + dropPad;
      // destaque da seleção desliza da linha 0 até a escolhida
      if (selK > 0 && pick >= 0) {
        const hy = top + lerp(Math.max(0, pick - 1), pick, selK) * rowH;
        ctx.fillStyle = HOVER;
        ctx.globalAlpha *= clamp(selK * 3);
        ctx.beginPath();
        ctx.roundRect(barX + 12 * u, hy + 4 * u, bw - 24 * u, rowH - 8 * u, 16 * u);
        ctx.fill();
        ctx.globalAlpha = clamp(seg(t, T_IN, T_IN + 0.3)) * (1 - outK);
      }
      const base = ctx.globalAlpha;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      sugs.forEach((s, i) => {
        const a = (keyT[Math.min(2, keyT.length - 1)] ?? T_TYPE) + 0.05 + i * 0.06;
        const k = ease.outCubic(seg(t, a, a + 0.4));
        const yy = top + i * rowH + rowH / 2 + (1 - k) * 12 * u;
        ctx.globalAlpha = base * k;
        lens(ctx, barX + 52 * u, yy, 26 * u, MUTED, 2.6 * u);
        // parte digitada em peso normal, o complemento em negrito
        const tx = barX + 92 * u;
        const maxW = bw - 92 * u - 40 * u;
        const lower = s.toLowerCase();
        const n = lower.startsWith(typed.toLowerCase()) ? typed.length : 0;
        ctx.font = `400 ${30 * u}px ${F}`;
        ctx.fillStyle = INK;
        const head = s.slice(0, n);
        ctx.fillText(head, tx, yy);
        const hw = ctx.measureText(head).width;
        ctx.font = `650 ${30 * u}px ${F}`;
        ctx.fillText(ellipsize(ctx, s.slice(n), maxW - hw), tx + hw, yy);
      });
      ctx.globalAlpha = base;
      ctx.restore();
    }

    // conteúdo da barra (só quando aberta o bastante)
    const open = clamp((bw - BH) / (BW - BH));
    const iconX = barX + BH / 2;
    const pulse = Math.sin(Math.PI * seg(t, T_ENTER - 0.05, T_ENTER + 0.3));
    lens(ctx, iconX + 2 * u, by + BH / 2, 34 * u * (1 + 0.18 * pulse), focus > 0.5 || entered ? p.accent : MUTED, 3.4 * u);
    if (open > 0.05) {
      ctx.save();
      ctx.globalAlpha *= clamp(open * 1.5 - 0.3);
      ctx.beginPath();
      ctx.rect(barX + BH * 0.85, by, bw - BH * 0.85 - 30 * u, BH);
      ctx.clip();
      const tx = barX + BH * 0.95;
      const ty = by + BH / 2 + 1 * u;
      ctx.font = `450 ${34 * u}px ${F}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const swapK = ease.inOutCubic(seg(t, T_SEL + 0.05, T_SEL + 0.3));
      let shown = typed;
      if (swapK > 0.5 && pick >= 0) shown = chosen;
      if (!typed) {
        ctx.fillStyle = MUTED;
        ctx.fillText('Search', tx, ty);
      } else {
        ctx.fillStyle = INK;
        ctx.fillText(shown, tx, ty);
      }
      // cursor
      const caretX = tx + (typed ? ctx.measureText(shown).width + 3 * u : 0);
      const typingNow = t > T_TYPE && !doneTyping;
      if (t > T_TYPE - 0.4 && !entered && (typingNow || Math.floor(t * 2) % 2 === 0)) {
        ctx.fillStyle = p.accent;
        ctx.fillRect(caretX, by + BH * 0.3, 3 * u, BH * 0.4);
      }
      ctx.restore();
      // lado direito: atalho ⌘K → spinner de carregamento → limpar ×
      const rx = barX + bw - BH / 2 - 6 * u;
      const ry = by + BH / 2;
      ctx.save();
      ctx.globalAlpha *= clamp(open * 2 - 1);
      if (!typed) {
        ctx.font = `600 ${20 * u}px ${F}`;
        const label = '⌘ K';
        const kw = ctx.measureText(label).width + 24 * u;
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 2 * u;
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
        ctx.beginPath();
        ctx.roundRect(rx + 20 * u - kw, ry - 19 * u, kw, 38 * u, 10 * u);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'center';
        ctx.fillText(label, rx + 20 * u - kw / 2, ry + 1 * u);
      } else if (entered && t < T_RES + 0.1) {
        const a0 = (t - T_ENTER) * 9;
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 4 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(rx, ry, 16 * u, a0, a0 + 4.2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = MUTED;
        ctx.lineWidth = 3 * u;
        ctx.lineCap = 'round';
        const s = 10 * u;
        ctx.beginPath();
        ctx.moveTo(rx - s, ry - s);
        ctx.lineTo(rx + s, ry + s);
        ctx.moveTo(rx + s, ry - s);
        ctx.lineTo(rx - s, ry + s);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  },
};
