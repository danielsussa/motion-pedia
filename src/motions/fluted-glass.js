import { TAU } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Vidro canelado: a tela é cortada em caneluras (cilindros) e cada uma refrata a foto atrás dela —
// a amostra é deslocada pela inclinação da superfície (perfil cúbico: o meio quase reto, as bordas
// puxam forte e chegam a espelhar). Fosco = 7 amostras ao longo do eixo transversal; aberração cromática
// cresce para a borda da canelura. Luz: especular estreito de um lado, sombra no sulco e um fio de luz
// na aresta. O vidro desliza um número inteiro de caneluras na duração e a foto respira num zoom em
// cosseno, então t=0 e t=duration são o mesmo quadro.
const FRAG = `
uniform sampler2D u_img;
uniform vec4 u_rect;    // retângulo cover normalizado (x, y, w, h), origem em cima à esquerda
uniform vec2 u_wh;      // tamanho lógico
uniform float u_flute;  // largura da canelura (unidades lógicas)
uniform float u_shift;  // deslocamento do vidro (em caneluras)
uniform float u_ang;    // inclinação das caneluras (rad)
uniform float u_refr;
uniform float u_frost;
uniform float u_chroma;
uniform float u_light;
uniform vec3 u_tint;
uniform float u_tintAmt;
uniform float u_aa;     // ~1 px real em unidades de canelura
vec3 photo(vec2 pos) {
  vec2 s = pos / u_wh;
  vec2 uv = clamp((s - u_rect.xy) / u_rect.zw, vec2(0.001), vec2(0.999));
  return texture(u_img, vec2(uv.x, 1.0 - uv.y)).rgb;
}
void main() {
  vec2 pos = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y) * u_wh;
  vec2 ctr = 0.5 * u_wh;
  float cs = cos(u_ang), sn = sin(u_ang);
  vec2 across = vec2(cs, sn);            // eixo transversal às caneluras (na tela)
  float x = dot(pos - ctr, across) / u_flute + u_shift;
  float u = fract(x) - 0.5;              // -0.5..0.5 dentro da canelura
  float n = 2.0 * u;                     // inclinação normalizada
  // deslocamento: quase nada no meio, forte na borda (perfil cúbico) — puxa em direção oposta à inclinação
  float off = -u_refr * u_flute * (0.55 * n + 0.75 * n * n * n);
  vec3 col = vec3(0.0);
  float wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    float k = float(i) / 3.0;
    float wgt = 1.0 - 0.6 * abs(k);
    vec2 base = pos + across * (off + k * u_frost * u_flute * 0.32);
    float ca = u_chroma * u_flute * 0.06 * n;
    col.r += photo(base + across * ca).r * wgt;
    col.g += photo(base).g * wgt;
    col.b += photo(base - across * ca).b * wgt;
    wsum += wgt;
  }
  col /= wsum;
  // tinta e névoa leve do vidro
  col = mix(col, col * u_tint * 1.15, u_tintAmt);
  col = mix(col, vec3(dot(col, vec3(0.333))), 0.06);
  // iluminação do cilindro: normal (n, sqrt(1-n²)), luz vinda de um lado
  vec3 N = normalize(vec3(n * 0.95, 0.0, sqrt(max(0.0, 1.0 - 0.9 * n * n))));
  vec3 L = normalize(vec3(-0.85, 0.0, 0.53));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(0.0, dot(N, H)), 140.0);
  float diff = dot(N, L);
  col *= 0.9 + 0.12 * diff;
  col += u_light * (0.4 * spec + 0.05 * smoothstep(0.2, 0.5, -u));
  // sulco: sombra suave nos dois lados + fio de luz na aresta
  float edge = 0.5 - abs(u);             // distância ao sulco (em caneluras)
  col *= 1.0 - 0.32 * u_light * (1.0 - smoothstep(0.0, 0.09, edge));
  float aa = max(u_aa, 0.004);
  col += u_light * 0.22 * (1.0 - smoothstep(0.0, 0.025 + aa, edge)) * step(0.0, u);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export default {
  id: 'fluted-glass',
  title: 'Fluted Glass',
  description: 'The photo behind fluted glass: each flute refracts and mirrors a slice of the image, with glints on the ridges, as the glass glides endlessly.',
  category: 'imagem',
  tags: ['loop', 'background', 'shader', 'pattern'],
  duration: 8,
  poster: 2.4,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/portrait.jpg' },
    flutes: { type: 'range', label: 'Flutes (short side)', min: 4, max: 40, step: 1, default: 13 },
    refraction: { type: 'range', label: 'Refraction', min: 0, max: 1.5, step: 0.01, default: 0.7 },
    frost: { type: 'range', label: 'Frost', min: 0, max: 1, step: 0.01, default: 0.25 },
    angle: { type: 'range', label: 'Tilt', min: -45, max: 45, step: 1, default: 0 },
    speed: { type: 'range', label: 'Flutes per turn', min: 0, max: 8, step: 1, default: 2 },
    light: { type: 'range', label: 'Glass shine', min: 0, max: 1, step: 0.01, default: 0.6 },
    chroma: { type: 'range', label: 'Chromatic aberration', min: 0, max: 1, step: 0.01, default: 0.35 },
    tint: { type: 'color', label: 'Glass tint', default: '#cfe3e6' },
    tintAmt: { type: 'range', label: 'Tint strength', min: 0, max: 1, step: 0.01, default: 0.15 },
    focusY: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.3 },
  },

  render(ctx, t, env) {
    const { w, h, p, px, progress } = env;
    const img = asset(p.image);
    if (!img) {
      ctx.fillStyle = '#1b1d21';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const z = 1.06 + 0.04 * (0.5 - 0.5 * Math.cos(TAU * progress));
    const r = coverRect(img, w, h, { zoom: z, fx: 0.5, fy: p.focusY });
    const flute = Math.min(w, h) / p.flutes;
    shader(ctx, FRAG, {
      u_img: img,
      u_rect: [r.x / w, r.y / h, r.w / w, r.h / h],
      u_wh: [w, h],
      u_flute: flute,
      u_shift: -Math.round(p.speed) * progress,
      u_ang: (p.angle * Math.PI) / 180,
      u_refr: p.refraction,
      u_frost: p.frost,
      u_chroma: p.chroma,
      u_light: p.light,
      u_tint: p.tint,
      u_tintAmt: p.tintAmt,
      u_aa: 1 / (flute * px),
    }, env);
  },
};
