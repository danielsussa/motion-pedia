import { el } from './dom.js';
import { Player } from '../lib/player.js';
import { loadParams, saveParams, clearParams, defaults } from '../lib/params.js';
import { exportPng, exportVideo } from '../lib/export.js';
import { buildControls } from './controls.js';
import { transport, bindKeys } from './transport.js';
import { renderPanel } from './render-panel.js';

const FORMATS = [
  { label: '16:9', w: 1920, h: 1080 },
  { label: '9:16', w: 1080, h: 1920 },
  { label: '1:1', w: 1080, h: 1080 },
  { label: '4:5', w: 1080, h: 1350 },
];

export function renderDetail(root, motion) {
  let params = loadParams(motion);
  let format = FORMATS[0];

  const canvas = el('canvas.stage-canvas');
  const player = new Player(canvas);
  player.load(motion, params, format);

  const fmtBtns = FORMATS.map((f) =>
    el(
      'button.chip' + (f === format ? '.on' : ''),
      {
        onclick: () => {
          format = f;
          fmtBtns.forEach((b, i) => b.classList.toggle('on', FORMATS[i] === f));
          player.resize(f);
        },
      },
      f.label,
    ),
  );

  const status = el('span.status');
  const fileName = () => `${motion.id}-${format.w}x${format.h}`;
  const videoBtn = el(
    'button.btn',
    {
      title: 'Grava no próprio navegador, em tempo real (pode perder frames)',
      onclick: async () => {
        videoBtn.disabled = true;
        status.textContent = `Gravando ${motion.duration}s…`;
        try {
          await exportVideo(player, fileName());
          status.textContent = 'Vídeo exportado.';
        } catch (err) {
          status.textContent = err.message;
        }
        videoBtn.disabled = false;
        player.play();
      },
    },
    'Gravar rápido',
  );

  const onChange = (key, value) => {
    params = { ...params, [key]: value };
    player.setParams(params);
    saveParams(motion, params);
  };

  const controlsHost = el('div');
  const mountControls = () => controlsHost.replaceChildren(buildControls(motion.params ?? {}, params, onChange));
  mountControls();

  root.append(
    el('header.top', {}, el('a.brand', { href: '#/' }, 'motion', el('span', {}, '·'), 'pedia'), el('a.back', { href: '#/' }, '← galeria')),
    el(
      'main.detail',
      {},
      el(
        'section.stage-col',
        {},
        el('div.stage', {}, canvas),
        transport(player),
        el(
          'div.toolbar',
          {},
          el('div.chips', {}, fmtBtns),
          el('div.spacer'),
          status,
          el('button.btn', { onclick: () => exportPng(player, `${fileName()}-${player.t.toFixed(2)}s`) }, 'PNG do frame'),
          videoBtn,
        ),
      ),
      el(
        'aside.panel',
        {},
        el('h1', {}, motion.title),
        el('p.desc', {}, motion.description ?? ''),
        el('div.tags', {}, (motion.tags ?? []).map((t) => el('span.tag', {}, t))),
        renderPanel({
          kind: 'motion',
          id: motion.id,
          getParams: () => params,
          getTime: () => player.t,
          getSize: () => ({ w: format.w, h: format.h }),
          alpha: true,
        }),
        controlsHost,
        el(
          'div.panel-actions',
          {},
          el(
            'button.btn',
            {
              onclick: () => {
                clearParams(motion);
                params = defaults(motion);
                player.setParams(params);
                mountControls();
              },
            },
            'Restaurar padrão',
          ),
          el(
            'button.btn',
            {
              onclick: async () => {
                await navigator.clipboard.writeText(JSON.stringify(params, null, 2));
                status.textContent = 'Parâmetros copiados.';
              },
            },
            'Copiar parâmetros',
          ),
        ),
      ),
    ),
  );

  const unbind = bindKeys(player);
  player.play();

  return () => {
    unbind();
    player.destroy();
  };
}
