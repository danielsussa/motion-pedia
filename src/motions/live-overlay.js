import { TAU, clamp, seg, ease, spring, rgba, rng, smoothstep } from '../lib/anim.js';

// Overlay de transmissão ao vivo (genérico): selo AO VIVO com espectadores e tempo no ar,
// chat lateral rolando, alertas de novo inscrito e de doação, e barra de meta.
// Fundo transparente por padrão (exporte com --alpha); sem ele, pinta uma cena de prévia.

const F = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (wt, s) => `${wt} ${s}px "JetBrains Mono", ui-monospace, monospace`;
let MC = null;
const measure = () => (MC ||= document.createElement('canvas').getContext('2d'));
const fmt = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NAME_COLORS = ['#8fb3ff', '#f5c46b', '#8fdcb8', '#c3a6ff', '#ff9f8c', '#7fd3e6'];

const CHAT = `marina.rx: boa noite chat!!
pedro_dev: chegueiii
julia.motion: esse efeito ficou insano
caio_b: como fez essa transição?
lu.design: salvando pra estudar depois
rafa: 🔥🔥🔥
bia_codes: manda o link do projeto
theo.m: primeira vez aqui, curti demais
nanda: easing perfeito
gui.ramos: dá pra exportar com alpha?
leo: GG
carol.ui: tutorial quando?`;

function parseChat(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    const i = l.indexOf(':');
    out.push(i > 0 ? { user: l.slice(0, i).trim(), msg: l.slice(i + 1).trim() } : { user: 'anônimo', msg: l });
    if (out.length === 16) break;
  }
  return out;
}

// quebra com recuo na primeira linha (o nome ocupa o começo)
function wrap(ctx, text, maxW, firstIndent) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  let lim = maxW - firstIndent;
  for (const wd of words) {
    const test = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(test).width <= lim || !cur) cur = test;
    else {
      lines.push(cur);
      cur = wd;
      lim = maxW;
    }
  }
  if (cur || !lines.length) lines.push(cur);
  return lines.slice(0, 3);
}

function geom(w, h, scale) {
  const m = Math.min(w, h);
  const portrait = h > w * 1.3;
  const u = (m / 1080) * scale * (portrait ? 1.22 : 1);
  const pad = 48 * u;
  const wide = w > h * 1.3;
  let chat;
  if (wide) chat = { x: w - pad - 470 * u, y: h * 0.3, w: 470 * u, h: h * 0.7 - pad };
  else if (portrait) chat = { x: pad, y: h * 0.56, w: w * 0.7, h: h * 0.44 - pad - 150 * u };
  else chat = { x: w - pad - 500 * u, y: h * 0.42, w: 500 * u, h: h * 0.58 - pad };
  const goal = portrait
    ? { x: pad, y: h - pad - 92 * u, w: w - pad * 2 }
    : { x: pad, y: h - pad - 92 * u, w: Math.min(540 * u, chat.x - pad * 2) };
  return { m, u, pad, portrait, wide, chat, goal };
}

// estrela de 5 pontas
function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function heartPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.85);
  ctx.bezierCurveTo(x - r * 1.25, y + r * 0.05, x - r * 0.75, y - r * 1.05, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.75, y - r * 1.05, x + r * 1.25, y + r * 0.05, x, y + r * 0.85);
  ctx.closePath();
}

const T_SUB = 1.7; // alerta de inscrito
const T_DON = 5.5; // alerta de doação
const ALERT_LEN = 3.1;

