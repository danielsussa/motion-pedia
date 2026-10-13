// Filme de lançamento de um app fictício ("pauta"), nas técnicas do estudo docs/ESTUDO-REVID.md:
// parallax com profundidade, match-cut pelo ponto da marca, digitação com câmera seguindo o cursor,
// botão que vira tela, UI inclinada que endireita, câmera sobre a UI e pull-back para grade infinita.
import { el, ease, seg, lerp, clamp, win, springWin, inScene, show, tf, set, camera, keys, rng, typedCount, typedChars, caretOn } from '../comp/core.js';
import { canvasLayer } from '../comp/canvas-layer.js';
import { cursor, ripple } from '../comp/ui/cursor.js';
import { promptBar } from '../comp/ui/prompt-bar.js';
import { taskCard } from '../comp/ui/task-card.js';
import { weekBoard, boardGhost } from '../comp/ui/week-board.js';

const W = 1920;
const H = 1080;
const BOARD = { x: 160, y: 90 }; // posição do app no plano da câmera

const DAYS = [['Seg', 12], ['Ter', 13], ['Qua', 14], ['Qui', 15], ['Sex', 16]];
const TASKS = [
  ...[0, 1, 2, 3, 4].map((d) => ({ id: `focus${d}`, day: d, start: 8.5, dur: 1.5, title: 'Foco profundo', time: '08:30 – 10:00', variant: 'dark' })),
  { id: 'daily', day: 0, start: 10.5, dur: 1, title: 'Daily', time: '10:30' },
  { id: 'design', day: 1, start: 11, dur: 1, title: 'Review de design', time: '11:00', variant: 'accent' },
  { id: 'sync', day: 2, start: 11, dur: 1, title: 'Sync de produto', time: '11:00' },
  { id: 'client', day: 3, start: 11, dur: 1, title: 'Call com cliente', time: '11:00' },
  { id: 'retro', day: 4, start: 10.5, dur: 1.5, title: 'Retro', time: '10:30' },
  ...[0, 1, 2, 3, 4].map((d) => ({ id: `lunch${d}`, day: d, start: 12, dur: 1, title: 'Almoço', variant: 'hatch' })),
  { id: 'plan', day: 0, start: 14, dur: 1.5, title: 'Planejamento', time: '14:00' },
  { id: 'hire', day: 1, start: 13.5, dur: 1, title: 'Entrevista', time: '13:30' },
  { id: 'kickoff', day: 1, start: 9.5, dur: 1, title: 'Kickoff', time: '15:30 – 16:30', variant: 'outline' },
  { id: 'one', day: 2, start: 13.5, dur: 1, title: '1:1 · Marina', time: '13:30' },
  { id: 'road', day: 2, start: 15, dur: 1.5, title: 'Roadmap Q4', time: '15:00' },
  { id: 'metrics', day: 3, start: 13.5, dur: 1, title: 'Métricas', time: '13:30' },
  { id: 'pr', day: 3, start: 15, dur: 1, title: 'Revisão de PR', time: '15:00' },
  { id: 'deck', day: 4, start: 14, dur: 2, title: 'Deck pronto', time: '14:00 – 16:00', variant: 'accent' },
  { id: 'gym1', day: 1, start: 17, dur: 1, title: 'Academia', time: '17:00', variant: 'outline' },
  { id: 'gym2', day: 3, start: 17, dur: 1, title: 'Academia', time: '17:00', variant: 'outline' },
];

const parseBold = (s) => s.split(/(\*[^*]+\*)/).filter(Boolean).map((t) => (t.startsWith('*') ? { t: t.slice(1, -1), b: true } : { t }));

