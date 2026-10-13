import { TAU, clamp, ease, rgba, fract } from '../lib/anim.js';
import { rotate, project } from '../lib/space.js';

// Globo pontilhado girando uma volta por loop. Os pontos ficam em anéis de latitude e só onde há
// terra, segundo uma máscara simplificada embutida (contornos grosseiros dos continentes em lon/lat,
// testados por ponto-em-polígono no setup). Arcos de conexão entre cidades nascem quando o trecho
// passa de frente para a câmera: a cabeça corre até o destino, a cauda recolhe, e as duas pontas
// pulsam. O hemisfério de trás é atenuado (ou escondido) com teste de oclusão contra a esfera.

// [lon, lat] — contornos aproximados (precisão de ~1–2°, suficiente para pontos de ~2°)
const LAND = [
  // América do Norte
  [[-168,66],[-162,70],[-156,71.3],[-141,69.6],[-128,70],[-115,68.5],[-95,71],[-82,73],[-80,63],[-94,59],[-92,57],[-82,55],[-79,51.5],[-77,57],[-78,62],[-71,61],[-64,60],[-61,56],[-56,52],[-60,47],[-66,45],[-70,43],[-70,41.5],[-74,40.5],[-76,37],[-75.5,35],[-81,31],[-80.5,27],[-80,25.3],[-81.5,25.8],[-82.8,28],[-84,30],[-89,30.2],[-94,29.5],[-97.3,27.5],[-97.7,22],[-95,18.7],[-91,19],[-90.3,21],[-87,21.5],[-88.2,17.5],[-83.3,15],[-83.5,11],[-81.5,9],[-79.5,9.5],[-77.5,8.5],[-78,7],[-80,7.4],[-82,8.2],[-85.7,10],[-87.5,13],[-91,13.9],[-94.5,16],[-98,16.2],[-102,18],[-105.5,20.5],[-105.6,23],[-109,26],[-112.5,30],[-114.5,31.5],[-112,28.5],[-110,23],[-109.5,23.2],[-112,25.5],[-114.5,29],[-116.5,32],[-117.5,33.5],[-120.5,34.5],[-122.5,37.5],[-124.2,40.5],[-124,46],[-124.6,48.4],[-127,50],[-130,54],[-133,57],[-137,58.5],[-141,60],[-146,61],[-150,59.6],[-154,57.5],[-158,56.5],[-164,54.6],[-158,58.5],[-162,60],[-165,62],[-164.5,63.2],[-161,64.4],[-166,65.3]],
  // Groenlândia e ilhas árticas
  [[-73,78],[-60,82],[-30,83.5],[-20,81.5],[-18,77],[-22,72],[-24,69],[-32,68],[-40,65],[-43,60],[-48,61],[-52,64.5],[-54,67],[-55,70.5],[-60,75.5],[-68,76.5]],
  [[-80,73.5],[-68,70.5],[-62,66.5],[-65,63],[-72,62.5],[-78,64.5],[-80,68],[-90,70]],
  [[-95,76],[-80,77],[-75,79.5],[-62,82.5],[-90,82],[-100,79],[-105,76]],
  [[-118,70],[-102,68.5],[-100,72],[-112,73.5],[-120,72]],
  // Caribe
  [[-85,21.8],[-82,23.2],[-77,22],[-74.2,20.2],[-77.5,19.9],[-80,21.5]],
  [[-74.5,18.4],[-72.5,19.9],[-68.4,18.6],[-71,18]],
  // América do Sul
  [[-77.5,8.5],[-75.5,10.5],[-72,12],[-71,11],[-67,10.6],[-62,10.7],[-60,8.5],[-57,6],[-52,4.5],[-50,1.5],[-48,-1],[-44,-2.5],[-39,-3.5],[-35,-5.5],[-35,-9],[-37,-12],[-39,-15],[-39.5,-19],[-41,-22],[-44,-23],[-48,-26],[-48.5,-28.5],[-52,-32],[-54,-34.5],[-57,-35],[-57.5,-38],[-62,-39],[-65,-41],[-64.5,-42.5],[-67.5,-46],[-66,-48],[-69,-51],[-68.5,-52.5],[-70,-54.5],[-72.5,-53],[-75,-50],[-75.5,-46],[-73.5,-42],[-73.5,-37],[-71.5,-31],[-71.3,-25],[-70.3,-18.5],[-75,-15.5],[-77,-12],[-79.5,-7.5],[-81,-5],[-80,-2.5],[-80,1],[-78.5,2],[-77.5,4.5],[-77.3,7]],
  // Eurásia
  [[-9,43.5],[-1.5,43.5],[-1.2,46],[-4.5,48],[-1.5,48.7],[1.5,50],[4,51.5],[5,53],[8.5,53.8],[8.2,55.5],[8.2,57],[10.5,57.7],[11.5,58.5],[7,58],[5,59],[5,62],[10,64],[14,67.5],[18,69.8],[25,71],[31,70],[33,69],[41,67],[44,68.5],[53,68.5],[60,69],[68,69],[73,72],[80,72.5],[87,75],[100,77],[105,77.5],[113,73.7],[128,73],[140,72.5],[150,71.5],[160,70],[170,70],[180,69],[180,65],[178,64.5],[170,60],[163,58],[162,56],[160,53],[156.5,51],[156,57],[160,61.5],[155,59.2],[143,59.3],[137,54],[141,52.5],[140.5,48],[135,43.5],[130,42.5],[129.5,40],[127.5,39.5],[129,37],[129.3,35.2],[126.5,34.5],[126.2,37],[125,37.7],[121.5,39],[122,40.5],[118,39],[119.5,37],[122.5,37],[120,34.5],[121.8,31],[122,29],[119.5,25.5],[116,22.8],[111,21.5],[110,20.3],[108,21.5],[106.5,20],[106,18],[108.5,15],[109.2,12],[107,10.5],[105,8.6],[104.8,10.5],[103,10.6],[100.5,13.5],[99.2,10],[100.5,7],[103.5,3],[104,1.3],[101,2.8],[98.5,8],[98.4,12],[97.5,16.5],[94.5,16],[94,18.5],[92.3,21],[90,22],[87,21.5],[86.5,20],[84,18],[80.2,15.5],[80,10.5],[77.5,8.1],[76.3,9.7],[74.5,14.8],[73,19],[72.8,21],[70,22.5],[68.5,23.5],[66.5,25.5],[61.5,25.2],[57.5,25.7],[56.3,27.1],[52,27.8],[50.5,30],[48,30],[48.5,28.5],[50,26],[51.5,24.2],[54,24.2],[56,26.2],[56.5,24],[59.8,22.5],[57.8,19],[55,17],[52,15.6],[45,12.8],[43.3,12.6],[42.7,15.5],[40,20],[38.6,23.5],[35.2,28],[34.5,28.1],[33,31],[34.5,31.5],[35.8,34.5],[36,36.8],[32,36.2],[30,36.3],[27.3,37],[26.3,39.2],[26.2,41],[23.8,40.7],[22.6,40.2],[23,38],[22,36.7],[21.2,37.8],[20,39.5],[19.4,41.8],[16,43.5],[13.6,45.7],[12.3,45.4],[12.4,44],[14,42],[16,41.4],[18.5,40.2],[16.5,39.8],[16,38],[15.6,40.1],[13,41.2],[11,42.4],[10.2,43.9],[8.5,44.4],[7,43.6],[4.5,43.4],[3.1,42.4],[3.2,41.8],[0.7,40.6],[-0.3,39.2],[0,38.7],[-0.8,37.6],[-2.2,36.7],[-5.5,36.1],[-6.4,36.8],[-7.5,37.2],[-8.9,37],[-8.8,38.7],[-9.5,39],[-8.8,41.5]],
  // Ilhas da Europa e do Ártico
  [[-5.7,50],[-3,50.6],[1.4,51.2],[1.7,52.7],[0.2,53.5],[-1.5,55],[-2,56],[-1.8,57.6],[-3,58.6],[-5,58.6],[-6.2,57.3],[-5.6,55.4],[-4.6,54.8],[-3,54],[-3,53.4],[-4.6,53.3],[-4.2,52.3],[-5.2,51.7],[-3.2,51.4]],
  [[-6,52.2],[-6,53.9],[-5.6,54.6],[-7.3,55.3],[-8.5,54.4],[-10,53.4],[-10.2,51.6],[-8,51.6]],
  [[-22.5,64],[-24,65.5],[-21.5,66.2],[-15,66.5],[-13.5,65],[-15,64.3],[-18.5,63.4]],
  [[52,71.5],[56,73.5],[60,76],[68,76.8],[62,74],[57,71]],
  [[11,78.5],[17,80.5],[27,80],[22,77.5],[16,77]],
  // África e Madagascar
  [[-17,21],[-16,24],[-13,27.5],[-10,29.5],[-9.5,32],[-6.8,34],[-5.9,35.8],[-2,35.1],[1,36.5],[5,36.8],[10,37.3],[11,36.8],[10.2,35],[11,33.5],[15,32.3],[19,30.3],[20,31],[20,32.5],[22,32.9],[25,31.7],[29,30.9],[32.3,31.3],[32.5,30],[33,28],[35.5,24],[37.2,21],[38.5,18],[40,15.7],[43.3,12.5],[45,10.5],[51.2,11.8],[51,10],[48,4.5],[44,0.5],[41.5,-1.8],[39.5,-5],[39,-8.5],[40.5,-11],[40.5,-15],[37,-18],[35.3,-22],[35.5,-24.5],[32.8,-26],[32.4,-28.5],[30,-31.5],[27.5,-33.5],[25,-34],[22,-34.3],[20,-34.8],[18.4,-34.1],[18.2,-31.5],[16.5,-28.6],[15.2,-27],[14.4,-23],[11.8,-17.5],[12,-13.5],[13.8,-10.7],[12.2,-6],[11.8,-3.5],[9.3,-0.7],[9.8,3],[8.7,4.5],[6,4.3],[4.5,6.3],[1.5,6.1],[-2,4.8],[-7.5,4.4],[-11.5,6.9],[-13.3,8.8],[-15.1,11],[-16.8,13],[-17.5,14.7],[-16.5,16.5],[-16,19]],
  [[49.3,-12],[50.5,-15.5],[49.8,-17],[47.2,-24.8],[45.2,-25.5],[43.6,-23.5],[43.3,-21.5],[44.4,-16.5],[46.5,-15.7],[48,-13.6]],
  // Ásia insular
  [[130,31],[131,31.5],[132,33.8],[135,33.5],[137,34.5],[139.8,35],[141,36.5],[141.5,40],[141.5,41.4],[140,40.6],[139.7,39],[138.5,37.5],[136.7,37.2],[135.5,35.5],[133,35.5],[131,34.4],[129.7,33.2]],
  [[140,41.5],[141.2,41.8],[143.3,42],[145.6,43.3],[144.5,44],[141.6,45.4],[141.3,43.4],[140,42.5]],
  [[142,46],[143.5,49],[143,53],[142.5,54.2],[142,51]],
  [[120.1,23],[121.9,25],[121,22]],
  [[79.8,9.8],[81.9,7.2],[81.2,6],[80,6]],
  [[120.5,18.5],[122.3,18.5],[122,16.5],[121.5,15],[124,13.5],[123.5,12.8],[121,13.5],[120.5,14.5],[120,16]],
  [[122,7],[124,8.5],[126.5,9],[126.2,6.3],[125.4,5.6],[124,6.4]],
  [[95.3,5.6],[98,4],[100.5,2],[104,-1],[106,-3],[105.8,-5.8],[104,-5],[102,-3.5],[100.5,-1],[98.5,1.5]],
  [[105.3,-6.8],[108,-6.3],[111,-6.5],[114.5,-7.7],[114.4,-8.7],[110,-8.1],[106,-7.4]],
  [[109,1.5],[109.6,-1],[110.5,-3],[114.5,-3.5],[116.5,-3],[117.5,0],[119,1],[117.8,4.2],[119.2,5.3],[117,7],[115.5,5],[113.2,3.1],[111,1.8]],
  [[119.5,-5.5],[120.5,-2],[120.7,1],[124.5,1.4],[121,0.5],[123,-1],[121.5,-1.8],[122,-4.6],[120.5,-5.8]],
  [[131,-1],[134,-0.8],[138,-1.7],[141,-2.6],[145.5,-4.6],[147.5,-6],[147.7,-8],[150.5,-10.5],[146,-8.5],[143.5,-9],[141,-9.1],[139,-8],[138,-5.5],[135,-4.5],[132.8,-4],[132,-2.8]],
  // Oceania
  [[113.5,-22],[114,-26],[115,-34],[118,-35],[123,-33.8],[126,-32.3],[131,-31.5],[134,-32.5],[136,-35],[138,-34.5],[138.5,-35.6],[140,-37.8],[143.5,-38.8],[146.3,-39],[150,-37.5],[153,-31],[153.5,-28],[152.8,-25],[149.5,-22],[146,-18.5],[145.4,-15],[143.5,-14],[142.5,-10.7],[141.5,-12.6],[141.6,-17],[140,-17.6],[137,-15.8],[135.5,-14.8],[136.8,-12.2],[132.5,-11.3],[130,-12.6],[129,-15],[125.5,-14.3],[122.5,-16.8],[121.5,-19.2],[117,-20.6]],
  [[144.6,-40.7],[148.3,-40.9],[148,-43.2],[146,-43.6]],
  [[172.6,-34.4],[174.5,-36],[176,-37.6],[178.5,-37.7],[177,-39.5],[175,-41.5],[174.6,-39.8],[173.8,-39],[174.5,-37]],
  [[172.7,-40.5],[174.3,-41.7],[173,-43.8],[171,-45.8],[169,-46.6],[166.5,-46],[168.5,-44],[170.5,-43]],
];
// mares internos recortados da Eurásia
const WATER = [
  [[28,41.5],[28.5,43.5],[30,46],[33,46],[35.5,45.3],[38,47],[39.5,47],[37.5,44.5],[40,43.5],[41.6,41.6],[36,41.7],[31,41.2]],
  [[47,45],[50,46.8],[53,47],[53,45],[51,44.5],[53,42],[53.5,39.5],[53.5,37],[50.5,37],[49,38.5],[49.5,40.5],[48,42.5],[47.5,43.5]],
  [[10.5,54],[14,54],[19,54.5],[21,56.5],[23.5,57.5],[24,59.5],[30,60],[25,60.5],[21.5,61],[21.5,63.5],[25,65.5],[22,65.8],[18,62.5],[17.5,60.5],[19,59.5],[16.5,57],[14,55.5],[12.5,56],[10.5,57.5],[10,56]],
];

