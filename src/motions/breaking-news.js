import { TAU, clamp, seg, ease, rgba, rng } from '../lib/anim.js';

// Pacote de plantão jornalístico (genérico): vinheta com faixas inclinadas e "URGENTE" em tela
// cheia, depois tarja com selo, manchete (que troca no meio) e ticker de últimas notícias.
// Fundo transparente por padrão (exporte com --alpha).

const F = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
let MC = null;
const measure = () => (MC ||= document.createElement('canvas').getContext('2d'));

function wrap(ctx, text, maxW, max = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
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
  if (lines.length > max) {
    const keep = lines.slice(0, max);
    let last = `${keep[max - 1]} ${lines.slice(max).join(' ')}`;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    keep[max - 1] = `${last.trimEnd()}…`;
    return keep;
  }
  return lines;
}

const T_SWAP = 5.0; // troca de manchete

export default {
  id: 'breaking-news',
  title: 'Breaking News',
  description: 'Breaking news package: a full-screen sting with stripes and "BREAKING", a lower third with rotating headlines and a running ticker.',
  category: 'dados',
  tags: ['overlay', 'alpha', 'broadcast', 'typography'],
  duration: 9,
  poster: 3.4,

  params: {
    tag: { type: 'text', label: 'Tag', default: 'BREAKING' },
    headline: { type: 'text', label: 'Headline', default: 'Heavy rain floods avenues and shuts down three subway lines downtown' },
    headline2: { type: 'text', label: 'Second headline (optional)', default: 'Emergency services issue alert and urge residents to avoid risk areas' },
    place: { type: 'text', label: 'Place · time', default: 'LIVE · SÃO PAULO · 18:42' },
    ticker: {
      type: 'textarea',
      label: 'Ticker (one per line)',
      rows: 4,
      default: 'Airport running with delays of up to 40 minutes\nStocks close up 1.2%\nCity extends night bus hours\nForecast calls for clear skies from Friday',
    },
    accent: { type: 'color', label: 'Accent', default: '#e3122d' },
    dark: { type: 'color', label: 'Dark', default: '#101218' },
    panel: { type: 'color', label: 'Lower third', default: '#ffffff' },
    sting: { type: 'boolean', label: 'Opening sting', default: true },
    transparent: { type: 'boolean', label: 'Transparent background', default: true },
  },

  setup({ w, h, p, px }) {
    const m = Math.min(w, h);
    const portrait = h > w * 1.3;
    const u = (m / 1080) * (portrait ? 1.15 : 1);
    const pad = Math.max(w * 0.045, 40 * u);
    const bandW = w - pad * 2;
    const hs = (portrait ? 54 : 56) * u;
    const textX = 44 * u;
    const mc = measure();
    mc.font = F(800, hs);
    mc.letterSpacing = `${-hs * 0.015}px`;
    const maxW = bandW - textX - 40 * u;
    const maxL = portrait ? 4 : h > w * 0.9 ? 3 : 2;
    const lines1 = wrap(mc, p.headline, maxW, maxL);
    const lines2 = p.headline2 ? wrap(mc, p.headline2, maxW, maxL) : null;
    const nLines = Math.max(lines1.length, lines2 ? lines2.length : 0, 1);
    const lh = hs * 1.14;
    const panelH = nLines * lh + 46 * u;

    const tickH = 66 * u;
    const tickY = h - tickH - (portrait ? h * 0.09 : h > w * 0.9 ? 40 * u : 0);
    const panelY = tickY - (portrait ? 36 : 30) * u - panelH;
    const tagH = 58 * u;
    const tagY = panelY - tagH;

    const items = String(p.ticker || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    mc.letterSpacing = '0px';
    mc.font = F(600, 27 * u);
    const sep = 64 * u;
    const itemW = items.map((s) => mc.measureText(s).width);
    const loopW = itemW.reduce((a, b) => a + b + sep, 0);

    let scene = null;
    if (!p.transparent) {
      scene = document.createElement('canvas');
      scene.width = Math.max(1, Math.round(w * px));
      scene.height = Math.max(1, Math.round(h * px));
      const g = scene.getContext('2d');
      g.scale(px, px);
      const lg = g.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, '#2a3a52');
      lg.addColorStop(1, '#0e1420');
      g.fillStyle = lg;
      g.fillRect(0, 0, w, h);
      // "estúdio": luzes desfocadas
      const r = rng(11);
      for (let i = 0; i < 9; i++) {
        const x = r() * w;
        const y = r() * h * 0.6;
        const rad = m * (0.08 + r() * 0.2);
        const rg = g.createRadialGradient(x, y, 0, x, y, rad);
        const c = i % 3 ? '#8fb0d8' : '#d8b48f';
        rg.addColorStop(0, rgba(c, 0.32));
        rg.addColorStop(1, rgba(c, 0));
        g.fillStyle = rg;
        g.fillRect(0, 0, w, h);
      }
    }

    return { u, pad, bandW, hs, lh, textX, lines1, lines2, panelH, panelY, tagH, tagY, tickH, tickY, items, itemW, loopW, sep, scene, portrait };
  },

  render(ctx, t, { w, h, p, duration, state: S }) {
    const { u, pad, bandW, hs, lh, textX, panelH, panelY, tagH, tagY, tickH, tickY } = S;
    if (!p.transparent && S.scene) ctx.drawImage(S.scene, 0, 0, w, h);
    const m = Math.min(w, h);
    const T0 = p.sting ? 1.25 : 0.1; // começo da tarja

    // ================= vinheta =================
    if (p.sting && t < 1.7) {
      const slant = Math.max(w, h) * 0.18;
      const band = (c, d) => {
        // borda da frente varre a tela; depois a de trás, revelando
        const R = -slant + (w + slant * 2) * ease.outExpo(seg(t, 0.05 + d, 0.6 + d));
        const L = -slant + (w + slant * 2) * ease.inOutExpo(seg(t, 0.95 + d * 0.6, 1.5 + d * 0.6));
        if (R <= L) return null;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(L + slant, 0);
        ctx.lineTo(R + slant, 0);
        ctx.lineTo(R - slant, h);
        ctx.lineTo(L - slant, h);
        ctx.closePath();
        ctx.fill();
        return [L, R];
      };
      band(p.panel, 0);
      band(p.dark, 0.06);
      const box = band(p.accent, 0.12);
      if (box) {
        ctx.save();
        ctx.beginPath();
        const [L, R] = box;
        ctx.moveTo(L + slant, 0);
        ctx.lineTo(R + slant, 0);
        ctx.lineTo(R - slant, h);
        ctx.lineTo(L - slant, h);
        ctx.clip();
        const tIn = ease.outExpo(seg(t, 0.4, 1.1));
        const fs = Math.min(w * 0.17, m * 0.24);
        ctx.font = F(900, fs);
        ctx.letterSpacing = `${fs * (0.12 - 0.12 * tIn)}px`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = clamp(tIn * 1.5);
        const txt = (p.tag || 'BREAKING').toUpperCase();
        const tw = ctx.measureText(txt).width;
        // letterSpacing com center desloca meio espaçamento: compensa
        ctx.fillText(txt, w / 2 + (fs * (0.12 - 0.12 * tIn)) / 2, h / 2 + fs * 0.04);
        ctx.letterSpacing = '0px';
        // linhas finas acima/abaixo
        const lw = tw * ease.outExpo(seg(t, 0.55, 1.15));
        ctx.fillRect(w / 2 - lw / 2, h / 2 - fs * 0.72, lw, Math.max(2, fs * 0.035));
        ctx.fillRect(w / 2 - lw / 2, h / 2 + fs * 0.68, lw, Math.max(2, fs * 0.035));
        ctx.font = F(700, fs * 0.16);
        ctx.letterSpacing = `${fs * 0.16 * 0.4}px`;
        ctx.globalAlpha = clamp(seg(t, 0.6, 0.9));
        ctx.fillText('NEWS ALERT', w / 2 + fs * 0.16 * 0.2, h / 2 - fs * 0.94);
        ctx.letterSpacing = '0px';
        ctx.restore();
      }
    }

    // ================= saída =================
    const ex = (d) => ease.inExpo(seg(t, duration - 0.95 + d, duration - 0.35 + d));

    // ================= ticker =================
    const tkIn = ease.outExpo(seg(t, T0 - 0.05, T0 + 0.6));
    const tkOut = ex(0.2);
    if (tkIn > 0.001 && tkOut < 0.999) {
      const y = tickY + (1 - tkIn) * (tickH + 20 * u) + tkOut * (tickH + h);
      ctx.save();
      ctx.fillStyle = p.dark;
      ctx.fillRect(0, y, w, tickH);
      ctx.fillStyle = p.accent;
      ctx.fillRect(0, y, w, 3 * u);
      // rótulo
      ctx.font = F(800, 22 * u);
      ctx.letterSpacing = `${22 * u * 0.14}px`;
      const lab = 'LATEST';
      const labW = ctx.measureText(lab).width + 56 * u;
      const lx = S.portrait ? 0 : pad - 28 * u;
      // texto correndo (clip à direita do rótulo)
      if (S.items.length && S.loopW > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(lx + labW, y, w - lx - labW, tickH);
        ctx.clip();
        ctx.letterSpacing = '0px';
        ctx.font = F(600, 27 * u);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const speed = 170 * u;
        const off = ((t - T0) * speed) % S.loopW;
        let x = lx + labW + 30 * u - off - S.loopW;
        const cy = y + tickH / 2 + 2 * u;
        while (x < w) {
          for (let i = 0; i < S.items.length; i++) {
            if (x + S.itemW[i] > 0 && x < w) {
              ctx.fillStyle = '#ffffff';
              ctx.fillText(S.items[i], x, cy);
            }
            x += S.itemW[i];
            ctx.fillStyle = p.accent;
            const sq = 9 * u;
            ctx.fillRect(x + S.sep / 2 - sq / 2, cy - sq / 2 - u, sq, sq);
            x += S.sep;
          }
        }
        ctx.restore();
      }
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(lx + labW + 14 * u, y);
      ctx.lineTo(lx + labW - 6 * u, y + tickH);
      ctx.lineTo(lx, y + tickH);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.font = F(800, 22 * u);
      ctx.letterSpacing = `${22 * u * 0.14}px`;
      ctx.fillText(lab, lx + 24 * u, y + tickH / 2 + 1.5 * u);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }

    // ================= tarja da manchete =================
    const pIn = ease.outExpo(seg(t, T0 + 0.2, T0 + 1.0));
    const pOut = ex(0.05);
    const a = bandW * pOut;
    const b = bandW * pIn;
    if (b > a + 0.5) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad + a, panelY, b - a, panelH);
      ctx.clip();
      ctx.fillStyle = p.panel;
      ctx.fillRect(pad, panelY, bandW, panelH);
      // faixa de destaque à esquerda
      ctx.fillStyle = p.accent;
      ctx.fillRect(pad, panelY, 12 * u, panelH);
      // brilho correndo uma vez
      const sh = seg(t, T0 + 0.5, T0 + 1.4);
      if (sh > 0 && sh < 1) {
        const sx = pad + sh * (bandW + 400 * u) - 200 * u;
        const g = ctx.createLinearGradient(sx - 160 * u, 0, sx + 160 * u, 0);
        g.addColorStop(0, rgba(p.accent, 0));
        g.addColorStop(0.5, rgba(p.accent, 0.12));
        g.addColorStop(1, rgba(p.accent, 0));
        ctx.fillStyle = g;
        ctx.fillRect(pad, panelY, bandW, panelH);
      }
      // manchete: linhas sobem com máscara; troca no meio empurrando para cima
      ctx.beginPath();
      ctx.rect(pad, panelY + 6 * u, bandW, panelH - 12 * u);
      ctx.clip();
      ctx.font = F(800, hs);
      ctx.letterSpacing = `${-hs * 0.015}px`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = p.dark;
      const top = panelY + 23 * u;
      const drawLines = (lines, t0, outT) => {
        lines.forEach((ln, i) => {
          const k = ease.outExpo(seg(t, t0 + i * 0.09, t0 + 0.8 + i * 0.09));
          const o = outT == null ? 0 : ease.inCubic(seg(t, outT + i * 0.05, outT + 0.35 + i * 0.05));
          if (k <= 0 || o >= 1) return;
          const y = top + i * lh + hs * 0.86 + (1 - k) * lh * 1.1 - o * panelH;
          ctx.fillText(ln, pad + textX, y);
        });
      };
      const swap = S.lines2 ? T_SWAP : null;
      drawLines(S.lines1, T0 + 0.45, swap);
      if (S.lines2) drawLines(S.lines2, T_SWAP + 0.3, null);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }

    // ================= selo + local =================
    const tagIn = ease.outExpo(seg(t, T0 + 0.05, T0 + 0.7));
    const tagOut = ex(0);
    if (tagIn > 0.001 && tagOut < 0.999) {
      ctx.save();
      ctx.font = F(900, 28 * u);
      ctx.letterSpacing = `${28 * u * 0.1}px`;
      const tag = (p.tag || 'BREAKING').toUpperCase();
      const tw = ctx.measureText(tag).width + 76 * u;
      const x0 = pad;
      ctx.beginPath();
      ctx.rect(x0 + tw * tagOut, tagY, Math.max(0, tw * tagIn - tw * tagOut), tagH);
      ctx.clip();
      // pisca de luz no selo (dois flashes rápidos ao entrar, depois respira)
      const flash = Math.max(0, Math.sin(Math.PI * seg(t, T0 + 0.75, T0 + 0.95)), Math.sin(Math.PI * seg(t, T0 + 1.05, T0 + 1.25)));
      ctx.fillStyle = p.accent;
      ctx.fillRect(x0, tagY, tw, tagH);
      if (flash > 0) {
        ctx.fillStyle = rgba('#ffffff', 0.35 * flash);
        ctx.fillRect(x0, tagY, tw, tagH);
      }
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const dot = 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(TAU * (t - T0)));
      ctx.globalAlpha = dot;
      ctx.beginPath();
      ctx.arc(x0 + 26 * u, tagY + tagH / 2, 7 * u, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillText(tag, x0 + 46 * u, tagY + tagH / 2 + 2 * u);
      ctx.restore();

      // local · hora (caixa escura ao lado)
      const plIn = ease.outExpo(seg(t, T0 + 0.35, T0 + 1.0));
      if (p.place && plIn > 0.001) {
        ctx.save();
        ctx.font = F(650, 21 * u);
        ctx.letterSpacing = `${21 * u * 0.1}px`;
        const pw = Math.min(ctx.measureText(p.place).width + 48 * u, bandW - tw);
        const px0 = x0 + tw;
        const ph = tagH * 0.78;
        const py = tagY + tagH - ph;
        ctx.beginPath();
        ctx.rect(px0 + pw * tagOut, py, Math.max(0, pw * plIn - pw * tagOut), ph);
        ctx.clip();
        ctx.fillStyle = p.dark;
        ctx.fillRect(px0, py, pw, ph);
        ctx.fillStyle = rgba('#ffffff', 0.92);
        ctx.textBaseline = 'middle';
        ctx.fillText(p.place, px0 + 24 * u - (1 - plIn) * 20 * u, py + ph / 2 + 1.5 * u);
        ctx.restore();
      }
    }
  },
};
