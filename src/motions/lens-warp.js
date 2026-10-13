import { seg, ease, clamp } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, isA, { w, h, p }) {
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

// Buraco negro: em coordenadas polares em torno do centro, a cena é amostrada mais longe (encolhe para o
// centro) e girada (redemoinho que aperta perto do horizonte), com aberração cromática radial. O horizonte
// (disco opaco) cresce até cobrir a tela no meio; na volta encolhe e a cena B sai do centro girando no
// mesmo sentido. Disco de acreção: brilho exponencial fora do horizonte com estrias em espiral + anel de fótons.
// Com transparent só o disco, o halo escuro e o brilho (alpha pré-multiplicado).
const RES = 0.5; // resolução do shader (relativa à do canvas): tudo aqui é suave
const FRAG = `
uniform sampler2D u_tex;
uniform float u_scene;
uniform vec2 u_c;
uniform float u_rh;
uniform float u_k;
uniform float u_kw;
uniform float u_g;
uniform float u_twist;
uniform float u_pull;
uniform float u_ab;
uniform float u_rot;
uniform vec3 u_core;
uniform vec3 u_glow;
uniform vec3 u_hot;
void main(){
  float S = min(u_res.x, u_res.y);
  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / S;
  vec2 v = q - u_c;
  float r = length(v);
  float th = atan(v.y, v.x);
  float rh = u_rh;
  float x = r - rh;
  float aa = 1.5 / S;
  float core = 1.0 - smoothstep(-aa, aa, x);
  float xs = max(x, 0.0);

  // brilho do disco de acreção: estrias em espiral girando (sentido de u_twist)
  float sp = th * 3.0 + log(r + 0.02) * 9.0 * sign(u_twist) - u_rot;
  float streak = 0.5 + 0.3 * sin(sp) + 0.2 * sin(sp * 2.0 + 1.7 - u_rot * 0.6);
  float wdt = 0.025 + 0.05 * rh;
  float gl = exp(-xs / wdt) * streak * u_g;
  float ring = exp(-pow((x - 0.006) / 0.0045, 2.0)) * u_g;
  vec3 glow = u_glow * gl * 1.1 + u_hot * (ring * 0.9 + gl * gl * 0.5);
  // halo escuro (a luz da cena é engolida perto do horizonte)
  float shade = (1.0 - smoothstep(0.0, 0.07 + 0.22 * rh, xs)) * smoothstep(0.0, 0.08, u_k);

  vec3 col;
  float a;
  if (u_scene > 0.5) {
    // amostra mais longe (encolhe para o centro) + giro que aperta perto do horizonte
    float kw = u_kw;
    float pull = u_pull * kw * (0.55 + 0.015 / (xs + 0.03));
    float rs = r * (1.0 + pull) + u_pull * kw * 0.04;
    float ts = th + u_twist * kw * (1.1 + 0.55 / (xs + 0.07));
    float ab = u_ab * kw * 0.05 * (rh + 0.06) / (xs + 0.05);
    vec2 dir = vec2(cos(ts), sin(ts));
    vec2 toUV = vec2(S) / u_res;
    vec2 base = u_c;
    float cr = texture(u_tex, ((base + dir * rs * (1.0 + ab)) * toUV + 0.5)).r;
    float cg = texture(u_tex, ((base + dir * rs) * toUV + 0.5)).g;
    float cb = texture(u_tex, ((base + dir * rs * (1.0 - ab)) * toUV + 0.5)).b;
    vec3 sc = vec3(cr, cg, cb);
    sc = mix(sc, u_core, shade * 0.7);
    col = mix(sc + glow, u_core, core);
    a = 1.0;
  } else {
    // só as formas: disco + halo escuro + brilho (cores pré-multiplicadas)
    float ah = max(core, shade * 0.85);
    col = u_core * ah + glow * (1.0 - core);
    a = clamp(max(ah, max(col.r, max(col.g, col.b))), 0.0, 1.0);
    col = min(col, vec3(a));
  }
  outColor = vec4(col, a);
}`;

export default {
  id: 'lens-warp',
  title: 'Lens Warp',
  description: 'A black hole opens in the scene, swirls the image into the horizon until all goes dark, then spits the next scene out in a spiral.',
  category: 'transicoes',
  tags: ['transition', 'shader', 'overlay', 'alpha'],
  duration: 1.6,
  poster: 0.36,

  params: {
    core: { type: 'color', label: 'Event horizon', default: '#050507' },
    glow: { type: 'color', label: 'Glow', default: '#ff7a3d' },
    hot: { type: 'color', label: 'Light ring', default: '#fff1dc' },
    twist: { type: 'range', label: 'Twist', min: -3, max: 3, step: 0.01, default: 1.6 },
    pull: { type: 'range', label: 'Pull', min: 0, max: 2, step: 0.01, default: 1 },
    aberration: { type: 'range', label: 'Chromatic aberration', min: 0, max: 1, step: 0.01, default: 0.5 },
    glowAmt: { type: 'range', label: 'Glow intensity', min: 0, max: 1.5, step: 0.01, default: 1 },
    cx: { type: 'range', label: 'Center X', min: 0, max: 1, step: 0.01, default: 0.5 },
    cy: { type: 'range', label: 'Center Y', min: 0, max: 1, step: 0.01, default: 0.5 },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  setup({ w, h, p, px }) {
    const m = Math.min(w, h);
    const c = [(p.cx - 0.5) * (w / m), (0.5 - p.cy) * (h / m)];
    let rmax = 0;
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rmax = Math.max(rmax, Math.hypot((x * w) / m / 2 - c[0], (y * h) / m / 2 - c[1]));
    const st = { c, rmax: rmax + 0.02 };
    if (p.transparent) return st;
    // prévias A e B em meia resolução (vão como textura; o warp borra mesmo)
    const s = px * 0.5;
    const mk = (isA) => {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * s));
      cv.height = Math.max(1, Math.round(h * s));
      const g = cv.getContext('2d');
      g.scale(s, s);
      preview(g, isA, { w, h, p });
      return cv;
    };
    st.A = mk(true);
    st.B = mk(false);
    return st;
  },

  render(ctx, t, env) {
    const { w, h, p, px, duration, state } = env;
    const mid = duration / 2;
    const isA = t < mid;
    // k: 0 → 1 no meio → 0. Suga acelerando; cospe rápido e assenta devagar.
    const u = isA ? seg(t, duration * 0.04, mid) : 1 - seg(t, mid + duration * 0.02, duration * 0.96);
    // na volta o tempo corre "ao contrário" com outro easing: sai rápido e assenta devagar
    const k = isA ? u : ease.inCubic(u);
    const kw = isA ? ease.inOutSine(u) ** 1.2 : k ** 0.8;
    if (k <= 0) {
      if (!p.transparent) preview(ctx, isA, env);
      return;
    }
    // horizonte: pequeno quase o tempo todo, toma a tela só no fim da sucção
    const rh = state.rmax * k ** 6;
    const g = p.glowAmt * clamp(k * 5, 0, 1);
    const uni = {
      u_scene: !p.transparent,
      u_c: state.c,
      u_rh: rh,
      u_k: k,
      u_kw: kw,
      u_g: g,
      u_twist: (isA ? 1 : -1) * p.twist,
      u_pull: p.pull,
      u_ab: p.aberration,
      u_rot: t * 9 * Math.sign(p.twist || 1),
      u_core: p.core,
      u_glow: p.glow,
      u_hot: p.hot,
    };
    if (!p.transparent) uni.u_tex = isA ? state.A : state.B;
    shader(ctx, FRAG, uni, { w, h, px: px * RES });
  },
};