const CITIES = {
  sp: [-46.6, -23.5], ny: [-74, 40.7], la: [-118.2, 34], mex: [-99.1, 19.4], bog: [-74.1, 4.7],
  lon: [-0.1, 51.5], par: [2.3, 48.9], lag: [3.4, 6.5], cai: [31.2, 30], joh: [28, -26.2],
  dub: [55.3, 25.2], mos: [37.6, 55.8], mum: [72.9, 19.1], sin: [103.8, 1.35], hk: [114.2, 22.3],
  tok: [139.7, 35.7], syd: [151.2, -33.9], chi: [-87.6, 41.9], lis: [-9.1, 38.7], nai: [36.8, -1.3],
};
const ROUTES = [
  ['sp', 'lis'], ['ny', 'lon'], ['la', 'tok'], ['lon', 'dub'], ['dub', 'sin'], ['sin', 'syd'],
  ['mex', 'sp'], ['par', 'lag'], ['mum', 'hk'], ['chi', 'la'], ['cai', 'joh'], ['mos', 'tok'],
  ['bog', 'ny'], ['nai', 'mum'], ['hk', 'syd'], ['lis', 'ny'],
];

const D2R = Math.PI / 180;
const toXYZ = (lon, lat) => {
  const cl = Math.cos(lat * D2R);
  return [cl * Math.sin(lon * D2R), -Math.sin(lat * D2R), -cl * Math.cos(lon * D2R)];
};

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const bbox = (poly) => {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [x, y] of poly) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
};

