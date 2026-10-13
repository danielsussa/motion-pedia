import { TAU, clamp, lerp, seg, ease, spring, rgba, rng } from '../lib/anim.js';

// Fluxo de pagamento Pix num celular (tema claro): valor contando, QR Code se montando, linha de
// leitura passando, "processando", "Pagamento aprovado" com check desenhado e comprovante com
// dados fictícios. O ícone é um losango genérico (não é o logotipo oficial do Pix). Nos formatos
// largos/quadrados há um título com os 3 passos ao lado; no vertical o título fica em cima.

// Celular desenhado em "pontos" (tela 390×844, como um iPhone), escalado para o quadro.
const PW = 414, PH = 868, SW = 390, SH = 844;
const QN = 29; // módulos do QR (versão 3)

const INTER = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (wt, s) => `${wt} ${s}px "JetBrains Mono", ui-monospace, monospace`;
const SERIF = (s) => `italic 400 ${s}px "Instrument Serif", Georgia, serif`;

function parseAmount(s) {
  let t = String(s || '').replace(/[^\d.,]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const v = Number(t);
  return Number.isFinite(v) ? v : 0;
}
const BRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v) => `R$ ${BRL.format(v)}`;

// QR "plausível": padrões de posição, timing, alinhamento e dados pseudoaleatórios (não é legível).
function makeQR(seed) {
  const r = rng(seed * 131 + 7);
  const g = new Uint8Array(QN * QN);
  const fixed = new Uint8Array(QN * QN);
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= QN || y >= QN) return;
    g[y * QN + x] = v;
    fixed[y * QN + x] = 1;
  };
  const finder = (ox, oy) => {
    for (let y = -1; y <= 7; y++)
      for (let x = -1; x <= 7; x++) {
        const inR = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const ring = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        set(ox + x, oy + y, inR && (ring || core) ? 1 : 0);
      }
  };
  finder(0, 0);
  finder(QN - 7, 0);
  finder(0, QN - 7);
  for (let i = 8; i < QN - 8; i++) {
    set(i, 6, i % 2 === 0 ? 1 : 0);
    set(6, i, i % 2 === 0 ? 1 : 0);
  }
  const ac = QN - 7;
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++) set(ac + x, ac + y, Math.max(Math.abs(x), Math.abs(y)) !== 1 ? 1 : 0);
  set(8, QN - 8, 1);
  // miolo livre para o ícone
  const c = (QN - 1) / 2;
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) set(c + x, c + y, 0);
  for (let i = 0; i < QN * QN; i++) if (!fixed[i]) g[i] = r() < 0.47 ? 1 : 0;
  // separa em finders (desenhados à parte, com cantos arredondados) e módulos soltos
  const mods = [];
  const isFinder = (x, y) => (x < 8 && y < 8) || (x >= QN - 8 && y < 8) || (x < 8 && y >= QN - 8);
  for (let y = 0; y < QN; y++) for (let x = 0; x < QN; x++) if (g[y * QN + x] && !isFinder(x, y)) mods.push([x, y, r()]);
  return mods;
}

// Losango genérico (ícone de pagamento instantâneo): quadrado girado de cantos arredondados + miolo vazado.
function diamond(ctx, x, y, s, color, hole) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  const a = s / Math.SQRT2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-a / 2, -a / 2, a, a, a * 0.22);
  ctx.fill();
  if (hole) {
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.roundRect(-a * 0.2, -a * 0.2, a * 0.4, a * 0.4, a * 0.08);
    ctx.fill();
  }
  ctx.restore();
}

function fitFont(ctx, text, maxW, size, font) {
  ctx.font = font(size);
  const tw = ctx.measureText(text).width;
  if (tw > maxW) {
    size *= maxW / tw;
    ctx.font = font(size);
  }
  return size;
}

