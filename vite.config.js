import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const RENDERS = resolve('renders');
const UPLOADS = resolve('public/uploads');

// Endpoints locais para o botão "Renderizar" do front chamar scripts/render.mjs.
//   POST /__render  { kind: 'comp'|'motion', id, params, fps, mblur, alpha, w, h, frame }
//        → texto em streaming: linhas "progress a/b" e, no fim, "done <arquivo>" ou "error <msg>"
//   GET  /__renders/<arquivo> → download do resultado
function renderApi() {
  let busy = false;
  return {
    name: 'motion-pedia-render',
    configureServer(server) {
      server.middlewares.use('/__render', (req, res) => {
        if (req.method !== 'POST') return res.writeHead(405).end();
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          if (busy) return res.writeHead(409).end('error já existe um render em andamento\n');
          const o = JSON.parse(body || '{}');
          const args = ['scripts/render.mjs', `--${o.kind === 'motion' ? 'motion' : 'comp'}`, o.id, '--params', JSON.stringify(o.params ?? {})];
          for (const k of ['fps', 'mblur', 'w', 'h', 'frame']) if (o[k] != null) args.push(`--${k}`, String(o[k]));
          if (o.alpha) args.push('--alpha');
          busy = true;
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
          const child = spawn(process.execPath, args, { cwd: process.cwd() });
          let err = '';
          child.stdout.on('data', (d) => {
            for (const line of String(d).split('\n')) {
              if (line.startsWith('done ')) res.write(`done ${basename(line.slice(5).trim())}\n`);
              else if (line.trim()) res.write(`${line}\n`);
            }
          });
          child.stderr.on('data', (d) => (err += d));
          child.on('close', (code) => {
            busy = false;
            if (code !== 0) res.write(`error ${err.trim().split('\n').slice(-3).join(' | ') || `render saiu com código ${code}`}\n`);
            res.end();
          });
          // cliente desconectou no meio (aba fechada): aborta o render
          res.on('close', () => !res.writableFinished && child.exitCode === null && child.kill());
        });
      });

      // Upload de imagem/áudio para parâmetros `image`/`audio`. Fica em public/uploads (entra no build do render).
      server.middlewares.use('/__upload', (req, res) => {
        if (req.method !== 'POST') return res.writeHead(405).end();
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const buf = Buffer.concat(chunks);
          const ext = (decodeURIComponent(req.headers['x-filename'] || '').match(/\.[a-z0-9]{2,5}$/i)?.[0] || '').toLowerCase();
          const name = createHash('sha1').update(buf).digest('hex').slice(0, 16) + ext;
          mkdirSync(UPLOADS, { recursive: true });
          writeFileSync(resolve(UPLOADS, name), buf);
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ url: `/uploads/${name}` }));
        });
      });

      server.middlewares.use('/__renders/', (req, res) => {
        const file = resolve(RENDERS, basename(decodeURIComponent(req.url.split('?')[0])));
        if (!existsSync(file)) return res.writeHead(404).end();
        res.writeHead(200, {
          'Content-Length': statSync(file).size,
          'Content-Disposition': `attachment; filename="${basename(file)}"`,
          'Content-Type': 'application/octet-stream',
        });
        createReadStream(file).pipe(res);
      });
    },
  };
}

// Neste ambiente o import.meta.glob não percebe arquivos novos/apagados em src/motions e src/compositions:
// invalidamos o index.js da pasta e recarregamos a página.
function globRefresh() {
  return {
    name: 'motion-pedia-glob-refresh',
    configureServer(server) {
      const onChange = (file) => {
        const m = file.replace(/\\/g, '/').match(/\/src\/(motions|compositions)\/[^/]+\.js$/);
        if (!m) return;
        const index = resolve('src', m[1], 'index.js');
        for (const mod of server.moduleGraph.getModulesByFile(index) ?? []) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

export default defineConfig({
  plugins: [renderApi(), globRefresh()],
  server: {
    host: '127.0.0.1',
    port: 5179,
    strictPort: true,
    allowedHosts: ['.ts.net'], // exposto via `tailscale serve` no Windows
    watch: { ignored: ['**/renders/**', '**/public/uploads/**'] },
  },
  build: {
    rollupOptions: { input: { main: resolve('index.html'), render: resolve('render.html') } },
  },
});
