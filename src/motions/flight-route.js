import { TAU, clamp, seg, ease, spring, rgba } from '../lib/anim.js';

// Rota de voo sobre um mapa-múndi pontilhado (equirretangular, enquadrado na rota). O mapa se
// revela a partir da origem, o arco pontilhado da rota se desenha e o avião percorre o arco
// deixando a linha tracejada atrás; cada cidade ganha pin, onda e rótulo. As cidades vêm de uma
// tabela embutida (nome ou código IATA) ou de "Nome @ lat, lon". Um cartão conta a distância voada.

// Contornos grosseiros dos continentes em [lon, lat] (~1–2°), testados por ponto-em-polígono no setup.
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


// nome, IATA, lat, lon, apelidos
const CITIES = [
  ['São Paulo', 'GRU', -23.55, -46.63, 'sao paulo,sp,sampa'],
  ['Rio de Janeiro', 'GIG', -22.91, -43.17, 'rio'],
  ['Brasília', 'BSB', -15.79, -47.88, ''],
  ['Salvador', 'SSA', -12.97, -38.5, ''],
  ['Recife', 'REC', -8.05, -34.9, ''],
  ['Fortaleza', 'FOR', -3.73, -38.52, ''],
  ['Manaus', 'MAO', -3.12, -60.02, ''],
  ['Belém', 'BEL', -1.46, -48.5, ''],
  ['Belo Horizonte', 'CNF', -19.92, -43.94, 'bh'],
  ['Porto Alegre', 'POA', -30.03, -51.23, ''],
  ['Curitiba', 'CWB', -25.43, -49.27, ''],
  ['Florianópolis', 'FLN', -27.6, -48.55, 'floripa'],
  ['Buenos Aires', 'EZE', -34.6, -58.38, ''],
  ['Santiago', 'SCL', -33.45, -70.67, ''],
  ['Lima', 'LIM', -12.05, -77.04, ''],
  ['Bogotá', 'BOG', 4.71, -74.07, ''],
  ['Mexico City', 'MEX', 19.43, -99.13, 'cidade do mexico,mexico'],
  ['New York', 'JFK', 40.71, -74.0, 'nova york,nyc'],
  ['Miami', 'MIA', 25.76, -80.19, ''],
  ['Orlando', 'MCO', 28.54, -81.38, ''],
  ['Los Angeles', 'LAX', 34.05, -118.24, 'la'],
  ['San Francisco', 'SFO', 37.77, -122.42, 'são francisco'],
  ['Chicago', 'ORD', 41.88, -87.63, ''],
  ['Toronto', 'YYZ', 43.65, -79.38, ''],
  ['Lisbon', 'LIS', 38.72, -9.14, 'lisboa'],
  ['Porto', 'OPO', 41.15, -8.61, 'oporto'],
  ['Madrid', 'MAD', 40.42, -3.7, 'madri'],
  ['Barcelona', 'BCN', 41.39, 2.17, ''],
  ['Paris', 'CDG', 48.86, 2.35, ''],
  ['London', 'LHR', 51.51, -0.13, 'londres'],
  ['Rome', 'FCO', 41.9, 12.5, 'roma'],
  ['Milan', 'MXP', 45.46, 9.19, 'milao'],
  ['Frankfurt', 'FRA', 50.11, 8.68, ''],
  ['Amsterdam', 'AMS', 52.37, 4.9, 'amsterda'],
  ['Berlin', 'BER', 52.52, 13.4, 'berlim'],
  ['Istanbul', 'IST', 41.01, 28.98, 'istambul'],
  ['Moscow', 'SVO', 55.76, 37.62, 'moscou'],
  ['Dubai', 'DXB', 25.2, 55.27, ''],
  ['Cairo', 'CAI', 30.04, 31.24, ''],
  ['Lagos', 'LOS', 6.52, 3.38, ''],
  ['Luanda', 'LAD', -8.84, 13.23, ''],
  ['Nairobi', 'NBO', -1.29, 36.82, ''],
  ['Johannesburg', 'JNB', -26.2, 28.05, 'joanesburgo'],
  ['Cape Town', 'CPT', -33.92, 18.42, 'cidade do cabo'],
  ['Mumbai', 'BOM', 19.08, 72.88, ''],
  ['Delhi', 'DEL', 28.61, 77.21, 'new delhi,nova delhi'],
  ['Bangkok', 'BKK', 13.76, 100.5, 'banguecoque'],
  ['Singapore', 'SIN', 1.35, 103.82, 'singapura'],
  ['Hong Kong', 'HKG', 22.32, 114.17, ''],
  ['Beijing', 'PEK', 39.9, 116.4, 'pequim'],
  ['Shanghai', 'PVG', 31.23, 121.47, 'xangai'],
  ['Seoul', 'ICN', 37.57, 126.98, 'seul'],
  ['Tokyo', 'HND', 35.68, 139.69, 'toquio'],
  ['Sydney', 'SYD', -33.87, 151.21, ''],
  ['Auckland', 'AKL', -36.85, 174.76, ''],
];
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const LOOKUP = new Map();
for (const [name, code, lat, lon, alias] of CITIES) {
  const c = { name, code, lat, lon };
  for (const k of [name, code, ...alias.split(',')].filter(Boolean)) LOOKUP.set(norm(k), c);
}

