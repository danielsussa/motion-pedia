import './styles.css';
import { motions } from './motions/index.js';
import { compositions } from './compositions/index.js';
import { renderGallery } from './ui/gallery.js';
import { renderDetail } from './ui/detail.js';
import { renderCompDetail } from './ui/comp-detail.js';

const app = document.getElementById('app');
let cleanup = null;

function route() {
  cleanup?.();
  app.innerHTML = '';
  const [, kind, id] = location.hash.match(/^#\/([mc])\/(.+)$/) ?? [];
  const find = (list) => list.find((x) => x.id === decodeURIComponent(id));
  const motion = kind === 'm' && find(motions);
  const comp = kind === 'c' && find(compositions);
  cleanup = comp ? renderCompDetail(app, comp) : motion ? renderDetail(app, motion) : renderGallery(app, motions, compositions);
  window.scrollTo(0, 0);
}

// Canvas não espera webfont sozinho: carrega antes do primeiro desenho.
Promise.all([
  ...['100', '200', '300', '400', '500', '600', '700', '800', '900'].map((wt) => document.fonts.load(`${wt} 40px Inter`)),
  document.fonts.load("italic 40px 'Instrument Serif'"),
  document.fonts.load("500 40px 'JetBrains Mono'"),
])
  .catch(() => {})
  .then(() => {
    addEventListener('hashchange', route);
    route();
  });
