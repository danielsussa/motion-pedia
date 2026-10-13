import { TAU, clamp, lerp, seg, ease, rng, spring } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Texto líquido. Num canvas pequeno (metade da resolução) monta-se um CAMPO: as letras já desfocadas
// + "línguas" de gotas feitas de discos suaves somados ('lighter'), como metaballs. O shader corta o
// campo em 0,5 (borda líquida, as gotas se fundem e se soltam sozinhas) e ilumina pela inclinação do
// campo (brilho especular de tinta molhada). Linha do tempo: parado → escorre → as gotas caem → as
// línguas voltam com mola e a palavra se refaz. t=0 e t=duration são o mesmo quadro.
const FRAG = `
uniform sampler2D u_f;
uniform vec3 u_col;
uniform vec3 u_bg;
uniform float u_tr;
uniform float u_gloss;
uniform float u_step;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 e = vec2(u_step) / u_res;
  float f = texture(u_f, uv).a;
  float fw = max(fwidth(f) * 0.8, 0.002);
  float a = smoothstep(0.5 - fw, 0.5 + fw, f);
  float gx = texture(u_f, uv + vec2(e.x, 0.0)).a - texture(u_f, uv - vec2(e.x, 0.0)).a;
  float gy = texture(u_f, uv + vec2(0.0, e.y)).a - texture(u_f, uv - vec2(0.0, e.y)).a;
  // a borda (f perto de 0,5) é íngreme; o miolo (f ≈ 1) é plano
  vec3 n = normalize(vec3(-gx * 2.2, -gy * 2.2, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.6, 0.75));
  float dif = clamp(dot(n, L), 0.0, 1.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 60.0);
  float rim = 1.0 - n.z;
  vec3 col = u_col * (0.62 + 0.38 * dif);
  col *= 1.0 - 0.35 * smoothstep(0.1, 0.6, rim) * step(0.0, -n.y + 0.2);   // sombra embaixo das bordas
  col += vec3(1.0) * spec * u_gloss;
  col += u_col * 0.25 * smoothstep(0.55, 0.95, f) * (0.5 + 0.5 * uv.y);    // corpo levemente translúcido
  if (u_tr > 0.5) outColor = vec4(col * a, a);
  else outColor = vec4(mix(u_bg, col, a), 1.0);
}`;

