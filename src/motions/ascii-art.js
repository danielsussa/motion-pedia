import { TAU, lerp, seg, ease } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { drawCover } from '../lib/image.js';
import { SOURCES, createSource } from '../lib/source.js';
import { shader } from '../lib/gl.js';

// ASCII art em shader: a origem (foto ou outro motion) é reduzida para uma grade cols×rows (1 px por célula,
// drawImage com suavização faz a média) e o shader escolhe, por célula, o glifo de um atlas pré-renderizado
// (JetBrains Mono) pelo brilho. Custo em JS é O(1) por frame — não há laço por caractere.

const CHARSETS = {
  'clássico': ' .:-=+*#%@',
  detalhado: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocos: ' ░▒▓█',
  'binário': ' .01',
};

const FRAG = `
uniform sampler2D u_grid;
uniform sampler2D u_atlas;
uniform vec2 u_cells;
uniform vec2 u_cellPx;
uniform float u_n;
uniform float u_contrast;
uniform float u_sharp;
uniform vec2 u_levels;
uniform float u_mono;
uniform vec3 u_ink;
uniform vec3 u_accent;
uniform vec3 u_bg;
uniform float u_reveal;
uniform float u_hide;
uniform float u_step;
uniform float u_flicker;
uniform vec2 u_focus;

// brilho = média entre luminância e o maior canal (cores saturadas não somem no escuro)
float br(vec3 c) { return 0.5 * dot(c, vec3(0.2126, 0.7152, 0.0722)) + 0.5 * max(c.r, max(c.g, c.b)); }

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main() {
  vec2 fc = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 cell = floor(fc / u_cellPx);
  vec2 local = (fc - cell * u_cellPx) / u_cellPx;
  vec2 guv = vec2((cell.x + 0.5) / u_cells.x, 1.0 - (cell.y + 0.5) / u_cells.y);
  vec3 c = texture(u_grid, guv).rgb;
  float l = br(c);
  // contraste local (unsharp mask com vizinhos a 2 células): realça olhos, bordas e contornos
  vec2 o = 2.0 / u_cells;
  float nb = 0.0;
  nb += br(texture(u_grid, guv + vec2(o.x, 0.0)).rgb);
  nb += br(texture(u_grid, guv - vec2(o.x, 0.0)).rgb);
  nb += br(texture(u_grid, guv + vec2(0.0, o.y)).rgb);
  nb += br(texture(u_grid, guv - vec2(0.0, o.y)).rgb);
  nb += br(texture(u_grid, guv + o).rgb);
  nb += br(texture(u_grid, guv - o).rgb);
  nb += br(texture(u_grid, guv + vec2(o.x, -o.y)).rgb);
  nb += br(texture(u_grid, guv - vec2(o.x, -o.y)).rgb);
  l += u_sharp * (l - nb / 8.0);
  l = (l - u_levels.x) / max(0.05, u_levels.y - u_levels.x);
  l = clamp((l - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  float g = floor(l * (u_n - 1.0) + 0.5);

  // cor do glifo: matiz da origem com o brilho "normalizado" (a densidade já mostra a luz)
  float mx = max(max(c.r, c.g), max(c.b, 0.06));
  vec3 col = mix(u_ink, mix(c, c / mx, 0.55) * (0.55 + 0.45 * l), 1.0 - u_mono);

  // onda de revelação (entrada) e de saída a partir do foco
  vec2 cc = (cell + 0.5) * u_cellPx - u_focus * u_res;
  float d = length(cc) / (0.6 * length(u_res));
  float hc = hash(cell);
  float fin = u_reveal - d - hc * 0.03;
  float fout = u_hide - d - hc * 0.03;
  float band = 0.035;
  float scram = 0.0;
  if (fin < 0.0 || fout > band) { g = 0.0; }
  else if (fin < band) { scram = 1.0 - 0.6 * fin / band; }
  else if (fout > 0.0) { scram = 0.4 + 0.6 * fout / band; }
  else if (g > 0.5 && hash(cell + u_step * 0.173) < u_flicker) { scram = 0.6; }
  if (scram > 0.0) {
    g = 1.0 + floor(hash(cell + vec2(u_step * 0.37, 1.7)) * (u_n - 1.0));
    col = mix(col, u_accent, scram);
  }

  float a = g < 0.5 ? 0.0 : texture(u_atlas, vec2((g + local.x) / u_n, 1.0 - local.y)).a;
  outColor = vec4(mix(u_bg, col, a), 1.0);
}`;

const OPTS = ['foto', ...SOURCES];

