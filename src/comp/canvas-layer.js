import { Player } from '../lib/player.js';
import { defaults } from '../lib/params.js';
import { motions } from '../motions/index.js';

// Usa um motion de canvas da biblioteca como camada dentro de uma composição.
export function canvasLayer(id, params = {}, { w = 1920, h = 1080 } = {}) {
  const motion = motions.find((m) => m.id === id);
  if (!motion) throw new Error(`motion "${id}" does not exist`);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const player = new Player(canvas);
  player.load(motion, { ...defaults(motion), ...params }, { w, h });
  return { el: canvas, update: (t) => player.seek(((t % motion.duration) + motion.duration) % motion.duration) };
}
