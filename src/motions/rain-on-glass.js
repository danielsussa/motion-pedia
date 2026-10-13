import { TAU, rng, hexToRgb } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Chuva na janela à noite. A câmera foca no vidro: a cidade atrás fica desfocada (bokeh) e embaçada.
// Cada gota é uma lente: mostra a cidade NÍTIDA, invertida e encolhida (amostra c − p·zoom).
// O fundo é pintado uma vez no setup em duas texturas pequenas (nítida e desfocada) passadas como
// ImageData — o gl.js guarda em cache por objeto, então sobem para a GPU uma vez só.
// Gotas que escorrem: colunas de células que descem N células por loop (N inteiro) e o hash usa
// id.y módulo N → t=0 e t=duration são o mesmo quadro. Dentro da célula a gota faz "gruda-e-solta"
// (sobe relativo à grade devagar, cai rápido) com K = N−1 ciclos por loop, e deixa rastro limpo + gotículas.
const FRAG = `
uniform sampler2D u_sharp;
uniform sampler2D u_blur;
uniform float u_prog;
uniform float u_amount;
uniform float u_size;
uniform float u_fog;
uniform float u_seed;
uniform vec3 u_fogc;
const float TAU = 6.28318530718;

float gM; vec2 gRes;
uniform vec2 u_mf;   // margem da textura além da tela (fração de w, h)
vec2 toTex(vec2 q) { return ((q * gM + 0.5 * gRes) / gRes + u_mf) / (1.0 + 2.0 * u_mf); }

vec3 hash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// melhor gota no pixel (a de maior cobertura): cobertura, posição local, raio, zoom da lente
float bm = 0.0; vec2 bp = vec2(0.0); float br = 1.0; float bz = 0.0;
float aa;
void hit(vec2 p, float r, float stretch, float z) {
  if (r <= 0.0005) return;
  float d = length(vec2(p.x, p.y * stretch));
  float m = smoothstep(r, r - aa, d);
  if (m > bm) { bm = m; bp = vec2(p.x, p.y * stretch); br = r; bz = z; }
}

float wob(float y, vec3 h) {
  return 0.09 * sin(y * TAU + h.y * TAU) + 0.05 * sin(y * TAU * 2.0 + h.z * TAU);
}

// camada de gotas escorrendo; devolve o quanto o vidro foi "limpo" pelo rastro
float falling(vec2 uv, float cw, float ch, float ls) {
  float cx = floor(uv.x / cw);
  vec3 hc = hash3(vec2(cx + 3.1, ls + u_seed));
  float N = 4.0 + 2.0 * floor(hc.x * 3.0);           // 4, 6 ou 8 células por loop
  vec2 g = vec2(uv.x, uv.y + u_prog * N * ch + hc.y * ch);
  float cy = floor(g.y / ch);
  float id = mod(cy, N);
  vec3 h = hash3(vec2(cx * 1.7 + id * 31.0, ls * 5.3 + u_seed));
  vec3 h2 = hash3(vec2(cx + 11.0 + id * 7.0, ls * 3.0 + u_seed * 1.3));
  if (h.z > u_amount) return 0.0;
  vec2 l = vec2(g.x / cw - cx, g.y / ch - cy);
  float ph = fract((N - 1.0) * u_prog + h.x);
  // gruda (sobe junto com a grade que desce) e solta (cai rápido, com freio no fim)
  float s = ph < 0.82 ? ph / 0.82 : 1.0 - (1.0 - pow(1.0 - (ph - 0.82) / 0.18, 3.0));
  float slip = ph < 0.82 ? 0.0 : sin(3.14159 * (ph - 0.82) / 0.18);
  float yd = 0.18 + 0.6 * s;
  float r = cw * (0.17 + 0.1 * h2.x);
  float xd = 0.5 + wob(yd, h2);
  vec2 p = vec2((l.x - xd) * cw, (l.y - yd) * ch);
  // forma: rabicho para cima, mais esticada quando escorrega
  float st = p.y > 0.0 ? mix(0.8, 0.55, slip) : 1.05;
  hit(p, r, st, 2.6);
  // rastro acima da gota
  float clear = 0.0;
  if (l.y > yd) {
    float age = (l.y - yd) * ch;
    float dx = (l.x - 0.5 - wob(l.y, h2)) * cw;
    float fade = exp(-age * 3.5) * smoothstep(0.99, 0.85, l.y);
    clear = 0.5 * smoothstep(r * 0.65, r * 0.25, abs(dx)) * fade;
    // gotículas deixadas pelo caminho
    float sp = r * 1.7;
    float j = floor(age / sp);
    vec3 hj = hash3(vec2(j + id * 13.0, cx + ls * 7.0));
    float rr = r * (0.18 + 0.22 * hj.x) * step(0.35, hj.y) * smoothstep(r * 1.2, r * 2.4, age) * (0.5 + 0.5 * fade);
    float cyj = (j + 0.5) * sp + (hj.z - 0.5) * sp * 0.4;
    hit(vec2(dx - (hj.z - 0.5) * r * 0.5, age - cyj), rr, 1.0, 1.6);
  }
  return clear;
}

// gotas paradas (condensação) que nascem e somem; o rastro das que escorrem as apaga
void still(vec2 uv, float sc, float ls, float clear, float amt) {
  vec2 c = floor(uv / sc);
  vec2 f = uv / sc - c;
  vec3 h = hash3(c + ls + u_seed * 0.7);
  if (h.z > amt) return;
  vec3 h2 = hash3(c * 1.3 + 17.0 + ls);
  float k = 1.0 + floor(h2.z * 2.0);
  float a = fract(k * u_prog + h.y);
  float life = smoothstep(0.0, 0.25, a) * smoothstep(1.0, 0.8, a);
  float r = sc * (0.08 + 0.2 * h.x * h.x) * (0.55 + 0.45 * life) * step(0.06, life);
  r *= 1.0 - smoothstep(0.05, 0.3, clear);
  vec2 ctr = 0.3 + 0.4 * h2.xy;
  hit((f - ctr) * sc, r, 1.0, 1.8);
}

void main() {
  gRes = u_res;
  gM = min(u_res.x, u_res.y);
  aa = 1.6 / gM;
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / gM;
  float S = u_size;
  float clear = falling(uv, 0.115 * S, 0.55 * S, 1.0);
  clear = max(clear, falling(uv + vec2(0.037, 0.0), 0.075 * S, 0.42 * S, 2.0));
  still(uv, 0.05 * S, 3.0, clear, u_amount * 0.85);
  still(uv + 0.013, 0.026 * S, 4.0, clear, 0.2 + 0.25 * u_amount);

  vec2 tuv = toTex(uv);
  vec3 blur = texture(u_blur, tuv).rgb;
  // vidro embaçado: véu claro e levemente frio, menos contraste
  float fogMask = u_fog * (0.75 + 0.25 * sin(uv.x * 2.3 + 1.0) * sin(uv.y * 1.9 + 0.4));
  vec3 fogged = mix(blur, u_fogc, 0.42 * fogMask) + 0.03 * fogMask;
  vec3 col = mix(fogged, blur * 1.08, clamp(clear, 0.0, 1.0));

  if (bm > 0.0) {
    float q = clamp(length(bp) / br, 0.0, 1.0);
    // lente: imagem invertida, com mais zoom para fora nas bordas (olho de peixe)
    vec2 sp = uv - bp - bp * bz * (1.0 + 0.035 / br) * (1.0 + 0.6 * q * q);
    vec3 refr = texture(u_sharp, toTex(sp)).rgb;
    refr = mix(refr, texture(u_blur, toTex(sp)).rgb, 0.3);
    // gotas pequenas mostram pouco da cena: puxam para o véu claro
    float small = smoothstep(0.012, 0.004, br);
    refr = mix(refr * 1.3 + u_fogc * 0.07, fogged * 1.15, 0.55 * small);
    // contorno fino escuro (mais embaixo) e borda clara em cima
    float rim = smoothstep(0.78, 1.0, q);
    refr *= 1.0 - 0.6 * rim * smoothstep(-0.6, 0.4, -bp.y / br);
    refr += 0.1 * rim * smoothstep(0.0, 0.6, bp.y / br);
    // brilho especular em cima à esquerda e luz concentrada embaixo
    vec2 sq = bp / br;
    float spec = smoothstep(0.32, 0.0, length(sq - vec2(-0.3, 0.38)));
    float foc = smoothstep(0.5, 0.0, length((sq - vec2(0.12, -0.62)) * vec2(0.7, 1.6)));
    refr += vec3(0.7) * spec * spec + u_fogc * 0.3 * foc;
    col = mix(col, refr, bm);
  }
  float v = length(uv * vec2(0.85, 1.0));
  col *= 1.0 - 0.38 * smoothstep(0.45, 1.25, v);
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.018;
  outColor = vec4(col, 1.0);
}`;