export default {
  id: 'ascii-art',
  title: 'ASCII Art',
  description: 'A photo or another motion becomes a grid of mono characters, each glyph picked by brightness, revealed by a sweeping wave.',
  category: 'imagem',
  tags: ['image', 'typography', 'shader', 'loop'],
  duration: 8,
  poster: 4,

  params: {
    source: { type: 'select', label: 'Source', options: OPTS, default: 'foto' },
    image: { type: 'image', label: 'Photo', default: '/samples/portrait.jpg' },
    charset: { type: 'select', label: 'Characters', options: Object.keys(CHARSETS), default: 'clássico' },
    color: { type: 'select', label: 'Color', options: ['mono', 'origem'], default: 'mono' },
    cell: { type: 'range', label: 'Cell size', min: 8, max: 48, step: 1, default: 14 },
    contrast: { type: 'range', label: 'Contrast', min: 0.5, max: 2.5, step: 0.05, default: 0.95 },
    sharp: { type: 'range', label: 'Edge sharpening', min: 0, max: 3, step: 0.05, default: 1.5 },
    ink: { type: 'color', label: 'Ink (mono)', default: '#ece6d8' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Background', default: '#0b0b0e' },
    focus: { type: 'range', label: 'Vertical focus (photo)', min: 0, max: 1, step: 0.01, default: 0.3 },
  },

  setup(env) {
    const { w, h, p, px } = env;
    const m = Math.min(w, h);
    const fs = (p.cell * m) / 1080; // tamanho da fonte em unidades lógicas
    const cw = fs * 0.6;
    const ch = fs * 1.08;
    const cols = Math.ceil(w / cw);
    const rows = Math.ceil(h / ch);

    // atlas: N glifos brancos lado a lado, cada um com o tamanho real (px) da célula
    const chars = [...CHARSETS[p.charset]];
    const gw = Math.max(2, Math.ceil(cw * px));
    const gh = Math.max(2, Math.ceil(ch * px));
    const atlas = document.createElement('canvas');
    atlas.width = gw * chars.length;
    atlas.height = gh;
    const a = atlas.getContext('2d');
    a.fillStyle = '#fff';
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    a.font = `500 ${fs * px}px "JetBrains Mono", monospace`;
    chars.forEach((c, i) => a.fillText(c, i * gw + gw / 2, gh * 0.53));

    const grid = document.createElement('canvas');
    grid.width = cols;
    grid.height = rows;
    const gctx = grid.getContext('2d');
    gctx.imageSmoothingQuality = 'high';

    let src = null;
    if (p.source !== 'foto') {
      // fonte ~3 px por célula: a redução para a grade faz a média
      const scale = Math.min(1, 3 / (cw * px));
      src = createSource(p.source, env, { scale });
    }
    // níveis da foto (percentis 2% e 98% do brilho) para usar toda a escala de caracteres
    let levels = null;
    const levelsOf = (img) => {
      if (levels) return levels;
      const c = document.createElement('canvas');
      c.width = c.height = 48;
      const g = c.getContext('2d', { willReadFrequently: true });
      drawCover(g, img, 48, 48, { fy: p.focus });
      const d = g.getImageData(0, 0, 48, 48).data;
      const ls = [];
      for (let i = 0; i < d.length; i += 4) ls.push((0.5 * (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) + 0.5 * Math.max(d[i], d[i + 1], d[i + 2])) / 255);
      ls.sort((a, b) => a - b);
      levels = [ls[Math.floor(ls.length * 0.02)], ls[Math.floor(ls.length * 0.98)]];
      return levels;
    };
    return { cols, rows, cw, ch, atlas, n: chars.length, grid, gctx, src, levels: levelsOf };
  },

  render(ctx, t, { w, h, p, px, progress, state }) {
    const { cols, rows, cw, ch, grid, gctx, src } = state;
    const photo = p.source === 'foto';
    const img = photo ? asset(p.image) : null;

    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, cols, rows);
    if (src) {
      const c = src.frame(progress * src.duration);
      gctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, w / cw, h / ch);
    } else if (img) {
      gctx.scale(1 / cw, 1 / ch);
      drawCover(gctx, img, cols * cw, rows * ch, { fy: p.focus, zoom: 1 + 0.06 * ease.inOutSine(progress) });
    }

    let reveal = 9, hide = -9, flicker = 0;
    if (photo) {
      reveal = lerp(-0.2, 1.3, ease.inOutSine(seg(t, 0.1, 3.0)));
      hide = lerp(-0.2, 1.35, ease.inCubic(seg(t, 6.3, 7.95)));
      flicker = img ? 0.004 : 0;
      if (!img) reveal = 0.25 + 0.1 * Math.sin(TAU * progress * 4); // carregando: um anel embaralhado
    }

    shader(ctx, FRAG, {
      u_grid: grid,
      u_atlas: state.atlas,
      u_cells: [cols, rows],
      u_cellPx: [cw * px, ch * px],
      u_n: state.n,
      u_contrast: p.contrast,
      u_sharp: p.sharp,
      u_levels: photo && img ? state.levels(img) : [0, 1],
      u_mono: p.color === 'mono',
      u_ink: p.ink,
      u_accent: p.accent,
      u_bg: p.bg,
      u_reveal: reveal,
      u_hide: hide,
      u_step: Math.floor(t * 14),
      u_flicker: flicker,
      u_focus: [0.5, photo ? 0.42 : 0.5],
    }, { w, h, px });
  },
};
