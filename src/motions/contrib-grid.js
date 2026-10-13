import { clamp, seg, ease, rgba, rng, hexToRgb } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

const fmtInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKS = 53;

const INTER = (wt) => (s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (s) => `500 ${s}px 'JetBrains Mono', ui-monospace, monospace`;

function fitFont(ctx, text, maxW, size, font) {
  ctx.font = font(size);
  const tw = ctx.measureText(text).width;
  if (tw > maxW) {
    size *= maxW / tw;
    ctx.font = font(size);
  }
  return size;
}

// mistura duas cores hex → [r,g,b]
const mixRGB = (A, B, k) => A.map((v, i) => Math.round(v + (B[i] - v) * k));

export default {
  id: 'contrib-grid',
  title: 'Contribution Grid',
  description: 'A GitHub-style calendar grid filling up in waves of intensity, with a legend and a counting total.',
  category: 'dados',
  tags: ['data', 'ui', 'pattern'],
  duration: 7,
  poster: 4.2,

  params: {
    title: { type: 'text', label: 'Title ({n} = total)', default: '{n} contributions in the last year' },
    activity: { type: 'range', label: 'Activity', min: 0.1, max: 1, step: 0.01, default: 0.62 },
    weekends: { type: 'boolean', label: 'Quieter weekends', default: true },
    accent: { type: 'color', label: 'Accent', default: '#39d353' },
    ink: { type: 'color', label: 'Text', default: '#e6edf3' },
    bg: { type: 'color', label: 'Background', default: '#0d1117' },
    startMonth: { type: 'range', label: 'Start month', min: 1, max: 12, step: 1, default: 11 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 12 },
  },

  setup({ p }) {
    const noise = createNoise(p.seed);
    const r = rng(p.seed * 13 + 1);
    const level = new Uint8Array(WEEKS * 7);
    const count = new Uint16Array(WEEKS * 7);
    let total = 0;
    const act = clamp(p.activity, 0.05, 1);
    for (let wk = 0; wk < WEEKS; wk++) {
      for (let d = 0; d < 7; d++) {
        const i = wk * 7 + d;
        // ritmo: temporadas (noise lento) + tendência de crescimento + sprints
        let v = 0.55 * noise.noise2(wk * 0.09, 3.1) + 0.35 * noise.noise2(wk * 0.35, d * 0.7 + 9) + (wk / WEEKS) * 0.35;
        v += r() * 0.55 - 0.1;
        if (p.weekends && (d === 0 || d === 6)) v -= 0.55;
        v = v + (act - 0.5) * 1.4;
        let lv = v < 0.15 ? 0 : v < 0.45 ? 1 : v < 0.75 ? 2 : v < 1.0 ? 3 : 4;
        if (wk === WEEKS - 1 && d > 3) lv = 0; // semana corrente incompleta
        level[i] = lv;
        const c = lv === 0 ? 0 : Math.round([0, 1.5, 4, 7, 11][lv] + r() * [0, 1.5, 2.5, 3, 6][lv]);
        count[i] = c;
        total += c;
      }
    }
    // estatísticas: maior sequência de dias seguidos e melhor dia
    let streak = 0, best = 0, cur = 0, active = 0;
    for (let i = 0; i < count.length; i++) {
      if (count[i] > 0) {
        cur++;
        active++;
        streak = Math.max(streak, cur);
      } else cur = 0;
      best = Math.max(best, count[i]);
    }
    return { level, count, total, streak, best, active };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const ar = w / h;
    const { level, total, streak, best, active } = state;
    const blocks = ar > 1.4 ? 1 : ar > 0.7 ? 2 : 3; // 16:9: 1 faixa; 1:1/4:5: 2; 9:16: 3
    const perBlock = Math.ceil(WEEKS / blocks);

    const OUT = duration - 1.0;
    const outAll = ease.inCubic(seg(t, OUT + 0.4, duration - 0.05));

    // ---------- tempos das ondas ----------
    const FILL0 = 0.6;
    const FILL1 = 3.0; // a onda de preenchimento atravessa a grade
    const cellIndexT = (wk, d) => (wk + d * 0.6) / (WEEKS + 3.6); // diagonal

    // ---------- layout ----------
    const padX = w * (blocks === 1 ? 0.07 : 0.08);
    const labW = m * 0.055;
    const gridW = w - padX * 2 - labW;
    const cellByW = gridW / perBlock;
    const titleS = m * (ar < 0.7 ? 0.058 : 0.05);
    const headH = titleS * 2.2;
    const monthH = m * 0.04;
    const legendH = m * 0.07;
    const statsH = m * (ar < 0.7 ? 0.17 : 0.15);
    const blockGap = m * 0.05;
    const availH = h * 0.84 - headH - legendH - statsH - blocks * monthH - (blocks - 1) * blockGap;
    const cell = Math.min(cellByW, availH / (blocks * 7));
    const gap = cell * 0.18;
    const sq = cell - gap;
    const gridWReal = cell * perBlock - gap;
    const totalH = headH + blocks * (monthH + cell * 7) + (blocks - 1) * blockGap + legendH + statsH;
    const gx = (w - (gridWReal + labW)) / 2 + labW;
    let y = (h - totalH) / 2;

    // ---------- título com total contando ----------
    const fillK = ease.inOutCubic(seg(t, FILL0, FILL1 + 0.4));
    const shown = Math.round(total * fillK);
    const tIn = ease.outExpo(seg(t, 0.1, 1.0)) * (1 - outAll);
    {
      const parts = String(p.title || '{n}').split('{n}');
      const num = fmtInt.format(shown);
      const numFull = fmtInt.format(total);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const full = parts.join(numFull);
      const fs = fitFont(ctx, full, gridWReal + labW, titleS, INTER(700));
      ctx.globalAlpha = tIn;
      let x = gx - labW;
      const by = y + fs + (1 - tIn) * fs * 0.6;
      ctx.letterSpacing = `${-fs * 0.015}px`;
      parts.forEach((s, i) => {
        ctx.font = INTER(600)(fs);
        ctx.fillStyle = rgba(p.ink, 0.75);
        ctx.fillText(s, x, by);
        x += ctx.measureText(s).width;
        if (i < parts.length - 1) {
          ctx.font = INTER(800)(fs);
          ctx.fillStyle = p.ink;
          ctx.fillText(num, x, by);
          x += ctx.measureText(num).width;
        }
      });
      ctx.letterSpacing = '0px';
      ctx.globalAlpha = 1;
    }
    y += headH;

    // ---------- cores dos níveis ----------
    const BG = hexToRgb(p.bg);
    const AC = hexToRgb(p.accent);
    const empty = mixRGB(BG, hexToRgb(p.ink), 0.07);
    const lv = [empty, mixRGB(BG, AC, 0.3), mixRGB(BG, AC, 0.52), mixRGB(BG, AC, 0.76), AC];
    // nível contínuo 0..5 (5 = brilho da onda) → cor quantizada em 4 passos por nível p/ agrupar
    const STEPS = 4;
    const buckets = new Map();
    const colorKey = (x) => Math.round(clamp(x, 0, 4.99) * STEPS);
    const colorOf = (k) => {
      const x = k / STEPS;
      const i = Math.min(3, Math.floor(x));
      const f = x - i;
      const c = i >= 4 ? lv[4] : mixRGB(lv[i], lv[i + 1], f);
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    };

    // onda de intensidade contínua depois do preenchimento (pulso diagonal que passa a cada ~1,6 s)
    const pulseOn = clamp(seg(t, FILL1, FILL1 + 0.5)) * (1 - clamp(seg(t, OUT, OUT + 0.3)));

    for (let b = 0; b < blocks; b++) {
      const w0 = b * perBlock;
      const w1 = Math.min(WEEKS, w0 + perBlock);
      // meses
      ctx.font = MONO(Math.min(m * 0.024, cell * 0.8));
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      let lastM = -1;
      for (let wk = w0; wk < w1; wk++) {
        const mo = (Math.floor((wk * 12) / WEEKS) + Math.round(p.startMonth) - 1) % 12;
        if (mo !== lastM && (wk - w0 < perBlock - 2)) {
          const e = ease.outExpo(seg(t, FILL0 + cellIndexT(wk, 0) * (FILL1 - FILL0) - 0.2, FILL0 + cellIndexT(wk, 0) * (FILL1 - FILL0) + 0.5)) * (1 - outAll);
          ctx.fillStyle = rgba(p.ink, 0.5 * e);
          ctx.fillText(MONTHS[mo], gx + (wk - w0) * cell, y + monthH * 0.7);
          lastM = mo;
        }
      }
      const gy = y + monthH;
      // dias da semana
      const dIn = ease.outExpo(seg(t, 0.4, 1.2)) * (1 - outAll);
      ctx.font = MONO(Math.min(m * 0.022, cell * 0.7));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(p.ink, 0.45 * dIn);
      for (const d of [1, 3, 5]) ctx.fillText(DAYS[d], gx - cell * 0.4, gy + cell * d + sq / 2);

      // células, agrupadas por cor
      buckets.clear();
      for (let wk = w0; wk < w1; wk++) {
        for (let d = 0; d < 7; d++) {
          const i = wk * 7 + d;
          const ct = cellIndexT(wk, d);
          const a = FILL0 + ct * (FILL1 - FILL0);
          const appear = seg(t, a - 0.25, a + 0.05); // célula vazia surge
          if (appear <= 0) continue;
          const fill = ease.outCubic(seg(t, a, a + 0.55)); // sobe até o nível
          let x = level[i] * fill;
          // onda: frente que sobe 1 nível quando passa
          if (pulseOn > 0 && level[i] > 0) {
            const ph = ((t - FILL1) * 0.62 - ct) % 1;
            const pp = ph < 0 ? ph + 1 : ph;
            const bump = Math.max(0, 1 - Math.abs(pp - 0.5) * 9);
            x += bump * pulseOn * 1.2;
          }
          // saída: a onda apaga na mesma direção
          const out = ease.inCubic(seg(t, OUT + ct * 0.5, OUT + ct * 0.5 + 0.35));
          x *= 1 - out;
          const vis = appear * (1 - out);
          if (vis <= 0.001) continue;
          const key = colorKey(x) * 8 + Math.round(vis * 7);
          let arr = buckets.get(key);
          if (!arr) buckets.set(key, (arr = []));
          arr.push(gx + (wk - w0) * cell, gy + d * cell, vis);
        }
      }
      const rad = sq * 0.22;
      for (const [key, arr] of buckets) {
        ctx.fillStyle = colorOf(key >> 3);
        ctx.globalAlpha = (key & 7) / 7;
        ctx.beginPath();
        for (let j = 0; j < arr.length; j += 3) {
          const s = sq * (0.6 + 0.4 * arr[j + 2]);
          const o = (sq - s) / 2;
          ctx.roundRect(arr[j] + o, arr[j + 1] + o, s, s, rad);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      y = gy + cell * 7 + blockGap;
    }
    y -= blockGap;

    // ---------- legenda ----------
    const lgIn = ease.outExpo(seg(t, FILL1 - 0.4, FILL1 + 0.6)) * (1 - outAll);
    if (lgIn > 0.001) {
      const ls = Math.min(m * 0.022, cell * 0.8);
      const lsq = Math.max(sq * 0.9, ls * 1.1);
      const ly = y + legendH * 0.55;
      const right = gx + gridWReal;
      ctx.globalAlpha = lgIn;
      ctx.font = MONO(ls);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.fillText('more', right, ly);
      let x = right - ctx.measureText('more').width - ls * 0.7 - lsq;
      for (let k = 4; k >= 0; k--) {
        ctx.fillStyle = `rgb(${lv[k][0]},${lv[k][1]},${lv[k][2]})`;
        ctx.beginPath();
        ctx.roundRect(x, ly - lsq / 2, lsq, lsq, lsq * 0.22);
        ctx.fill();
        x -= lsq + lsq * 0.25;
      }
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.fillText('less', x + lsq - ls * 0.2, ly);
      // dias com atividade (esquerda)
      ctx.textAlign = 'left';
      ctx.fillStyle = rgba(p.ink, 0.5);
      if (right - (gx - labW) > m * 0.7) ctx.fillText('Contribution calendar', gx - labW, ly);
      ctx.globalAlpha = 1;
    }
    y += legendH;

    // ---------- estatísticas ----------
    const stats = [
      [active, 'active days'],
      [streak, 'day streak (record)'],
      [best, 'on the best day'],
    ];
    const sx0 = gx - labW;
    const sw = (gridWReal + labW) / 3;
    stats.forEach(([v, lab], k) => {
      const a = FILL1 - 0.2 + k * 0.15;
      const e = ease.outExpo(seg(t, a, a + 0.9)) * (1 - outAll);
      if (e <= 0.001) return;
      const cnt = ease.outExpo(seg(t, a, a + 1.6));
      const x = sx0 + sw * k;
      const ns = statsH * 0.46;
      ctx.globalAlpha = e;
      ctx.fillStyle = rgba(p.ink, 0.12);
      ctx.fillRect(x, y + statsH * 0.12, Math.max(1, m * 0.0015), statsH * 0.76);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = INTER(800)(ns);
      ctx.letterSpacing = `${-ns * 0.03}px`;
      ctx.fillStyle = k === 1 ? p.accent : p.ink;
      ctx.fillText(fmtInt.format(Math.round(v * cnt)), x + m * 0.02, y + statsH * 0.12 + ns * 0.95 + (1 - e) * ns * 0.3);
      ctx.letterSpacing = '0px';
      fitFont(ctx, lab, sw - m * 0.03, statsH * 0.15, INTER(500));
      ctx.fillStyle = rgba(p.ink, 0.55);
      ctx.fillText(lab, x + m * 0.02, y + statsH * 0.12 + ns * 0.95 + statsH * 0.26);
      ctx.globalAlpha = 1;
    });
  },
};
