import { seg, ease, clamp, rgba, TAU } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';

// Cabine de fotos em dois atos. 1) Visor: a foto ao vivo em tela cheia, com cantoneiras, contador
// "foto n/4", contagem 3-2-1 num anel e, a cada clique, o flash (sobe em 50 ms e decai exponencialmente);
// sob o flash a "pose" muda (outro recorte: zoom, foco, giro e espelho). Embaixo, quatro miniaturas
// preenchem com a pose que acabou de ser tirada. 2) O último flash fica branco e abre no painel da
// máquina: pela fenda sai a tira impressa (papel, as 4 poses no estilo escolhido e a legenda), aos
// trancos como um motor de passo, e balança presa na fenda enquanto a câmera se aproxima.
// Recortes, tira, sombra e painel são pré-pintados no setup; o render só faz drawImage e a interface.
const SANS = 'Inter, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

const SHOTS = [1.45, 2.6, 3.75, 4.9];
// poses: zoom, deslocamento do foco, giro, espelho
const POSES = [
  { zoom: 1.0, dx: 0, dy: 0, rot: 0, flip: false },
  { zoom: 1.4, dx: -0.04, dy: -0.01, rot: -0.04, flip: false },
  { zoom: 1.85, dx: 0.04, dy: 0.0, rot: 0.035, flip: true },
  { zoom: 1.18, dx: 0.02, dy: 0.03, rot: -0.015, flip: true },
];
const FILTERS = {
  'P&B': 'grayscale(1) contrast(1.18) brightness(1.04)',
  sépia: 'grayscale(1) sepia(0.75) contrast(1.1) brightness(1.03)',
  cor: 'saturate(1.08) contrast(1.06)',
};

function mk(W, H) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(W));
  c.height = Math.max(1, Math.ceil(H));
  return c;
}

// desenha a pose (recorte em cover num retângulo w×h com giro/espelho) no contexto atual
function drawPose(g, img, w, h, pose, focusY, extraZoom = 1) {
  const r = coverRect(img, w, h, {
    zoom: pose.zoom * extraZoom * (1 + Math.abs(pose.rot) * 1.6),
    fx: clamp(0.5 + pose.dx),
    fy: clamp(focusY + pose.dy),
  });
  g.save();
  g.translate(w / 2, h / 2);
  g.rotate(pose.rot);
  if (pose.flip) g.scale(-1, 1);
  g.translate(-w / 2, -h / 2);
  g.drawImage(img, r.x, r.y, r.w, r.h);
  g.restore();
}