const rgb = (hex) => hexToRgb(hex);
const css = ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Cena da cidade (prédios, janelas acesas, postes, faróis) em coordenadas lógicas.
function buildCity(w, h, p) {
  const R = rng(p.seed * 7919 + 13);
  const M = Math.min(w, h);
  const blds = [];
  const lights = [];
  // três fileiras de prédios: fundo (alto, apagado) → frente (baixo, escuro)
  const rows = [
    { top: [0.12, 0.42], wid: [0.07, 0.16], shade: 0.35, lit: 0.22 },
    { top: [0.3, 0.55], wid: [0.1, 0.22], shade: 0.18, lit: 0.3 },
    { top: [0.5, 0.68], wid: [0.12, 0.3], shade: 0.05, lit: 0.4 },
  ];
  rows.forEach((row, ri) => {
    let x = -R() * M * 0.1;
    while (x < w) {
      const bw = M * (row.wid[0] + R() * (row.wid[1] - row.wid[0]));
      const top = h * (row.top[0] + R() * (row.top[1] - row.top[0]));
      const b = { x, y: top, w: bw, h: h - top, shade: row.shade, ri, wins: [] };
      const cs = M * (0.012 + ri * 0.004);
      for (let wy = top + cs; wy < h * 0.86; wy += cs * 1.6)
        for (let wx = x + cs * 0.6; wx < x + bw - cs; wx += cs * 1.3)
          if (R() < row.lit) b.wins.push([wx, wy, cs * 0.6, cs * 0.8, R() < 0.18 ? 1 : 0, 0.35 + R() * 0.6]);
      blds.push(b);
      x += bw * (0.85 + R() * 0.4);
    }
  });
  // rua: postes (quentes, grandes), faróis (brancos/frios) e lanternas (destaque)
  const nL = Math.round((w / M) * 7);
  for (let i = 0; i < nL; i++) lights.push({ x: ((i + 0.3 + R() * 0.4) / nL) * w, y: h * (0.6 + R() * 0.16), r: M * (0.004 + R() * 0.003), c: 0, a: 0.6 + R() * 0.4, b: M * (0.03 + R() * R() * 0.08) });
  // poucos borrões enormes e fracos em primeiro plano (profundidade)
  for (let i = 0; i < Math.round((w / M) * 3); i++) lights.push({ x: R() * w, y: h * (0.35 + R() * 0.6), r: 0, c: R() < 0.7 ? 0 : 1, a: 0.25 + R() * 0.2, b: M * (0.1 + R() * 0.08) });
  const nC = Math.round((w / M) * 16);
  for (let i = 0; i < nC; i++) {
    const tail = R() < 0.55;
    lights.push({ x: R() * w, y: h * (0.8 + R() * 0.14), r: M * (0.003 + R() * 0.003), c: tail ? 2 : 1, a: 0.7 + R() * 0.3, b: M * (0.015 + R() * R() * 0.06) });
  }
  // algumas janelas viram bokeh também
  for (const b of blds) for (const wv of b.wins) if (R() < 0.12) lights.push({ x: wv[0] + wv[2] / 2, y: wv[1] + wv[3] / 2, r: 0, c: wv[4], a: wv[5] * 0.5, b: M * (0.01 + 0.01 * b.ri + R() * R() * 0.03) });
  return { blds, lights };
}

