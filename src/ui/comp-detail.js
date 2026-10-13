import { el } from './dom.js';
import { CompPlayer } from '../lib/comp-player.js';
import { loadParams, saveParams, clearParams, defaults } from '../lib/params.js';
import { buildControls } from './controls.js';
import { transport, bindKeys } from './transport.js';
import { renderPanel } from './render-panel.js';

export function renderCompDetail(root, comp) {
  let params = loadParams(comp);
  const host = el('div.comp-host');
  const stage = el('div.stage', {}, host);
  const player = new CompPlayer(host, comp, params, { scale: 0.4 });
  const fit = () => {
    const s = Math.min((stage.clientWidth - 32) / comp.size.w, (stage.clientHeight - 32) / comp.size.h);
    if (s > 0) player.setScale(s);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);

  const onChange = (key, value) => {
    params = { ...params, [key]: value };
    player.setParams(params);
    saveParams(comp, params);
  };
  const controlsHost = el('div');
  const mountControls = () => controlsHost.replaceChildren(buildControls(comp.params ?? {}, params, onChange));
  mountControls();

  root.append(
    el('header.top', {}, el('a.brand', { href: '#/' }, 'motion', el('span', {}, '·'), 'pedia'), el('a.back', { href: '#/' }, '← galeria')),
    el(
      'main.detail',
      {},
      el('section.stage-col', {}, stage, transport(player)),
      el(
        'aside.panel',
        {},
        el('h1', {}, comp.title),
        el('p.desc', {}, comp.description ?? ''),
        el('div.tags', {}, (comp.tags ?? []).map((t) => el('span.tag', {}, t))),
        renderPanel({ kind: 'comp', id: comp.id, getParams: () => params, getTime: () => player.t, alpha: comp.alpha }),
        controlsHost,
        el(
          'div.panel-actions',
          {},
          el('button.btn', { onclick: () => (clearParams(comp), (params = defaults(comp)), player.setParams(params), mountControls()) }, 'Restaurar padrão'),
        ),
      ),
    ),
  );

  const unbind = bindKeys(player);
  fit();
  player.play();
  return () => {
    ro.disconnect();
    unbind();
    player.destroy();
  };
}
