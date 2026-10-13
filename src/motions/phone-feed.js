import { TAU, clamp, lerp, seg, ease, spring, rgba, mixHex } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';

const F = 'Inter, system-ui, sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';

// Tela em "pontos" de iPhone: tudo é desenhado em 390×844 e escalado.
const SW = 390;
const SH = 844;
const BEZEL = 13;
const TOP = 104; // fim do cabeçalho fixo
const TAB = 82; // barra de abas

const DEFAULT = `marina.luz | Primeiro dia de sol depois de uma semana inteira de chuva ☀️
rafa.lima | Novo retrato pro portfólio. Luz de janela e nada mais.
estudio.norte | "Movimento é a cola entre uma ideia e outra."
bia.campos | Fim de tarde no mirante, valeu cada degrau
joao.pedro | Testando lente nova, o que acharam?`;

// variações de mídia (mesmas duas fotos com enquadramentos diferentes + um card de citação)
const VARIANTS = [
  { kind: 'img', src: 'land', hh: 390, zoom: 1, fx: 0.5, fy: 0.5 },
  { kind: 'img', src: 'port', hh: 488, zoom: 1, fx: 0.5, fy: 0.3 },
  { kind: 'quote', hh: 390 },
  { kind: 'img', src: 'land', hh: 488, zoom: 1.7, fx: 0.25, fy: 0.55 },
  { kind: 'img', src: 'port', hh: 390, zoom: 1.3, fx: 0.5, fy: 0.42 },
];

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.85);
  ctx.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 0.95, y - s * 0.95, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.95, y - s * 0.95, x + s * 1.25, y + s * 0.05, x, y + s * 0.85);
  ctx.closePath();
}

const fmt = new Intl.NumberFormat('pt-BR');

