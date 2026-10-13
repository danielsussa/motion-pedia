// Assets de parâmetros `image` e `audio` (valor = URL). São pré-carregados antes do render;
// no motion use asset(p.logo) → HTMLImageElement | AudioData | null (ainda carregando).
const cache = new Map();

export const asset = (url) => (url ? (cache.get(url)?.value ?? null) : null);

// caminhos absolutos ('/samples/…') seguem o base do build (a galeria publicada fica em dekah.tech/motion-pedia/)
const at = (url) => (url.startsWith('/') && !url.startsWith('//') ? import.meta.env.BASE_URL + url.slice(1) : url);

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`image failed to load: ${url}`));
    img.src = at(url);
  });
}

// FFT radix-2 in-place (re, im de tamanho potência de 2).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

const FPS = 60;
const BANDS = 32;
const N = 2048;

// Decodifica e analisa o áudio inteiro offline: por frame (60/s) → 32 bandas log (0..1) + rms.
async function loadAudio(url) {
  const buf = await (await fetch(at(url))).arrayBuffer();
  const audio = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(buf);
  const sr = audio.sampleRate;
  const ch = audio.numberOfChannels;
  const mono = new Float32Array(audio.length);
  for (let c = 0; c < ch; c++) audio.getChannelData(c).forEach((v, i) => (mono[i] += v / ch));

  const frames = Math.ceil(audio.duration * FPS);
  const bands = new Float32Array(frames * BANDS);
  const rms = new Float32Array(frames);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const edges = Array.from({ length: BANDS + 1 }, (_, b) => Math.round(2 * (N / 2 / 2) ** (b / BANDS)));
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let f = 0; f < frames; f++) {
    const start = Math.floor((f / FPS) * sr) - N / 2;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = mono[start + i] ?? 0;
      re[i] = v * win[i];
      im[i] = 0;
      e += v * v;
    }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    for (let b = 0; b < BANDS; b++) {
      let m = 0;
      for (let k = edges[b]; k < Math.max(edges[b + 1], edges[b] + 1); k++) m = Math.max(m, Math.hypot(re[k], im[k]));
      const db = 20 * Math.log10(m / (N / 4) + 1e-9);
      bands[f * BANDS + b] = Math.min(1, Math.max(0, (db + 60) / 60));
    }
  }
  return { url, duration: audio.duration, fps: FPS, bands: BANDS, data: bands, rms, frames };
}

// Bandas (Float32Array de 32, 0..1) e rms no tempo t, com loop se o áudio for mais curto.
export function audioAt(a, t) {
  if (!a) return { bands: new Float32Array(BANDS), rms: 0 };
  const f = Math.floor((((t % a.duration) + a.duration) % a.duration) * a.fps) % a.frames;
  return { bands: a.data.subarray(f * a.bands, (f + 1) * a.bands), rms: a.rms[f] };
}

export function preload(schema = {}, params = {}) {
  const jobs = [];
  for (const [k, d] of Object.entries(schema)) {
    const url = params[k];
    if (!url || (d.type !== 'image' && d.type !== 'audio')) continue;
    if (!cache.has(url)) {
      const entry = { value: null };
      entry.promise = (d.type === 'image' ? loadImage(url) : loadAudio(url))
        .then((v) => (entry.value = v))
        .catch((e) => console.error(e));
      cache.set(url, entry);
    }
    jobs.push(cache.get(url).promise);
  }
  return Promise.all(jobs);
}

// URL do primeiro parâmetro de áudio (o renderizador mixa esse áudio no vídeo).
export function audioParam(schema = {}, params = {}) {
  const key = Object.keys(schema).find((k) => schema[k].type === 'audio');
  return key ? params[key] || null : null;
}
