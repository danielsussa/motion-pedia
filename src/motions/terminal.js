import { TAU, clamp, seg, ease, spring, rgba, mixHex, rng } from '../lib/anim.js';

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const F = 'Inter, system-ui, sans-serif';

const DEFAULT = `$ npm create motion@latest my-film
[spin] Downloading the template
✓ Project created in ./my-film
$ cd my-film && npm install
[progress] Installing dependencies
  added 128 packages in 3.2 s
$ npm run render -- --fps 60
[spin] Rendering 720 frames
✓ Done: renders/my-film.mp4  (24.8 MB)`;

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

// Roteiro → linhas com tipo e agenda (em segundos "brutos", reescalados depois).
function plan(src, seed) {
  const r = rng(seed);
  const out = [];
  let t = 0;
  for (const raw of String(src).replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    let m;
    if ((m = raw.match(/^\s*\$\s?(.*)$/))) {
      t += 0.45;
      const cmd = m[1];
      const at = t;
      // tempo de cada caractere: ritmo humano com variação determinística
      const ct = new Float32Array(cmd.length + 1);
      for (let i = 0; i < cmd.length; i++) {
        t += (cmd[i] === ' ' ? 0.09 : 0.045) + r() * 0.05;
        ct[i + 1] = t - at;
      }
      out.push({ kind: 'cmd', text: cmd, at, ct, done: t });
      t += 0.32;
    } else if ((m = raw.match(/^\s*\[(spin|progress)\]\s*(.*)$/i))) {
      const kind = m[1].toLowerCase();
      const dur = kind === 'spin' ? 1.2 : 1.9;
      out.push({ kind, text: m[2], at: t, done: t + dur });
      t += dur + 0.12;
    } else {
      out.push({ kind: 'out', text: raw.replace(/\s+$/, ''), at: t, done: t });
      t += 0.08;
    }
  }
  return { lines: out, total: t };
}