function slerp(a, b, k) {
  const d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  const om = Math.acos(d);
  if (om < 1e-6) return a.slice();
  const s = Math.sin(om);
  const ka = Math.sin((1 - k) * om) / s;
  const kb = Math.sin(k * om) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

export default {
  id: 'globe',
  title: 'Dot Globe',
  description: 'Globo pontilhado girando, com arcos de conexão entre cidades que se desenham e pulsam nas pontas.',
  category: 'formas',
  tags: ['3d', 'dados', 'loop'],
  duration: 16,
  poster: 6,

  params: {
    dots: { type: 'color', label: 'Pontos', default: '#dce4f0' },
    accent: { type: 'color', label: 'Arcos', default: '#4f9dff' },
    bg: { type: 'color', label: 'Fundo', default: '#06080d' },
    density: { type: 'range', label: 'Densidade', min: 1, max: 4, step: 0.1, default: 1.8 },
    size: { type: 'range', label: 'Tamanho', min: 0.5, max: 1.4, step: 0.01, default: 1 },
    arcs: { type: 'range', label: 'Arcos', min: 0, max: 16, step: 1, default: 12 },
    tilt: { type: 'range', label: 'Inclinação', min: -0.8, max: 0.8, step: 0.01, default: 0.38 },
    back: { type: 'select', label: 'Lado de trás', options: ['atenuar', 'esconder'], default: 'atenuar' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ p }) {
    const polys = LAND.map((pl) => ({ pl, bb: bbox(pl) }));
    const water = WATER.map((pl) => ({ pl, bb: bbox(pl) }));
    const hit = (lon, lat, list) => list.some(({ pl, bb }) => lon >= bb[0] && lon <= bb[2] && lat >= bb[1] && lat <= bb[3] && inPoly(lon, lat, pl));
    const step = p.density;
    const pts = [];
    for (let lat = -90 + step / 2; lat < 90; lat += step) {
      const n = Math.max(1, Math.round((360 * Math.cos(lat * D2R)) / step));
      const off = (lat / step) % 2 ? 0.5 : 0; // alterna para não alinhar colunas
      for (let i = 0; i < n; i++) {
        let lon = ((i + off) / n) * 360 - 180;
        const land = lat < -68 || (hit(lon, lat, polys) && !hit(lon, lat, water));
        if (land) pts.push(toXYZ(lon, lat));
      }
    }
    const flat = new Float32Array(pts.length * 3);
    pts.forEach((v, i) => flat.set(v, i * 3));

    // arcos: cada um nasce quando o seu meio passa de frente para a câmera
    const arcs = ROUTES.slice(0, p.arcs).map(([a, b], i) => {
      const A = toXYZ(...CITIES[a]);
      const B = toXYZ(...CITIES[b]);
      const mid = slerp(A, B, 0.5);
      const lon = Math.atan2(mid[0], -mid[2]); // longitude do meio (rad)
      const om = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1));
      const uFace = fract(-lon / TAU); // de frente quando ry = lon, com ry = -TAU·u
      const pts3 = [];
      const N = 48;
      const lift = 0.08 + 0.42 * (om / Math.PI);
      for (let k = 0; k <= N; k++) {
        const s = slerp(A, B, k / N);
        const r = 1 + lift * Math.sin(Math.PI * (k / N));
        pts3.push([s[0] * r, s[1] * r, s[2] * r]);
      }
      return { A, B, pts: pts3, start: fract(uFace - 0.13 + ((i * 0.37) % 1) * 0.04 - 0.02) };
    });
    const cityKeys = [...new Set(ROUTES.slice(0, p.arcs).flat())];
    return { flat, n: pts.length, arcs, cities: cityKeys.map((k) => toXYZ(...CITIES[k])) };
  },

  render(ctx, t, { w, h, p, px, progress: u, state }) {
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = m * 0.37 * p.size;
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    // atmosfera: halo da cor de destaque variando só o alpha
    const atm = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.32);
    atm.addColorStop(0, rgba(p.accent, 0.2));
    atm.addColorStop(0.25, rgba(p.accent, 0.07));
    atm.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = atm;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.33, 0, TAU);
    ctx.fill();

    const rot = { ry: -TAU * u, rx: p.tilt };
    const view = (v) => rotate(rotate(v, { ry: rot.ry }), { rx: rot.rx, rz: 0.18 });
    const dist = 4.2;
    const cam = { cx, cy, fov: dist * R, dist };
    const C = [0, 0, -dist];
    // ponto Q (unitário ou acima da superfície) está escondido pela esfera?
    const occluded = (q) => {
      const d = [q[0] - C[0], q[1] - C[1], q[2] - C[2]];
      const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      const b = 2 * (C[0] * d[0] + C[1] * d[1] + C[2] * d[2]);
      const c = C[0] * C[0] + C[1] * C[1] + C[2] * C[2] - 1;
      const disc = b * b - 4 * a * c;
      if (disc <= 0) return false;
      const s1 = (-b - Math.sqrt(disc)) / (2 * a);
      return s1 > 0 && s1 < 0.995;
    };

    const { flat, n } = state;
    const BANDS = 5;
    const front = Array.from({ length: BANDS }, () => []);
    const back = [];
    const dotR = R * 0.0042 * p.density;
    for (let i = 0; i < n; i++) {
      const v = view([flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]]);
      // de frente se a normal aponta para a câmera
      const facing = -(v[0] * (v[0] - C[0]) + v[1] * (v[1] - C[1]) + v[2] * (v[2] - C[2])) / Math.hypot(v[0] - C[0], v[1] - C[1], v[2] - C[2]);
      const pr = project(v, cam);
      if (facing > 0) front[Math.min(BANDS - 1, Math.floor(Math.sqrt(facing) * BANDS))].push(pr);
      else back.push(pr);
    }

    // trás (visto através do globo)
    if (p.back === 'atenuar' && back.length) {
      ctx.fillStyle = rgba(p.dots, 0.1);
      ctx.beginPath();
      for (const q of back) {
        // atrás os pontos são pequenos e apagados: quadrados bastam (bem mais baratos que arcos)
        const r = ((dotR * q.s) / R) * 0.7;
        ctx.rect(q.x - r, q.y - r, 2 * r, 2 * r);
      }
      ctx.fill();
    }
    // corpo do globo: escurece o que ficou atrás e dá volume
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    const bgc = p.transparent ? '#000000' : p.bg;
    body.addColorStop(0, rgba(bgc, 0.55));
    body.addColorStop(1, rgba(bgc, 0.85));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R * (dist / Math.sqrt(dist * dist - 1)) * 0.995, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(p.accent, 0.35);
    ctx.lineWidth = Math.max(1, m * 0.0012);
    ctx.stroke();

    // frente, em faixas de brilho (limbo mais escuro)
    for (let b = 0; b < BANDS; b++) {
      const list = front[b];
      if (!list.length) continue;
      const k = (b + 0.5) / BANDS;
      ctx.fillStyle = rgba(p.dots, 0.18 + 0.82 * k);
      ctx.beginPath();
      for (const q of list) {
        const r = (dotR * q.s) / R * (0.65 + 0.35 * k);
        ctx.moveTo(q.x + r, q.y);
        ctx.arc(q.x, q.y, r, 0, TAU);
      }
      ctx.fill();
    }

    // arcos
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lw = m * 0.0032 * p.size;
    const life = 0.2; // fração do loop
    const pulses = [];
    for (const arc of state.arcs) {
      const a = fract(u - arc.start);
      if (a > life) continue;
      const k = a / life;
      const head = ease.inOutCubic(clamp(k / 0.55));
      const tail = ease.inOutCubic(clamp((k - 0.5) / 0.5));
      if (k < 0.12) pulses.push({ v: arc.A, k: k / 0.12 });
      if (k > 0.5 && k < 0.62) pulses.push({ v: arc.B, k: (k - 0.5) / 0.12 });
      const N = arc.pts.length - 1;
      const i0 = tail * N;
      const i1 = head * N;
      if (i1 - i0 < 0.01) continue;
      // amostra o trecho visível
      const seg = [];
      const steps = Math.max(2, Math.ceil(i1 - i0) + 1);
      for (let s = 0; s <= steps; s++) {
        const f = i0 + ((i1 - i0) * s) / steps;
        const j = Math.min(N - 1, Math.floor(f));
        const fr = f - j;
        const P0 = arc.pts[j];
        const P1 = arc.pts[j + 1];
        const v = view([P0[0] + (P1[0] - P0[0]) * fr, P0[1] + (P1[1] - P0[1]) * fr, P0[2] + (P1[2] - P0[2]) * fr]);
        seg.push({ pr: project(v, cam), hid: occluded(v) });
      }
      for (const pass of [0, 1]) {
        // 0 = brilho largo, 1 = linha
        ctx.lineWidth = pass ? lw : lw * 4;
        for (const hidden of [true, false]) {
          if (hidden && (p.back === 'esconder' || !pass)) continue;
          ctx.strokeStyle = rgba(pass ? p.accent : p.accent, (hidden ? 0.18 : 1) * (pass ? 1 : 0.16));
          ctx.beginPath();
          for (let s = 1; s < seg.length; s++) {
            if (seg[s].hid !== hidden || seg[s - 1].hid !== hidden) continue;
            ctx.moveTo(seg[s - 1].pr.x, seg[s - 1].pr.y);
            ctx.lineTo(seg[s].pr.x, seg[s].pr.y);
          }
          ctx.stroke();
        }
      }
      // cabeça
      const hd = seg[seg.length - 1];
      if (k < 0.55 && !hd.hid) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(hd.pr.x, hd.pr.y, lw * 1.3, 0, TAU);
        ctx.fill();
      }
    }

    // cidades + pulsos
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    for (const c of state.cities) {
      const v = view(c);
      if (occluded(v)) continue;
      const q = project(v, cam);
      ctx.moveTo(q.x + lw * 1.4, q.y);
      ctx.arc(q.x, q.y, lw * 1.4, 0, TAU);
    }
    ctx.fill();
    for (const pl of pulses) {
      const v = view(pl.v);
      if (occluded(v)) continue;
      const q = project(v, cam);
      const e = ease.outCubic(pl.k);
      ctx.strokeStyle = rgba(p.accent, 0.9 * (1 - pl.k));
      ctx.lineWidth = lw * 0.9;
      ctx.beginPath();
      ctx.arc(q.x, q.y, lw * (1.5 + 7 * e), 0, TAU);
      ctx.stroke();
    }
  },
};