function icon(size, { fg, bg }) {
  const r = size * 0.26;
  const bar = (w, top, dot) =>
    el('div', {
      style: { position: 'absolute', left: `${size * 0.22}px`, top: `${top * size}px`, width: `${w * size}px`, height: `${size * 0.1}px`, borderRadius: `${size}px`, background: fg },
    }, dot ? el('div', { style: { position: 'absolute', right: `${-size * 0.2}px`, top: `${-size * 0.03}px`, width: `${size * 0.16}px`, height: `${size * 0.16}px`, borderRadius: '50%', background: 'var(--accent)' } }) : null);
  return el('div', { style: { position: 'relative', flex: 'none', width: `${size}px`, height: `${size}px`, borderRadius: `${r}px`, background: bg } }, bar(0.36, 0.26, true), bar(0.56, 0.45), bar(0.44, 0.64));
}

function lockup(brand, size, colors) {
  const letters = [...brand].map((c) => el('span', { style: { display: 'inline-block' } }, c));
  const word = el('div', { style: { font: `800 ${size}px/1 Inter`, letterSpacing: '-0.05em', color: colors.fg, overflow: 'hidden', padding: '0.08em 0.04em 0.12em' } }, letters);
  const ic = icon(size * 0.95, { fg: colors.iconFg, bg: colors.iconBg });
  const node = el('div', { style: { display: 'flex', alignItems: 'center', gap: `${size * 0.28}px` } }, ic, word);
  return { el: node, icon: ic, letters };
}

// Palavras que entram com blur → nítido (e saem do mesmo jeito).
function words(text, style) {
  const spans = text.split(' ').map((w) => el('span', { style: { display: 'inline-block', marginRight: '0.24em' } }, w));
  const node = el('div', { style: { whiteSpace: 'nowrap', ...style } }, spans);
  return {
    el: node,
    update(t, tin, tout, step = 0.07) {
      spans.forEach((s, i) => {
        const k = ease.outCubic(seg(t, tin + i * step, tin + i * step + 0.5));
        const o = ease.inCubic(seg(t, tout + i * 0.03, tout + i * 0.03 + 0.3));
        set(s, { opacity: k * (1 - o), filter: `blur(${(1 - k) * 14 + o * 14}px)`, transform: `translateY(${(1 - k) * 40 - o * 20}px)` });
      });
    },
  };
}

