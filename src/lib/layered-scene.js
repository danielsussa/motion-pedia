// Player de cena 2.5D em camadas exportada pelo repo 2.5d-animation (`anim25d export`).
// Cada camada é um plano na profundidade z (coords da arte original); a câmera vira escala + translação
// por plano (exato para planos frontais sem rotação; o pan entra como deslocamento igual para todos).
// Animação por camada: órbita (sway/bob), balanço (rock), herança do `parent` e, nas tiras de mar,
// uma onda que viaja ao longo da tira (desenhada em fatias verticais). Tudo é função pura de t.
import { TAU, ease } from './anim.js';

const PRESETS = {
  static: () => ({}),
  push_in: (u) => ({ tz: 0.16 * u, ty: -0.01 * u }),
  pull_out: (u) => ({ tz: 0.16 * (1 - u), ty: -0.01 * (1 - u) }),
  truck_right: (u) => ({ tx: -0.05 + 0.1 * u }),
  truck_left: (u) => ({ tx: 0.05 - 0.1 * u }),
  crane_up: (u) => ({ ty: 0.05 - 0.1 * u, tz: 0.03 * u }),
  // desliza em x e gira para manter o plano focal (z = 1.6) no centro
  orbit: (u) => { const tx = 0.08 * (2 * u - 1); return { tx, pan: -Math.atan2(tx, 1.6) }; },
  // dolly-zoom: aproxima e abre o zoom mantendo o plano focal do mesmo tamanho
  vertigo: (u) => { const tz = 0.22 * u; return { tz, zoom: (1.6 - tz) / 1.6 }; },
  drift: (u) => ({ tx: -0.03 + 0.06 * u, tz: 0.08 * u, roll: (-0.6 + 1.2 * u) * (Math.PI / 180) }),
};
export const CAMERA_PRESETS = Object.keys(PRESETS);

export function cameraAt(preset, u, strength = 1) {
  const c = (PRESETS[preset] || PRESETS.static)(ease.inOutSine(Math.min(1, Math.max(0, u))));
  return {
    tx: (c.tx || 0) * strength, ty: (c.ty || 0) * strength, tz: (c.tz || 0) * strength,
    pan: (c.pan || 0) * strength, roll: (c.roll || 0) * strength, zoom: 1 + ((c.zoom ?? 1) - 1) * strength,
  };
}

// período arredondado para caber um número inteiro de ciclos na duração (loop perfeito)
const fit = (period, loop) => (loop ? loop / Math.max(1, Math.round(loop / period)) : period);

function waveFn(L, t, k, loop) {
  const a = L.anim;
  if (!a || !a.wave || k === 0) return null;
  const w = TAU / fit(a.period || 3, loop);
  const kk = TAU / a.wave.wavelength;
  const wt = w * t * (a.wave.dir || 1) - (a.phase || 0) * TAU;
  const amp = a.wave.amp * k;
  // órbita de partícula de água: x adiantado 1/4 de ciclo em relação a y
  return (x) => {
    const arg = kk * x - wt;
    return [0.6 * amp * Math.cos(arg), amp * Math.sin(arg), amp * kk * Math.cos(arg)];
  };
}

const rotAbout = (cx, cy, r) => new DOMMatrix().translate(cx, cy).rotate((r * 180) / Math.PI).translate(-cx, -cy);

// matriz da animação 2D da camada (coords da arte), composta com a do pai
function animMatrix(L, t, k, loop, byName) {
  const a = L.anim || {};
  let M = new DOMMatrix();
  if (k > 0 && (a.bob || a.sway || a.rock)) {
    const w = TAU / fit(a.period || 3, loop);
    const ph = (a.phase || 0) * TAU;
    const dy = (a.bob || 0) * k * Math.sin(w * t + ph);
    const dx = (a.sway || 0) * k * Math.cos(w * t + ph);
    const rot = ((a.rock || 0) * k * Math.PI / 180) * Math.sin(w * t + ph + 0.8);
    M = new DOMMatrix().translate(dx, dy).multiply(rotAbout(L.center[0], L.center[1], rot));
  }
  if (L.parent) {
    const P = byName.get(L.parent);
    const wave = waveFn(P, t, k, loop);
    if (wave) {
      // o objeto "surfa" a onda da tira: sobe/desce e inclina conforme a encosta sob ele
      const [dx, dy, slope] = wave(L.center[0]);
      const ride = new DOMMatrix().translate(dx, dy).multiply(rotAbout(L.center[0], L.center[1], Math.atan(slope) * (a.follow ?? 0.8)));
      M = ride.multiply(M);
    }
    M = animMatrix(P, t, k, loop, byName).multiply(M);
  }
  return M;
}

/**
 * Desenha a cena.
 * opts: { images: Map(name -> img), cam (de cameraAt), motion (multiplica a animação), loop (s),
 *         focusY (0 = topo da arte, 1 = base; enquadramento quando a proporção difere), px }
 */
export function drawLayeredScene(ctx, t, { w, h }, scene, opts) {
  const { images, cam, motion = 1, loop = 0, focusY = 0.5, px = 1 } = opts;
  const W = scene.width, H = scene.height, f = scene.focal;
  const byName = scene._byName || (scene._byName = new Map(scene.layers.map((L) => [L.name, L])));
  const s = Math.max(w / W, h / H); // cover
  const B = ctx.getTransform();
  const frame = new DOMMatrix()
    .translate((w - W * s) / 2, (h - H * s) * focusY)
    .scale(s)
    .multiply(rotAbout(W / 2, H / 2, cam.roll || 0));

  for (const L of scene.layers) {
    const img = images.get(L.name);
    if (!img) continue;
    let P = new DOMMatrix();
    if (L.z != null) {
      const Z = L.z, d = Z - cam.tz;
      if (d <= 0.05) continue;
      const a = (cam.zoom * Z) / d;
      const bx = (-cam.zoom * f * cam.tx) / d - cam.zoom * f * Math.tan(cam.pan);
      const by = (-cam.zoom * f * cam.ty) / d;
      P = new DOMMatrix().translate(W / 2 + bx, H / 2 + by).scale(a).translate(-W / 2, -H / 2);
    }
    const m = B.multiply(L.z != null ? frame : new DOMMatrix().translate((w - W * s) / 2, (h - H * s) * focusY).scale(s))
      .multiply(P)
      .multiply(animMatrix(L, t, motion, loop, byName))
      .translate(L.x, L.y);
    ctx.setTransform(m);

    const wave = waveFn(L, t, motion, loop);
    if (!wave) {
      ctx.drawImage(img, 0, 0);
      continue;
    }
    // tira de mar com onda viajante: fatias verticais de ~2 px reais, cada uma deslocada pela onda
    const scaleReal = Math.abs(m.a) || 1;
    const step = Math.max(1, Math.round(2 / scaleReal));
    const iw = img.width, ih = img.height;
    for (let u0 = 0; u0 < iw; u0 += step) {
      const sw = Math.min(step + 1, iw - u0); // 1 px de sobreposição: sem frestas entre fatias
      const [dx, dy] = wave(L.x + u0 + step / 2);
      ctx.drawImage(img, u0, 0, sw, ih, u0 + dx, dy, sw, ih);
    }
  }
  ctx.setTransform(B);
}
