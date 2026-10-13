// Mede onde os TEXTOS de uma composição chegam na horizontal, quadro a quadro (seek a cada --passo s), para saber se
// um corte lateral (vídeo em "cover" numa tela mais estreita que o vídeo) cortaria letra. Só texto visível conta.
//   node scripts/limites.mjs --comp reler-v2-trilha [--comp outra …] [--passo 0.2] [--margem 60]
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'vite';

const argv = process.argv.slice(2);
const comps = argv.flatMap((a, i) => (a === '--comp' ? [argv[i + 1]] : []));
const opt = (k, d) => (argv.includes(k) ? Number(argv[argv.indexOf(k) + 1]) : d);
const passo = opt('--passo', 0.2), margem = opt('--margem', 60);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };
const dir = mkdtempSync(join(tmpdir(), 'motion-pedia-limites-'));
await build({ logLevel: 'error', build: { outDir: dir, emptyOutDir: true } });
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const f = join(dir, p === '/' ? 'index.html' : p);
  if (!f.startsWith(dir) || !existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: chrome });
let ruim = 0;
for (const id of comps) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/render.html?comp=${id}&params={}`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
  const info = await page.evaluate(() => window.__info);
  await page.setViewportSize({ width: info.w, height: info.h });
  const piores = [];
  for (let t = 0; t <= info.duration; t += passo) {
    await page.evaluate((t) => window.__seek(t), t);
    const r = await page.evaluate((W) => {
      const vis = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.opacity < 0.05 || s.visibility === 'hidden' || s.display === 'none') return false; } return true; };
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const out = [];
      while (w.nextNode()) {
        const n = w.currentNode; if (!n.textContent.trim() || !vis(n.parentElement)) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const b of rg.getClientRects()) if (b.width > 2) out.push({ l: b.left, r: W - b.right, txt: n.textContent.trim().slice(0, 24) });
      }
      return out;
    }, info.w);
    for (const b of r) piores.push({ t: +t.toFixed(2), lado: b.l < b.r ? 'esq' : 'dir', folga: Math.round(Math.min(b.l, b.r)), txt: b.txt });
  }
  // texto entrando/saindo voando passa fora da tela por um instante; só conta quem fica abaixo da margem por ≥ --parado s
  const parado = opt('--parado', 0.6), porTexto = {};
  for (const p of piores) (porTexto[p.txt] ??= []).push(p);
  const fora = [];
  let min = Infinity;
  for (const [txt, ps] of Object.entries(porTexto)) {
    const porT = new Map(); for (const p of ps) if (!porT.has(p.t) || p.folga < porT.get(p.t).folga) porT.set(p.t, p);
    const seq = [...porT.values()].sort((a, b) => a.t - b.t);
    let ini = null, pior = null;
    for (let k = 0; k <= seq.length; k++) {
      const p = seq[k], ruimAqui = p && p.folga < margem && (ini === null || p.t - seq[k - 1].t <= passo * 1.5);
      if (ruimAqui) { if (ini === null) ini = p; if (!pior || p.folga < pior.folga) pior = p; continue; }
      if (ini && seq[k - 1].t - ini.t >= parado) fora.push({ txt, folga: pior.folga, lado: pior.lado, de: ini.t, ate: seq[k - 1].t });
      ini = null; pior = null;
      if (p && p.folga < margem) { ini = p; pior = p; }
    }
    const rest = seq.map((p) => p.folga).sort((a, b) => a - b)[Math.floor(seq.length / 2)];
    min = Math.min(min, rest);
  }
  ruim += fora.length;
  console.log(`${id}: folga mediana mínima ${min}px${fora.length ? ` · parado abaixo de ${margem}px: ` + fora.map((p) => `"${p.txt}" ${p.folga}px ${p.lado} ${p.de}–${p.ate}s`).join(' | ') : ' · ok'}`);
  await page.close();
}
await browser.close(); server.close(); rmSync(dir, { recursive: true, force: true });
process.exit(ruim ? 1 : 0);
