// Página usada pelo renderizador headless (scripts/render.mjs). Expõe window.__seek(t).
import { compositions } from './compositions/index.js';
import { motions } from './motions/index.js';
import { CompPlayer } from './lib/comp-player.js';
import { Player } from './lib/player.js';
import { defaults } from './lib/params.js';
import { audioParam } from './lib/assets.js';

const q = new URLSearchParams(location.search);
const host = document.getElementById('host');
const extra = JSON.parse(q.get('params') || '{}');

async function boot() {
  await Promise.all(['100', '200', '300', '400', '500', '600', '700', '800', '900'].map((w) => document.fonts.load(`${w} 40px Inter`)));
  await Promise.all(["italic 40px 'Instrument Serif'", "40px 'Instrument Serif'"].map((f) => document.fonts.load(f)));
  await Promise.all(['400', '600'].map((w) => document.fonts.load(`${w} 40px 'JetBrains Mono'`)));
  await Promise.all(['500', '700', '800', '900'].map((w) => document.fonts.load(`${w} 40px Fraunces`)));
  await document.fonts.ready;

  let player;
  let size;
  let audio = null;
  if (q.get('comp')) {
    const comp = compositions.find((c) => c.id === q.get('comp'));
    player = new CompPlayer(host, comp, { ...defaults(comp), ...extra });
    size = comp.size;
  } else {
    const motion = motions.find((m) => m.id === q.get('motion'));
    size = { w: Number(q.get('w') || 1920), h: Number(q.get('h') || 1080) };
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    host.append(canvas);
    player = new Player(canvas);
    const params = { ...defaults(motion), ...extra };
    player.load(motion, params, size);
    await player.ready;
    audio = audioParam(motion.params, params);
  }

  // composições com <img> (ex.: fundos dos guias do labirinto): só captura depois que todas carregaram
  await Promise.all([...host.querySelectorAll('img')].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
  window.__info = { duration: player.duration, audio, ...size };
  window.__seek = (t) => {
    player.seek(t);
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
  window.__ready = true;
}

boot().catch((e) => (window.__error = String(e)));