// Disco suave (alpha 1 no centro → 0 na borda): somados, viram metaballs.
function blobSprite(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  for (let i = 0; i <= 8; i++) {
    const x = i / 8;
    const v = 1 - x * x * (3 - 2 * x);
    gr.addColorStop(x, `rgba(255,255,255,${v})`);
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

const Q = 0.5; // resolução do campo em relação ao canvas real

export default {
  id: 'liquid-text',
  title: 'Liquid Text',
  description: 'Letters soften and melt into drips that fall off screen; the drips spring back and the word reforms.',
  category: 'tipografia',
  tags: ['typography', 'loop', 'simulation', 'shader'],
  duration: 7,
  poster: 3.4,

  params: {
    text: { type: 'text', label: 'Text', default: 'MELT' },
    size: { type: 'range', label: 'Size', min: 0.1, max: 0.4, step: 0.005, default: 0.24 },
    drips: { type: 'range', label: 'Drip amount', min: 0.2, max: 2, step: 0.05, default: 1 },
    length: { type: 'range', label: 'Length', min: 0.3, max: 2, step: 0.05, default: 1 },
    gloss: { type: 'range', label: 'Glow', min: 0, max: 1.5, step: 0.05, default: 0.8 },
    color: { type: 'color', label: 'Liquid', default: '#ff5a36' },
    bg: { type: 'color', label: 'Background', default: '#f1ece4' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p, px }) {
    const s = px * Q; // px do campo por unidade lógica
    const FW = Math.max(2, Math.round(w * s));
    const FH = Math.max(2, Math.round(h * s));
    const m = Math.min(w, h);
    const text = p.text.trim() || ' ';

    let fs = m * p.size;
    const font = (z) => `900 ${z}px Inter, system-ui, sans-serif`;
    const mc = document.createElement('canvas').getContext('2d');
    mc.font = font(fs);
    let tw = mc.measureText(text).width;
    if (tw > w * 0.84) {
      fs *= (w * 0.84) / tw;
      tw = w * 0.84;
    }
    const capH = fs * 0.727;
    const cy = h * (h > w ? 0.4 : 0.38);
    const top = cy - capH / 2;
    const base = cy + capH / 2;
    const blur = fs * 0.04;

    // Máscara: letras desfocadas (o corte em 0,5 arredonda as quinas — já parece líquido parado).
    const mask = document.createElement('canvas');
    mask.width = FW;
    mask.height = FH;
    const g = mask.getContext('2d', { willReadFrequently: true });
    g.scale(s, s);
    g.filter = `blur(${blur * s}px)`;
    g.font = font(fs);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff';
    g.fillText(text, w / 2, base);
    g.filter = 'none';

    // Pontos de onde pingar: colunas com tinta, ancoradas na tinta mais baixa da coluna.
    const data = g.getImageData(0, 0, FW, FH).data;
    const x0 = Math.max(0, Math.floor((w / 2 - tw / 2) * s));
    const x1 = Math.min(FW - 1, Math.ceil((w / 2 + tw / 2) * s));
    const yA = Math.max(0, Math.floor((top - fs * 0.2) * s));
    const yB = Math.min(FH - 1, Math.ceil((base + fs * 0.2) * s));
    const bottomAt = (fx) => {
      for (let y = yB; y >= yA; y--) if (data[(y * FW + fx) * 4 + 3] > 140) return y / s;
      return null;
    };
    const R = rng(p.seed * 7919 + 13);
    const n = Math.max(3, Math.round((tw / fs) * 3.2 * p.drips));
    const drips = [];
    for (let tries = 0; drips.length < n && tries < n * 30; tries++) {
      const fx = Math.round(lerp(x0, x1, R()));
      const yb = bottomAt(fx);
      if (yb == null) continue;
      const x = fx / s;
      if (drips.some((d) => Math.abs(d.x - x) < fs * 0.09)) continue;
      const big = R();
      drips.push({
        x,
        yb,
        t0: 0.7 + R() * 1.1,
        grow: 1.3 + R() * 0.9,
        len: fs * p.length * (0.35 + 1.25 * big * big),
        r: fs * (0.045 + 0.04 * R()),
        bulb: 1.25 + 0.5 * R(),
        drops: big > 0.45 ? 1 + (R() > 0.6 ? 1 : 0) : 0,
        back: 4.35 + R() * 0.7,
      });
    }

    const SP = 64;
    return {
      FW, FH, s, mask, top, fs, drips,
      field: Object.assign(document.createElement('canvas'), { width: FW, height: FH }),
      sprite: blobSprite(SP),
    };
  },

  render(ctx, t, { w, h, p, px, state }) {
    const { FW, FH, s, mask, top, fs, drips, field, sprite } = state;
    const f = field.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, FW, FH);

    // Amolecimento geral: a palavra cede um pouco para baixo (escala vertical presa no topo).
    const sag = 0.06 * ease.inOutSine(seg(t, 0.8, 3.4)) * (1 - spring(seg(t, 4.3, 6.2), 0.25));
    const sy = 1 + sag;
    f.setTransform(1, 0, 0, sy, 0, top * s * (1 - sy));
    f.drawImage(mask, 0, 0);
    f.setTransform(s, 0, 0, s, 0, 0);
    f.globalCompositeOperation = 'lighter';

    const blob = (x, y, r) => {
      const R = r * 2; // o corte em 0,5 do sprite fica em ~metade do raio
      f.drawImage(sprite, x - R, y - R, R * 2, R * 2);
    };
    const g = Math.max(fs * 2.6, h * 1.5); // "gravidade" das gotas soltas (unidades lógicas/s²)
    for (const d of drips) {
      const yb = top + (d.yb - top) * sy - d.r * 0.6;
      const grow = ease.inOutCubic(seg(t, d.t0, d.t0 + d.grow));
      const detach = d.t0 + d.grow;
      // depois de soltar a gota, a língua encolhe um pouco (mola); na volta, recolhe inteira
      const after = d.drops ? 1 - 0.35 * spring(seg(t, detach, detach + 0.9), 0.3) : 1;
      const back = 1 - spring(seg(t, d.back, d.back + 1.5), 0.22);
      const L = d.len * grow * after * back;
      if (L > 0.5) {
        // língua: discos do mais largo (colado na letra) até o pescoço, e um bulbo na ponta
        const steps = Math.max(3, Math.ceil(L / (d.r * 0.45)));
        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          const r = lerp(d.r * 1.35, d.r * 0.62, Math.sqrt(u));
          blob(d.x + Math.sin(u * 2.1 + d.x) * d.r * 0.25 * u, yb + L * u, r);
        }
        const bulb = d.r * lerp(1, d.bulb, clamp(grow * 1.4 - 0.2)) * (0.7 + 0.3 * back);
        blob(d.x + Math.sin(2.1 + d.x) * d.r * 0.25, yb + L + bulb * 0.4, bulb);
      }
      // gotas que se soltam da ponta e caem
      for (let j = 0; j < d.drops; j++) {
        const tj = detach + j * 0.75;
        const dt = t - tj;
        if (dt <= 0) continue;
        const y = yb + d.len * (j ? 0.7 : 1) + d.r * d.bulb * 0.4 + 0.5 * g * dt * dt + fs * 0.4 * dt;
        if (y - d.r * 4 > h) continue;
        const rr = d.r * d.bulb * (j ? 0.8 : 1);
        blob(d.x + Math.sin(2.1 + d.x) * d.r * 0.25, y, rr);
        blob(d.x + Math.sin(2.1 + d.x) * d.r * 0.25, y - rr * 0.9, rr * 0.55); // cauda curta
      }
    }
    f.globalCompositeOperation = 'source-over';

    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    shader(ctx, FRAG, {
      u_f: field,
      u_col: p.color,
      u_bg: p.bg,
      u_tr: p.transparent,
      u_gloss: p.gloss,
      u_step: Math.max(1, 1.5 / Q),
    }, { w, h, px });
  },
};
