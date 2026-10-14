import { asset } from '../lib/assets.js';
import { CAMERA_PRESETS, cameraAt, drawLayeredScene } from '../lib/layered-scene.js';
import { TITLE_PARAMS, drawPosterTitle } from './_poster-title.js';
import scene from './_painted-harbor-3d-scene.js';

// Versão 2.5D do painted-harbor, montada pelo pipeline do repo 2.5d-animation (`anim25d export`):
// camadas recortadas por IA (SAM 2 + matting), o que fica atrás de cada objeto gerado (fundo limpo por IA),
// cada camada num plano 3D. O mar é fatiado em tiras de papel que seguem as cristas da própria arte;
// em cada tira corre uma onda, e as galés sobem e inclinam com ela. Parada, a cena reproduz a ilustração.
// Coordenadas e camadas em _painted-harbor-3d-scene.js; PNGs em public/scenes/siracusa-3d/.
const LAYER_PARAMS = Object.fromEntries(
  scene.layers.map((L) => [`layer_${L.name}`, { type: 'image', label: `Layer: ${L.name}`, default: L.src }]),
);

export default {
  id: 'painted-harbor-3d',
  title: 'Painted Harbor 3D',
  description: 'The painted harbor as a 2.5D scene: AI-cut layers on 3D planes, a camera move and a cut-paper sea whose waves the galleys ride.',
  category: 'fundos',
  tags: ['background', 'loop', '3d', 'intro'],
  duration: 6,
  poster: 1.2,

  params: {
    camera: { type: 'select', label: 'Camera', options: CAMERA_PRESETS, default: 'static' },
    strength: { type: 'range', label: 'Camera strength', min: 0, max: 2, step: 0.01, default: 1 },
    motion: { type: 'range', label: 'Waves & ships', min: 0, max: 1.5, step: 0.01, default: 0.6 },
    focusY: { type: 'range', label: 'Framing (top–bottom)', min: 0, max: 1, step: 0.01, default: 0.62 },
    showTitle: { type: 'boolean', label: 'Title', default: false },
    ...TITLE_PARAMS,
    ...LAYER_PARAMS,
  },

  render(ctx, t, env) {
    const { w, h, p, duration, progress } = env;
    ctx.fillStyle = '#f8eedb'; // enquanto as camadas carregam
    ctx.fillRect(0, 0, w, h);
    const images = new Map();
    for (const L of scene.layers) images.set(L.name, asset(p[`layer_${L.name}`]));
    // câmera parada = loop perfeito; com movimento, ela percorre a duração inteira
    const cam = cameraAt(p.camera, progress, p.strength);
    drawLayeredScene(ctx, t, env, scene, { images, cam, motion: p.motion, loop: duration, focusY: p.focusY, px: env.px });
    if (p.showTitle) drawPosterTitle(ctx, t, env);
  },
};
