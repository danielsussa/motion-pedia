# motion·pedia

Biblioteca de motion graphics em JavaScript puro (Canvas 2D + WebGL compartilhado), com galeria, editor de parâmetros
e renderizador frame a frame para MP4/ProRes com alpha.

- **208 motions** em 7 categorias: tipografia, fundos & loops, formas & geometria, partículas & simulação,
  transições & overlays, UI/dados/broadcast e imagem & foto. Todos funcionam em 16:9, 9:16, 1:1 e 4:5.
- **Composições**: filmes com cenas, câmera 2.5D e UI em DOM/CSS, que usam os motions como camadas.
- **Renderizador** (`scripts/render.mjs`): Chrome headless + ffmpeg, com motion blur por sub-amostras e saída com alpha.

```bash
npm install
npm run dev                                   # galeria em http://127.0.0.1:5179
npm run render -- --motion aurora --fps 30    # vídeo em renders/
```

Requer Google Chrome e ffmpeg instalados para o renderizador.

Como criar um motion, as regras do contrato (`render` é função pura do tempo) e as armadilhas conhecidas estão em
[CLAUDE.md](CLAUDE.md). Planejamento e estudos em [docs/](docs/).

Fotos de exemplo: Unsplash (ver [public/samples/CREDITS.md](public/samples/CREDITS.md)).