export default {
  id: 'terminal',
  title: 'Terminal',
  description: 'Commands typed into a terminal, with output appearing line by line, a spinner and a progress bar.',
  category: 'dados',
  tags: ['ui', 'data', 'typography'],
  duration: 12,
  poster: 10.5,

  params: {
    script: {
      type: 'textarea',
      label: 'Script ($ command · [spin] text · [progress] text · output)',
      rows: 9,
      default: DEFAULT,
    },
    path: { type: 'text', label: 'Prompt folder', default: '~/projects' },
    accent: { type: 'color', label: 'Accent', default: '#7ee2b8' },
    window: { type: 'color', label: 'Window', default: '#101218' },
    bg: { type: 'color', label: 'Background', default: '#0a0b0e' },
    speed: { type: 'range', label: 'Pace', min: 0.6, max: 1.8, step: 0.05, default: 1 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p, px, duration }) {
    const { lines, total } = plan(p.script, 11);
    const T0 = 0.9;
    const avail = duration - 1.9 - T0;
    const k = Math.min(1 / p.speed, avail / Math.max(total, 0.01));
    for (const L of lines) {
      L.at = T0 + L.at * k;
      L.done = T0 + L.done * k;
      if (L.ct) L.ct = L.ct.map((v) => v * k);
    }
    const endT = lines.length ? lines[lines.length - 1].done + 0.15 : T0;

    let wall = null;
    if (!p.transparent) {
      wall = document.createElement('canvas');
      wall.width = Math.max(4, Math.round(w * px));
      wall.height = Math.max(4, Math.round(h * px));
      const g = wall.getContext('2d');
      g.scale(px, px);
      g.fillStyle = p.bg;
      g.fillRect(0, 0, w, h);
      const rg = g.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      rg.addColorStop(0, rgba(p.accent, 0.1));
      rg.addColorStop(0.5, rgba(p.accent, 0.025));
      rg.addColorStop(1, rgba(p.accent, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    }
    return { lines, endT, wall };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    const { lines, endT, wall } = state;
    if (wall) ctx.drawImage(wall, 0, 0, w, h);

    const m = Math.min(w, h);
    const portrait = h > w * 1.15;
    const WW = portrait ? w * 0.9 : Math.min(w * 0.76, h * 1.45);
    const prompt = `${p.path || '~'} ❯ `;
    const longest = Math.max(
      40,
      ...lines.map((L) => (L.kind === 'cmd' ? prompt.length + L.text.length : L.kind === 'progress' ? L.text.length + 22 : L.text.length + 3)),
    );
    const titleH = WW * 0.045;
    const pad = WW * 0.032;
    const cwRatio = 0.6;
    const fsW = (WW - pad * 2) / ((longest + 2) * cwRatio);
    const maxWH = h * (portrait ? 0.6 : 0.8);
    const wantRows = clamp(lines.length + 2, 9, 18);
    const fsH = (maxWH - titleH - pad * 2) / (wantRows * 1.55);
    const fs = Math.min(fsW, fsH, m * 0.036);
    const lh = fs * 1.55;
    const cw = fs * cwRatio;
    const rows = Math.max(4, Math.floor((maxWH - titleH - pad * 2) / lh));
    const shownRows = Math.min(rows, Math.max(wantRows, 9));
    const WH = titleH + pad * 2 + shownRows * lh;
    const R = WW * 0.016;

    // ---------- entrada / saída ----------
    const inK = spring(seg(t, 0.05, 1.05), 0.14);
    const outK = ease.inCubic(seg(t, duration - 0.7, duration - 0.05));
    if (outK >= 1) return;
    ctx.save();
    ctx.globalAlpha = clamp(seg(t, 0.05, 0.35)) * (1 - outK);
    ctx.translate(w / 2, h / 2 + (1 - inK) * m * 0.08 + outK * m * 0.05);
    const sc = (0.94 + 0.06 * inK) * (1 - 0.03 * outK);
    ctx.scale(sc, sc);
    ctx.translate(-WW / 2, -WH / 2);

    for (const [e, a] of [[60, 0.1], [30, 0.14], [10, 0.18]]) {
      const s = (e * WW) / 1600;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.roundRect(-s * 0.5, s * 0.7, WW + s, WH + s * 0.4, R + s);
      ctx.fill();
    }
    ctx.fillStyle = p.window;
    ctx.beginPath();
    ctx.roundRect(0, 0, WW, WH, R);
    ctx.fill();
    ctx.save();
    ctx.clip();

    // barra de título
    ctx.fillStyle = mixHex(p.window, '#ffffff', 0.04);
    ctx.fillRect(0, 0, WW, titleH);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, titleH - 1, WW, 1);
    const dotR = titleH * 0.13;
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(titleH * 0.6 + i * dotR * 3.3, titleH / 2, dotR, 0, TAU);
      ctx.fill();
    });
    ctx.font = `500 ${titleH * 0.32}px ${F}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8b90a0';
    const cols = Math.round((WW - pad * 2) / cw);
    ctx.fillText(`${(p.path || '~').replace(/^.*\//, '') || '~'} — zsh — ${cols}×${shownRows}`, WW / 2, titleH / 2 + 1);

    // ---------- conteúdo ----------
    const vis = [];
    for (const L of lines) if (t >= L.at) vis.push(L);
    let scroll = 0;
    for (let i = shownRows - 1; i < lines.length; i++) {
      // a última linha (prompt vazio) também ocupa uma linha
      const at = i + 1 < lines.length ? lines[i + 1].at : endT;
      scroll += ease.outCubic(seg(t, at, at + 0.18));
    }
    const top = titleH + pad;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, titleH, WW, WH - titleH);
    ctx.clip();

    const ACC = p.accent;
    const INK = '#e3e6ec';
    const DIM = '#717787';
    const PATH = '#8fa3c7';
    const x0 = pad;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const fN = `400 ${fs}px ${MONO}`;
    const fB = `600 ${fs}px ${MONO}`;
    ctx.font = fN;
    let cursor = null; // {x, y, solid}
    const drawPrompt = (y) => {
      const path = p.path || '~';
      ctx.fillStyle = PATH;
      ctx.font = fB;
      ctx.fillText(path, x0, y);
      ctx.fillStyle = ACC;
      ctx.fillText('❯', x0 + (path.length + 1) * cw, y);
      ctx.font = fN;
      return x0 + prompt.length * cw;
    };

    vis.forEach((L, i) => {
      const y = top + (i - scroll) * lh + lh / 2;
      if (y < top - lh || y > WH + lh) return;
      const appear = ease.outCubic(seg(t, L.at, L.at + 0.18));
      ctx.globalAlpha = (1 - outK) * clamp(seg(t, 0.05, 0.35)) * (L.kind === 'cmd' ? 1 : appear);
      const dy = L.kind === 'cmd' ? 0 : (1 - appear) * lh * 0.25;
      if (L.kind === 'cmd') {
        const xs = drawPrompt(y);
        let n = 0;
        while (n < L.text.length && L.ct[n + 1] <= t - L.at) n++;
        const s = L.text.slice(0, n);
        // primeira palavra (o programa) em negrito
        const sp = s.indexOf(' ');
        const head = sp < 0 ? s : s.slice(0, sp);
        ctx.font = fB;
        ctx.fillStyle = INK;
        ctx.fillText(head, xs, y);
        ctx.font = fN;
        if (sp >= 0) {
          // flags em cor apagada
          let col = sp;
          for (const part of s.slice(sp).split(/(\s+)/)) {
            if (part && !/^\s+$/.test(part)) {
              ctx.fillStyle = part.startsWith('-') ? PATH : part === '&&' || part === '|' ? ACC : INK;
              ctx.fillText(part, xs + col * cw, y);
            }
            col += part.length;
          }
        }
        if (t < L.done + 0.08) cursor = { x: xs + n * cw, y, solid: true };
      } else if (L.kind === 'spin' || L.kind === 'progress') {
        const done = t >= L.done;
        const yy = y + dy;
        if (L.kind === 'spin') {
          if (done) {
            const pop = spring(seg(t, L.done, L.done + 0.4), 0.4);
            ctx.save();
            ctx.translate(x0 + cw * 0.5, yy);
            ctx.scale(pop, pop);
            ctx.fillStyle = ACC;
            ctx.font = fB;
            ctx.textAlign = 'center';
            ctx.fillText('✓', 0, 0);
            ctx.restore();
            ctx.textAlign = 'left';
            ctx.font = fN;
            ctx.fillStyle = INK;
            ctx.fillText(L.text, x0 + cw * 2, yy);
          } else {
            ctx.fillStyle = ACC;
            ctx.fillText(SPIN[Math.floor((t - L.at) * 12.5) % SPIN.length], x0, yy);
            ctx.fillStyle = DIM;
            const dots = '.'.repeat(Math.floor((t - L.at) * 3) % 4);
            ctx.fillText(L.text + dots, x0 + cw * 2, yy);
          }
        } else {
          // barra de progresso com avanço irregular (mas determinístico)
          const raw = seg(t, L.at + 0.1, L.done);
          const q = clamp(raw + 0.06 * Math.sin(raw * TAU * 2) * (1 - raw) * raw * 4);
          const pr = ease.inOutSine(q);
          ctx.fillStyle = done ? INK : DIM;
          ctx.fillText(L.text, x0, yy);
          const bx = x0 + (L.text.length + 2) * cw;
          const bw = cw * 14;
          const bh = fs * 0.42;
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath();
          ctx.roundRect(bx, yy - bh / 2, bw, bh, bh / 2);
          ctx.fill();
          if (pr > 0.001) {
            ctx.fillStyle = ACC;
            ctx.beginPath();
            ctx.roundRect(bx, yy - bh / 2, Math.max(bh, bw * pr), bh, bh / 2);
            ctx.fill();
          }
          ctx.fillStyle = done ? ACC : DIM;
          ctx.fillText(`${String(Math.round(pr * 100)).padStart(3, ' ')}%`, bx + bw + cw, yy);
        }
      } else {
        const s = L.text;
        const ok = /^\s*[✓✔]/.test(s);
        const err = /^\s*(✗|✖|error|erro)/i.test(s);
        const indented = /^\s/.test(s);
        if (ok || err) {
          const j = s.search(/\S/);
          ctx.fillStyle = err ? '#ff7a7a' : ACC;
          ctx.font = fB;
          ctx.fillText(s[j], x0 + j * cw, y + dy);
          ctx.font = fN;
          ctx.fillStyle = INK;
          ctx.fillText(s.slice(j + 1), x0 + (j + 1) * cw, y + dy);
        } else {
          ctx.fillStyle = indented ? DIM : INK;
          ctx.fillText(s, x0, y + dy);
        }
      }
    });
    ctx.globalAlpha = (1 - outK) * clamp(seg(t, 0.05, 0.35));

    // prompt final (e o inicial, antes do 1º comando)
    const firstAt = lines.length ? lines[0].at : 0;
    if (t >= endT || t < firstAt) {
      const i = t >= endT ? vis.length : 0;
      const y = top + (i - scroll) * lh + lh / 2;
      if (t >= 0.2) {
        const xs = drawPrompt(y);
        cursor = { x: xs, y, solid: false };
      }
    }
    if (cursor) {
      const on = cursor.solid || Math.floor(t * 1.9) % 2 === 0;
      if (on) {
        ctx.fillStyle = rgba(ACC, 0.85);
        ctx.fillRect(cursor.x, cursor.y - lh * 0.36, cw, lh * 0.72);
      }
    }
    ctx.restore();

    ctx.restore(); // clip janela
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = Math.max(1, WW / 1400);
    ctx.beginPath();
    ctx.roundRect(0, 0, WW, WH, R);
    ctx.stroke();
    ctx.restore();
  },
};
