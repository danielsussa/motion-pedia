import { TAU, seg, ease, lerp, smoothstep } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Lupa: um passe de shader desenha a foto (escurecida e um pouco dessaturada fora da lente), a sombra
// suave da lupa e do cabo, o interior ampliado (com abaulamento na borda, aberração cromática radial,
// escurecimento da espessura do vidro e reflexos), o aro metálico e o cabo — tudo em SDF com antialias
// de ~1 px. A lupa percorre paradas fixas (inOutCubic, velocidade zero em cada parada) e começa/termina
// na mesma parada; na pausa a ampliação "foca" um pouco a mais. t=0 e t=duration são o mesmo quadro.
const FRAG = `
uniform sampler2D u_img;
uniform vec4 u_rect;    // retângulo cover normalizado (x, y, w, h), origem em cima à esquerda
uniform vec2 u_wh;
uniform vec2 u_c;       // centro da lente (lógico)
uniform float u_R;      // raio do vidro
uniform float u_rw;     // largura do aro
uniform float u_mag;
uniform float u_bulge;
uniform float u_ab;
uniform float u_dim;
uniform float u_handle; // 0/1
uniform vec2 u_hdir;
uniform vec3 u_rim;
uniform vec3 u_grip;
uniform vec3 u_shade;   // cor da sombra/escurecimento
vec3 photo(vec2 pos) {
  vec2 s = pos / u_wh;
  vec2 uv = clamp((s - u_rect.xy) / u_rect.zw, vec2(0.001), vec2(0.999));
  return texture(u_img, vec2(uv.x, 1.0 - uv.y)).rgb;
}
float segDist(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  vec2 pos = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y) * u_wh;
  float aa = u_wh.x / u_res.x;               // 1 px real em unidades lógicas
  float R = u_R, rw = u_rw;
  vec2 d = pos - u_c;
  float r = length(d);
  vec2 perp = vec2(-u_hdir.y, u_hdir.x);

  // cabo: pescoço (cor do aro) + empunhadura
  vec2 hA = u_c + u_hdir * (R + rw * 0.5);
  vec2 hB = u_c + u_hdir * (R + rw + R * 0.32);
  vec2 hC = u_c + u_hdir * (R + rw + R * 0.4);
  vec2 hD = u_c + u_hdir * (R + rw + R * 1.55);
  float hn, hg;
  float neck = segDist(pos, hA, hB, hn) - R * 0.075;
  float grip = segDist(pos, hC, hD, hg) - R * 0.13;

  // fundo: foto escurecida fora da lente
  vec3 bg = photo(pos);
  float bl = dot(bg, vec3(0.2126, 0.7152, 0.0722));
  bg = mix(bg, vec3(bl), 0.35 * u_dim / 0.5);
  bg = mix(bg, u_shade, u_dim);
  // sombra projetada (lente + cabo), deslocada para baixo e à direita
  vec2 so = vec2(0.05, 0.1) * R;
  float sl = length(pos - u_c - so) - (R + rw);
  float hh;
  float sg = u_handle > 0.5 ? segDist(pos - so, hA, hD, hh) - R * 0.12 : 1e5;
  float sd = min(sl, sg);
  float sh = 1.0 - smoothstep(-0.05 * R, 0.28 * R, sd);
  vec3 col = mix(bg, u_shade * 0.6, 0.5 * sh);

  // vidro: ampliação com abaulamento na borda e aberração cromática radial
  float rn = r / R;
  if (rn < 1.02) {
    float q = rn * rn;
    float k = (1.0 + u_bulge * q * q) / u_mag;
    float ab = u_ab * 0.035 * q * rn;
    vec3 lens;
    lens.r = photo(u_c + d * k * (1.0 + ab)).r;
    lens.g = photo(u_c + d * k).g;
    lens.b = photo(u_c + d * k * (1.0 - ab)).b;
    // espessura do vidro: escurece perto do aro
    lens = mix(lens, u_shade, 0.22 * smoothstep(0.86, 1.0, rn));
    // reflexos: brilho largo no alto à esquerda + filete fino na borda interna
    vec2 dn = d / R;
    float sheen = 1.0 - smoothstep(0.0, 0.75, length(dn - vec2(-0.38, -0.42)));
    lens += 0.10 * sheen * sheen;
    float ang = max(0.0, dot(normalize(d + 1e-5), normalize(vec2(-0.7, -0.75))));
    lens += 0.32 * pow(ang, 6.0) * smoothstep(0.86, 0.96, rn) * (1.0 - smoothstep(0.96, 1.0, rn));
    float ang2 = max(0.0, dot(normalize(d + 1e-5), normalize(vec2(0.7, 0.75))));
    lens += 0.12 * pow(ang2, 8.0) * smoothstep(0.9, 0.99, rn);
    col = mix(col, clamp(lens, 0.0, 1.0), smoothstep(aa, -aa, r - R));
  }

  // aro: perfil arredondado, luz vinda do alto à esquerda
  float ringD = abs(r - R - rw * 0.5) - rw * 0.5;
  if (ringD < aa * 2.0) {
    float v = clamp((r - R) / rw, 0.0, 1.0) * 2.0 - 1.0;   // -1 dentro .. 1 fora
    vec2 nd = normalize(d + 1e-5);
    vec3 N = normalize(vec3(nd * v * 0.9, sqrt(max(0.0, 1.0 - 0.81 * v * v))));
    vec3 L = normalize(vec3(-0.45, -0.6, 0.66));
    float diff = max(0.0, dot(N, L));
    float spec = pow(max(0.0, dot(N, normalize(L + vec3(0.0, 0.0, 1.0)))), 40.0);
    vec3 rc = u_rim * (0.35 + 0.85 * diff) + vec3(1.0) * spec * 0.55;
    col = mix(col, clamp(rc, 0.0, 1.0), smoothstep(aa, -aa, ringD));
  }

  // cabo
  if (u_handle > 0.5) {
    float s1 = clamp(dot(pos - hA, perp) / (R * 0.075), -1.0, 1.0);
    float l1 = 0.35 + 0.8 * max(0.0, 0.55 * s1 + 0.8 * sqrt(1.0 - s1 * s1));
    vec3 nc = u_rim * l1 + vec3(1.0) * 0.4 * pow(max(0.0, 1.0 - abs(s1 + 0.45) * 2.2), 4.0);
    col = mix(col, clamp(nc, 0.0, 1.0), smoothstep(aa, -aa, neck));
    float s2 = clamp(dot(pos - hC, perp) / (R * 0.13), -1.0, 1.0);
    float l2 = 0.4 + 0.75 * max(0.0, 0.55 * s2 + 0.8 * sqrt(1.0 - s2 * s2));
    vec3 gc = u_grip * l2 + vec3(1.0) * 0.18 * pow(max(0.0, 1.0 - abs(s2 + 0.5) * 2.5), 3.0);
    col = mix(col, clamp(gc, 0.0, 1.0), smoothstep(aa, -aa, grip));
  }
  outColor = vec4(col, 1.0);
}`;

