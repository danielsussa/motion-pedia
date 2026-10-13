import { el, fmtTime } from './dom.js';

// Play/pause + scrubber + tempo, ligados a um Clock (Player ou CompPlayer).
export function transport(player) {
  const playBtn = el('button.btn.play', { onclick: () => player.toggle(), title: 'Play/Pause (espaço)' }, '▶');
  const time = el('span.time');
  const scrub = el('input.scrub', {
    type: 'range',
    min: 0,
    max: player.duration,
    step: 0.001,
    value: 0,
    oninput: (e) => (player.pause(), player.seek(Number(e.target.value))),
  });
  player.on('frame', (t) => {
    scrub.value = t;
    time.textContent = `${fmtTime(t)} / ${fmtTime(player.duration)}`;
  });
  player.on('state', (on) => (playBtn.textContent = on ? '❚❚' : '▶'));
  return el('div.transport', {}, playBtn, scrub, time);
}

// Atalhos: espaço = play/pause, ←/→ = 1 frame.
export function bindKeys(player) {
  const onKey = (e) => {
    if (e.target.matches('input[type=text], input[type=search], select, textarea')) return;
    if (e.code === 'Space') (e.preventDefault(), player.toggle());
    if (e.code === 'ArrowLeft') (player.pause(), player.seek(player.t - 1 / 60));
    if (e.code === 'ArrowRight') (player.pause(), player.seek(player.t + 1 / 60));
  };
  addEventListener('keydown', onKey);
  return () => removeEventListener('keydown', onKey);
}