// "São Paulo → Lisboa", também "->", ">", ";", "|" ou uma por linha. "Nome @ lat, lon" para cidades fora da tabela.
function parseRoute(text) {
  const out = [];
  for (const raw of String(text || '').split(/\s*(?:→|->|>|;|\||\n)\s*/)) {
    const s = raw.trim();
    if (!s) continue;
    const m = s.match(/^(.*?)\s*@\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      const name = m[1].trim() || 'Point';
      out.push({ name, code: norm(name).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase(), lat: clamp(+m[2], -80, 80), lon: +m[3] });
    } else if (LOOKUP.has(norm(s))) out.push(LOOKUP.get(norm(s)));
    if (out.length === 4) break;
  }
  return out;
}

const D2R = Math.PI / 180;
function haversine(a, b) {
  const dLat = (b.lat - a.lat) * D2R;
  const dLon = (b.lon - a.lon) * D2R;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

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
const POLYS = LAND.map((pl) => ({ pl, bb: bbox(pl) }));
const WATERS = WATER.map((pl) => ({ pl, bb: bbox(pl) }));
const hit = (lon, lat, list) => list.some(({ pl, bb }) => lon >= bb[0] && lon <= bb[2] && lat >= bb[1] && lat <= bb[3] && inPoly(lon, lat, pl));
const isLand = (lon, lat) => {
  const L = ((((lon + 180) % 360) + 360) % 360) - 180;
  return lat < -70 + 2.5 * Math.sin(L * D2R * 3) + 1.5 * Math.sin(L * D2R * 7 + 1) || (hit(L, lat, POLYS) && !hit(L, lat, WATERS));
};

// Avião visto de cima, nariz em +x, comprimento 1.
const PLANE = [[0.5, 0], [0.44, -0.045], [0.12, -0.05], [-0.06, -0.46], [-0.16, -0.46], [-0.06, -0.055], [-0.33, -0.045], [-0.42, -0.19], [-0.48, -0.19], [-0.45, -0.03], [-0.5, 0]];
function planePath(ctx, L) {
  ctx.beginPath();
  PLANE.forEach(([x, y], i) => (i ? ctx.lineTo(x * L, y * L) : ctx.moveTo(x * L, y * L)));
  for (let i = PLANE.length - 2; i >= 1; i--) ctx.lineTo(PLANE[i][0] * L, -PLANE[i][1] * L);
  ctx.closePath();
}

const INTER = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (wt, s) => `${wt} ${s}px 'JetBrains Mono', ui-monospace, monospace`;
const fmt = new Intl.NumberFormat('pt-BR');

const T_FLY0 = 1.7; // decolagem
const T_FLY1 = 6.7; // pouso no destino final
const ZOOM0 = 1.1; // câmera começa mais perto e abre

const dotCache = new Map();

export default {
  id: 'flight-route',
  title: 'Flight Route',
  description: 'A plane flying an arced route over a dotted world map, with city pins and a running distance count.',
  category: 'dados',
  tags: ['data', 'ui', 'broadcast'],
  duration: 9,
  poster: 4.6,

  params: {
    route: { type: 'textarea', label: 'Route (city → city; or "Name @ lat, lon")', rows: 3, default: 'São Paulo → Lisbon' },
    accent: { type: 'color', label: 'Accent', default: '#ff8a3d' },
    dots: { type: 'color', label: 'Map dots', default: '#c3cedc' },
    ink: { type: 'color', label: 'Text', default: '#f3f1ec' },
    bg: { type: 'color', label: 'Background', default: '#0a0d12' },
    density: { type: 'range', label: 'Map density', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    card: { type: 'boolean', label: 'Distance card', default: true },
  },

  setup({ w, h, p, px }) {
    const cities = parseRoute(p.route);
    if (cities.length < 2) return { cities, legs: [] };
    const m = Math.min(w, h);
    const portrait = h > w * 1.2;
    // longitudes "desenroladas" (rota cruzando o antimeridiano não dá a volta no mundo)
    const lons = [cities[0].lon];
    for (let i = 1; i < cities.length; i++) {
      let L = cities[i].lon;
      while (L - lons[i - 1] > 180) L -= 360;
      while (L - lons[i - 1] < -180) L += 360;
      lons.push(L);
    }
    const lat0 = clamp(cities.reduce((a, c) => a + c.lat, 0) / cities.length, -60, 60);
    const kx = Math.cos(lat0 * D2R);
    const P = cities.map((c, i) => [lons[i] * kx, -c.lat]);

    // arcos (quadráticos, bojo para "cima" da tela) em unidades de mapa
    const legsM = [];
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, ay] = P[i];
      const [bx, by] = P[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const d = Math.hypot(dx, dy) || 1;
      let nx = dy / d;
      let ny = -dx / d;
      if (ny > 0 || (Math.abs(ny) < 0.2 && nx > 0)) (nx = -nx), (ny = -ny);
      const bulge = d * 0.24;
      legsM.push({ a: [ax, ay], c: [(ax + bx) / 2 + nx * bulge, (ay + by) / 2 + ny * bulge], b: [bx, by] });
    }
    // enquadramento: caixa da rota (com os arcos) dentro da área útil
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const ext = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (const L of legsM) for (let k = 0; k <= 20; k++) {
      const u = k / 20;
      ext((1 - u) ** 2 * L.a[0] + 2 * u * (1 - u) * L.c[0] + u * u * L.b[0], (1 - u) ** 2 * L.a[1] + 2 * u * (1 - u) * L.c[1] + u * u * L.b[1]);
    }
    const minSpan = 26;
    if (x1 - x0 < minSpan) { const c = (x0 + x1) / 2; x0 = c - minSpan / 2; x1 = c + minSpan / 2; }
    if (y1 - y0 < minSpan * 0.6) { const c = (y0 + y1) / 2; y0 = c - minSpan * 0.3; y1 = c + minSpan * 0.3; }
    // 16:9: cartão num canto livre; demais formatos: cartão embaixo e a rota acima dele
    const wide = w / h > 1.45;
    const cardSpace = p.card && !wide ? m * 0.2 + m * (portrait ? 0.1 : 0.06) : 0;
    const box = wide
      ? { x: w * 0.14, y: h * 0.17, w: w * 0.72, h: h * 0.6 }
      : { x: w * 0.12, y: h * (portrait ? 0.24 : 0.14), w: w * 0.76, h: h - cardSpace - m * 0.13 - h * (portrait ? 0.24 : 0.14) };
    const S = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
    const ox = box.x + box.w / 2 - ((x0 + x1) / 2) * S;
    const oy = box.y + box.h / 2 - ((y0 + y1) / 2) * S;
    const toS = ([x, y]) => [ox + x * S, oy + y * S];
    const fromS = (sx, sy) => [(sx - ox) / S / kx, -(sy - oy) / S];

    // pernas em tela + tabela de comprimento de arco
    const legs = legsM.map((L, i) => {
      const a = toS(L.a), c = toS(L.c), b = toS(L.b);
      const N = 64;
      const pts = [];
      const len = [0];
      for (let k = 0; k <= N; k++) {
        const u = k / N;
        pts.push([(1 - u) ** 2 * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]]);
        if (k) len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      }
      return { pts, len, total: len[N], km: haversine(cities[i], cities[i + 1]) };
    });
    // tempo de cada perna proporcional à raiz do comprimento, com pausa nas escalas
    const pause = 0.45;
    const wts = legs.map((L) => Math.sqrt(L.total));
    const flyT = T_FLY1 - T_FLY0 - pause * (legs.length - 1);
    const sw = wts.reduce((a, b) => a + b, 0);
    let tt = T_FLY0;
    legs.forEach((L, i) => {
      L.t0 = tt;
      L.t1 = tt + (flyT * wts[i]) / sw;
      tt = L.t1 + pause;
    });
    const kmTotal = legs.reduce((a, L) => a + L.km, 0);
    const screenPts = P.map(toS);

    // rótulo de cada cidade do lado oposto aos arcos que chegam/saem dela
    const sides = screenPts.map((_, i) => {
      let vx = 0, vy = 0;
      const add = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; vx += (b[0] - a[0]) / d; vy += (b[1] - a[1]) / d; };
      if (i < legs.length) add(legs[i].pts[0], legs[i].pts[6]);
      if (i > 0) { const q = legs[i - 1].pts; add(q[q.length - 1], q[q.length - 7]); }
      const d = Math.hypot(vx, vy);
      if (d < 0.3) return 'below';
      vx /= -d; vy /= -d; // direção livre
      if (vy > 0.45) return 'below';
      if (vy < -0.6) return 'above';
      return vx > 0 ? 'right' : 'left';
    });

    // cartão no canto com menos rota por baixo
    const cw0 = m * (portrait ? 0.82 : 0.72);
    const ch0 = m * (portrait ? 0.2 : 0.17);
    const mg = m * (portrait ? 0.1 : 0.06);
    const corners = !wide
      ? [['bl', (w - cw0) / 2, h - ch0 - mg]]
      : [['bl', mg, h - ch0 - mg], ['br', w - cw0 - mg, h - ch0 - mg], ['tl', mg, mg], ['tr', w - cw0 - mg, mg]];
    let corner = corners[0][0];
    let best = Infinity;
    for (const [name, cx, cy] of corners) {
      let hits = 0;
      const inside = (x, y, pad) => x > cx - pad && x < cx + cw0 + pad && y > cy - pad && y < cy + ch0 + pad;
      for (const L of legs) for (const q of L.pts) if (inside(q[0], q[1], m * 0.03)) hits++;
      for (const q of screenPts) if (inside(q[0], q[1], m * 0.12)) hits += 40;
      if (hits < best) (best = hits), (corner = name);
    }

    // mapa pontilhado pré-renderizado (um pouco maior que a tela para o zoom ficar nítido)
    const sp = (m * 0.0125) / p.density;
    const key = [w, h, px, p.route, p.density, p.dots, p.card].join('|');
    let buf = dotCache.get(key);
    if (!buf) {
      const Z = ZOOM0;
      buf = document.createElement('canvas');
      buf.width = Math.max(1, Math.round(w * px * Z));
      buf.height = Math.max(1, Math.round(h * px * Z));
      const g = buf.getContext('2d');
      g.scale(px * Z, px * Z);
      const land = new Path2D();
      const sea = new Path2D();
      const r = sp * 0.26;
      const cols = Math.ceil(w / sp) + 1;
      const rows = Math.ceil(h / sp) + 1;
      const offX = (w - (cols - 1) * sp) / 2;
      const offY = (h - (rows - 1) * sp) / 2;
      for (let j = 0; j < rows; j++) {
        const sy = offY + j * sp;
        for (let i = 0; i < cols; i++) {
          const sx = offX + i * sp;
          const [lon, lat] = fromS(sx, sy);
          const path = lat > -85 && lat < 85 && isLand(lon, lat) ? land : sea;
          path.moveTo(sx + r, sy);
          path.arc(sx, sy, r, 0, TAU);
        }
      }
      g.fillStyle = rgba(p.dots, 0.06);
      g.fill(sea);
      g.fillStyle = rgba(p.dots, 0.5);
      g.fill(land);
      dotCache.set(key, buf);
      if (dotCache.size > 12) dotCache.delete(dotCache.keys().next().value);
    }
    return { cities, legs, screenPts, kmTotal, buf, sides, corner };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const portrait = h > w * 1.2;
    const { cities, legs, screenPts } = state;
    if (!legs.length) {
      ctx.font = INTER(500, m * 0.028);
      ctx.fillStyle = rgba(p.ink, 0.55);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Route needs 2+ known cities (or "Name @ lat, lon")', w / 2, h / 2);
      return;
    }

    const OUT = duration - 1.0;
    const fadeOut = ease.inOutCubic(seg(t, OUT, duration - 0.1));
    const [ox, oy] = screenPts[0];

    // ---------- câmera ----------
    const zoom = ZOOM0 - (ZOOM0 - 1) * ease.inOutSine(seg(t, 0, T_FLY1 + 0.6));
    // foco começa na origem e vai para o centro
    const fk = ease.inOutSine(seg(t, 0, T_FLY1 + 0.6));
    const fx = ox + (w / 2 - ox) * fk;
    const fy = oy + (h / 2 - oy) * fk;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(zoom, zoom);
    ctx.translate(-fx, -fy);

    // mapa revelado em círculo a partir da origem
    const rev = ease.outCubic(seg(t, 0, 1.6));
    if (rev > 0.001) {
      const R = Math.hypot(Math.max(ox, w - ox), Math.max(oy, h - oy)) * 1.15 * rev;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ox, oy, Math.max(R, 0.1), 0, TAU);
      ctx.clip();
      ctx.globalAlpha = (0.35 + 0.65 * rev) * (1 - fadeOut);
      ctx.drawImage(state.buf, 0, 0, w, h);
      ctx.restore();
      // frente de onda da revelação
      if (rev < 1) {
        ctx.strokeStyle = rgba(p.accent, 0.35 * (1 - rev));
        ctx.lineWidth = m * 0.004;
        ctx.beginPath();
        ctx.arc(ox, oy, R, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();

    // tudo que é rota/pins é desenhado em coordenadas de tela já transformadas (traço com espessura fixa)
    const Tx = (x) => fx + (x - fx) * zoom;
    const Ty = (y) => fy + (y - fy) * zoom;
    const alphaAll = 1 - fadeOut;
    ctx.save();
    ctx.globalAlpha = alphaAll;

    // ---------- arcos guia (pontilhado fraco, desenhando) ----------
    const guide = ease.inOutCubic(seg(t, 0.9, 1.8));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, m * 0.0032);
    ctx.setLineDash([0.001, m * 0.011]);
    ctx.strokeStyle = rgba(p.ink, 0.38);
    for (const L of legs) {
      const n = Math.round(guide * (L.pts.length - 1));
      if (n < 1) continue;
      ctx.beginPath();
      for (let k = 0; k <= n; k++) (k ? ctx.lineTo : ctx.moveTo).call(ctx, Tx(L.pts[k][0]), Ty(L.pts[k][1]));
      ctx.stroke();
    }

    // ---------- trilha percorrida (tracejada) e posição do avião ----------
    let plane = null;
    let kmFlown = 0;
    const at = (L, d) => {
      // ponto e tangente na distância d ao longo da perna
      const { len, pts } = L;
      let k = 1;
      while (k < len.length - 1 && len[k] < d) k++;
      const f = clamp((d - len[k - 1]) / (len[k] - len[k - 1] || 1));
      const a = pts[k - 1];
      const b = pts[k];
      return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ang: Math.atan2(b[1] - a[1], b[0] - a[0]), k };
    };
    ctx.setLineDash([m * 0.014, m * 0.009]);
    ctx.lineCap = 'butt';
    ctx.lineWidth = Math.max(1.2, m * 0.0042);
    ctx.strokeStyle = p.accent;
    legs.forEach((L, i) => {
      const u = ease.inOutCubic(seg(t, L.t0, L.t1));
      kmFlown += L.km * u;
      if (u <= 0) return;
      const d = L.total * u;
      const pos = at(L, d);
      ctx.beginPath();
      ctx.moveTo(Tx(L.pts[0][0]), Ty(L.pts[0][1]));
      for (let k = 1; k < pos.k; k++) ctx.lineTo(Tx(L.pts[k][0]), Ty(L.pts[k][1]));
      ctx.lineTo(Tx(pos.x), Ty(pos.y));
      ctx.stroke();
      if (t >= L.t0 - 0.35 && t <= L.t1 + 0.35) plane = { ...pos, u, i, L };
    });
    ctx.setLineDash([]);

    // ---------- pins ----------
    const pinR = m * 0.009;
    cities.forEach((c, i) => {
      const tOn = i === 0 ? 0.45 : legs[i - 1].t1 - 0.05;
      const pop = spring(seg(t, tOn, tOn + 0.6), 0.4);
      if (pop <= 0.001) return;
      const x = Tx(screenPts[i][0]);
      const y = Ty(screenPts[i][1]);
      // ondas
      for (let k = 0; k < 2; k++) {
        const wv = seg(t, tOn + k * 0.35, tOn + 1.5 + k * 0.35);
        if (wv <= 0 || wv >= 1) continue;
        ctx.strokeStyle = rgba(p.accent, 0.6 * (1 - wv));
        ctx.lineWidth = Math.max(1, m * 0.0025);
        ctx.beginPath();
        ctx.arc(x, y, pinR + m * 0.05 * ease.outCubic(wv), 0, TAU);
        ctx.stroke();
      }
      // halo constante + ponto
      ctx.fillStyle = rgba(p.accent, 0.18);
      ctx.beginPath();
      ctx.arc(x, y, pinR * 2.6 * pop, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(x, y, pinR * 1.35 * pop, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(x, y, pinR * 0.8 * pop, 0, TAU);
      ctx.fill();

      // rótulo: abaixo do pin (os arcos sobem), alinhado para dentro da tela
      const lab = ease.outExpo(seg(t, tOn + 0.15, tOn + 0.9));
      if (lab <= 0.001) return;
      const ns = m * 0.032;
      const cs = m * 0.019;
      ctx.font = INTER(700, ns);
      const nw = ctx.measureText(c.name).width;
      ctx.font = MONO(600, cs);
      ctx.letterSpacing = `${cs * 0.12}px`;
      const cw = ctx.measureText(c.code).width;
      ctx.letterSpacing = '0px';
      const bw = Math.max(nw, cw);
      const margin = m * 0.04;
      let side = state.sides[i];
      const lh = cs * 1.45 + ns * 1.05; // altura do bloco
      const off = pinR * 3.6;
      // sem espaço do lado escolhido: vai para baixo (ou para cima, se embaixo também não couber)
      if ((side === 'right' && x + off + bw > w - margin) || (side === 'left' && x - off - bw < margin)) side = y + off + lh < h - margin ? 'below' : 'above';
      let lx = side === 'left' ? x - off - bw : side === 'right' ? x + off : x - bw / 2;
      let ly = side === 'below' ? y + off : side === 'above' ? y - off - lh : y - lh / 2;
      lx = clamp(lx, margin, w - margin - bw);
      ly = clamp(ly, margin, h - margin - lh);
      const al = side === 'left' ? 1 : side === 'right' ? 0 : 0.5; // alinhamento interno
      ctx.save();
      ctx.beginPath();
      ctx.rect(lx - m * 0.02, ly - ns * 0.2, bw + m * 0.04, lh + ns * 0.5);
      ctx.clip();
      const dy = (1 - lab) * (side === 'above' ? ns * 1.6 : -ns * 1.6);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = MONO(600, cs);
      ctx.letterSpacing = `${cs * 0.12}px`;
      ctx.fillStyle = p.accent;
      ctx.fillText(c.code, lx + (bw - cw) * al, ly + dy);
      ctx.letterSpacing = '0px';
      ctx.font = INTER(700, ns);
      ctx.fillStyle = p.ink;
      ctx.fillText(c.name, lx + (bw - nw) * al, ly + cs * 1.45 + dy);
      ctx.restore();
    });

    // ---------- avião ----------
    if (plane) {
      const { L } = plane;
      const show = spring(seg(t, L.t0 - 0.35, L.t0 + 0.25), 0.3) * (1 - ease.inCubic(seg(t, L.t1 - 0.1, L.t1 + 0.3)));
      if (show > 0.001) {
        const alt = Math.sin(Math.PI * plane.u); // "altitude": cresce no meio do voo
        const Ls = m * 0.05 * (0.85 + 0.3 * alt) * show;
        const x = Tx(plane.x);
        const y = Ty(plane.y);
        // sombra no chão, deslocada pela altitude
        ctx.save();
        ctx.translate(x + m * 0.012 * alt, y + m * 0.03 * alt);
        ctx.rotate(plane.ang);
        ctx.fillStyle = `rgba(0,0,0,${0.32 - 0.14 * alt})`;
        planePath(ctx, Ls * 0.92);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(plane.ang);
        ctx.fillStyle = p.ink;
        ctx.lineJoin = 'round';
        planePath(ctx, Ls);
        ctx.fill();
        // turbinas
        ctx.fillStyle = rgba(p.bg, 0.55);
        ctx.fillRect(Ls * 0.0, -Ls * 0.22, Ls * 0.09, Ls * 0.05);
        ctx.fillRect(Ls * 0.0, Ls * 0.17, Ls * 0.09, Ls * 0.05);
        ctx.restore();
      }
    }

    // ---------- cartão ----------
    if (p.card) {
      const cIn = ease.outExpo(seg(t, 0.9, 1.9));
      if (cIn > 0.001) {
        const first = cities[0];
        const last = cities[cities.length - 1];
        const s = m * (portrait ? 0.95 : 0.8);
        const pad = s * 0.035;
        const codes = cities.map((c) => c.code).join('  →  ');
        let fsC = s * 0.05;
        let fsS = s * 0.024;
        {
          // encolhe as fontes se os códigos + distância não couberem na largura
          ctx.font = INTER(800, fsC);
          const need = ctx.measureText(codes).width * 1.02 + fsC * 0.8 * 5.5 + s * 0.035 * 4;
          const k = Math.min(1, (w - m * 0.1) / need);
          fsC *= k;
          fsS *= Math.max(k, 0.8);
        }
        ctx.font = INTER(800, fsC);
        ctx.letterSpacing = `${fsC * 0.02}px`;
        const codesW = ctx.measureText(codes).width;
        ctx.letterSpacing = '0px';
        const sub = `${first.name} — ${last.name}${cities.length > 2 ? ` · ${cities.length - 2} stop${cities.length > 3 ? 's' : ''}` : ''}`;
        ctx.font = INTER(500, fsS);
        const subW = ctx.measureText(sub).width;
        const kmTxt = `${fmt.format(Math.round(state.kmTotal))} km`;
        ctx.font = MONO(600, fsC * 0.8);
        const kmW = ctx.measureText(kmTxt).width;
        const cw = Math.min(w - m * 0.1, Math.max(codesW, subW) + kmW + pad * 4);
        const ch = fsC * 1.2 + fsS * 1.6 + pad * 2.6;
        const mg = m * (portrait ? 0.1 : 0.06);
        const cr = state.corner;
        const cx = w / h <= 1.45 ? (w - cw) / 2 : cr[1] === 'r' ? w - cw - mg : mg;
        const cy = cr[0] === 't' ? mg : h - ch - mg;
        ctx.save();
        ctx.translate(0, (1 - cIn) * m * 0.05);
        ctx.globalAlpha = alphaAll * clamp(cIn * 1.5);
        ctx.fillStyle = rgba('#000000', 0.35);
        ctx.beginPath();
        ctx.roundRect(cx, cy + m * 0.008, cw, ch, s * 0.02);
        ctx.fill();
        ctx.fillStyle = rgba(mixBg(p.bg), 0.92);
        ctx.beginPath();
        ctx.roundRect(cx, cy, cw, ch, s * 0.02);
        ctx.fill();
        ctx.strokeStyle = rgba(p.ink, 0.08);
        ctx.lineWidth = Math.max(1, m * 0.0015);
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = INTER(800, fsC);
        ctx.letterSpacing = `${fsC * 0.02}px`;
        ctx.fillStyle = p.ink;
        ctx.fillText(codes, cx + pad * 1.2, cy + pad + fsC * 0.95);
        ctx.letterSpacing = '0px';
        ctx.font = INTER(500, fsS);
        ctx.fillStyle = rgba(p.ink, 0.55);
        ctx.fillText(sub, cx + pad * 1.2, cy + pad + fsC * 1.2 + fsS * 1.2);
        // distância voada contando
        ctx.textAlign = 'right';
        ctx.font = MONO(600, fsC * 0.8);
        ctx.fillStyle = p.accent;
        ctx.fillText(`${fmt.format(Math.round(kmFlown))} km`, cx + cw - pad * 1.2, cy + pad + fsC * 0.95);
        ctx.font = INTER(600, fsS * 0.85);
        ctx.letterSpacing = `${fsS * 0.12}px`;
        ctx.fillStyle = rgba(p.ink, 0.45);
        const status = t < T_FLY0 ? 'BOARDING' : t < T_FLY1 ? 'IN FLIGHT' : 'LANDED';
        ctx.fillText(status, cx + cw - pad * 1.2, cy + pad + fsC * 1.2 + fsS * 1.2);
        ctx.letterSpacing = '0px';
        // barra de progresso no pé do cartão
        const by = cy + ch - pad * 0.9;
        const bx0 = cx + pad * 1.2;
        const bx1 = cx + cw - pad * 1.2;
        const prog = state.kmTotal ? kmFlown / state.kmTotal : 0;
        ctx.fillStyle = rgba(p.ink, 0.1);
        ctx.fillRect(bx0, by, bx1 - bx0, Math.max(1, m * 0.003));
        ctx.fillStyle = p.accent;
        ctx.fillRect(bx0, by, (bx1 - bx0) * prog, Math.max(1, m * 0.003));
        ctx.restore();
      }
    }
    ctx.restore();
  },
};

// cartão: fundo um pouco mais claro que o do mapa
function mixBg(hex) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * 0.06));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
