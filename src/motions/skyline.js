import { TAU, rng, fract, clamp, hexToRgb } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Cidade à noite em três planos (fundo enevoado, meio com torres, frente), pré-renderizados no setup
// com as janelas fixas já pintadas. Por frame: estrelas cintilando, nuvens finas passando,
// janelas que acendem/apagam (cada uma num ciclo inteiro do loop), luzes de obstrução piscando,
// trânsito na avenida da orla, um avião cruzando e o reflexo ondulando na água (faixas deslocadas).

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function canvas(w, h, px) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * px));
  c.height = Math.max(1, Math.ceil(h * px));
  const g = c.getContext('2d');
  g.scale(px, px);
  return [c, g];
}

function glowSprite(color, S = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  return c;
}

export default {
  id: 'skyline',
  title: 'Skyline Noturno',
  description: 'Silhueta de cidade à noite com janelas acendendo, trânsito na orla, luzes piscando e reflexo na água.',
  category: 'fundos',
  tags: ['fundo', 'loop'],
  duration: 24,
  poster: 10,

  params: {
    sky: { type: 'color', label: 'Céu', default: '#0a0d22' },
    glow: { type: 'color', label: 'Brilho do horizonte', default: '#4a3360' },
    city: { type: 'color', label: 'Prédios', default: '#0c0e1c' },
    windows: { type: 'color', label: 'Janelas', default: '#ffc874' },
    lights: { type: 'range', label: 'Janelas acesas', min: 0.1, max: 1, step: 0.01, default: 0.5 },
    traffic: { type: 'range', label: 'Trânsito', min: 0, max: 1, step: 0.01, default: 0.6 },
    water: { type: 'boolean', label: 'Água com reflexo', default: true },
    stars: { type: 'boolean', label: 'Estrelas', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 11 },
  },

  setup({ w, h, p, px }) {
    const rand = rng(p.seed * 17 + 5);
    const nz = createNoise(p.seed);
    const m = Math.min(w, h);
    const tall = h > w ? Math.min(1.45, h / w) : 1; // vertical: prédios mais altos
    const yB = Math.round(h * (p.water ? (w > h ? 0.72 : h > w ? 0.68 : 0.7) : 0.86)); // base dos prédios
    const rh = m * 0.03; // avenida
    const yW = yB + rh; // linha d'água

    const SKY = hexToRgb(p.sky);
    const GLOW = hexToRgb(p.glow);
    const CITY = hexToRgb(p.city);
    const WIN = hexToRgb(p.windows);
    const COOL = mixc(WIN, [150, 190, 255], 0.7);

    // ---- céu
    const [sky, sg] = canvas(w, yW, px);
    const gr = sg.createLinearGradient(0, 0, 0, yB);
    gr.addColorStop(0, css(SKY));
    gr.addColorStop(0.55, css(mixc(SKY, GLOW, 0.35)));
    gr.addColorStop(0.85, css(mixc(SKY, GLOW, 0.8)));
    gr.addColorStop(1, css(mixc(GLOW, WIN, 0.12)));
    sg.fillStyle = gr;
    sg.fillRect(0, 0, w, yW);
    // lua
    const mx = w * (w > h ? 0.8 : 0.74);
    const my = h * (h > w ? 0.12 : 0.17);
    const mr = m * 0.032;
    const mg = sg.createRadialGradient(mx, my, mr, mx, my, mr * 7);
    mg.addColorStop(0, css(mixc(GLOW, [255, 255, 255], 0.5), 0.22));
    mg.addColorStop(1, css(mixc(GLOW, [255, 255, 255], 0.5), 0));
    sg.fillStyle = mg;
    sg.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
    sg.fillStyle = css(mixc([255, 248, 232], GLOW, 0.08));
    sg.beginPath();
    sg.arc(mx, my, mr, 0, TAU);
    sg.fill();
    sg.fillStyle = css(mixc([255, 248, 232], GLOW, 0.25), 0.35);
    for (const [ox, oy, r] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.1, -0.35, 0.1]]) {
      sg.beginPath();
      sg.arc(mx + ox * mr, my + oy * mr, r * mr, 0, TAU);
      sg.fill();
    }

    // estrelas em 3 grupos de cintilação
    const stars = [new Path2D(), new Path2D(), new Path2D()];
    const nS = Math.round((w * yB) / 3800);
    for (let i = 0; i < nS; i++) {
      const x = rand() * w;
      const y = Math.pow(rand(), 1.5) * yB * 0.75;
      const r = m * (0.0006 + Math.pow(rand(), 5) * 0.0018);
      if (Math.hypot(x - mx, y - my) < mr * 3) continue;
      stars[i % 3].moveTo(x + r, y);
      stars[i % 3].arc(x, y, r, 0, TAU);
    }

    // nuvens finas: faixa periódica em x (ruído num círculo), baixa resolução
    const CW = 384;
    const CH = 64;
    const [cloud, cg] = canvas(CW, CH, 1);
    const img = cg.createImageData(CW, CH);
    const CC = mixc(GLOW, [255, 255, 255], 0.25);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const a = (x / CW) * TAU;
        const n = nz.fbm3(Math.cos(a) * 2.2, Math.sin(a) * 2.2, (y / CH) * 1.4, 4);
        const band = Math.sin((y / CH) * Math.PI);
        const v = clamp((n * 0.5 + 0.5 - 0.48) * 3.2) * band * band;
        const k = (y * CW + x) * 4;
        img.data[k] = CC[0];
        img.data[k + 1] = CC[1];
        img.data[k + 2] = CC[2];
        img.data[k + 3] = v * 120;
      }
    }
    cg.putImageData(img, 0, 0);

    // ---- prédios
    const toggles = [[], []]; // janelas que mudam (meio, frente)
    const beacons = [];
    const layerDefs = [
      { col: mixc(CITY, GLOW, 0.42), hMin: 0.2, hMax: 0.52, wMin: 0.05, wMax: 0.11, mod: 0.62, lit: 0.35, tog: 0 },
      { col: mixc(CITY, GLOW, 0.17), hMin: 0.14, hMax: 0.44, wMin: 0.06, wMax: 0.13, mod: 0.8, lit: 0.55, tog: 0.12 },
      { col: CITY, hMin: 0.06, hMax: 0.26, wMin: 0.07, wMax: 0.15, mod: 1, lit: 0.6, tog: 0.14 },
    ];
    const [back, bg] = canvas(w, yW, px);
    const [front, fg] = canvas(w, yW, px);
    const cxD = w * 0.55;
    layerDefs.forEach((L, li) => {
      const g = li < 2 ? bg : fg;
      const sil = new Path2D();
      const wins = { warm: new Path2D(), dim: new Path2D(), cool: new Path2D(), off: new Path2D() };
      const pitch = m * 0.0105 * L.mod;
      const floorH = m * 0.0165 * L.mod;
      let x = -rand() * m * 0.05;
      let hero = 0;
      while (x < w + m * 0.02) {
        const bw = m * (L.wMin + rand() * (L.wMax - L.wMin));
        const env = 0.5 + 0.5 * Math.exp(-(((x + bw / 2 - cxD) / (Math.max(w, m * 1.2) * 0.32)) ** 2));
        let bh = m * tall * (L.hMin + Math.pow(rand(), 1.4) * (L.hMax - L.hMin)) * env;
        const isHero = li === 1 && hero < 3 && Math.abs(x + bw / 2 - cxD) < w * 0.3 && rand() < 0.4;
        if (isHero) {
          bh = m * tall * (0.5 + rand() * 0.12);
          hero++;
        }
        const top = yB - bh;
        sil.rect(x, top, bw, bh + 1);
        // coroamento
        const kind = rand();
        let tipY = top;
        let tipX = x + bw / 2;
        if (isHero || kind < 0.18) {
          // recuo + agulha
          const sw = bw * 0.6;
          const sh = bh * 0.08;
          sil.rect(x + (bw - sw) / 2, top - sh, sw, sh + 1);
          const sw2 = bw * 0.3;
          sil.rect(x + (bw - sw2) / 2, top - sh * 1.8, sw2, sh * 0.8 + 1);
          const ah = bh * (isHero ? 0.22 : 0.12);
          sil.moveTo(tipX - m * 0.0022, top - sh * 1.8);
          sil.lineTo(tipX, top - sh * 1.8 - ah);
          sil.lineTo(tipX + m * 0.0022, top - sh * 1.8);
          sil.closePath();
          tipY = top - sh * 1.8 - ah;
        } else if (kind < 0.3) {
          // telhado inclinado
          sil.moveTo(x, top + 1);
          sil.lineTo(x + bw, top + 1);
          sil.lineTo(x + bw, top - bw * 0.35);
          sil.closePath();
          tipX = x + bw * 0.95;
          tipY = top - bw * 0.33;
        } else if (kind < 0.5) {
          // casa de máquinas / caixa d'água
          const bx = x + bw * (0.15 + rand() * 0.4);
          const bww = bw * 0.3;
          sil.rect(bx, top - bw * 0.16, bww, bw * 0.16 + 1);
          tipX = bx + bww / 2;
          tipY = top - bw * 0.16;
          if (rand() < 0.5) {
            sil.rect(tipX - m * 0.0012, tipY - bh * 0.1, m * 0.0024, bh * 0.1 + 1);
            tipY -= bh * 0.1;
          }
        }
        if (li > 0 && (isHero || tipY < yB - m * tall * 0.3)) beacons.push({ x: tipX, y: tipY, ph: rand(), li });

        // janelas
        const cols = Math.floor((bw - pitch * 0.9) / pitch);
        const rows = Math.floor((bh - floorH * 1.2) / floorH);
        const x0 = x + (bw - cols * pitch) / 2 + pitch * 0.22;
        const lit = clamp(L.lit * p.lights * (0.4 + rand() * 1.2));
        const cool = rand() < 0.18;
        const ww = pitch * 0.56;
        const wh = floorH * (cool ? 0.62 : 0.5);
        for (let r = 0; r < rows; r++) {
          const fl = rand() < 0.15 ? 0 : rand() < 0.12 ? 2.2 : 1; // andar apagado / andar inteiro aceso
          const y = top + floorH * 0.9 + r * floorH;
          for (let c = 0; c < cols; c++) {
            const wx = x0 + c * pitch;
            const q = rand();
            if (q < lit * fl) {
              const pth = cool ? wins.cool : rand() < 0.25 ? wins.dim : wins.warm;
              pth.rect(wx, y, ww, wh);
            } else if (q < lit * fl + L.tog && li > 0) {
              const k = 1 + Math.floor(rand() * 3);
              toggles[li - 1].push({ x: wx, y, w: ww, h: wh, k, ph: rand(), duty: 0.35 + rand() * 0.45, cool });
              wins.off.rect(wx, y, ww, wh);
            } else wins.off.rect(wx, y, ww, wh);
          }
        }
        x += bw * (0.82 + rand() * 0.22);
      }
      g.fillStyle = css(L.col);
      g.fill(sil);
      const fade = 1 - li * 0.28;
      g.fillStyle = css(mixc(L.col, [255, 255, 255], 0.035));
      g.fill(wins.off);
      g.fillStyle = css(WIN, 0.92 * fade);
      g.fill(wins.warm);
      g.fillStyle = css(WIN, 0.5 * fade);
      g.fill(wins.dim);
      g.fillStyle = css(COOL, 0.6 * fade);
      g.fill(wins.cool);
      // névoa na base de cada plano
      g.save();
      g.globalCompositeOperation = 'source-atop';
      const hz = g.createLinearGradient(0, yB - m * 0.35, 0, yB);
      const hc = mixc(SKY, GLOW, 0.8);
      hz.addColorStop(0, css(hc, 0));
      hz.addColorStop(1, css(hc, li === 0 ? 0.75 : li === 1 ? 0.4 : 0.12));
      g.fillStyle = hz;
      g.fillRect(0, 0, w, yB);
      g.restore();
      if (li === 0) {
        // o plano de fundo ganha uma bruma por cima, sem alterar o meio
        bg.fillStyle = css(mixc(SKY, GLOW, 0.6), 0.25);
        bg.globalCompositeOperation = 'source-atop';
        bg.fillRect(0, 0, w, yB);
        bg.globalCompositeOperation = 'source-over';
      }
    });

    // avenida da orla + postes
    fg.fillStyle = css(mixc(CITY, [0, 0, 0], 0.3));
    fg.fillRect(-1, yB, w + 2, rh + 1);
    fg.fillStyle = css(mixc(CITY, GLOW, 0.25));
    fg.fillRect(-1, yB, w + 2, Math.max(1 / px, m * 0.0012));
    const lamp = glowSprite(css(WIN));
    const lampSp = m * 0.09;
    fg.globalCompositeOperation = 'lighter';
    for (let x = lampSp * 0.3; x < w; x += lampSp) {
      const ly = yB - m * 0.022;
      fg.globalAlpha = 0.5;
      fg.drawImage(lamp, x - m * 0.02, ly - m * 0.02, m * 0.04, m * 0.04);
      fg.globalAlpha = 1;
      fg.drawImage(lamp, x - m * 0.004, ly - m * 0.004, m * 0.008, m * 0.008);
    }
    fg.globalCompositeOperation = 'source-over';
    fg.strokeStyle = css(mixc(CITY, [0, 0, 0], 0.3));
    fg.lineWidth = m * 0.0015;
    fg.beginPath();
    for (let x = lampSp * 0.3; x < w; x += lampSp) {
      fg.moveTo(x, yB);
      fg.lineTo(x, yB - m * 0.02);
    }
    fg.stroke();

    // ---- reflexo (espelho no nível da avenida, achatado, escurecido e desfocado)
    let refl = null;
    const WH = h - yW;
    if (p.water && WH > 1) {
      const [rc, rg] = canvas(w, WH, px);
      const s = 0.9;
      // borrão vertical: várias cópias deslocadas (luz alongada na água)
      rg.filter = `blur(${m * 0.003 * px}px)`;
      const K = 6;
      for (let k = 0; k < K; k++) {
        rg.globalAlpha = k === 0 ? 1 : 0.75;
        rg.globalCompositeOperation = k === 0 ? 'source-over' : 'lighten';
        rg.setTransform(px, 0, 0, -s * px, 0, (s * yB + (yB - yW) + rh * 0.6 + k * m * 0.007) * px);
        rg.drawImage(sky, 0, 0, w, yW);
        rg.drawImage(back, 0, 0, w, yW);
        rg.drawImage(front, 0, 0, w, yW);
      }
      rg.globalAlpha = 1;
      rg.globalCompositeOperation = 'source-over';
      rg.filter = 'none';
      rg.setTransform(px, 0, 0, px, 0, 0);
      const WATER = mixc(SKY, CITY, 0.5);
      const dk = rg.createLinearGradient(0, 0, 0, WH);
      dk.addColorStop(0, css(WATER, 0.4));
      dk.addColorStop(1, css(WATER, 0.88));
      rg.fillStyle = dk;
      rg.fillRect(0, 0, w, WH);
      refl = { canvas: rc, water: css(WATER) };
    }

    // ---- trânsito: 2 faixas, carros com velocidade inteira por loop
    const cars = [];
    const lanes = [
      { y: yB + rh * 0.35, dir: 1, n: 3, tail: true },
      { y: yB + rh * 0.68, dir: -1, n: 4, tail: false },
    ];
    lanes.forEach((ln, i) => {
      const count = Math.round((w / m) * 9 * p.traffic);
      for (let c = 0; c < count; c++) cars.push({ lane: i, x0: (c + rand() * 0.7) / Math.max(1, count), s: 0.8 + rand() * 0.4 });
    });

    return {
      sky, back, front, stars, cloud, toggles, beacons, refl, cars, lanes, yB, yW, rh,
      head: glowSprite(css(mixc(WIN, [255, 255, 255], 0.6))),
      tail: glowSprite('#ff3b3b'),
      red: glowSprite('#ff4040'),
      WIN: css(WIN),
      COOL: css(COOL, 0.7),
      plane: { y: h * (h > w ? 0.09 : 0.12) },
    };
  },

  render(ctx, t, { w, h, p, px, progress: u, state: S }) {
    const m = Math.min(w, h);
    const { yB, yW } = S;

    ctx.drawImage(S.sky, 0, 0, w, yW);

    if (p.stars) {
      ctx.fillStyle = '#ffffff';
      for (let g = 0; g < 3; g++) {
        ctx.globalAlpha = 0.55 + 0.4 * Math.sin(TAU * (3 + g * 2) * u + g * 2.1);
        ctx.fill(S.stars[g]);
      }
      ctx.globalAlpha = 1;
    }

    // nuvens: duas faixas em velocidades inteiras
    const drawCloud = (y, hh, n, a) => {
      const cw = w * 1.4;
      const off = fract(u * n) * cw;
      ctx.globalAlpha = a;
      ctx.drawImage(S.cloud, -off, y, cw + 1, hh);
      ctx.drawImage(S.cloud, cw - off, y, cw, hh);
    };
    drawCloud(yB * 0.18, m * 0.12, 1, 0.55);
    drawCloud(yB * 0.42, m * 0.08, 2, 0.4);
    ctx.globalAlpha = 1;

    // avião
    const ax = w * (1.08 - 1.16 * u);
    const ay = S.plane.y + u * m * 0.04;
    const blink = fract(u * 24) < 0.12;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(ax - m * 0.0012, ay - m * 0.0012, m * 0.0024, m * 0.0024);
    if (blink) {
      ctx.globalCompositeOperation = 'lighter';
      const r = m * 0.012;
      ctx.drawImage(S.red, ax + m * 0.004 - r, ay - r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.drawImage(S.back, 0, 0, w, yW);
    const toggles = (list) => {
      const warm = new Path2D();
      const cool = new Path2D();
      for (const it of list) {
        if (fract(it.k * u + it.ph) >= it.duty) continue;
        (it.cool ? cool : warm).rect(it.x, it.y, it.w, it.h);
      }
      ctx.fillStyle = S.WIN;
      ctx.fill(warm);
      ctx.fillStyle = S.COOL;
      ctx.fill(cool);
    };
    ctx.globalAlpha = 0.72;
    toggles(S.toggles[0]);
    ctx.globalAlpha = 1;
    ctx.drawImage(S.front, 0, 0, w, yW);
    toggles(S.toggles[1]);

    // luzes de obstrução (1 piscada por segundo, fases diferentes)
    ctx.globalCompositeOperation = 'lighter';
    for (const b of S.beacons) {
      const f = fract(u * 24 + b.ph);
      const a = f < 0.5 ? Math.sin((f / 0.5) * Math.PI) : 0;
      if (a < 0.02) continue;
      const r = m * (b.li === 1 ? 0.01 : 0.013);
      ctx.globalAlpha = a;
      ctx.drawImage(S.red, b.x - r, b.y - r, r * 2, r * 2);
    }

    // trânsito
    const mg = m * 0.05;
    for (const c of S.cars) {
      const ln = S.lanes[c.lane];
      const x = fract(c.x0 + ln.dir * ln.n * u) * (w + mg * 2) - mg;
      const r = m * 0.009 * c.s;
      const sp = ln.tail ? S.tail : S.head;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sp, x - r * 2, ln.y - r, r * 4, r * 2);
      ctx.globalAlpha = 1;
      ctx.drawImage(sp, x - r * 0.35, ln.y - r * 0.35, r * 0.7, r * 0.7);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // água
    if (S.refl) {
      const WH = h - yW;
      ctx.fillStyle = S.refl.water;
      ctx.fillRect(0, yW, w, WH);
      const n = Math.max(12, Math.round(WH / (m * 0.012)));
      const sh = WH / n;
      const cv = S.refl.canvas;
      const sy = cv.height / WH;
      for (let i = 0; i < n; i++) {
        const d = i / n;
        const amp = m * (0.002 + 0.012 * d * d);
        const dx = Math.sin(TAU * (2 * u) + i * 0.9) * amp + Math.sin(TAU * (3 * u) - i * 2.3) * amp * 0.5;
        const y = i * sh;
        ctx.drawImage(cv, 0, y * sy, cv.width, sh * sy + 1, dx, yW + y, w, sh + 0.5);
      }
      // brilho da lua na água
      const mx = w * (w > h ? 0.8 : 0.74);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,245,225,0.12)';
      for (let i = 0; i < 9; i++) {
        const d = i / 9;
        const y = yW + WH * (0.05 + d * 0.5);
        const len = m * (0.012 + 0.03 * d) * (0.6 + 0.4 * Math.sin(TAU * 2 * u + i * 1.7));
        ctx.fillRect(mx - len / 2 + Math.sin(TAU * 3 * u + i) * m * 0.004, y, len, Math.max(1 / px, m * 0.0016));
      }
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = css(mixc(hexToRgb(p.city), [0, 0, 0], 0.3));
      ctx.fillRect(0, yW - 0.5, w, h - yW + 0.5);
    }
  },
};