// paradas da lupa em fração da área útil (x, y) — a primeira se repete no fim
const STOPS = [
  [0.5, 0.36],
  [0.18, 0.62],
  [0.8, 0.25],
  [0.66, 0.8],
];
const HOLD = 0.38; // fração de cada trecho parada

function pathAt(u) {
  const n = STOPS.length;
  const x = ((u % 1) + 1) % 1 * n;
  const i = Math.floor(x);
  const local = x - i;
  const a = STOPS[i], b = STOPS[(i + 1) % n];
  const k = ease.inOutCubic(seg(local, HOLD, 1));
  // pausa: 1 no meio da parada, 0 durante a viagem
  const rest = Math.sin(Math.PI * Math.min(1, local / HOLD)) * (local < HOLD ? 1 : 0);
  return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), rest };
}

export default {
  id: 'magnifier',
  title: 'Lupa',
  description: 'Uma lupa de aro metálico passeia sobre a foto parando em pontos, ampliando o que está embaixo com vidro abaulado, reflexos e sombra.',
  category: 'imagem',
  tags: ['loop', 'shader', 'forma'],
  duration: 10,
  poster: 0.15,

  params: {
    image: { type: 'image', label: 'Foto', default: '/samples/portrait.jpg' },
    magnification: { type: 'range', label: 'Ampliação', min: 1.2, max: 5, step: 0.05, default: 2.2 },
    size: { type: 'range', label: 'Tamanho da lente', min: 0.1, max: 0.45, step: 0.01, default: 0.22 },
    bulge: { type: 'range', label: 'Abaulamento', min: 0, max: 1.5, step: 0.01, default: 0.45 },
    aberration: { type: 'range', label: 'Aberração cromática', min: 0, max: 1, step: 0.01, default: 0.4 },
    dim: { type: 'range', label: 'Escurecer fora', min: 0, max: 0.8, step: 0.01, default: 0.3 },
    rim: { type: 'color', label: 'Aro', default: '#c9ccd2' },
    grip: { type: 'color', label: 'Cabo', default: '#1f1a17' },
    handle: { type: 'boolean', label: 'Mostrar cabo', default: true },
    focusY: { type: 'range', label: 'Foco vertical', min: 0, max: 1, step: 0.01, default: 0.3 },
  },

  render(ctx, t, env) {
    const { w, h, p, progress } = env;
    const img = asset(p.image);
    if (!img) {
      ctx.fillStyle = '#1b1d21';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const m = Math.min(w, h);
    const R = m * p.size;
    const rw = R * 0.085;
    const st = pathAt(progress);
    // área útil: a lente inteira dentro do quadro (com folga)
    const mx = Math.min(w / 2, R * 1.25), my = Math.min(h / 2, R * 1.25);
    const cx = mx + st.x * (w - 2 * mx);
    const cy = my + st.y * (h - 2 * my);
    const r = coverRect(img, w, h, { zoom: 1.03 + 0.02 * (0.5 - 0.5 * Math.cos(TAU * progress)), fx: 0.5, fy: p.focusY });
    // cabo para baixo; gira suavemente da direita para a esquerda conforme a lente anda para a direita
    const hx = 0.6 - 1.2 * smoothstep(w * 0.4, w * 0.85, cx);
    const ang = Math.atan2(0.8, hx);
    shader(ctx, FRAG, {
      u_img: img,
      u_rect: [r.x / w, r.y / h, r.w / w, r.h / h],
      u_wh: [w, h],
      u_c: [cx, cy],
      u_R: R,
      u_rw: rw,
      u_mag: p.magnification * (1 + 0.08 * st.rest),
      u_bulge: p.bulge,
      u_ab: p.aberration,
      u_dim: p.dim,
      u_handle: p.handle,
      u_hdir: [Math.cos(ang), Math.sin(ang)],
      u_rim: p.rim,
      u_grip: p.grip,
      u_shade: '#0b0c0f',
    }, env);
  },
};