function paint(w, h, p, city, s, sharp) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.round(w * s));
  cv.height = Math.max(2, Math.round(h * s));
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.scale(s, s);
  const sky = rgb(p.sky);
  const cols = [rgb(p.warm), rgb(p.cool), rgb(p.accent)];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, css(mixc(sky, [0, 0, 0], 0.35)));
  g.addColorStop(0.62, css(mixc(sky, cols[0], 0.32)));
  g.addColorStop(1, css(mixc(sky, cols[0], 0.1)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (const b of city.blds) {
    ctx.fillStyle = css(mixc(sky, [0, 0, 0], 0.55 - b.shade));
    ctx.fillRect(b.x, b.y, b.w, b.h);
    for (const c of [0, 1]) {
      ctx.fillStyle = css(mixc(cols[c], [255, 255, 255], 0.15));
      for (const wv of b.wins) if (wv[4] === c) {
        ctx.globalAlpha = wv[5] * (sharp ? 1 : 0.8);
        ctx.fillRect(wv[0], wv[1], wv[2], wv[3]);
      }
    }
    ctx.globalAlpha = 1;
  }
  // chão molhado
  const fl = ctx.createLinearGradient(0, h * 0.78, 0, h);
  fl.addColorStop(0, css(mixc(sky, [0, 0, 0], 0.6), 0));
  fl.addColorStop(1, css(mixc(sky, [0, 0, 0], 0.6), 0.85));
  ctx.fillStyle = fl;
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
  if (sharp) {
    for (const L of city.lights) {
      if (!L.r) continue;
      ctx.fillStyle = css(mixc(cols[L.c], [255, 255, 255], 0.35), L.a);
      ctx.beginPath();
      ctx.arc(L.x, L.y, L.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = css(cols[L.c], 0.18 * L.a);
      ctx.beginPath();
      ctx.arc(L.x, L.y, L.r * 3, 0, TAU);
      ctx.fill();
    }
    return cv;
  }
  // desfocada: a cena borrada + discos de bokeh com borda levemente mais clara
  const tmp = document.createElement('canvas');
  tmp.width = cv.width;
  tmp.height = cv.height;
  const tc = tmp.getContext('2d');
  tc.drawImage(cv, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = `blur(${Math.max(1, Math.min(w, h) * s * 0.012)}px)`;
  ctx.drawImage(tmp, 0, 0);
  ctx.filter = 'none';
  ctx.scale(s, s);
  ctx.globalCompositeOperation = 'lighter';
  const M = Math.min(w, h);
  for (const L of city.lights) {
    const c = mixc(cols[L.c], [255, 255, 255], 0.1);
    ctx.fillStyle = css(c, 0.16 * L.a);
    ctx.beginPath();
    ctx.arc(L.x, L.y, L.b, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = css(c, 0.1 * L.a * (L.b > M * 0.09 ? 0.3 : 1));
    ctx.lineWidth = L.b * 0.12;
    ctx.beginPath();
    ctx.arc(L.x, L.y, L.b * 0.94, 0, TAU);
    ctx.stroke();
  }
  // halo dos postes
  for (const L of city.lights) {
    if (L.c !== 0 || !L.r) continue;
    const rg = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.b * 2.2);
    rg.addColorStop(0, css(cols[0], 0.22));
    rg.addColorStop(1, css(cols[0], 0));
    ctx.fillStyle = rg;
    ctx.fillRect(L.x - L.b * 2.2, L.y - L.b * 2.2, L.b * 4.4, L.b * 4.4);
  }
  ctx.globalCompositeOperation = 'source-over';
  // suaviza a borda dos discos
  tc.clearRect(0, 0, tmp.width, tmp.height);
  tc.drawImage(cv, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = `blur(${Math.max(0.6, Math.min(w, h) * s * 0.0025)}px)`;
  ctx.drawImage(tmp, 0, 0);
  ctx.filter = 'none';
  return cv;
}

const toData = (cv) => cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);

export default {
  id: 'rain-on-glass',
  title: 'Rain on Glass',
  description: 'Gotas escorrendo numa janela embaçada à noite, cada uma refratando de ponta-cabeça a cidade desfocada atrás.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'shader', 'simulação'],
  duration: 16,

  params: {
    sky: { type: 'color', label: 'Noite', default: '#16202e' },
    warm: { type: 'color', label: 'Luz quente', default: '#ffb35c' },
    cool: { type: 'color', label: 'Luz fria', default: '#b9d7ff' },
    accent: { type: 'color', label: 'Lanternas', default: '#ff4a3d' },
    amount: { type: 'range', label: 'Quantidade de chuva', min: 0.1, max: 1, step: 0.01, default: 0.6 },
    size: { type: 'range', label: 'Tamanho das gotas', min: 0.5, max: 2, step: 0.01, default: 1 },
    fog: { type: 'range', label: 'Embaçado', min: 0, max: 1, step: 0.01, default: 0.55 },
    seed: { type: 'range', label: 'Semente', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, p }) {
    // a textura cobre a tela + margem (as lentes da borda olham para fora do quadro)
    const mg = Math.min(w, h) * 0.2;
    const W = w + 2 * mg, H = h + 2 * mg;
    const city = buildCity(W, H, p);
    const L = Math.max(W, H);
    return {
      mf: [mg / w, mg / h],
      sharp: toData(paint(W, H, p, city, 960 / L, true)),
      blur: toData(paint(W, H, p, city, 400 / L, false)),
      fogc: (() => {
        const s = rgb(p.sky);
        return mixc(mixc(s, [205, 218, 232], 0.55), rgb(p.warm), 0.08).map((v) => v / 255);
      })(),
    };
  },

  render(ctx, t, env) {
    const { p, progress, state: s } = env;
    shader(ctx, FRAG, {
      u_sharp: s.sharp,
      u_blur: s.blur,
      u_prog: progress,
      u_amount: p.amount,
      u_size: p.size,
      u_fog: p.fog,
      u_seed: p.seed * 1.618,
      u_fogc: s.fogc,
      u_mf: s.mf,
    }, env);
  },
};