export default {
  id: 'live-overlay',
  title: 'Live Overlay',
  description: 'Overlay de live: selo ao vivo com espectadores, chat lateral rolando, alertas de inscrito e doação e barra de meta.',
  category: 'dados',
  tags: ['overlay', 'alpha', 'ui', 'broadcast'],
  duration: 10,
  poster: 6.6,

  params: {
    subName: { type: 'text', label: 'Novo inscrito', default: 'ana.dev' },
    donor: { type: 'text', label: 'Quem doou', default: 'lucas_m' },
    amount: { type: 'range', label: 'Valor da doação (R$)', min: 1, max: 500, step: 1, default: 25 },
    donMsg: { type: 'text', label: 'Mensagem da doação', default: 'Que motion lindo, continua!' },
    chat: { type: 'textarea', label: 'Chat (nome: mensagem)', rows: 6, default: CHAT },
    goal: { type: 'text', label: 'Meta', default: 'Meta de inscritos' },
    accent: { type: 'color', label: 'Destaque', default: '#ff4f5e' },
    viewers: { type: 'range', label: 'Espectadores', min: 0, max: 50000, step: 1, default: 1284 },
    scale: { type: 'range', label: 'Escala', min: 0.6, max: 1.4, step: 0.01, default: 1 },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: true },
  },

  setup({ w, h, p, px }) {
    const G = geom(w, h, p.scale);
    const { u } = G;
    const mc = measure();
    const fs = 24 * u;
    const lh = fs * 1.38;
    const innerW = G.chat.w - 44 * u;
    const msgs = parseChat(p.chat).map((c, i) => {
      mc.font = F(700, fs);
      const nameW = mc.measureText(c.user).width + 10 * u;
      mc.font = F(500, fs);
      const lines = wrap(mc, c.msg, innerW, nameW);
      return { ...c, nameW, lines, color: NAME_COLORS[(c.user.length * 7 + i * 3) % NAME_COLORS.length], h: lines.length * lh + 14 * u };
    });
    // mensagem de sistema quando chega a doação
    mc.font = F(600, fs);
    const sysText = `${p.donor} doou R$ ${brl.format(p.amount)}`;

    let scene = null;
    if (!p.transparent) {
      scene = document.createElement('canvas');
      scene.width = Math.max(1, Math.round(w * px));
      scene.height = Math.max(1, Math.round(h * px));
      const g = scene.getContext('2d');
      g.scale(px, px);
      const lg = g.createLinearGradient(0, 0, w * 0.4, h);
      lg.addColorStop(0, '#26324a');
      lg.addColorStop(1, '#0c0f16');
      g.fillStyle = lg;
      g.fillRect(0, 0, w, h);
      const r = rng(7);
      const blobs = ['#3d5a8a', '#7a3f5c', '#2f6b6b', '#4a3f7a'];
      for (let i = 0; i < 7; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = G.m * (0.2 + r() * 0.35);
        const c = blobs[i % blobs.length];
        const rg = g.createRadialGradient(x, y, 0, x, y, rad);
        rg.addColorStop(0, rgba(c, 0.55));
        rg.addColorStop(1, rgba(c, 0));
        g.fillStyle = rg;
        g.fillRect(0, 0, w, h);
      }
      const vg = g.createRadialGradient(w / 2, h / 2, G.m * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
    }
    return { G, msgs, fs, lh, sysText, scene };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { G, msgs, fs, lh, sysText, scene } = state;
    const { u, pad, chat, goal } = G;
    if (!p.transparent && scene) ctx.drawImage(scene, 0, 0, w, h);

    const ink = '#f5f3ef';
    const panel = 'rgba(14,15,20,0.72)';
    const exitK = (d) => ease.inCubic(seg(t, duration - 0.75 + d, duration - 0.2 + d * 0.5));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // ---------------- selo AO VIVO + espectadores + tempo ----------------
    {
      const inK = ease.outExpo(seg(t, 0.05, 0.9));
      const out = exitK(0.1);
      const y = pad + (1 - inK) * -90 * u - out * 90 * u;
      const ph = 50 * u;
      ctx.save();
      ctx.globalAlpha = clamp(inK * 1.5) * (1 - out);
      // pílula AO VIVO
      ctx.font = F(800, 21 * u);
      ctx.letterSpacing = `${21 * u * 0.12}px`;
      const lw = ctx.measureText('AO VIVO').width;
      const w1 = lw + 66 * u;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.roundRect(pad, y, w1, ph, 10 * u);
      ctx.fill();
      const blink = 0.55 + 0.45 * Math.cos(TAU * t * 1);
      ctx.fillStyle = rgba('#ffffff', blink);
      ctx.beginPath();
      ctx.arc(pad + 26 * u, y + ph / 2, 7 * u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText('AO VIVO', pad + 44 * u, y + ph / 2 + u);
      ctx.letterSpacing = '0px';
      // espectadores
      const vNow = Math.round(p.viewers + Math.floor(t * 2.3) + (t > T_SUB ? 3 : 0));
      ctx.font = F(700, 22 * u);
      const vTxt = fmt.format(vNow);
      const vw = ctx.measureText(vTxt).width;
      const x2 = pad + w1 + 10 * u;
      const w2 = vw + 76 * u;
      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.roundRect(x2, y, w2, ph, 10 * u);
      ctx.fill();
      // olho
      const ex = x2 + 28 * u;
      const ey = y + ph / 2;
      ctx.strokeStyle = rgba(ink, 0.8);
      ctx.lineWidth = 2.4 * u;
      ctx.beginPath();
      ctx.moveTo(ex - 12 * u, ey);
      ctx.quadraticCurveTo(ex, ey - 11 * u, ex + 12 * u, ey);
      ctx.quadraticCurveTo(ex, ey + 11 * u, ex - 12 * u, ey);
      ctx.stroke();
      ctx.fillStyle = rgba(ink, 0.8);
      ctx.beginPath();
      ctx.arc(ex, ey, 3.6 * u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.fillText(vTxt, x2 + 52 * u, ey + u);
      // tempo no ar
      const sec = 5077 + Math.floor(t);
      const tt = [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((v) => String(v).padStart(2, '0')).join(':');
      ctx.font = MONO(500, 21 * u);
      const tw = ctx.measureText(tt).width;
      const x3 = x2 + w2 + 10 * u;
      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.roundRect(x3, y, tw + 40 * u, ph, 10 * u);
      ctx.fill();
      ctx.fillStyle = rgba(ink, 0.75);
      ctx.fillText(tt, x3 + 20 * u, ey + u);
      ctx.restore();
    }

    // ---------------- chat ----------------
    {
      const inK = ease.outExpo(seg(t, 0.25, 1.15));
      const out = exitK(0);
      const dx = (1 - inK) * (G.portrait ? -1 : 1) * (chat.w + pad) + out * (G.portrait ? -1 : 1) * (chat.w + pad);
      ctx.save();
      ctx.translate(dx, 0);
      ctx.globalAlpha = 1 - out * 0.3;
      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.roundRect(chat.x, chat.y, chat.w, chat.h, 18 * u);
      ctx.fill();
      ctx.strokeStyle = rgba(ink, 0.08);
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      // cabeçalho
      const hh = 62 * u;
      ctx.font = F(700, 17 * u);
      ctx.letterSpacing = `${17 * u * 0.14}px`;
      ctx.fillStyle = rgba(ink, 0.6);
      ctx.fillText('CHAT AO VIVO', chat.x + 22 * u, chat.y + hh / 2 + u);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(chat.x + chat.w - 28 * u, chat.y + hh / 2, 5 * u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(ink, 0.08);
      ctx.fillRect(chat.x + 22 * u, chat.y + hh, chat.w - 44 * u, Math.max(1, 1.5 * u));

      // lista: cada mensagem nova entra embaixo e empurra as outras (altura com easing)
      const top = chat.y + hh + 8 * u;
      const gapT = (8.4 - 1.5) / Math.max(1, msgs.length - 4);
      const items = msgs.map((m, i) => ({ ...m, ti: i < 4 ? 0.55 + i * 0.14 : 1.5 + (i - 4) * gapT }));
      const sysAt = T_DON + 0.5;
      items.push({ sys: true, ti: sysAt, h: lh + 26 * u });
      items.sort((a, b) => a.ti - b.ti);
      let y = chat.y + chat.h - 14 * u;
      ctx.save();
      ctx.beginPath();
      ctx.rect(chat.x, top, chat.w, chat.y + chat.h - top);
      ctx.clip();
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const e = ease.outExpo(seg(t, it.ti, it.ti + 0.55));
        if (e <= 0) continue;
        y -= it.h * e;
        if (y + it.h < top) break;
        const fade = smoothstep(top - 10 * u, top + 70 * u, y) * clamp(e * 1.6);
        if (fade <= 0.01) continue;
        ctx.globalAlpha = fade;
        const x = chat.x + 22 * u + (1 - e) * 24 * u;
        const ly = y + lh / 2 + 4 * u;
        if (it.sys) {
          ctx.fillStyle = rgba(p.accent, 0.18);
          ctx.beginPath();
          ctx.roundRect(chat.x + 12 * u, y + 2 * u, chat.w - 24 * u, it.h - 8 * u, 10 * u);
          ctx.fill();
          ctx.fillStyle = p.accent;
          ctx.fillRect(chat.x + 12 * u, y + 2 * u, 4 * u, it.h - 8 * u);
          heartPath(ctx, x + 10 * u, y + it.h / 2 - 2 * u, 10 * u);
          ctx.fill();
          ctx.font = F(650, fs);
          ctx.fillStyle = ink;
          ctx.fillText(sysText, x + 32 * u, y + it.h / 2 - 2 * u);
          continue;
        }
        ctx.font = F(700, fs);
        ctx.fillStyle = it.color;
        ctx.fillText(it.user, x, ly);
        ctx.font = F(500, fs);
        ctx.fillStyle = rgba(ink, 0.9);
        it.lines.forEach((ln, j) => ctx.fillText(ln, x + (j ? 0 : it.nameW), ly + j * lh));
      }
      ctx.restore();
      ctx.restore();
    }

    // ---------------- barra de meta ----------------
    {
      const inK = ease.outExpo(seg(t, 0.4, 1.3));
      const out = exitK(0.05);
      const target = 1000;
      const bump = ease.outExpo(seg(t, T_SUB + 0.4, T_SUB + 1.4));
      const cur = 842 + (t > T_SUB + 0.4 ? 1 : 0);
      const frac = (842 + bump) / target;
      const flash = Math.sin(Math.PI * seg(t, T_SUB + 0.4, T_SUB + 1.2));
      ctx.save();
      ctx.globalAlpha = clamp(inK * 1.4) * (1 - out);
      ctx.translate(0, (1 - inK) * 60 * u + out * 60 * u);
      const gh = 92 * u;
      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.roundRect(goal.x, goal.y, goal.w, gh, 16 * u);
      ctx.fill();
      ctx.font = F(650, 20 * u);
      ctx.fillStyle = rgba(ink, 0.85);
      ctx.fillText(p.goal, goal.x + 22 * u, goal.y + 30 * u);
      ctx.textAlign = 'right';
      ctx.font = F(700, 20 * u);
      ctx.fillStyle = flash > 0 ? p.accent : ink;
      const nTxt = fmt.format(cur);
      const tTxt = ` / ${fmt.format(target)}`;
      ctx.fillStyle = rgba(ink, 0.5);
      ctx.fillText(tTxt, goal.x + goal.w - 22 * u, goal.y + 30 * u);
      const ttw = ctx.measureText(tTxt).width;
      ctx.fillStyle = flash > 0.05 ? p.accent : ink;
      ctx.fillText(nTxt, goal.x + goal.w - 22 * u - ttw, goal.y + 30 * u - flash * 4 * u);
      ctx.textAlign = 'left';
      const bx = goal.x + 22 * u;
      const by = goal.y + 54 * u;
      const bw = goal.w - 44 * u;
      const bh = 16 * u;
      ctx.fillStyle = rgba(ink, 0.12);
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, bh / 2);
      ctx.fill();
      const fill = bw * frac * ease.outExpo(seg(t, 0.6, 1.8));
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.roundRect(bx, by, Math.max(bh, fill), bh, bh / 2);
      ctx.fill();
      if (flash > 0) {
        ctx.fillStyle = rgba('#ffffff', 0.45 * flash);
        ctx.beginPath();
        ctx.arc(bx + fill - bh / 2, by + bh / 2, bh * (0.5 + 0.9 * flash), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // ---------------- alertas ----------------
    const alert = (t0, kind) => {
      const lt = t - t0;
      if (lt < 0 || lt > ALERT_LEN) return;
      const inK = spring(seg(lt, 0, 0.7), 0.35);
      const outK = ease.inBack(seg(lt, ALERT_LEN - 0.45, ALERT_LEN));
      const s = (0.7 + 0.3 * inK) * (1 - 0.25 * outK);
      const op = clamp(seg(lt, 0, 0.18)) * (1 - clamp(outK * 1.2));
      if (op <= 0.001) return;
      const label = kind === 'sub' ? 'NOVO INSCRITO' : 'DOAÇÃO';
      const amtNow = p.amount * ease.outExpo(seg(lt, 0.3, 1.4));
      const main = kind === 'sub' ? p.subName : `R$ ${brl.format(amtNow)}`;
      const mainFull = kind === 'sub' ? p.subName : `R$ ${brl.format(p.amount)}`;
      const sub = kind === 'sub' ? 'acabou de se inscrever!' : `${p.donor}: “${p.donMsg}”`;
      const ms = 46 * u;
      ctx.font = F(800, ms);
      const mw = ctx.measureText(mainFull).width;
      ctx.font = F(500, 22 * u);
      let subTxt = sub;
      const maxSub = Math.min(w - pad * 2, 820 * u) - 160 * u;
      if (ctx.measureText(subTxt).width > maxSub) {
        while (subTxt.length > 2 && ctx.measureText(`${subTxt}…`).width > maxSub) subTxt = subTxt.slice(0, -1);
        subTxt += '…';
      }
      const sw = ctx.measureText(subTxt).width;
      const icon = 92 * u;
      const cw = Math.min(w - pad * 2, Math.max(mw, sw, 260 * u) + icon + 90 * u);
      const ch = 150 * u;
      const cx = w / 2;
      const cy = G.portrait ? h * 0.24 : G.wide ? h * 0.2 : h * 0.24;
      ctx.save();
      ctx.globalAlpha = op;
      ctx.translate(cx, cy + (1 - inK) * -40 * u + outK * -30 * u);
      ctx.scale(s, s);
      ctx.translate(-cw / 2, -ch / 2);
      // sombra em camadas
      for (let i = 3; i >= 1; i--) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.roundRect(-i * 6 * u, -i * 3 * u + 14 * u, cw + i * 12 * u, ch + i * 10 * u, 24 * u + i * 6 * u);
        ctx.fill();
      }
      ctx.fillStyle = '#121318';
      ctx.beginPath();
      ctx.roundRect(0, 0, cw, ch, 24 * u);
      ctx.fill();
      ctx.save();
      ctx.clip();
      // brilho de entrada passando
      const sweep = seg(lt, 0.15, 0.95);
      if (sweep > 0 && sweep < 1) {
        const sx = -cw * 0.3 + sweep * cw * 1.6;
        const sg = ctx.createLinearGradient(sx - 120 * u, 0, sx + 120 * u, 0);
        sg.addColorStop(0, rgba('#ffffff', 0));
        sg.addColorStop(0.5, rgba('#ffffff', 0.07));
        sg.addColorStop(1, rgba('#ffffff', 0));
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, cw, ch);
      }
      // tempo restante
      const left = 1 - seg(lt, 0.7, ALERT_LEN - 0.4);
      ctx.fillStyle = rgba(p.accent, 0.9);
      ctx.fillRect(0, ch - 6 * u, cw * left, 6 * u);
      ctx.restore();
      ctx.strokeStyle = rgba('#ffffff', 0.08);
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.roundRect(0, 0, cw, ch, 24 * u);
      ctx.stroke();
      // ícone
      const ix = 34 * u + icon / 2;
      const iy = ch / 2 - 3 * u;
      const ip = spring(seg(lt, 0.15, 0.75), 0.5);
      const burst = seg(lt, 0.2, 0.8);
      if (burst > 0 && burst < 1) {
        ctx.strokeStyle = rgba(p.accent, 1 - burst);
        ctx.lineWidth = 4 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + 0.3;
          const r0 = icon * (0.55 + 0.35 * ease.outCubic(burst));
          const r1 = r0 + icon * 0.16 * (1 - burst);
          ctx.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0);
          ctx.lineTo(ix + Math.cos(a) * r1, iy + Math.sin(a) * r1);
        }
        ctx.stroke();
      }
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(ix, iy, (icon / 2) * ip, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      if (kind === 'sub') starPath(ctx, ix, iy + u, icon * 0.24 * ip);
      else heartPath(ctx, ix, iy + 2 * u, icon * 0.24 * ip);
      ctx.fill();
      // textos
      const tx = 34 * u + icon + 28 * u;
      const tIn = (d) => ease.outExpo(seg(lt, 0.2 + d, 0.9 + d));
      ctx.textAlign = 'left';
      ctx.font = F(800, 17 * u);
      ctx.letterSpacing = `${17 * u * 0.16}px`;
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = op * tIn(0);
      ctx.fillText(label, tx + (1 - tIn(0)) * 20 * u, 36 * u);
      ctx.letterSpacing = `${-ms * 0.02}px`;
      ctx.font = F(800, ms);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = op * tIn(0.08);
      ctx.fillText(main, tx + (1 - tIn(0.08)) * 26 * u, 76 * u);
      ctx.letterSpacing = '0px';
      ctx.font = F(500, 22 * u);
      ctx.fillStyle = rgba(ink, 0.65);
      ctx.globalAlpha = op * tIn(0.16);
      ctx.fillText(subTxt, tx + (1 - tIn(0.16)) * 30 * u, 116 * u);
      ctx.restore();
    };
    alert(T_SUB, 'sub');
    alert(T_DON, 'don');
  },
};