export default {
  id: 'pauta-launch',
  title: 'Launch Film — Pauta',
  description: 'Filme de lançamento de app (26 s): parallax, match-cut pelo ponto, prompt digitado, UI em 3D e pull-back infinito.',
  tags: ['launch', 'ui', 'câmera'],
  duration: 26,
  size: { w: W, h: H },
  poster: 12.9,

  params: {
    brand: { type: 'text', label: 'Marca', default: 'pauta' },
    accent: { type: 'color', label: 'Cor da marca', default: '#ff4f1f' },
    ink: { type: 'color', label: 'Tinta', default: '#151515' },
    paper: { type: 'color', label: 'Papel', default: '#f3f2ee' },
    line1: { type: 'text', label: 'Gancho (linha 1)', default: 'Tarefas demais.' },
    line2: { type: 'text', label: 'Gancho (linha 2)', default: 'Tempo de menos.' },
    tagline: { type: 'text', label: 'Tagline', default: 'Sua semana, no lugar.' },
    prompt: { type: 'text', label: 'Prompt (*negrito*)', default: 'Planeja minha semana: *academia ter e qui*, *deck até sexta*.' },
    featA: { type: 'text', label: 'Feature 1', default: 'Reuniões | se ajeitam.' },
    featB: { type: 'text', label: 'Feature 2', default: 'Manhãs | ficam suas.' },
    featC: { type: 'text', label: 'Feature 3', default: 'Imprevistos | também cabem.' },
    closing: { type: 'text', label: 'Fechamento', default: 'Tudo cabe' },
    url: { type: 'text', label: 'URL', default: 'pauta.app' },
  },

  mount(root, p) {
    set(root, { '--accent': p.accent, '--ink': p.ink, '--paper': p.paper, background: p.paper, fontFamily: 'Inter, sans-serif' });
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--ink', p.ink);
    root.style.setProperty('--paper', p.paper);
    const abs = (extra = {}) => ({ position: 'absolute', left: 0, top: 0, width: `${W}px`, height: `${H}px`, ...extra });
    const R = rng(42);

    // ── Plano da câmera (S3 → S6): o app principal + cópias leves para o pull-back ─────────────
    const stage = el('div', { style: abs({ perspective: '2600px', overflow: 'hidden' }) });
    const plane = el('div', { style: abs({ transformStyle: 'flat' }) });
    stage.append(plane);
    const board = weekBoard({ brand: p.brand, days: DAYS, tasks: TASKS, logo: icon(34, { fg: '#fff', bg: p.ink }) });
    set(board.el, { left: `${BOARD.x}px`, top: `${BOARD.y}px` });
    const ghosts = el('div', { style: { position: 'absolute', left: 0, top: 0 } });
    for (let j = -4; j <= 4; j++)
      for (let i = -4; i <= 4; i++) {
        if (!i && !j) continue;
        const g = boardGhost({ days: DAYS, tasks: TASKS });
        set(g, { left: `${BOARD.x + i * 1720}px`, top: `${BOARD.y + j * 1010}px`, boxShadow: '0 0 0 1.5px #e7e5df' });
        ghosts.append(g);
      }
    plane.append(ghosts, board.el);
    const slot = (day, hour) => ({ x: BOARD.x + board.x(day) + board.colW / 2, y: BOARD.y + board.y(hour) });
    const taskList = [...board.taskEls.values()];
    const kickoff = board.taskEls.get('kickoff');
    const pr = board.taskEls.get('pr');
    const urgent = taskCard({ title: 'Bug urgente', time: '15:00', variant: 'accent', w: board.colW - 14, h: board.hourH - 8 });
    set(urgent, { left: `${board.x(3) + 7}px`, top: `${board.y(15) + 4}px` });
    board.el.append(urgent);

    // ── S1: gancho com cards em profundidade ────────────────────────────────────────────
    const s1wrap = el('div', { style: abs({ perspective: '1600px' }) });
    const s1 = el('div', { style: abs({ transformOrigin: '960px 540px' }) });
    s1wrap.append(s1);
    const CARD_NAMES = ['Sync', 'Roadmap', 'Demo', 'Offsite', 'Design crit', 'Kickoff', '1:1', 'Pricing', 'QBR prep', 'Vendor call', 'Hiring panel', 'Board prep', 'Métricas', 'Launch sync', 'Quick chat', 'All-hands', 'Interview', 'Retro', 'Deep work', 'Budget', 'Onboarding', 'Standup'];
    const cards = CARD_NAMES.map((name, i) => {
      const depth = i % 3;
      const variant = R() < 0.22 ? 'dark' : R() < 0.3 ? 'outline' : '';
      const node = taskCard({ title: name, time: `${8 + Math.floor(R() * 9)}:${R() < 0.5 ? '00' : '30'}`, variant, w: 250 + R() * 80, h: 100 });
      s1.append(node);
      return { node, depth, x: (i % 6) * 340 - 80 + R() * 140, y: Math.floor(i / 6) * 270 + R() * 130 - 40, delay: 0.15 + R() * 1.1 };
    });
    cards.sort((a, b) => b.depth - a.depth).forEach((c) => s1.append(c.node));
    const line = el('div', { style: { position: 'absolute', top: '539px', height: '3px', background: p.accent } });
    const pill = el('div', { style: { position: 'absolute', left: '40px', top: '526px', font: "700 20px 'JetBrains Mono'", color: '#fff', background: p.accent, padding: '4px 10px', borderRadius: '8px' } }, '08:42');
    const h1Inner = el('div', {}, p.line1);
    const h1 = el('div', { style: { position: 'absolute', left: 0, width: `${W}px`, top: '330px', textAlign: 'center', font: '700 96px/1.1 Inter', letterSpacing: '-0.035em', color: p.ink, overflow: 'hidden' } }, h1Inner);
    const h2 = el('div', { style: { position: 'absolute', left: 0, width: `${W}px`, top: '600px', textAlign: 'center', font: '800 230px/1 Inter', letterSpacing: '-0.055em', color: p.ink, whiteSpace: 'nowrap' } }, p.line2);
    s1.append(line, pill, h1, h2);

    // Ponto da marca: sobrevive ao corte S1 → S2 e vira a íris escura.
    const dot = el('div', { style: { position: 'absolute', left: '948px', top: '528px', width: '24px', height: '24px', borderRadius: '50%', background: p.accent } });
    const iris = el('div', { style: { position: 'absolute', left: `${960 - 1200}px`, top: `${540 - 1200}px`, width: '2400px', height: '2400px', borderRadius: '50%' } });

    // ── S2: logo no escuro com um motion de canvas como textura ──────────────────────────
    const s2 = el('div', { style: abs() });
    const dots = canvasLayer('dot-wave', { bg: p.ink, colorA: '#262626', colorB: p.accent, spacing: 34, radius: 0.32, freq: 0.008, cycles: 1 });
    set(dots.el, { maskImage: 'radial-gradient(circle at 50% 50%, transparent 18%, #000 75%)', WebkitMaskImage: 'radial-gradient(circle at 50% 50%, transparent 18%, #000 75%)' });
    const logoDark = lockup(p.brand, 170, { fg: '#fff', iconFg: p.ink, iconBg: '#fff' });
    const tagline = el('div', { style: { font: '500 38px Inter', color: '#9c9a94', marginTop: '26px', height: '46px' } });
    const s2center = el('div', { style: abs({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }) }, logoDark.el, tagline);
    s2.append(dots.el, s2center);

    // ── S3: prompt sobre a UI desfocada; câmera segue o cursor até "enviar" ───────────────
    const segments = parseBold(p.prompt);
    const bar = promptBar({ segments, icon: icon(44, { fg: '#fff', bg: p.ink }) });
    const BAR = { x: 410, y: 488 };
    set(bar.el, { left: `${BAR.x}px`, top: `${BAR.y}px` });
    const BTN = { x: BAR.x + 1100 - 20 - 33, y: BAR.y + 52 };
    const cur = cursor();
    const rip = ripple();
    const overlay = el('div', { style: abs({ transformOrigin: '0 0' }) }, bar.el, rip.el, cur.el);
    const accentIris = el('div', { style: { position: 'absolute', width: '2800px', height: '2800px', borderRadius: '50%', background: p.accent } });
    const band = el('div', { style: { position: 'absolute', left: `${960 - 2500}px`, width: '5000px', background: p.accent } });

    // ── S5: manchetes das features ───────────────────────────────────────────────────────
    const fade = el('div', { style: abs({ width: '1150px', background: `linear-gradient(90deg, ${p.paper} 0%, ${p.paper} 62%, transparent 100%)` }) });
    const feats = [p.featA, p.featB, p.featC].map((txt) => {
      const [a, b = ''] = txt.split('|').map((s) => s.trim());
      const top = words(a, { font: '800 118px/1.05 Inter', letterSpacing: '-0.045em', color: p.ink });
      const bot = words(b, { font: "italic 400 132px/1.05 'Instrument Serif'", color: p.accent, letterSpacing: '-0.01em' });
      const node = el('div', { style: { position: 'absolute', left: '120px', top: '380px' } }, top.el, bot.el);
      return { node, top, bot };
    });
    const featLayer = el('div', { style: abs() }, fade, ...feats.map((f) => f.node));

    // ── S6: "Tudo cabe." sobre a grade infinita ──────────────────────────────────────────
    const glow = el('div', { style: abs({ background: `radial-gradient(ellipse 900px 360px at 50% 50%, ${p.paper} 30%, transparent 75%)` }) });
    const closingDot = el('span', { style: { display: 'inline-block', width: '40px', height: '40px', borderRadius: '50%', background: p.accent, marginLeft: '8px' } });
    const closing = el('div', { style: abs({ display: 'flex', alignItems: 'baseline', justifyContent: 'center', paddingTop: '430px', boxSizing: 'border-box', font: '800 210px/1 Inter', letterSpacing: '-0.055em', color: p.ink }) }, p.closing, closingDot);
    const s6 = el('div', { style: abs() }, glow, closing);

    // ── S7: end card ─────────────────────────────────────────────────────────────────────
    const logoLight = lockup(p.brand, 150, { fg: p.ink, iconFg: '#fff', iconBg: p.ink });
    const url = el('div', { style: { font: "500 34px 'JetBrains Mono'", color: '#8b887f', marginTop: '34px' } }, p.url);
    const s7 = el('div', { style: abs({ background: p.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }) }, logoLight.el, url);

    // z-index explícito: com filter + perspective no palco, o Chrome pode reordenar irmãos sem ele.
    const layers = [stage, featLayer, s6, s1wrap, dot, iris, s2, overlay, accentIris, band, s7];
    layers.forEach((node, i) => set(node, { zIndex: String(i + 1), isolation: 'isolate' }));
    root.append(...layers);

    // Câmera: estados-chave do plano (S3 → S6).
    const full = { fx: 960, fy: 540, zoom: 1, rx: 0, rz: 0 };
    const nowFocus = { fx: BOARD.x + board.x(0) + (board.colW * 5) / 2, fy: BOARD.y + board.nowY };
    const beatCam = (day, hour) => {
      const s = slot(day, hour);
      return { fx: s.x - 300 / 1.9, fy: s.y, zoom: 1.9, rx: 0, rz: 0 };
    };
    const camA = beatCam(1, 12.6);
    const camB = beatCam(2, 10.2);
    const camC = beatCam(3, 15.2);

    return {
      update(t) {
        // S1 ────────────────────────────────────────────
        const s1on = t < 4.35;
        show(s1wrap, s1on);
        if (s1on) {
          cards.forEach((c) => {
            const k = springWin(t, c.delay, c.delay + 0.6, 0.25);
            const sc = [1, 0.86, 0.72][c.depth];
            const drift = [-34, -20, -11][c.depth] * t;
            set(c.node, {
              transform: tf({ x: c.x + drift, y: c.y + (1 - k) * 30, s: sc * (0.8 + 0.2 * k) }),
              opacity: clamp(k * 1.2) * [1, 0.85, 0.7][c.depth],
              filter: `blur(${[0, 2.5, 6][c.depth]}px)`,
            });
          });
          const lw = win(t, 0.25, 1.0, ease.outExpo) * W;
          set(line, { left: `${960 - lw / 2}px`, width: `${lw}px` });
          set(pill, { opacity: win(t, 0.9, 1.2) });
          set(h1Inner, { transform: `translateY(${(1 - win(t, 0.9, 1.6, ease.outExpo)) * 110}%)` });
          const k2 = win(t, 1.55, 2.2, ease.outExpo);
          set(h2, { transform: `translateX(${(1 - k2) * -700}px)`, filter: `blur(${(1 - k2) * 26}px)`, opacity: clamp(k2 * 3) });
          // saída: a composição inteira inclina, encolhe e borra rumo ao ponto
          const k = win(t, 3.3, 4.25, ease.inOutCubic);
          set(s1, { transform: `rotateX(${k * 58}deg) rotateZ(${-k * 16}deg) scale(${1 - k * 0.965})`, filter: `blur(${k * 9}px)`, opacity: 1 - seg(t, 3.95, 4.3) });
        }

        // Ponto e íris (S1 → S2) ────────────────────────
        show(dot, t < 4.4);
        set(dot, { transform: `scale(${springWin(t, 0.05, 0.6, 0.4)})` });
        const irisK = win(t, 4.3, 4.95, ease.inOutExpo);
        show(iris, t >= 4.3 && t < 7.3);
        set(iris, {
          transform: `scale(${(24 + irisK * 2376) / 2400})`,
          background: `color-mix(in srgb, ${p.accent} ${(1 - seg(t, 4.35, 4.6)) * 100}%, ${p.ink})`,
        });

        // S2 ────────────────────────────────────────────
        const s2on = inScene(t, 4.6, 7.3);
        show(s2, s2on);
        if (s2on) {
          dots.update(t);
          set(dots.el, { opacity: win(t, 4.9, 5.6) * 0.55 });
          set(logoDark.icon, { transform: `scale(${springWin(t, 4.85, 5.45, 0.35)})` });
          logoDark.letters.forEach((l, i) => set(l, { transform: `translateY(${(1 - win(t, 5.05 + i * 0.05, 5.6 + i * 0.05, ease.outExpo)) * 120}%)` }));
          const n = typedCount(p.tagline, t, 5.75, 30);
          tagline.textContent = p.tagline.slice(0, n);
          const out = win(t, 6.85, 7.25, ease.inCubic);
          set(s2, { opacity: 1 - out, filter: `blur(${out * 22}px)`, transform: `scale(${1 + out * 0.06})` });
        }

        // Plano da câmera (S3 → S6) ─────────────────────
        const stageOn = t >= 6.9 && t < 23.9;
        show(stage, stageOn);
        if (stageOn) {
          let cam;
          if (t < 11.65) {
            const push = win(t, 9.9, 11.0);
            cam = { fx: 960 + push * 120, fy: 540, zoom: 1.12 + push * 0.2, rx: 0, rz: 0, blur: 30 - win(t, 6.9, 7.6, ease.outCubic) * 18 };
          } else if (t < 13.9) {
            const tilted = { ...nowFocus, zoom: 1.4, rx: 44, rz: -14 };
            const k = springWin(t, 12.3, 13.7, 0.15);
            cam = { fx: lerp(tilted.fx, full.fx, k), fy: lerp(tilted.fy, full.fy, k), zoom: lerp(tilted.zoom, 1, k), rx: lerp(44, 0, k), rz: lerp(-14, 0, k), blur: 0 };
          } else {
            cam = keys(t, [
              [13.9, full],
              [14.6, camA],
              [16.0, camA],
              [16.6, camB],
              [18.0, camB],
              [18.6, camC],
              [20.0, camC],
              [22.3, { fx: 960, fy: 540, zoom: 0.16, rx: 52, rz: -24 }],
            ]);
            cam.blur = win(t, 21.7, 22.6) * 4.5;
          }
          camera(plane, cam, stage);
          show(ghosts, t >= 19.9);
          set(ghosts, { opacity: win(t, 20.2, 20.9) });

          // tarefas: escondidas atrás da íris, depois entram organizadas
          const popOn = t >= 11.6;
          taskList.forEach((node, i) => {
            const k = popOn ? springWin(t, 12.45 + i * 0.035, 12.95 + i * 0.035, 0.3) : 1;
            set(node, { opacity: k, transform: `scale(${0.85 + 0.15 * k})` });
          });
          // feature A: a reunião desce para a tarde
          const ka = win(t, 14.75, 15.45, ease.inOutCubic);
          set(kickoff, { top: `${board.y(lerp(9.5, 15.5, ka)) + 4}px`, filter: `blur(${Math.sin(ka * Math.PI) * 3}px)` });
          // feature B: blocos de foco ganham destaque
          const kb = win(t, 16.5, 16.9, ease.outBack) * (1 - win(t, 17.6, 17.9));
          TASKS.filter((tk) => tk.id.startsWith('focus')).forEach((tk) => set(board.taskEls.get(tk.id), { boxShadow: `0 0 0 ${kb * 5}px ${p.accent}` }));
          // feature C: imprevisto cai e empurra o PR
          const kc = springWin(t, 18.6, 19.15, 0.35);
          set(urgent, { opacity: t >= 18.6 ? clamp(kc * 2) : 0, transform: `translateY(${(1 - kc) * -260}px)` });
          set(pr, { top: `${board.y(lerp(15, 16, win(t, 18.55, 18.9))) + 4}px` });
        }

        // S3 overlay: prompt + cursor ───────────────────
        const ovOn = inScene(t, 7.0, 11.6);
        show(overlay, ovOn);
        if (ovOn) {
          const kin = springWin(t, 7.1, 7.7, 0.25);
          const typing = t >= 7.75 && t < 7.75 + bar.total / 26;
          const press = win(t, 10.98, 11.06) * (1 - win(t, 11.06, 11.2));
          bar.update({ chars: typedChars(bar.total, t, 7.75, 26), caret: caretOn(t, typing), press });
          set(bar.el, { opacity: clamp(kin * 1.5), transform: `scale(${0.92 + 0.08 * kin})` });
          const k = win(t, 9.95, 10.9);
          const s = 1 + k * 0.9;
          const P = { x: lerp(BTN.x, 1180, k), y: BTN.y };
          set(overlay, { transform: `translate(${P.x - BTN.x * s}px,${P.y - BTN.y * s}px) scale(${s})`, opacity: 1 - seg(t, 11.45, 11.6) });
          const kc = win(t, 10.2, 10.9, ease.outCubic);
          cur.update({ x: lerp(BTN.x + 280, BTN.x + 6, kc), y: lerp(BTN.y + 250, BTN.y + 8, kc), press, opacity: seg(t, 10.2, 10.35) });
          rip.update({ x: BTN.x, y: BTN.y, k: seg(t, 11.05, 11.55) });
        }

        // S4: botão vira tela; faixa colapsa na linha do "agora" ──
        const ik = win(t, 11.12, 11.65, ease.inOutExpo);
        show(accentIris, t >= 11.12 && t < 11.75);
        const d = 126 + ik * 2700;
        set(accentIris, { left: `${1180 - 1400}px`, top: `${540 - 1400}px`, transform: `scale(${d / 2800})` });
        show(band, t >= 11.7 && t < 12.4);
        const bh = lerp(3000, 3, win(t, 11.75, 12.35, ease.inOutExpo));
        set(band, { top: `${540 - bh / 2}px`, height: `${bh}px`, transform: 'rotate(-14deg)' });

        // S5: manchetes ─────────────────────────────────
        const featOn = inScene(t, 13.9, 20.3);
        show(featLayer, featOn);
        if (featOn) {
          set(fade, { opacity: win(t, 13.9, 14.4) * (1 - win(t, 19.8, 20.3)) });
          [[14.1, 15.6], [16.1, 17.6], [18.1, 19.6]].forEach(([a, b], i) => {
            feats[i].top.update(t, a, b);
            feats[i].bot.update(t, a + 0.18, b + 0.05);
          });
        }

        // S6 ────────────────────────────────────────────
        const s6on = inScene(t, 21.6, 23.9);
        show(s6, s6on);
        if (s6on) {
          const k = win(t, 21.9, 22.5, ease.outCubic);
          set(glow, { opacity: k });
          set(closing, { opacity: k, filter: `blur(${(1 - k) * 18}px)`, transform: `scale(${0.94 + 0.06 * k})` });
          set(closingDot, { transform: `scale(${springWin(t, 22.35, 22.9, 0.5)})` });
        }

        // S7 ────────────────────────────────────────────
        const s7on = t >= 23.5;
        show(s7, s7on);
        if (s7on) {
          set(s7, { opacity: win(t, 23.5, 23.85) });
          set(logoLight.icon, { transform: `scale(${springWin(t, 23.7, 24.3, 0.35)})` });
          logoLight.letters.forEach((l, i) => set(l, { transform: `translateY(${(1 - win(t, 23.85 + i * 0.05, 24.4 + i * 0.05, ease.outExpo)) * 120}%)` }));
          set(url, { opacity: win(t, 24.4, 24.8), transform: `translateY(${(1 - win(t, 24.4, 24.8, ease.outCubic)) * 14}px)` });
        }
      },
    };
  },
};
