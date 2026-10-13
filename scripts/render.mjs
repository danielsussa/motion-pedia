#!/usr/bin/env node
// Renderizador frame a frame: gera um build do projeto (cópia congelada do código), serve localmente,
// abre render.html no Chrome headless, faz seek(t) em cada frame, captura e envia para o ffmpeg.
//
//   node scripts/render.mjs --comp pauta-launch [--fps 30] [--mblur 4] [--out renders/x.mp4]
//   node scripts/render.mjs --motion lower-third --alpha            (ProRes 4444 com transparência)
//   node scripts/render.mjs --comp pauta-launch --frame 12.9        (um PNG)
//
// Opções: --params '{"brand":"x"}' | --params arquivo.json · --w/--h (motions) · --from/--to (s)
//         --url <servidor já rodando, em vez do build> · --mblur N = N sub-amostras por frame (motion blur, obturador 180°)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'vite';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);

const kind = args.comp ? 'comp' : 'motion';
const id = args.comp || args.motion;
if (!id || id === true) {
  console.error('use --comp <id> ou --motion <id>');
  process.exit(1);
}
const fps = Number(args.fps || 30);
const mblur = Math.max(1, Number(args.mblur || 1));
const alpha = Boolean(args.alpha);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' };

// Build congelado + servidor estático efêmero (evita reloads do dev server no meio do render).
async function serveBuild() {
  const dir = mkdtempSync(join(tmpdir(), 'motion-pedia-render-'));
  await build({ logLevel: 'error', build: { outDir: dir, emptyOutDir: true } });
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(dir, path === '/' ? 'index.html' : path);
    if (!file.startsWith(dir) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => (server.close(), rmSync(dir, { recursive: true, force: true })),
  };
}

const served = args.url ? null : await serveBuild();
const base = args.url || served.url;
let params = args.params || '{}';
if (existsSync(params)) params = readFileSync(params, 'utf8');

const q = new URLSearchParams({ [kind]: id, params });
if (args.w) q.set('w', args.w);
if (args.h) q.set('h', args.h);

const chrome = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
// Sem a cota maior de memória de GPU, cenas pesadas (ex.: grade de 80 cópias com blur) fazem o Chrome
// descartar a rasterização de outras camadas e elas saem quase transparentes em renders sequenciais.
const browser = await chromium.launch({ executablePath: chrome, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--force-gpu-mem-available-mb=8192', ...(process.env.RENDER_FLAGS?.split(' ').filter(Boolean) ?? [])] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
// Contra o dev server (--url): bloqueia o cliente de HMR do Vite, senão qualquer arquivo salvo recarrega a página no meio.
// O stub mantém a API que os módulos transformados importam (createHotContext, updateStyle…), sem o socket.
const VITE_CLIENT_STUB = `
const hot = { accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} };
const styles = new Map();
export const createHotContext = () => hot;
export function updateStyle(id, css) {
  let s = styles.get(id);
  if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); styles.set(id, s); }
  s.textContent = css;
}
export function removeStyle(id) { styles.get(id)?.remove(); styles.delete(id); }
export const injectQuery = (u) => u;
export class ErrorOverlay {}
`;
if (args.url) await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'text/javascript', body: VITE_CLIENT_STUB }));
await page.goto(`${base}/render.html?${q}`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60_000 });
const err = await page.evaluate(() => window.__error);
if (err) throw new Error(err);
const info = await page.evaluate(() => window.__info);
await page.setViewportSize({ width: info.w, height: info.h });

const cdp = await page.context().newCDPSession(page);
if (alpha) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
const shot = async () => {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    optimizeForSpeed: true,
    clip: { x: 0, y: 0, width: info.w, height: info.h, scale: 1 },
  });
  return Buffer.from(data, 'base64');
};

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

if (args.frame !== undefined) {
  const out = args.out || `renders/${id}-${Number(args.frame).toFixed(2)}s.png`;
  mkdirSync(dirname(out), { recursive: true });
  await page.evaluate((t) => window.__seek(t), Number(args.frame));
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, await shot());
  console.log(`done ${out}`);
  await browser.close();
  served?.close();
  process.exit(0);
}

const from = Number(args.from || 0);
const to = Number(args.to || info.duration);
const frames = Math.round((to - from) * fps);
const ext = alpha ? 'mov' : 'mp4';
const out = args.out || `renders/${id}-${stamp}.${ext}`;
mkdirSync(dirname(out), { recursive: true });

// Sub-amostras são somadas pelo tmix e só a última de cada grupo é mantida.
const vf = mblur > 1 ? [`tmix=frames=${mblur}`, `select='not(mod(n+1\\,${mblur}))'`, `setpts=N/(${fps}*TB)`] : [];
const codec = alpha
  ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']
  : ['-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
// Motion com parâmetro de áudio: mixa o áudio (em loop, cortado no fim do vídeo).
const audioIn = info.audio
  ? ['-stream_loop', '-1', '-ss', String(from), '-i', new URL(info.audio, base).href]
  : [];
const audioOut = info.audio
  ? ['-map', '0:v', '-map', '1:a', '-c:a', alpha ? 'pcm_s16le' : 'aac', '-b:a', '192k', '-shortest']
  : [];
const ff = spawn('ffmpeg', [
  '-v', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(fps * mblur), '-c:v', 'png', '-i', '-',
  ...audioIn,
  ...(vf.length ? ['-vf', vf.join(',')] : []),
  '-r', String(fps), ...codec, ...audioOut, out,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg saiu com ${c}`)))));

const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  for (let s = 0; s < mblur; s++) {
    // obturador de 180°: as sub-amostras cobrem meio intervalo de frame, terminando no frame
    const t = from + f / fps - (mblur > 1 ? ((mblur - 1 - s) / (mblur - 1)) * (0.5 / fps) : 0);
    await page.evaluate((x) => window.__seek(x), Math.max(0, t));
    if (!ff.stdin.write(await shot())) await new Promise((r) => ff.stdin.once('drain', r));
  }
  if (f % 10 === 0 || f === frames - 1) console.log(`progress ${f + 1}/${frames}`);
}
ff.stdin.end();
await ffDone;
await browser.close();
served?.close();
console.log(`time ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`done ${out}`);
