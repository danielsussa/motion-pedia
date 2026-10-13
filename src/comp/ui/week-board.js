import { el } from '../core.js';
import { taskCard } from './task-card.js';
import './ui.css';

const W = 1600;
const H = 900;
const SIDE = 300;
const TOP = 72;
const HEAD = 62;
const GUT = 74;
const H0 = 8; // primeira hora visível
const H1 = 18;

// App de agenda semanal (1600×900). tasks: [{ id, day, start, dur, title, variant }].
// Retorna helpers de geometria para a câmera mirar em dia/hora.
export function weekBoard({ brand = 'pauta', month = 'October 2026', week = 'Week 42', days, tasks, nowHour = 10.5, today = 1, logo }) {
  const colW = (W - SIDE - GUT) / days.length;
  const hourH = (H - TOP - HEAD) / (H1 - H0);
  const x = (day) => SIDE + GUT + day * colW;
  const y = (hour) => TOP + HEAD + (hour - H0) * hourH;

  const node = el('div.ui-board');

  const avatars = ['#f4b183', '#9ec5fe', '#b5e3c4'].map((c) => el('span.av', { style: { background: c } }));
  node.append(
    el('div.ui-board-top', {}, logo ?? null, brand, el('span.chip', {}, week), el('span.chip', {}, month), el('span.sp'), ...avatars, el('span.btn', {}, 'Today')),
  );

  const mini = el('div.ui-mini');
  'MTWTFSS'.split('').forEach((d) => mini.append(el('span', { style: { fontWeight: 700, color: '#a3a097' } }, d)));
  // Outubro/2026 começa numa quinta: 3 dias de setembro antes, 1 de novembro depois.
  for (const n of [28, 29, 30]) mini.append(el('span', { style: { opacity: 0.35 } }, String(n)));
  for (let n = 1; n <= 32; n++) {
    const inWeek = n >= 12 && n <= 16;
    const cls = n === 12 + today ? '.today' : inWeek ? '.wk' : '';
    mini.append(el(`span${cls}`, { style: n > 31 ? { opacity: 0.35 } : {} }, String(n > 31 ? n - 31 : n)));
  }
  const lists = [
    ['Work', 'var(--ink)'],
    ['Focus', 'var(--accent)'],
    ['Personal', '#9ec5fe'],
    ['Health', '#b5e3c4'],
  ].map(([n, c]) => el('div.ui-list', {}, el('i', { style: { background: c } }), n));
  node.append(el('div.ui-board-side', {}, el('h4', {}, month), mini, el('h4', {}, 'Lists'), ...lists));

  days.forEach(([name, num], i) => {
    node.append(
      el('div.ui-board-head', { style: { left: `${x(i) + 16}px` } }, name, el(`b${i === today ? '.today' : ''}`, {}, String(num))),
    );
    if (i > 0) node.append(el('div.ui-vline', { style: { left: `${x(i)}px`, top: `${TOP}px`, height: `${H - TOP}px` } }));
  });
  node.append(el('div.ui-vline', { style: { left: `${SIDE + GUT}px`, top: `${TOP}px`, height: `${H - TOP}px` } }));
  for (let h = H0; h < H1; h++) {
    node.append(el('div.ui-hour', { style: { left: `${SIDE + 14}px`, top: `${y(h) - 8}px` } }, `${String(h).padStart(2, '0')}:00`));
    node.append(el('div.ui-hline', { style: { left: `${SIDE + GUT}px`, width: `${W - SIDE - GUT}px`, top: `${y(h)}px` } }));
  }

  const taskEls = new Map();
  for (const tk of tasks) {
    const card = taskCard({ title: tk.title, time: tk.time, variant: tk.variant, w: colW - 14, h: tk.dur * hourH - 8 });
    card.style.left = `${x(tk.day) + 7}px`;
    card.style.top = `${y(tk.start) + 4}px`;
    node.append(card);
    taskEls.set(tk.id, card);
  }

  const nowY = y(nowHour);
  node.append(
    el('div.ui-now', { style: { left: `${SIDE + GUT}px`, width: `${W - SIDE - GUT}px`, top: `${nowY - 1.5}px` } }),
    el('div.ui-now-dot', { style: { left: `${x(today) - 7}px`, top: `${nowY - 7}px` } }),
    el('div.ui-now-pill', { style: { left: `${SIDE + 6}px`, top: `${nowY - 13}px` } }, `${String(Math.floor(nowHour)).padStart(2, '0')}:${String(Math.round((nowHour % 1) * 60)).padStart(2, '0')}`),
  );

  return { el: node, taskEls, x, y, colW, hourH, nowY, w: W, h: H };
}

// Versão leve (só blocos) para preencher grades com dezenas de cópias.
export function boardGhost({ days, tasks }) {
  const colW = (W - SIDE - GUT) / days.length;
  const hourH = (H - TOP - HEAD) / (H1 - H0);
  const node = el('div.ui-board');
  node.append(el('div.ui-board-top'), el('div.ui-board-side'));
  for (const tk of tasks) {
    node.append(
      el(`div.ui-task${tk.variant ? '.' + tk.variant : ''}`, {
        style: {
          left: `${SIDE + GUT + tk.day * colW + 7}px`,
          top: `${TOP + HEAD + (tk.start - H0) * hourH + 4}px`,
          width: `${colW - 14}px`,
          height: `${tk.dur * hourH - 8}px`,
        },
      }),
    );
  }
  return node;
}
