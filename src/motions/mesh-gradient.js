import { TAU, rng } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Gradiente de malha: 5 pontos de cor que passeiam em órbitas de frequência inteira (loop sem emenda);
// cada pixel mistura as cores por distância inversa num espaço levemente ondulado.
const N = 5;
const FRAG = `
uniform float u_ang;
uniform float u_soft;
uniform float u_warp;
uniform float u_grain;
uniform vec2 u_pt[${N}];
uniform vec3 u_col[${N}];
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  uv.y = -uv.y;
  // ondulação suave do espaço — dá a curvatura "seda" típica do mesh gradient
  vec2 q = uv;
  q += u_warp * vec2(sin(2.3 * uv.y + u_ang + 1.3 * sin(1.7 * uv.x - u_ang)),
                     cos(2.1 * uv.x - u_ang + 1.1 * cos(1.9 * uv.y + 2.0 * u_ang)));
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < ${N}; i++) {
    vec2 d = q - u_pt[i];
    float w = exp(-dot(d, d) / (u_soft * u_soft)) + 1e-5;
    acc += toLin(u_col[i]) * w;
    wsum += w;
  }
  vec3 col = pow(acc / wsum, vec3(1.0 / 2.2));
  col += (hash(gl_FragCoord.xy) - 0.5) * u_grain;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'mesh-gradient',
  title: 'Mesh Gradient',
  description: 'A soft, silky mesh gradient with color points drifting in a loop, Stripe/Apple style.',
  category: 'fundos',
  tags: ['background', 'loop', 'gradient', 'shader'],
  duration: 14,

  params: {
    c1: { type: 'color', label: 'Color 1', default: '#0e1442' },
    c2: { type: 'color', label: 'Color 2', default: '#4b5dff' },
    c3: { type: 'color', label: 'Color 3', default: '#ff6f61' },
    c4: { type: 'color', label: 'Color 4', default: '#ffd9c7' },
    soft: { type: 'range', label: 'Softness', min: 0.15, max: 1, step: 0.01, default: 0.42 },
    warp: { type: 'range', label: 'Warp', min: 0, max: 0.3, step: 0.005, default: 0.16 },
    motion: { type: 'range', label: 'Motion', min: 0, max: 0.5, step: 0.01, default: 0.22 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.12, step: 0.005, default: 0.035 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p }) {
    const rand = rng(p.seed);
    const m = Math.min(w, h);
    const hw = (0.5 * w) / m;
    const hh = (0.5 * h) / m;
    // âncoras espalhadas pela tela (grade jitterizada) e órbitas próprias
    const anchors = [[-0.7, -0.6], [0.65, -0.7], [-0.6, 0.7], [0.7, 0.55], [0.05, 0.0]];
    const colors = ['c3', 'c2', 'c4', 'c1', 'c1'];
    const order = anchors.map((_, i) => i).sort(() => rand() - 0.5);
    const pts = anchors.map(([ax, ay], i) => ({
      x: (ax + (rand() - 0.5) * 0.3) * hw,
      y: (ay + (rand() - 0.5) * 0.3) * hh,
      fx: 1 + Math.floor(rand() * 2),
      fy: 1 + Math.floor(rand() * 2),
      px: rand() * TAU,
      py: rand() * TAU,
      color: colors[order[i]],
    }));
    return { pts, hw, hh };
  },

  render(ctx, t, env) {
    const { p, progress: u, state } = env;
    const ang = TAU * u;
    const amp = p.motion;
    const uniforms = { u_ang: ang, u_soft: p.soft, u_warp: p.warp, u_grain: p.grain };
    state.pts.forEach((o, i) => {
      uniforms[`u_pt[${i}]`] = [
        o.x + Math.sin(o.fx * ang + o.px) * amp * state.hw,
        o.y + Math.cos(o.fy * ang + o.py) * amp * state.hh,
      ];
      uniforms[`u_col[${i}]`] = p[o.color];
    });
    shader(ctx, FRAG, uniforms, env);
  },
};
