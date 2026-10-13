import { el } from './dom.js';
import { Player } from '../lib/player.js';
import { CompPlayer } from '../lib/comp-player.js';
import { loadParams } from '../lib/params.js';
import { CATEGORIES } from '../motions/index.js';

export function renderGallery(root, motions, compositions) {
  const players = [];
  const observers = [];
  const all = [...compositions, ...motions];
  const tags = [...new Set(all.flatMap((m) => m.tags ?? []))].sort();
  let query = '';
  let activeTag = null;

  const sections = el('div');
  const chips = el('div.chips');
  const count = el('span.count');

  const hover = (player, poster) => ({
    onmouseenter: () => player.play(),
    onmouseleave: () => (player.pause(), player.seek(poster)),
  });

  const body = (m) =>
    el(
      'div.card-body',
      {},
      el('h3', {}, m.title),
      el('p', {}, m.description ?? ''),
      el('div.tags', {}, (m.tags ?? []).map((t) => el('span.tag', {}, t))),
    );

  // Miniaturas só são criadas quando o card entra na tela (setups podem ser caros).
  const lazy = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) (lazy.unobserve(e.target), e.target._mount());
  }, { rootMargin: '300px' });
  observers.push(lazy);

  const motionCard = (m) => {
    const canvas = el('canvas.thumb', { width: 480, height: 270 });
    const poster = m.poster ?? m.duration * 0.45;
    let player = null;
    const card = el(
      'a.card',
      {
        href: `#/m/${m.id}`,
        onmouseenter: () => player?.play(),
        onmouseleave: () => player && (player.pause(), player.seek(poster)),
      },
      el('div.thumb-wrap', {}, canvas, el('span.badge', {}, `${m.duration}s`)),
      body(m),
    );
    card._mount = () => {
      try {
        player = new Player(canvas, { scale: 0.25 });
        player.load(m, loadParams(m), { w: 1920, h: 1080 });
        player.seek(poster);
        players.push(player);
      } catch (err) {
        console.error(`motion ${m.id}:`, err);
      }
    };
    lazy.observe(card);
    return card;
  };

  const compCard = (c) => {
    const host = el('div.comp-host');
    const wrap = el('div.thumb-wrap.comp-thumb', {}, host, el('span.badge', {}, `${c.duration}s`));
    const player = new CompPlayer(host, c, loadParams(c), { scale: 0.2 });
    const poster = c.poster ?? c.duration * 0.45;
    player.seek(poster);
    players.push(player);
    const ro = new ResizeObserver(() => wrap.clientWidth && player.setScale(wrap.clientWidth / c.size.w));
    ro.observe(wrap);
    observers.push(ro);
    return el('a.card', { href: `#/c/${c.id}`, ...hover(player, poster) }, wrap, body(c));
  };

  const refresh = () => {
    players.splice(0).forEach((p) => p.destroy());
    observers.slice(1).forEach((o) => o.disconnect());
    observers.splice(1);
    const q = query.trim().toLowerCase();
    const match = (m) =>
      (!activeTag || m.tags?.includes(activeTag)) &&
      (!q || [m.title, m.description, ...(m.tags ?? [])].join(' ').toLowerCase().includes(q));
    const comps = compositions.filter(match);
    const mots = motions.filter(match);
    sections.replaceChildren(...[
      comps.length ? el('section', {}, el('h2.section-title', {}, 'Compositions', el('span', {}, ` ${comps.length}`)), el('div.grid', {}, comps.map(compCard))) : null,
      ...CATEGORIES.map((cat) => {
        const list = mots.filter((m) => (m.category ?? 'formas') === cat.id);
        return list.length ? el('section', {}, el('h2.section-title', {}, cat.label, el('span', {}, ` ${list.length}`)), el('div.grid', {}, list.map(motionCard))) : null;
      }),
      !comps.length && !mots.length ? el('p.empty', {}, 'Nothing found.') : null,
    ].filter(Boolean));
    count.textContent = `${comps.length + mots.length} of ${all.length}`;
    chips.replaceChildren(
      ...[null, ...tags].map((t) =>
        el('button.chip' + (t === activeTag ? '.on' : ''), { onclick: () => ((activeTag = t), refresh()) }, t ?? 'all'),
      ),
    );
  };

  root.append(
    el(
      'header.top',
      {},
      el('a.brand', { href: '#/' }, 'motion', el('span', {}, '·'), 'pedia'),
      el('input.search', { type: 'search', placeholder: 'Search motions, tags…', oninput: (e) => ((query = e.target.value), refresh()) }),
      count,
      el('a.gh', { href: 'https://github.com/danielsussa/motion-pedia', target: '_blank', rel: 'noopener' }, 'GitHub ↗'),
    ),
    el(
      'main.gallery',
      {},
      el('p.intro', {}, 'Motion graphics in pure JavaScript (Canvas 2D + WebGL). Hover a card to play it, open it to tweak every parameter live and export a video. Free, with the code on GitHub.'),
      chips,
      sections,
    ),
  );
  refresh();

  return () => {
    players.forEach((p) => p.destroy());
    observers.forEach((o) => o.disconnect());
  };
}
