import { el } from './dom.js';

// Painel que chama o renderizador local (POST /__render no dev server) e mostra o progresso.
export function renderPanel({ kind, id, getParams, getTime, getSize, alpha = false }) {
  // na galeria publicada não há o renderizador local: explica como rodar
  if (!import.meta.env.DEV)
    return el('div.render-panel', {}, el('h4', {}, 'Frame-by-frame render'),
      el('p.desc', {}, 'MP4 at 30/60 fps with motion blur, or ProRes with alpha, runs on your machine: clone the repo, ',
        el('code', {}, 'npm run dev'), ' and hit Render. ', el('a', { href: 'https://github.com/danielsussa/motion-pedia', target: '_blank', rel: 'noopener' }, 'GitHub ↗')));
  const fps = el('select', {}, ['30', '60'].map((v) => el('option', { value: v }, `${v} fps`)));
  const mblur = el(
    'select',
    {},
    [['1', 'no motion blur'], ['4', 'motion blur ×4'], ['8', 'motion blur ×8']].map(([v, l]) => el('option', { value: v, selected: v === '4' }, l)),
  );
  const alphaBox = el('input', { type: 'checkbox' });
  const bar = el('div.rp-bar', {}, el('i'));
  const status = el('div.rp-status');
  const buttons = [];

  async function run(extra) {
    buttons.forEach((b) => (b.disabled = true));
    status.replaceChildren('Preparing…');
    bar.firstChild.style.width = '0%';
    try {
      const res = await fetch('/__render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, params: getParams(), ...getSize?.(), ...extra }),
      });
      if (!res.ok && res.status !== 200) throw new Error(await res.text());
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const [cmd, ...rest] = line.split(' ');
          const arg = rest.join(' ');
          if (cmd === 'progress') {
            const [a, b] = arg.split('/').map(Number);
            bar.firstChild.style.width = `${(a / b) * 100}%`;
            status.replaceChildren(`Rendering frame ${a} of ${b}…`);
          } else if (cmd === 'done') {
            bar.firstChild.style.width = '100%';
            status.replaceChildren('Done: ', el('a', { href: `/__renders/${encodeURIComponent(arg)}` }, `download ${arg}`));
          } else if (cmd === 'error') throw new Error(arg);
        }
      }
    } catch (err) {
      status.replaceChildren(`Error: ${err.message.replace(/^error /, '')}`);
    }
    buttons.forEach((b) => (b.disabled = false));
  }

  const videoBtn = el(
    'button.btn.primary',
    { onclick: () => run({ fps: Number(fps.value), mblur: Number(mblur.value), alpha: alphaBox.checked }) },
    'Render video',
  );
  const frameBtn = el('button.btn', { onclick: () => run({ frame: Number(getTime().toFixed(3)), alpha: alphaBox.checked }) }, 'Frame PNG');
  buttons.push(videoBtn, frameBtn);

  return el(
    'div.render-panel',
    {},
    el('h4', {}, 'Local render (frame by frame)'),
    el('div.rp-row', {}, fps, mblur),
    alpha ? el('label.rp-alpha', {}, alphaBox, 'Transparent background (ProRes 4444 .mov)') : null,
    el('div.rp-row', {}, videoBtn, frameBtn),
    bar,
    status,
  );
}