export default {
  id: 'pix-checkout',
  title: 'Pix Checkout',
  description: 'Fluxo de pagamento Pix num celular: valor, QR Code com linha de leitura, "Pagamento aprovado" com check e comprovante.',
  category: 'dados',
  tags: ['ui', 'dados'],
  duration: 9,
  poster: 6.6,

  params: {
    headline: { type: 'text', label: 'Título', default: 'Pagamento em segundos' },
    merchant: { type: 'text', label: 'Recebedor', default: 'Café Aurora' },
    amount: { type: 'text', label: 'Valor (R$)', default: '128,90' },
    date: { type: 'text', label: 'Data do comprovante', default: '12/10/2026 · 14:32' },
    accent: { type: 'color', label: 'Destaque', default: '#0fa08c' },
    ink: { type: 'color', label: 'Texto', default: '#14181c' },
    bg: { type: 'color', label: 'Fundo', default: '#eceeed' },
    seed: { type: 'range', label: 'Seed (QR/ID)', min: 1, max: 99, step: 1, default: 12 },
  },

  setup({ w, h, p, px }) {
    const ar = w / h;
    const m = Math.min(w, h);
    const side = ar >= 0.95;
    let phH, cx, cy, head;
    if (side) {
      phH = h * (ar > 1.4 ? 0.88 : 0.84);
      const phW = (phH * PW) / PH;
      const pad = w * 0.07;
      cx = ar > 1.4 ? w * 0.7 : w - pad - phW / 2;
      cy = h * 0.53;
      head = { x: ar > 1.4 ? w * 0.09 : pad, w: cx - phW / 2 - (ar > 1.4 ? w * 0.09 : pad) - w * 0.05 };
    } else {
      phH = Math.min(h * (ar < 0.7 ? 0.8 : 0.79), (w * 0.82 * PH) / PW);
      cx = w / 2;
      cy = h - h * (ar < 0.7 ? 0.055 : 0.035) - phH / 2;
      head = { x: w * 0.08, w: w * 0.84, y: (cy - phH / 2) / 2 };
    }
    const k = phH / PH;

    // sombra do celular pré-renderizada (shadowBlur é caro)
    const pad = 80;
    const sc = Math.max(0.05, k * px);
    const sh = document.createElement('canvas');
    sh.width = Math.ceil((PW + pad * 2) * sc);
    sh.height = Math.ceil((PH + pad * 2) * sc);
    const g = sh.getContext('2d');
    g.scale(sc, sc);
    g.shadowColor = 'rgba(20,30,40,0.28)';
    g.shadowBlur = 50 * sc;
    g.shadowOffsetY = 26 * sc;
    g.fillStyle = '#000';
    g.beginPath();
    g.roundRect(pad, pad, PW, PH, 62);
    g.fill();
    g.shadowColor = 'transparent';
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.roundRect(pad + 2, pad + 2, PW - 4, PH - 4, 60);
    g.fill();

    const r = rng(p.seed * 17 + 1);
    const hex = '0123456789abcdef';
    let id = 'E';
    for (let i = 0; i < 8; i++) id += Math.floor(r() * 10);
    id += '2026';
    for (let i = 0; i < 14; i++) id += hex[Math.floor(r() * 16)];

    return { mods: makeQR(p.seed), k, cx, cy, side, head, shadow: sh, shPad: pad, id, value: parseAmount(p.amount), m };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { k, cx, cy, side, head, m, value } = state;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const ink = p.ink;
    const gray = rgba(ink, 0.52);
    const OUT = duration - 0.75;
    const out = ease.inCubic(seg(t, OUT, duration - 0.05));

    // ---------- texto lateral / título ----------
    const phaseA = t < 3.3 ? 0 : t < 4.2 ? 1 : 2;
    if (p.headline) {
      const words = p.headline.trim().split(/\s+/);
      const last = words.pop();
      const first = words.join(' ');
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      if (side) {
        // título em duas linhas, a última palavra em serifa itálica no destaque
        let fs = Math.min(m * 0.1, head.w * 0.15);
        ctx.font = INTER(800, fs);
        const w1 = ctx.measureText(first).width;
        ctx.font = SERIF(fs * 1.22);
        const w2 = ctx.measureText(last).width;
        fs *= Math.min(1, head.w / Math.max(w1, w2, 1));
        const lines = first ? 2 : 1;
        const stepsH = fs * 0.32 * 6.3;
        const blockH = fs * 1.05 * lines + fs * 0.9 + stepsH;
        let y = h / 2 - blockH / 2 + fs * 0.85;
        const t1 = ease.outExpo(seg(t, 0.25, 1.3));
        const t2 = ease.outExpo(seg(t, 0.4, 1.45));
        ctx.save();
        ctx.beginPath();
        ctx.rect(head.x - m * 0.02, y - fs * 1.05, head.w + m * 0.1, fs * 1.05 * lines + fs * 0.4);
        ctx.clip();
        if (first) {
          ctx.font = INTER(800, fs);
          ctx.letterSpacing = `${-fs * 0.035}px`;
          ctx.fillStyle = ink;
          ctx.fillText(first, head.x, y + (1 - t1) * fs * 1.2);
          ctx.letterSpacing = '0px';
          y += fs * 1.05;
        }
        ctx.font = SERIF(fs * 1.22);
        ctx.fillStyle = p.accent;
        ctx.fillText(last, head.x, y + (1 - t2) * fs * 1.2);
        ctx.restore();
        // passos
        const steps = ['Escaneie o QR Code', 'Confirme no app do banco', 'Receba o comprovante'];
        const ss = fs * 0.32;
        let sy = y + fs * 0.95;
        for (let i = 0; i < 3; i++) {
          const a = 0.7 + i * 0.12;
          const op = clamp(seg(t, a, a + 0.5));
          if (op <= 0) continue;
          const dy = (1 - ease.outExpo(seg(t, a, a + 1))) * ss * 1.5;
          const on = i === phaseA;
          const done = i < phaseA;
          const kOn = on ? clamp(seg(t, [0.8, 3.3, 4.2][i], [0.8, 3.3, 4.2][i] + 0.3)) : done ? 0 : 0;
          ctx.globalAlpha = op;
          const dx = head.x + ss * 0.55;
          const dyc = sy + dy - ss * 0.35;
          // trilho entre passos
          if (i < 2) {
            ctx.fillStyle = rgba(ink, 0.12);
            ctx.fillRect(dx - 1, dyc + ss * 0.65, 2, ss * 1.4);
            ctx.fillStyle = p.accent;
            const fill = clamp(seg(t, [3.0, 4.0][i], [3.3, 4.2][i]));
            ctx.fillRect(dx - 1, dyc + ss * 0.65, 2, ss * 1.4 * fill);
          }
          ctx.beginPath();
          ctx.arc(dx, dyc, ss * 0.5, 0, TAU);
          ctx.fillStyle = done || on ? p.accent : rgba(ink, 0.16);
          ctx.fill();
          if (on) {
            ctx.strokeStyle = rgba(p.accent, 0.35 * kOn);
            ctx.lineWidth = ss * 0.18;
            ctx.beginPath();
            ctx.arc(dx, dyc, ss * (0.5 + 0.35 * kOn), 0, TAU);
            ctx.stroke();
          }
          ctx.font = INTER(on ? 650 : 500, ss);
          ctx.fillStyle = on ? ink : done ? rgba(ink, 0.7) : rgba(ink, 0.45);
          ctx.fillText(steps[i], head.x + ss * 1.6, sy + dy);
          sy += ss * 2.1;
        }
      } else {
        // vertical: uma linha centralizada acima do celular
        const t1 = ease.outExpo(seg(t, 0.25, 1.3));
        let fs = m * 0.085;
        ctx.font = INTER(800, fs);
        const w1 = first ? ctx.measureText(first).width - fs * 0.035 * first.length + fs * 0.28 : 0;
        ctx.font = SERIF(fs * 1.22);
        const w2 = ctx.measureText(last).width;
        const sc = Math.min(1, head.w / (w1 + w2));
        fs *= sc;
        const x0 = w / 2 - ((w1 + w2) * sc) / 2;
        const y = head.y + fs * 0.35 + (1 - t1) * fs * 0.8;
        ctx.globalAlpha = clamp(seg(t, 0.25, 0.8));
        ctx.font = INTER(800, fs);
        ctx.letterSpacing = `${-fs * 0.035}px`;
        ctx.fillStyle = ink;
        if (first) ctx.fillText(first, x0, y);
        ctx.letterSpacing = '0px';
        ctx.font = SERIF(fs * 1.22);
        ctx.fillStyle = p.accent;
        ctx.fillText(last, x0 + w1 * sc, y);
      }
      ctx.restore();
    }

    // ---------- celular ----------
    const pin = spring(seg(t, 0, 1.1), 0.12);
    const ps = k * (0.94 + 0.06 * pin) * (1 - 0.03 * out);
    const py = cy + (1 - pin) * h * 0.12 + out * h * 0.05;
    const pa = clamp(seg(t, 0, 0.3));
    ctx.save();
    ctx.globalAlpha = pa;
    ctx.translate(cx, py);
    ctx.scale(ps, ps);
    ctx.translate(-PW / 2, -PH / 2);
    const sp = state.shPad;
    ctx.drawImage(state.shadow, -sp, -sp, PW + sp * 2, PH + sp * 2);
    // corpo
    ctx.fillStyle = '#17191c';
    ctx.beginPath();
    ctx.roundRect(0, 0, PW, PH, 62);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, PW - 3, PH - 3, 60.5);
    ctx.stroke();
    ctx.translate((PW - SW) / 2, (PH - SH) / 2);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, SW, SH, 50);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SW, SH);

    // barra de status
    ctx.fillStyle = ink;
    ctx.font = INTER(600, 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('9:41', 62, 31);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(SW / 2 - 60, 14, 120, 34, 17);
    ctx.fill();
    ctx.fillStyle = ink;
    for (let i = 0; i < 4; i++) ctx.fillRect(288 + i * 5.5, 35 - (i + 1) * 3, 3.6, (i + 1) * 3);
    ctx.strokeStyle = rgba(ink, 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(318, 25, 25, 12, 3.5);
    ctx.stroke();
    ctx.fillRect(320.5, 27.5, 17, 7);
    ctx.fillRect(344.5, 29, 1.8, 4);

    const s1Out = ease.inOutCubic(seg(t, 3.3, 3.65)); // tela 1 sai
    const appr = t >= 3.3;

    // ---------- tela 1: valor + QR ----------
    if (s1Out < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - s1Out;
      ctx.translate(0, -s1Out * 20);
      const e = (a) => ease.outExpo(seg(t, a, a + 0.9));
      const o = (a) => clamp(seg(t, a, a + 0.3));
      // cabeçalho
      ctx.globalAlpha = pa * (1 - s1Out) * o(0.45);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(34, 76);
      ctx.lineTo(26, 84);
      ctx.lineTo(34, 92);
      ctx.stroke();
      ctx.font = INTER(650, 17);
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.fillText('Pagar com Pix', SW / 2 + 10, 84);
      diamond(ctx, SW / 2 - 64, 84, 15, p.accent, '#ffffff');
      // recebedor
      const ry = 128 + (1 - e(0.55)) * 16;
      ctx.globalAlpha = pa * (1 - s1Out) * o(0.55);
      ctx.fillStyle = rgba(p.accent, 0.12);
      ctx.beginPath();
      ctx.arc(SW / 2, ry + 12, 24, 0, TAU);
      ctx.fill();
      const ini = p.merchant.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
      ctx.fillStyle = p.accent;
      ctx.font = INTER(750, 16);
      ctx.fillText(ini, SW / 2, ry + 13);
      ctx.fillStyle = ink;
      fitFont(ctx, p.merchant, SW - 60, 17, (z) => INTER(650, z));
      ctx.fillText(p.merchant, SW / 2, ry + 56);
      ctx.fillStyle = gray;
      ctx.font = INTER(500, 13);
      ctx.fillText('CNPJ 12.345.678/0001-90', SW / 2, ry + 77);
      // valor
      ctx.globalAlpha = pa * (1 - s1Out) * o(0.65);
      const vy = 236 + (1 - e(0.65)) * 16;
      ctx.font = INTER(500, 14);
      ctx.fillStyle = gray;
      ctx.fillText('Valor a pagar', SW / 2, vy);
      const cnt = ease.outExpo(seg(t, 0.7, 2.0));
      ctx.font = INTER(800, 40);
      ctx.letterSpacing = '-1.2px';
      ctx.fillStyle = ink;
      fitFont(ctx, money(value), SW - 40, 40, (z) => INTER(800, z));
      ctx.fillText(money(Math.round(value * cnt * 100) / 100), SW / 2, vy + 38);
      ctx.letterSpacing = '0px';

      // cartão do QR
      const qIn = spring(seg(t, 0.8, 1.6), 0.15);
      const QS = 256;
      const qx = (SW - QS) / 2;
      const qy = 342;
      ctx.globalAlpha = pa * (1 - s1Out) * o(0.8);
      ctx.save();
      ctx.translate(SW / 2, qy + QS / 2);
      ctx.scale(0.9 + 0.1 * qIn, 0.9 + 0.1 * qIn);
      ctx.translate(-SW / 2, -(qy + QS / 2));
      ctx.fillStyle = '#f4f6f5';
      ctx.beginPath();
      ctx.roundRect(qx - 18, qy - 18, QS + 36, QS + 36, 22);
      ctx.fill();
      const cell = QS / QN;
      // módulos em stagger diagonal
      ctx.fillStyle = ink;
      ctx.beginPath();
      for (const [x, y, rr] of state.mods) {
        const a = 0.95 + ((x + y) / (2 * QN)) * 0.8 + rr * 0.12;
        const kk = ease.outBack(seg(t, a, a + 0.3));
        if (kk <= 0) continue;
        const sz = cell * 1.04 * Math.min(kk, 1.1);
        ctx.rect(qx + (x + 0.5) * cell - sz / 2, qy + (y + 0.5) * cell - sz / 2, sz, sz);
      }
      ctx.fill();
      // padrões de posição
      const fk = spring(seg(t, 0.9, 1.5), 0.25);
      if (fk > 0) {
        for (const [fx, fy] of [[0, 0], [QN - 7, 0], [0, QN - 7]]) {
          const x0 = qx + fx * cell, y0 = qy + fy * cell;
          ctx.save();
          ctx.translate(x0 + 3.5 * cell, y0 + 3.5 * cell);
          ctx.scale(fk, fk);
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.roundRect(-3.5 * cell, -3.5 * cell, 7 * cell, 7 * cell, cell * 1.6);
          ctx.roundRect(-2.5 * cell, -2.5 * cell, 5 * cell, 5 * cell, cell * 1.0);
          ctx.fill('evenodd');
          ctx.beginPath();
          ctx.roundRect(-1.5 * cell, -1.5 * cell, 3 * cell, 3 * cell, cell * 0.7);
          ctx.fill();
          ctx.restore();
        }
      }
      // ícone no miolo
      const ik = spring(seg(t, 1.7, 2.3), 0.3);
      if (ik > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(qx + QS / 2 - 22 * ik, qy + QS / 2 - 22 * ik, 44 * ik, 44 * ik, 10 * ik);
        ctx.fill();
        diamond(ctx, qx + QS / 2, qy + QS / 2, 30 * ik, p.accent, '#ffffff');
      }
      // cantoneiras + linha de leitura
      const bIn = spring(seg(t, 1.9, 2.5), 0.25);
      const scanA = seg(t, 2.1, 3.25);
      const caught = clamp(seg(t, 3.1, 3.25));
      if (bIn > 0) {
        const gap = lerp(34, 10, bIn);
        const L = 30;
        ctx.strokeStyle = caught > 0 ? p.accent : rgba(p.accent, 0.95);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        const X0 = qx - gap, Y0 = qy - gap, X1 = qx + QS + gap, Y1 = qy + QS + gap;
        ctx.globalAlpha = pa * (1 - s1Out) * clamp(bIn * 2);
        ctx.beginPath();
        ctx.moveTo(X0, Y0 + L); ctx.lineTo(X0, Y0); ctx.lineTo(X0 + L, Y0);
        ctx.moveTo(X1 - L, Y0); ctx.lineTo(X1, Y0); ctx.lineTo(X1, Y0 + L);
        ctx.moveTo(X1, Y1 - L); ctx.lineTo(X1, Y1); ctx.lineTo(X1 - L, Y1);
        ctx.moveTo(X0 + L, Y1); ctx.lineTo(X0, Y1); ctx.lineTo(X0, Y1 - L);
        ctx.stroke();
      }
      if (scanA > 0 && scanA < 1) {
        // desce e sobe
        const u = scanA < 0.55 ? ease.inOutSine(scanA / 0.55) : 1 - ease.inOutSine((scanA - 0.55) / 0.45);
        const dir = scanA < 0.55 ? -1 : 1;
        const ly = qy - 6 + (QS + 12) * u;
        const fade = Math.min(1, scanA * 8, (1 - scanA) * 8);
        ctx.globalAlpha = pa * (1 - s1Out) * fade;
        const tr = 70;
        const gr = ctx.createLinearGradient(0, ly, 0, ly + dir * tr);
        gr.addColorStop(0, rgba(p.accent, 0.28));
        gr.addColorStop(1, rgba(p.accent, 0));
        ctx.fillStyle = gr;
        const yA = Math.max(qy - 10, Math.min(ly, ly + dir * tr));
        const yB = Math.min(qy + QS + 10, Math.max(ly, ly + dir * tr));
        ctx.fillRect(qx - 10, yA, QS + 20, Math.max(0, yB - yA));
        ctx.fillStyle = rgba(p.accent, 0.25);
        ctx.fillRect(qx - 14, ly - 4, QS + 28, 8);
        ctx.fillStyle = p.accent;
        ctx.fillRect(qx - 14, ly - 1.25, QS + 28, 2.5);
      }
      if (caught > 0) {
        ctx.globalAlpha = pa * (1 - s1Out) * Math.sin(Math.PI * caught) * 0.5;
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.roundRect(qx - 18, qy - 18, QS + 36, QS + 36, 22);
        ctx.fill();
      }
      ctx.restore();

      // copia e cola + validade
      ctx.globalAlpha = pa * (1 - s1Out) * o(1.3);
      const cy2 = 650 + (1 - e(1.3)) * 14;
      ctx.strokeStyle = rgba(ink, 0.14);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(36, cy2, SW - 72, 50, 25);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = MONO(500, 12.5);
      ctx.fillStyle = gray;
      ctx.fillText('00020126…6304A1F3', 58, cy2 + 25);
      ctx.textAlign = 'right';
      ctx.font = INTER(650, 14);
      ctx.fillStyle = p.accent;
      ctx.fillText('Copiar código', SW - 58, cy2 + 25);
      ctx.textAlign = 'center';
      ctx.globalAlpha = pa * (1 - s1Out) * o(1.45);
      const left = Math.max(0, 600 - Math.floor(t));
      ctx.font = INTER(500, 13);
      ctx.fillStyle = gray;
      ctx.fillText(`Expira em ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, SW / 2, cy2 + 84);
      ctx.restore();
    }

    // ---------- processando → aprovado → comprovante ----------
    if (appr) {
      const mv = ease.inOutCubic(seg(t, 5.2, 5.95)); // grupo do check sobe
      const ccy = lerp(352, 168, mv);
      const csc = lerp(1, 0.66, mv);
      const R = 46 * csc;
      ctx.globalAlpha = pa;
      // spinner
      const spin = clamp(seg(t, 3.45, 3.7)) * (1 - clamp(seg(t, 4.0, 4.15)));
      if (spin > 0) {
        ctx.globalAlpha = pa * spin;
        ctx.strokeStyle = rgba(ink, 0.08);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(SW / 2, ccy, R, 0, TAU);
        ctx.stroke();
        const a0 = t * 7;
        ctx.strokeStyle = p.accent;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(SW / 2, ccy, R, a0, a0 + 1.6 + 0.6 * Math.sin(t * 6));
        ctx.stroke();
        ctx.font = INTER(550, 16);
        ctx.fillStyle = gray;
        ctx.textAlign = 'center';
        ctx.fillText('Processando pagamento…', SW / 2, ccy + R + 44);
      }
      // aprovado
      const ck = spring(seg(t, 4.0, 4.7), 0.3);
      if (ck > 0) {
        ctx.globalAlpha = pa;
        // ondas
        for (let i = 0; i < 2; i++) {
          const rp = seg(t, 4.05 + i * 0.18, 5.0 + i * 0.18);
          if (rp <= 0 || rp >= 1) continue;
          ctx.strokeStyle = rgba(p.accent, 0.4 * (1 - rp));
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(SW / 2, ccy, R + ease.outCubic(rp) * 70, 0, TAU);
          ctx.stroke();
        }
        ctx.fillStyle = rgba(p.accent, 0.12);
        ctx.beginPath();
        ctx.arc(SW / 2, ccy, (R + 14 * csc) * ck, 0, TAU);
        ctx.fill();
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(SW / 2, ccy, R * ck, 0, TAU);
        ctx.fill();
        // check desenhado
        const d = ease.inOutCubic(seg(t, 4.18, 4.6));
        if (d > 0) {
          const P0 = [-18, 1], P1 = [-5, 14], P2 = [20, -13];
          const l1 = Math.hypot(13, 13), l2 = Math.hypot(25, 27);
          const L = (l1 + l2) * d;
          ctx.save();
          ctx.translate(SW / 2, ccy);
          ctx.scale(csc, csc);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(...P0);
          if (L <= l1) ctx.lineTo(P0[0] + (P1[0] - P0[0]) * (L / l1), P0[1] + (P1[1] - P0[1]) * (L / l1));
          else {
            ctx.lineTo(...P1);
            const f = (L - l1) / l2;
            ctx.lineTo(P1[0] + (P2[0] - P1[0]) * f, P1[1] + (P2[1] - P1[1]) * f);
          }
          ctx.stroke();
          ctx.restore();
        }
        // textos
        ctx.textAlign = 'center';
        const tA = ease.outExpo(seg(t, 4.3, 5.2));
        ctx.globalAlpha = pa * clamp(seg(t, 4.3, 4.6));
        const ty = ccy + lerp(98, 66, mv) + (1 - tA) * 18;
        ctx.font = INTER(750, lerp(25, 21, mv));
        ctx.fillStyle = ink;
        ctx.fillText('Pagamento aprovado', SW / 2, ty);
        const aA = ease.outExpo(seg(t, 4.42, 5.3));
        ctx.globalAlpha = pa * clamp(seg(t, 4.42, 4.72));
        ctx.font = INTER(800, lerp(36, 30, mv));
        ctx.letterSpacing = '-1px';
        ctx.fillText(money(value), SW / 2, ty + lerp(46, 38, mv) + (1 - aA) * 14);
        ctx.letterSpacing = '0px';
        ctx.globalAlpha = pa * clamp(seg(t, 4.55, 4.85)) * (1 - mv);
        ctx.font = INTER(500, 15);
        ctx.fillStyle = gray;
        ctx.fillText(`para ${p.merchant}`, SW / 2, ty + 82);
      }

      // comprovante
      const rIn = ease.outExpo(seg(t, 5.55, 6.5));
      if (rIn > 0) {
        const top = 318 + (1 - rIn) * 40;
        ctx.globalAlpha = pa * clamp(seg(t, 5.55, 5.85));
        ctx.fillStyle = '#f4f6f5';
        ctx.beginPath();
        ctx.roundRect(24, top, SW - 48, 324, 20);
        ctx.fill();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = INTER(700, 13);
        ctx.fillStyle = gray;
        ctx.letterSpacing = '1.2px';
        ctx.fillText('COMPROVANTE', 44, top + 30);
        ctx.letterSpacing = '0px';
        diamond(ctx, SW - 52, top + 30, 15, p.accent, '#f4f6f5');
        const rows = [
          ['Valor', money(value)],
          ['Para', p.merchant],
          ['Instituição', 'Banco Exemplo S.A.'],
          ['Data', p.date],
          ['ID da transação', state.id],
        ];
        for (let i = 0; i < rows.length; i++) {
          const a = 5.75 + i * 0.09;
          const op = clamp(seg(t, a, a + 0.3));
          if (op <= 0) continue;
          const y = top + 74 + i * 50 + (1 - ease.outExpo(seg(t, a, a + 0.9))) * 12;
          ctx.globalAlpha = pa * op;
          if (i) {
            ctx.fillStyle = rgba(ink, 0.08);
            ctx.fillRect(44, y - 25, SW - 88, 1);
          }
          ctx.textAlign = 'left';
          ctx.font = INTER(500, 14);
          ctx.fillStyle = gray;
          ctx.fillText(rows[i][0], 44, y);
          ctx.textAlign = 'right';
          ctx.fillStyle = ink;
          const isId = i === rows.length - 1;
          const font = isId ? (z) => MONO(500, z) : (z) => INTER(650, z);
          let val = rows[i][1];
          ctx.font = font(isId ? 12 : 15);
          const maxW = SW - 88 - (isId ? 118 : 96);
          if (ctx.measureText(val).width > maxW) {
            if (isId) {
              while (val.length > 6 && ctx.measureText(`${val.slice(0, Math.ceil(val.length / 2))}…${val.slice(-6)}`).width > maxW) val = val.slice(0, -1);
              val = `${val.slice(0, Math.ceil(val.length / 2))}…${rows[i][1].slice(-6)}`;
            } else fitFont(ctx, val, maxW, 15, font);
          }
          ctx.fillText(val, SW - 44, y);
        }
        // botão
        const bA = 6.3;
        const bk = spring(seg(t, bA, bA + 0.7), 0.2);
        if (bk > 0) {
          ctx.globalAlpha = pa * clamp(seg(t, bA, bA + 0.25));
          const by = 704 + (1 - bk) * 20;
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          ctx.roundRect(24, by, SW - 48, 54, 27);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.font = INTER(650, 16);
          ctx.fillText('Compartilhar comprovante', SW / 2, by + 27);
        }
      }
    }
    ctx.globalAlpha = pa;
    // indicador de home
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.roundRect(SW / 2 - 67, SH - 13, 134, 5, 2.5);
    ctx.fill();
    ctx.restore(); // clip da tela
    ctx.restore();
    if (out > 0) {
      ctx.fillStyle = rgba(p.bg, out);
      ctx.fillRect(0, 0, w, h);
    }
  },
};
