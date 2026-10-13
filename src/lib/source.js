// "Motion dentro de motion": renderiza outro motion num canvas offscreen para usar como textura, máscara
// ou fonte de pixels (título vazado, ASCII, slit-scan, glitch...).
//
// params: { source: SOURCE_PARAM }  →  setup: state.src = createSource(p.source, env, { scale: 0.5 })
// render: const c = state.src.frame(t)  →  canvas com o frame (desenhe com ctx.drawImage(c, 0, 0, w, h)
// ou use como sampler2D no shader()). Cada fonte custa um render extra do motion de origem por frame.
import { registry } from './registry.js';

// Motions que servem de fonte: sem parâmetros de imagem/áudio, fundo opaco, bonitos em loop.
export const SOURCES = ['domain-warp', 'aurora', 'mesh-gradient', 'gradient-orbs', 'flow-field', 'metaballs', 'plexus', 'starfield', 'dot-wave', 'synthwave', 'kaleidoscope', 'truchet', 'iso-wave', 'topo-contours', 'polygon-tunnel'];

export const SOURCE_PARAM = (def = 'domain-warp', label = 'Motion de origem') => ({ type: 'select', label, options: SOURCES, default: def });

// overrides: parâmetros do motion de origem (ex.: cores casando com o motion que o usa).
// scale: resolução relativa ao px do motion que usa (0.5 = metade; fonte desfocada barateia muito).
export function createSource(id, { w, h, px = 1, duration }, { scale = 1, overrides = {} } = {}) {
  const m = registry.get(id);
  if (!m) throw new Error(`motion de origem não encontrado: ${id}`);
  const p = Object.fromEntries(Object.entries(m.params ?? {}).map(([k, d]) => [k, d.default]));
  Object.assign(p, overrides);
  const k = px * scale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const env = { w, h, p, px: k, duration: m.duration };
  const state = m.setup ? m.setup(env) : null;
  let last = null;
  return {
    motion: m,
    canvas,
    duration: m.duration,
    // frame no tempo t do motion de origem (com loop na duração dele). Para manter o loop do motion que
    // usa, passe por exemplo progress * src.duration * n (n inteiro).
    frame(t) {
      const tt = ((t % m.duration) + m.duration) % m.duration;
      if (tt === last) return canvas;
      last = tt;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      m.render(ctx, tt, { ...env, state, progress: tt / m.duration });
      ctx.restore();
      return canvas;
    },
  };
}