export default {
  id: 'photo-booth',
  title: 'Photo Booth',
  description: 'Countdown and flash in a photo booth: four poses are taken and the printed strip slides out of the machine slot.',
  category: 'imagem',
  tags: ['intro', 'ui'],
  duration: 9,
  poster: 8.2,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/portrait.jpg' },
    style: { type: 'select', label: 'Print', options: ['P&B', 'sépia', 'cor'], default: 'P&B' },
    caption: { type: 'text', label: 'Strip caption', default: 'saturday · 10.12' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d3d' },
    panel: { type: 'color', label: 'Machine panel', default: '#1f2126' },
    paper: { type: 'color', label: 'Paper', default: '#f5f2ea' },
    focusY: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.33 },
  },

  setup({ w, h, p, px }) {
    const sc = Math.max(px, 0.25);
    const m = Math.min(w, h);
    const img = asset(p.image);

    // tira: largura S, 4 fotos levemente horizontais, legenda embaixo
    const slotY = h * 0.13;
    const avail = h - slotY - m * 0.05;
    let S = avail / 3.6;
    S = Math.min(S, w * 0.46);
    const b = S * 0.07;
    const pw = S - 2 * b;
    const ph = pw * 0.86;
    const gap = b * 0.8;
    const capH = b * 3.4;
    const SH = b + 4 * ph + 3 * gap + capH;
    const ss = sc * 1.25; // a câmera se aproxima: um pouco mais de resolução
    const strip = mk(S * ss, SH * ss);
    const frames = [];
    {
      const g = strip.getContext('2d');
      g.scale(ss, ss);
      g.fillStyle = p.paper;
      g.fillRect(0, 0, S, SH);
      // leve sombreado no papel (mesma cor, só alpha)
      const sh = g.createLinearGradient(0, 0, S, 0);
      sh.addColorStop(0, 'rgba(60,50,40,0.06)');
      sh.addColorStop(0.5, 'rgba(60,50,40,0)');
      sh.addColorStop(1, 'rgba(60,50,40,0.08)');
      g.fillStyle = sh;
      g.fillRect(0, 0, S, SH);
      for (let i = 0; i < 4; i++) {
        const y = b + i * (ph + gap);
        g.fillStyle = '#1a1a1a';
        g.fillRect(b, y, pw, ph);
        if (img) {
          g.save();
          g.beginPath();
          g.rect(b, y, pw, ph);
          g.clip();
          g.translate(b, y);
          g.filter = FILTERS[p.style] || 'none';
          drawPose(g, img, pw, ph, POSES[i], p.focusY);
          g.filter = 'none';
          // vinheta da lente
          const vg = g.createRadialGradient(pw / 2, ph / 2, ph * 0.3, pw / 2, ph / 2, pw * 0.72);
          vg.addColorStop(0, 'rgba(0,0,0,0)');
          vg.addColorStop(1, 'rgba(0,0,0,0.28)');
          g.fillStyle = vg;
          g.fillRect(0, 0, pw, ph);
          g.restore();
        }
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = Math.max(0.6 / ss, S * 0.003);
        g.strokeRect(b, y, pw, ph);
      }
      // legenda
      const cap = (p.caption || '').trim();
      if (cap) {
        const fs = S * 0.062;
        g.font = `500 ${fs}px ${MONO}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(40,36,32,0.78)';
        g.fillText(cap.toUpperCase(), S / 2, SH - capH / 2 + b * 0.2);
      }
      // miniaturas (recortes da tira já impressa)
      for (let i = 0; i < 4; i++) frames.push({ sx: b * ss, sy: (b + i * (ph + gap)) * ss, sw: pw * ss, sh: ph * ss });
    }

    // sombra da tira (desfocada em baixa resolução)
    const pad = S * 0.12;
    const s4 = sc * 0.3;
    const shadow = mk((S + pad * 2) * s4, (SH + pad * 2) * s4);
    {
      const g = shadow.getContext('2d');
      g.filter = `blur(${S * 0.035 * s4}px)`;
      g.fillStyle = 'rgba(0,0,0,1)';
      g.fillRect(pad * s4, pad * s4, S * s4, SH * s4);
    }

    // painel da máquina: cor + luz de cima + metal escovado + placa da fenda + rótulo
    const panelC = mk(w * sc, h * sc);
    const plateW = S * 1.55, plateH = m * 0.075;
    const slotW = S * 1.16, slotH = Math.max(m * 0.011, 3 / sc);
    {
      const g = panelC.getContext('2d');
      g.scale(sc, sc);
      g.fillStyle = p.panel;
      g.fillRect(0, 0, w, h);
      const lg = g.createRadialGradient(w / 2, slotY, 0, w / 2, slotY, Math.hypot(w, h) * 0.7);
      lg.addColorStop(0, 'rgba(255,255,255,0.09)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(0, 0, w, h);
      // escovado: linhas horizontais finas com alpha variável (determinístico)
      let seed = 7;
      const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const step = Math.max(1 / sc, m * 0.0025);
      for (let y = 0; y < h; y += step) {
        g.fillStyle = R() > 0.5 ? `rgba(255,255,255,${R() * 0.025})` : `rgba(0,0,0,${R() * 0.05})`;
        g.fillRect(0, y, w, step * 0.6);
      }
      const vg = g.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
      // placa
      const px0 = w / 2 - plateW / 2, py0 = slotY - plateH / 2;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.roundRect(px0, py0 + m * 0.006, plateW, plateH, plateH * 0.3);
      g.fill();
      const pgr = g.createLinearGradient(0, py0, 0, py0 + plateH);
      pgr.addColorStop(0, '#5a5d63');
      pgr.addColorStop(0.5, '#3b3e44');
      pgr.addColorStop(1, '#2c2e33');
      g.fillStyle = pgr;
      g.beginPath();
      g.roundRect(px0, py0, plateW, plateH, plateH * 0.3);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = Math.max(1 / sc, m * 0.0012);
      g.stroke();
      // parafusos
      for (const sx of [-1, 1]) {
        g.fillStyle = '#25272b';
        g.beginPath();
        g.arc(w / 2 + sx * (plateW / 2 - plateH * 0.32), slotY, plateH * 0.09, 0, TAU);
        g.fill();
      }
      // fenda
      g.fillStyle = '#060607';
      g.beginPath();
      g.roundRect(w / 2 - slotW / 2, slotY - slotH / 2, slotW, slotH, slotH / 2);
      g.fill();
      // rótulo
      const fs = m * 0.02;
      g.font = `500 ${fs}px ${MONO}`;
      g.letterSpacing = `${fs * 0.3}px`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const label = 'COLLECT YOUR PHOTOS';
      const lw = g.measureText(label).width;
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillText(label, w / 2 - lw / 2 + fs * 0.9, py0 - fs * 1.6);
      g.letterSpacing = '0px';
    }

    // vinheta do visor
    const vfC = mk(w * sc * 0.5, h * sc * 0.5);
    {
      const g = vfC.getContext('2d');
      g.scale(sc * 0.5, sc * 0.5);
      const vg = g.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
    }

    return { m, S, SH, b, slotY, slotW, slotH, plateH, strip, frames, shadow, pad, panelC, vfC, labelFs: m * 0.02 };
  },

  render(ctx, t, { w, h, p, duration, state: s }) {
    const img = asset(p.image);
    const { m } = s;
    const lastShot = SHOTS[3];
    const act2 = lastShot + 0.25;

    if (t < act2) {
      // ===== ato 1: visor =====
      let pose = 0;
      for (let i = 0; i < 4; i++) if (t > SHOTS[i] + 0.03) pose = Math.min(3, i + 1);
      ctx.fillStyle = '#0c0c0e';
      ctx.fillRect(0, 0, w, h);
      if (img) {
        // respiração da câmera na mão + aproximação lenta dentro de cada pose
        const since = pose === 0 ? t : t - SHOTS[pose - 1];
        const z = 1.03 + 0.03 * ease.outCubic(clamp(since / 1.2));
        ctx.save();
        ctx.translate(Math.sin(t * 1.7) * m * 0.004, Math.cos(t * 1.3) * m * 0.003);
        // no visor as poses aproximam menos quando o recorte já corta muito a foto (retrato em 16:9)
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        const cf = Math.max(w / iw, h / ih) / Math.min(w / iw, h / ih);
        const ps = POSES[pose];
        drawPose(ctx, img, w, h, { ...ps, zoom: 1 + (ps.zoom - 1) / Math.max(1, cf * 0.8) }, p.focusY, z);
        ctx.restore();
      }
      ctx.drawImage(s.vfC, 0, 0, w, h);

      // interface do visor
      const ui = ease.outCubic(seg(t, 0.15, 0.7)) * (1 - seg(t, lastShot, lastShot + 0.1));
      if (ui > 0) {
        ctx.globalAlpha = ui;
        const lw = Math.max(1.5, m * 0.004);
        const inset = m * 0.06, len = m * 0.06;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = lw;
        ctx.lineCap = 'square';
        ctx.beginPath();
        for (const [cx, cy, sx, sy] of [[inset, inset, 1, 1], [w - inset, inset, -1, 1], [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1]]) {
          ctx.moveTo(cx, cy + sy * len);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + sx * len, cy);
        }
        ctx.stroke();
        // topo: ponto piscando + contador de fotos
        const fs = m * 0.026;
        ctx.font = `500 ${fs}px ${MONO}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const ty = inset + len * 0.5;
        const on = Math.floor(t * 2) % 2 === 0;
        ctx.fillStyle = on ? p.accent : rgba(p.accent, 0.35);
        ctx.beginPath();
        ctx.arc(inset + len * 0.5, ty, fs * 0.32, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.letterSpacing = `${fs * 0.18}px`;
        ctx.fillText('BOOTH', inset + len * 0.5 + fs * 0.8, ty);
        ctx.textAlign = 'right';
        ctx.fillText(`PHOTO ${Math.min(4, pose + 1)}/4`, w - inset - len * 0.5 + fs * 0.18, ty);
        ctx.letterSpacing = '0px';

        // contagem 3-2-1 no anel antes de cada clique
        const next = SHOTS.findIndex((T) => t < T);
        if (next >= 0) {
          const T = SHOTS[next];
          const start = T - 0.9;
          if (t >= start) {
            const k = (t - start) / 0.9;
            const num = 3 - Math.min(2, Math.floor(k * 3));
            const kk = (k * 3) % 1;
            const R = m * 0.13;
            const cx = w / 2, cy = h / 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, TAU);
            ctx.stroke();
            ctx.strokeStyle = p.accent;
            ctx.lineWidth = lw * 1.6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * ease.inOutCubic(k));
            ctx.stroke();
            const pop = ease.outBack(clamp(kk * 3));
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
            ctx.globalAlpha = ui * clamp(kk * 5) * (1 - seg(kk, 0.8, 1) * 0.6);
            ctx.font = `700 ${R * 1.05}px ${SANS}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            const mt = ctx.measureText(String(num));
            ctx.fillStyle = '#fff';
            ctx.fillText(String(num), 0, (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2);
            ctx.restore();
            ctx.globalAlpha = ui;
          }
        }

        // miniaturas embaixo: 4 vagas que preenchem após cada clique
        const tw = m * (w < h ? 0.15 : 0.11), th = tw * 0.86, tg = tw * 0.14;
        const rowW = 4 * tw + 3 * tg;
        const y0 = h - inset - th - len * 0.15;
        for (let i = 0; i < 4; i++) {
          const x0 = w / 2 - rowW / 2 + i * (tw + tg);
          const k = seg(t, SHOTS[i] + 0.12, SHOTS[i] + 0.6);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x0, y0, tw, th);
          if (k > 0) {
            const e = ease.outBack(k);
            const f = s.frames[i];
            ctx.save();
            ctx.translate(x0 + tw / 2, y0 + th / 2);
            ctx.scale(e, e);
            ctx.globalAlpha = ui * clamp(k * 3);
            ctx.drawImage(s.strip, f.sx, f.sy, f.sw, f.sh, -tw / 2, -th / 2, tw, th);
            ctx.restore();
            ctx.globalAlpha = ui;
          }
          ctx.strokeStyle = k > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
          ctx.lineWidth = Math.max(1, m * 0.0022);
          ctx.strokeRect(x0, y0, tw, th);
        }
        ctx.globalAlpha = 1;
      }
    }

    if (t >= act2) {
      // ===== ato 2: painel e a tira saindo =====
      ctx.save();
      const z = 1 + 0.05 * ease.inOutSine(seg(t, act2, duration));
      const fy = s.slotY + s.SH * 0.3;
      ctx.translate(w / 2, fy);
      ctx.scale(z, z);
      ctx.translate(-w / 2, -fy);
      ctx.drawImage(s.panelC, 0, 0, w, h);

      // LED ao lado do rótulo
      const fs = s.labelFs;
      const ledOn = 0.55 + 0.45 * Math.cos(TAU * (t - act2) * 1.2);
      ctx.font = `500 ${fs}px ${MONO}`;
      ctx.letterSpacing = `${fs * 0.3}px`;
      const lw = ctx.measureText('COLLECT YOUR PHOTOS').width;
      ctx.letterSpacing = '0px';
      const ly = s.slotY - s.plateH / 2 - fs * 1.6;
      const lx = w / 2 - lw / 2 - fs * 0.2;
      ctx.fillStyle = rgba(p.accent, 0.25 * ledOn);
      ctx.beginPath();
      ctx.arc(lx, ly, fs * 0.75, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(p.accent, 0.5 + 0.5 * ledOn);
      ctx.beginPath();
      ctx.arc(lx, ly, fs * 0.33, 0, TAU);
      ctx.fill();

      // saída aos trancos: 4 passos, depois balança presa na fenda
      const t0 = act2 + 0.55;
      const stepT = 0.5;
      let out = 0;
      for (let i = 0; i < 4; i++) out += ease.inOutCubic(seg(t, t0 + i * stepT, t0 + i * stepT + 0.32)) * 0.25;
      out = 0.035 + 0.94 * out;
      const yTop = s.slotY - s.SH * (1 - out);
      const tEnd = t0 + 4 * stepT;
      const sw = t > tEnd - 0.2 ? 0.03 * Math.sin(TAU * (t - tEnd + 0.2) * 0.75) * Math.exp(-(t - tEnd + 0.2) * 0.9) : 0;
      const jig = t < tEnd ? Math.sin(t * 60) * m * 0.0006 * (seg(t, t0, tEnd) > 0 ? 1 : 0) : 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, s.slotY, w, h);
      ctx.clip();
      ctx.translate(w / 2 + jig, s.slotY);
      ctx.rotate(sw);
      const top = yTop - s.slotY;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(s.shadow, -s.S / 2 - s.pad + m * 0.01, top - s.pad + m * 0.018, s.S + s.pad * 2, s.SH + s.pad * 2);
      ctx.globalAlpha = 1;
      ctx.drawImage(s.strip, -s.S / 2, top, s.S, s.SH);
      // sombra da fenda sobre o papel logo na saída
      const sg = ctx.createLinearGradient(0, 0, 0, s.b * 1.4);
      sg.addColorStop(0, 'rgba(0,0,0,0.45)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(-s.S / 2, 0, s.S, s.b * 1.4);
      ctx.restore();
      // lábio da fenda por cima
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(w / 2 - s.slotW / 2, s.slotY + s.slotH / 2, s.slotW, Math.max(1, m * 0.0015));
      ctx.restore();
    }

    // flashes (o último segura o branco e abre no ato 2)
    let fl = 0;
    for (let i = 0; i < 4; i++) {
      const T = SHOTS[i];
      if (t >= T - 0.05 && t < T) fl = Math.max(fl, (t - (T - 0.05)) / 0.05);
      else if (t >= T) {
        const hold = i === 3 ? 0.35 : 0;
        const d = t - T - hold;
        fl = Math.max(fl, d <= 0 ? 1 : Math.exp(-d * (i === 3 ? 4.5 : 7)));
      }
    }
    if (fl > 0.003) {
      ctx.fillStyle = `rgba(255,252,246,${fl})`;
      ctx.fillRect(0, 0, w, h);
    }
    // entra do preto
    const fade = 1 - ease.outCubic(seg(t, 0, 0.4));
    if (fade > 0.003) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, w, h);
    }
  },
};