export default {
  id: 'phone-feed',
  title: 'Phone Feed',
  description: 'Mockup de celular rolando um feed social com stories, fotos, citação e curtida com toque duplo.',
  category: 'dados',
  tags: ['ui', 'dados', 'imagem'],
  duration: 10,
  poster: 2.9,

  params: {
    posts: { type: 'textarea', label: 'Posts (perfil | legenda)', rows: 5, default: DEFAULT },
    app: { type: 'text', label: 'Nome do app', default: 'momento' },
    photoA: { type: 'image', label: 'Foto 1', default: '/samples/landscape.jpg' },
    photoB: { type: 'image', label: 'Foto 2', default: '/samples/portrait.jpg' },
    theme: { type: 'select', label: 'Tema do app', options: ['claro', 'escuro'], default: 'claro' },
    accent: { type: 'color', label: 'Destaque', default: '#ff3b5c' },
    bg: { type: 'color', label: 'Fundo', default: '#e9e5df' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, p, px, duration }) {
    const lines = String(p.posts || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 8);
    let y = 112; // após os stories
    const posts = (lines.length ? lines : ['perfil | legenda']).map((l, i) => {
      const [user = 'perfil', caption = ''] = l.split('|').map((s) => s.trim());
      const v = VARIANTS[i % VARIANTS.length];
      const post = { user, caption, v, top: y, likes: 380 + ((i * 7919) % 2400), i };
      y += 54 + v.hh + 44 + 20 + 22 + 20 + 26;
      return post;
    });
    const feedH = y;
    // paradas de rolagem: topo de cada post logo abaixo do cabeçalho
    const viewH = SH - TOP - TAB;
    const maxScroll = Math.max(0, feedH - viewH);
    const stops = [0, ...posts.map((po) => Math.min(maxScroll, po.top - 4))];
    // agenda: o 1º flick leva ao post 0 (curtida com toque duplo), os seguintes vão de post em post
    const flicks = [];
    const T0 = 1.5;
    const T1 = duration - 1.5;
    const nF = Math.min(stops.length - 1, 5);
    const gap = nF > 1 ? (T1 - T0 - 1.6) / (nF - 1) : 0;
    for (let k = 1; k <= nF; k++) flicks.push({ t: k === 1 ? T0 : T0 + 1.6 + (k - 1) * gap, from: stops[k - 1], to: stops[k] });
    const like = { t: T0 + 1.15, post: 0 };

    let wall = null;
    if (!p.transparent) {
      wall = document.createElement('canvas');
      wall.width = Math.max(4, Math.round(w * px));
      wall.height = Math.max(4, Math.round(h * px));
      const g = wall.getContext('2d');
      g.scale(px, px);
      g.fillStyle = p.bg;
      g.fillRect(0, 0, w, h);
      const rg = g.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      rg.addColorStop(0, rgba(p.accent, 0.16));
      rg.addColorStop(0.5, rgba(p.accent, 0.05));
      rg.addColorStop(1, rgba(p.accent, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    }
    // sombra suave do aparelho: desfocada uma vez aqui (blur grande por frame é caro)
    const PW = SW + BEZEL * 2;
    const PH = SH + BEZEL * 2;
    const S = Math.min((h * 0.9) / PH, (w * 0.86) / PW);
    const M = 90; // margem em pontos
    const k = S * px;
    const shadow = document.createElement('canvas');
    shadow.width = Math.max(4, Math.round((PW + M * 2) * k));
    shadow.height = Math.max(4, Math.round((PH + M * 2) * k));
    const sg = shadow.getContext('2d');
    sg.scale(k, k);
    sg.filter = `blur(${30 * k}px)`;
    sg.fillStyle = 'rgba(30,20,20,0.5)';
    sg.beginPath();
    sg.roundRect(M + 14, M + 46, PW - 28, PH - 20, 60);
    sg.fill();
    sg.filter = `blur(${7 * k}px)`;
    sg.fillStyle = 'rgba(0,0,0,0.22)';
    sg.beginPath();
    sg.roundRect(M + 2, M + 8, PW - 4, PH - 4, 62);
    sg.fill();
    // fotos e avatares pré-recortados na resolução final (reduzir a foto inteira a cada frame é caro)
    const imgA = asset(p.photoA);
    const imgB = asset(p.photoB);
    const media = posts.map((po) => {
      const img = po.v.kind === 'img' ? (po.v.src === 'land' ? imgA : imgB) : null;
      if (!img) return null;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(SW * k));
      c.height = Math.max(1, Math.round(po.v.hh * k));
      const g = c.getContext('2d');
      const r = coverRect(img, c.width, c.height, po.v);
      g.drawImage(img, r.x, r.y, r.w, r.h);
      return c;
    });
    const AV = 36;
    const avs = Array.from({ length: 10 }, (_, i) => {
      const img = i % 3 === 2 ? imgA : imgB;
      if (!img) return null;
      const c = document.createElement('canvas');
      c.width = c.height = Math.max(2, Math.round(AV * 2 * k));
      const g = c.getContext('2d');
      const d = c.width;
      g.beginPath();
      g.arc(d / 2, d / 2, d / 2, 0, TAU);
      g.clip();
      const r = coverRect(img, d, d, { zoom: [1, 1.7, 2.4, 1.3, 2][i % 5], fx: [0.5, 0.42, 0.6, 0.35, 0.55][i % 5], fy: [0.3, 0.25, 0.4, 0.3, 0.2][i % 5] });
      g.drawImage(img, r.x, r.y, r.w, r.h);
      return c;
    });
    return { posts, feedH, flicks, like, wall, shadow, M, media, avs };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    const { posts, flicks, like, wall } = state;
    if (wall) ctx.drawImage(wall, 0, 0, w, h);
    const dark = p.theme === 'escuro';
    const BG = dark ? '#000000' : '#ffffff';
    const INK = dark ? '#f2f2f4' : '#101114';
    const MUTED = dark ? '#8e8e95' : '#7a7b82';
    const LINE = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

    // ---------- rolagem (função pura de t) ----------
    let scroll = 0;
    let touch = null; // { x, y, a }
    for (const f of flicks) {
      const k = seg(t, f.t - 0.12, f.t + 1.0);
      if (t >= f.t - 0.12) scroll = lerp(f.from, f.to, 1 - Math.pow(1 - k, 4));
      // dedo: encosta, arrasta para cima e solta
      const tk = seg(t, f.t - 0.32, f.t + 0.08);
      if (tk > 0 && tk < 1) {
        const drag = ease.inOutCubic(seg(t, f.t - 0.2, f.t + 0.06));
        touch = { x: 250, y: 640 - 230 * drag, a: Math.sin(Math.PI * tk) };
      }
    }
    if (flicks.length && t < flicks[0].t - 0.12) scroll = 0;

    // ---------- geometria do aparelho ----------
    const PW = SW + BEZEL * 2;
    const PH = SH + BEZEL * 2;
    const S = Math.min((h * 0.9) / PH, (w * 0.86) / PW);
    const inK = spring(seg(t, 0.05, 1.15), 0.12);
    const outK = ease.inCubic(seg(t, duration - 0.75, duration - 0.05));
    if (outK >= 1) return;
    const drift = Math.sin((TAU * t) / duration) * 4;
    ctx.save();
    ctx.translate(w / 2, h / 2 + (1 - inK) * (h * 0.5 + PH * S * 0.5) + outK * (h * 0.5 + PH * S * 0.6));
    ctx.rotate((1 - clamp(inK)) * 0.08 - outK * 0.06);
    ctx.scale(S, S);
    ctx.translate(-PW / 2, -PH / 2 + drift);

    // sombra em camadas
    ctx.drawImage(state.shadow, -state.M, -state.M, PW + state.M * 2, PH + state.M * 2);
    // corpo
    ctx.fillStyle = '#1b1c20';
    ctx.beginPath();
    ctx.roundRect(0, 0, PW, PH, 62);
    ctx.fill();
    ctx.strokeStyle = '#3a3c43';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(1.25, 1.25, PW - 2.5, PH - 2.5, 61);
    ctx.stroke();
    // botões laterais
    ctx.fillStyle = '#2a2b31';
    ctx.fillRect(-3, 170, 3, 34);
    ctx.fillRect(-3, 230, 3, 60);
    ctx.fillRect(-3, 302, 3, 60);
    ctx.fillRect(PW, 250, 3, 92);

    // ---------- tela ----------
    ctx.translate(BEZEL, BEZEL);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, SW, SH, 50);
    ctx.clip();
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, SW, SH);

    // feed rolável
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, SW, SH - TOP - TAB);
    ctx.clip();
    ctx.translate(0, TOP - scroll);
    const viewTop = scroll - 20;
    const viewBot = scroll + SH - TOP - TAB + 20;

    // avatar circular com recorte
    const avatar = (x, y, r, i) => {
      const a = state.avs[i % state.avs.length];
      if (a) ctx.drawImage(a, x - r, y - r, r * 2, r * 2);
      else {
        ctx.fillStyle = dark ? '#2a2a2e' : '#e6e6ea';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    };

    // stories
    if (viewTop < 112) {
      const names = ['Seu story', ...posts.map((po) => po.user)].slice(0, 6);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      names.forEach((nm, i) => {
        const x = 16 + 33 + i * 80;
        const y = 46;
        const k = spring(seg(t, 0.5 + i * 0.07, 1.3 + i * 0.07), 0.3);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k, k);
        if (i > 0) {
          const g = ctx.createLinearGradient(-34, 34, 34, -34);
          g.addColorStop(0, '#ffb341');
          g.addColorStop(0.55, p.accent);
          g.addColorStop(1, mixHex(p.accent, '#7a3cff', 0.6));
          ctx.strokeStyle = g;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(0, 0, 34, 0, TAU);
          ctx.stroke();
        }
        avatar(0, 0, 29.5, i + 1);
        if (i === 0) {
          ctx.fillStyle = BG;
          ctx.beginPath();
          ctx.arc(21, 21, 11, 0, TAU);
          ctx.fill();
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          ctx.arc(21, 21, 8.5, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(17, 21);
          ctx.lineTo(25, 21);
          ctx.moveTo(21, 17);
          ctx.lineTo(21, 25);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = i === 0 ? MUTED : INK;
        ctx.font = `400 11.5px ${F}`;
        ctx.globalAlpha = clamp(k);
        ctx.fillText(ellipsize(ctx, nm, 72), x, 98);
        ctx.globalAlpha = 1;
      });
      ctx.fillStyle = LINE;
      ctx.fillRect(0, 111, SW, 0.8);
    }

    // posts
    for (const po of posts) {
      const v = po.v;
      const hTot = 54 + v.hh + 44 + 20 + 22 + 20 + 26;
      if (po.top > viewBot || po.top + hTot < viewTop) continue;
      let y = po.top;
      // cabeçalho
      avatar(14 + 17, y + 27, 17, po.i);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.font = `600 13.5px ${F}`;
      ctx.fillText(po.user, 58, y + 20);
      ctx.fillStyle = MUTED;
      ctx.font = `400 11.5px ${F}`;
      ctx.fillText(['São Paulo', 'Lisboa', 'Patrocinado', 'Florianópolis', 'Rio de Janeiro'][po.i % 5], 58, y + 36);
      ctx.fillStyle = INK;
      for (let d = -1; d <= 1; d++) {
        ctx.beginPath();
        ctx.arc(SW - 24 + d * 6, y + 27, 1.7, 0, TAU);
        ctx.fill();
      }
      y += 54;
      // mídia
      if (v.kind === 'img') {
        const img = state.media[po.i];
        if (img) ctx.drawImage(img, 0, y, SW, v.hh);
        else {
          ctx.fillStyle = dark ? '#1c1c20' : '#ececef';
          ctx.fillRect(0, y, SW, v.hh);
        }
      } else {
        // card de citação
        const g = ctx.createLinearGradient(0, y, SW, y + v.hh);
        g.addColorStop(0, p.accent);
        g.addColorStop(1, mixHex(p.accent, '#1a0d33', 0.45));
        ctx.fillStyle = g;
        ctx.fillRect(0, y, SW, v.hh);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `400 92px ${SERIF}`;
        ctx.fillText('“', 30, y + 112);
        const q = po.caption.replace(/^["“]|["”]$/g, '');
        ctx.font = `italic 400 31px ${SERIF}`;
        // quebra simples
        const words = q.split(/\s+/);
        const ls = [];
        let cur = '';
        for (const wd of words) {
          const test = cur ? `${cur} ${wd}` : wd;
          if (ctx.measureText(test).width < SW - 70 || !cur) cur = test;
          else {
            ls.push(cur);
            cur = wd;
          }
        }
        if (cur) ls.push(cur);
        ls.length = Math.min(ls.length, 6);
        ls.forEach((l, li) => ctx.fillText(l, 34, y + 150 + li * 36));
        ctx.font = `600 12px ${F}`;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(`@${po.user}`.toUpperCase(), 34, y + v.hh - 30);
      }
      // curtida com toque duplo (post do `like`)
      const liked = po.i === like.post && t >= like.t;
      if (po.i === like.post) {
        const k = seg(t, like.t, like.t + 1.0);
        if (k > 0 && k < 1) {
          const s = spring(clamp(k * 2.2), 0.45) * (1 + 0.1 * seg(k, 0.6, 1));
          ctx.globalAlpha = 1 - seg(k, 0.65, 1);
          ctx.fillStyle = '#ffffff';
          ctx.save();
          ctx.translate(SW / 2, y + v.hh / 2);
          ctx.rotate(-0.12 * (1 - clamp(k * 3)));
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 20 * S * px;
          heart(ctx, 0, 0, 62 * s);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
        }
        // toques
        for (const tt of [like.t - 0.22, like.t - 0.02]) {
          const a = Math.sin(Math.PI * seg(t, tt - 0.05, tt + 0.16));
          if (a > 0) {
            ctx.fillStyle = `rgba(255,255,255,${0.35 * a})`;
            ctx.strokeStyle = `rgba(255,255,255,${0.8 * a})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(SW / 2 + 40, y + v.hh / 2 + 70, 22 + 6 * (1 - a), 0, TAU);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
      y += v.hh;
      // ações
      const ay = y + 22;
      ctx.lineWidth = 1.9;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const pop = liked ? 1 + 0.35 * Math.sin(Math.PI * seg(t, like.t + 0.05, like.t + 0.4)) : 1;
      if (liked) {
        ctx.fillStyle = p.accent;
        heart(ctx, 26, ay, 11.5 * pop);
        ctx.fill();
      } else {
        ctx.strokeStyle = INK;
        heart(ctx, 26, ay, 11.5);
        ctx.stroke();
      }
      ctx.strokeStyle = INK;
      // comentário
      ctx.beginPath();
      ctx.arc(66, ay, 10.5, 0.85, TAU + 0.55);
      ctx.lineTo(77.5, ay + 11);
      ctx.closePath();
      ctx.stroke();
      // enviar
      ctx.beginPath();
      ctx.moveTo(96, ay - 10);
      ctx.lineTo(118, ay - 10);
      ctx.lineTo(106, ay + 11);
      ctx.lineTo(104, ay - 2);
      ctx.closePath();
      ctx.moveTo(104, ay - 2);
      ctx.lineTo(118, ay - 10);
      ctx.stroke();
      // salvar
      ctx.beginPath();
      ctx.moveTo(SW - 32, ay - 11);
      ctx.lineTo(SW - 16, ay - 11);
      ctx.lineTo(SW - 16, ay + 11);
      ctx.lineTo(SW - 24, ay + 4);
      ctx.lineTo(SW - 32, ay + 11);
      ctx.closePath();
      ctx.stroke();
      // pontinhos do carrossel
      if (v.kind === 'img' && po.i % 2 === 0) {
        for (let d = 0; d < 3; d++) {
          ctx.fillStyle = d === 0 ? p.accent : dark ? '#444' : '#d0d0d5';
          ctx.beginPath();
          ctx.arc(SW / 2 + (d - 1) * 8, ay, 2.6, 0, TAU);
          ctx.fill();
        }
      }
      y += 44;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.font = `600 13px ${F}`;
      ctx.fillText(`${fmt.format(po.likes + (liked ? 1 : 0))} curtidas`, 14, y + 8);
      y += 20;
      // legenda: perfil em negrito + texto
      ctx.font = `600 13px ${F}`;
      ctx.fillText(po.user, 14, y + 10);
      const uw = ctx.measureText(po.user).width;
      ctx.font = `400 13px ${F}`;
      ctx.fillText(ellipsize(ctx, v.kind === 'quote' ? 'Frase da semana ✦' : po.caption, SW - 28 - uw - 8), 14 + uw + 6, y + 10);
      y += 22;
      ctx.fillStyle = MUTED;
      ctx.fillText(`Ver todos os ${12 + ((po.i * 37) % 80)} comentários`, 14, y + 9);
      y += 20;
      ctx.font = `400 10.5px ${F}`;
      ctx.fillText(['HÁ 2 HORAS', 'HÁ 5 HORAS', 'ONTEM', 'HÁ 2 DIAS', 'HÁ 3 DIAS'][po.i % 5], 14, y + 8);
    }
    ctx.restore(); // feed

    // ---------- cabeçalho fixo ----------
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, SW, TOP);
    if (scroll > 4) {
      ctx.fillStyle = LINE;
      ctx.fillRect(0, TOP - 0.8, SW, 0.8);
    }
    // status bar
    ctx.fillStyle = INK;
    ctx.font = `600 16px ${F}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('9:41', 62, 30);
    // sinal
    for (let b = 0; b < 4; b++) ctx.fillRect(284 + b * 5.5, 34 - 4 - b * 2.4, 3.6, 4 + b * 2.4);
    // wi-fi
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.lineCap = 'round';
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      ctx.arc(318, 36, 3 + r * 4, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();
    }
    // bateria
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.roundRect(334, 24.5, 25, 12, 3.5);
    ctx.stroke();
    ctx.fillRect(360.5, 28.5, 1.6, 4.5);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.roundRect(336, 26.5, 18, 8, 2);
    ctx.fill();
    // dynamic island
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(SW / 2 - 62, 11, 124, 36, 18);
    ctx.fill();
    // título do app
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = `italic 400 32px ${SERIF}`;
    ctx.fillText(p.app || 'momento', 16, 80);
    // ícones: coração + mensagens (com badge)
    ctx.lineWidth = 1.9;
    ctx.lineJoin = 'round';
    heart(ctx, 318, 80, 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(342, 71);
    ctx.lineTo(366, 71);
    ctx.lineTo(353, 91);
    ctx.lineTo(351, 79);
    ctx.closePath();
    ctx.moveTo(351, 79);
    ctx.lineTo(366, 71);
    ctx.stroke();
    const badge = spring(seg(t, 1.0, 1.6), 0.5);
    if (badge > 0.01) {
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(368, 68, 8 * badge, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 10px ${F}`;
      ctx.textAlign = 'center';
      ctx.fillText('3', 368, 68.5);
    }

    // ---------- barra de abas ----------
    const ty = SH - TAB;
    ctx.fillStyle = BG;
    ctx.fillRect(0, ty, SW, TAB);
    ctx.fillStyle = LINE;
    ctx.fillRect(0, ty, SW, 0.8);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1.9;
    const iy = ty + 26;
    const xs = [39, 117, 195, 273, 351];
    // início (preenchido)
    ctx.beginPath();
    ctx.moveTo(xs[0] - 11, iy + 11);
    ctx.lineTo(xs[0] - 11, iy - 2);
    ctx.lineTo(xs[0], iy - 11);
    ctx.lineTo(xs[0] + 11, iy - 2);
    ctx.lineTo(xs[0] + 11, iy + 11);
    ctx.closePath();
    ctx.fill();
    // busca
    ctx.beginPath();
    ctx.arc(xs[1] - 2, iy - 2, 8.5, 0, TAU);
    ctx.moveTo(xs[1] + 4.5, iy + 4.5);
    ctx.lineTo(xs[1] + 11, iy + 11);
    ctx.stroke();
    // novo
    ctx.beginPath();
    ctx.roundRect(xs[2] - 11, iy - 11, 22, 22, 6);
    ctx.moveTo(xs[2] - 5, iy);
    ctx.lineTo(xs[2] + 5, iy);
    ctx.moveTo(xs[2], iy - 5);
    ctx.lineTo(xs[2], iy + 5);
    ctx.stroke();
    // vídeos
    ctx.beginPath();
    ctx.roundRect(xs[3] - 11, iy - 11, 22, 22, 6);
    ctx.moveTo(xs[3] - 3, iy - 5);
    ctx.lineTo(xs[3] + 5, iy);
    ctx.lineTo(xs[3] - 3, iy + 5);
    ctx.closePath();
    ctx.stroke();
    // perfil
    avatar(xs[4], iy, 12, 3);
    // indicador home
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(SW / 2 - 67, SH - 13, 134, 5, 2.5);
    ctx.fill();

    // dedo (toque de rolagem)
    if (touch) {
      ctx.fillStyle = `rgba(120,120,130,${0.28 * touch.a})`;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * touch.a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(touch.x, touch.y, 22, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore(); // clip da tela
    ctx.restore();
  },
};
