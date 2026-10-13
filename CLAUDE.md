# motion·pedia

Biblioteca de motion graphics em dois níveis:
- **Motions** (`src/motions/`, rota `#/m/<id>`): efeitos isolados em Canvas 2D — os "ingredientes".
- **Composições** (`src/compositions/`, rota `#/c/<id>`): filmes com cenas, câmera e UI em DOM/CSS, que podem
  usar motions como camadas (`canvasLayer`). Ver `docs/ESTUDO-REVID.md` (por que) e `docs/ROADMAP.md` (o que vem).

- `npm run dev` — servidor local (Vite, porta 5179, exposto no tailnet via `tailscale serve` do Windows).
- `npm run build` — checa se tudo compila.
- `npm run render -- --comp <id>` / `--motion <id>` — render frame a frame (ver "Renderizador").
- Sem framework: JS puro + Vite. Dependências: só `vite` e `playwright-core` (render). Não adicione outras sem necessidade.

## Criar um motion

Copie `src/motions/_template.js` para `src/motions/<id>.js`. Qualquer `.js` nessa pasta (fora `index.js` e `_*.js`)
aparece sozinho na galeria, na seção da sua `category`. O módulo exporta por padrão:

| campo | |
|---|---|
| `id` | igual ao nome do arquivo, kebab-case |
| `title`, `description` | em português; description = 1 frase do que se vê |
| `category` | `tipografia` · `fundos` · `formas` · `particulas` · `transicoes` · `dados` · `imagem` (ver `CATEGORIES` em `src/motions/index.js`) |
| `tags` | curtas, reutilize: `tipografia`, `intro`, `loop`, `fundo`, `gradiente`, `padrão`, `forma`, `3d`, `partículas`, `simulação`, `transição`, `overlay`, `alpha`, `dados`, `ui`, `broadcast`, `shader`, `áudio` |
| `duration` | segundos; o player faz loop |
| `poster` | opcional: tempo (s) do frame mostrado parado na galeria (padrão 45% da duração) |
| `params` | `{ key: { type, label, default, ... } }` — tipos: `range` (`min/max/step`), `color`, `text`, `textarea` (`rows`), `select` (`options`), `boolean`, `image` (URL; padrão `/samples/logo.svg` para logos, `/samples/portrait.jpg` ou `/samples/landscape.jpg` para fotos), `audio` (URL; padrão `/samples/beat.wav`) |
| `setup(env)` | opcional; pré-computa coisas caras. Roda de novo a cada mudança de parâmetro/tamanho e quando imagens/áudios terminam de carregar |
| `render(ctx, t, env)` | desenha o frame no tempo `t` |

`env = { w, h, p, px, duration, progress, state }` — `w/h` são as dimensões lógicas (1920×1080, 1080×1920, 1080×1080
ou 1080×1350), `p` os parâmetros, `px` a escala real do canvas (miniaturas usam 0.25), `state` o retorno de `setup`.

### Regras
- `render` é **função pura de `t`** (a timeline e o renderizador fazem seek para qualquer tempo, inclusive sub-frames).
  Nada de `Math.random`, `Date`, nem estado acumulado entre frames. Aleatoriedade: `rng(seed)` dentro de `setup`.
- Pinte o fundo você mesmo (o canvas começa transparente).
- Escale tudo a partir de `Math.min(w, h)` (e/ou `w`, `h`) — tem que funcionar em 16:9, 9:16, 1:1 e 4:5.
- **`shadowBlur` e `ctx.filter = 'blur(Npx)'` ignoram o transform**: multiplique o raio por `px` (testado).
- Loops perfeitos: frequências inteiras de `progress` (`Math.sin(TAU * n * progress)`) ou `noise.loop2`.
- Desempenho: `render` idealmente < 8 ms em 1920×1080; `setup` < 300 ms. Dezenas de miniaturas rodam na galeria.
  Em laços grandes, agrupe por cor (um `fill()` por lote), evite trocar `fillStyle`/`font` a cada item, evite `ctx.filter` por item.
- Fontes: `Inter` (variável, 100–900), `Instrument Serif` (normal e itálico) e `JetBrains Mono` (400 e 600) — já carregadas.
- Padrões visuais (do estudo `docs/ESTUDO-REVID.md`): paleta contida (neutro + 1 cor de destaque), easing generoso
  (`outExpo`, mola com overshoot leve), stagger, momentos de pausa. O padrão (sem mexer em nada) tem que ficar bonito.
- Parâmetros: 4–10 que importam (cores de fundo/destaque, texto quando houver, intensidade/quantidade, `seed` se for aleatório).

### Armadilhas conhecidas
- **Gradiente entre cores diferentes com alpha** (ex.: branco a 0,03 → preto a 0,35) puxa o matiz no meio: o canvas
  não interpola pré-multiplicado. Para vinheta/halo, use a mesma cor variando só o alpha.
- `mixHex(a, b, t)` devolve `'rgb(...)'`, não hex — não dá para passar o resultado a `rgba()`/`mixHex()` de novo.
- `strokeText` com Inter (fonte variável) mostra os contornos internos sobrepostos dos glifos; para texto vazado,
  use traço grosso e preencha por cima com a cor do fundo, ou outra fonte.
- `shadowBlur` grande em formas grandes é caríssimo (centenas de ms). Glow barato: 2–3 traços largos com alpha baixo,
  ou sprite pré-renderizado no `setup`.
- **Fundo estático em tela cheia** (gradientes radiais, vinheta, wallpaper): cada gradiente de tela cheia custa ~4–5 ms
  por frame aqui. Pinte num canvas de `w*px × h*px` no `setup` e faça um `drawImage` por frame.
- `imageSmoothingQuality = 'high'` ao ampliar um buffer custa 40–70 ms por frame aqui: deixe o padrão.
- Milhares de `arc()`/`drawImage` por frame (retícula, grade de caracteres) não ficam baratos nem na miniatura: passe a
  grade como textura pequena e desenhe num shader (ver `halftone`, `ascii-art`).
- Dados grandes de um motion (contornos de mapa etc.): `src/motions/_<nome>.js` (a galeria ignora `_*`). Ex.: `_brasil-uf.js`.
- Shader "pixelado" (dither, mosaico): rode na resolução da grade, `shader(ctx, F, u, { w: W*c/px, h: H*c/px, px: px/c })`
  com `ctx.imageSmoothingEnabled = false`. Calcular por pixel real ficou 10–30× mais caro.
- Antialias em shader com `smoothstep(aa, -aa, d - r)`: com `r = 0` ainda sai 50% de cobertura. Pule quando `r ≈ 0`.
- **Loop**: tudo que depende de `progress` precisa de voltas inteiras — `fract(progress * 0.25)` ou `cos(TAU*(x + 0.15*progress))`
  quebram. No shader, para deriva contínua sem crossfade, faça o ruído periódico no eixo do movimento: mapeie o eixo para
  um círculo do simplex 3D (`vec3(x, R*cos θ, R*sin θ)`, θ = TAU·y/período). Crossfade A/B deixa o meio com cara de
  dupla exposição (se usar, divida por `sqrt(k² + (1−k)²)` para não perder contraste).
- `ctx.setTransform(...)` ignora a escala `px` (miniaturas quebram): guarde `const B = ctx.getTransform()` e componha a partir dele.
  Conte os `save()`/`restore()` — desbalancear desfaz o `save` do próprio player.
- Furo com `transparent: true`: pintar com a cor do fundo deixa opaco; use `globalCompositeOperation = 'destination-out'`.
  Formas que se encostam borda a borda deixam fresta de antialias: sobreponha 1–4 px.
- Máscara de texto animado letra a letra sobre outro conteúdo: `destination-in` não serve (cada `fillText` apaga os
  anteriores). Pinte a fonte inteira e ponha por cima um estêncil (fundo com as letras furadas por `destination-out`).
- `letterSpacing` com `textAlign = 'center'` desloca o centro em meio espaçamento. Para medir/posicionar glifos grandes
  (aspas, contraformas) use `measureText().actualBoundingBox*`, não o tamanho da fonte.
- Gradiente num `stroke()` é avaliado no transform ativo na hora do stroke. Rastros com alpha: `lineCap: 'butt'` (round vira contas).
- Foto em ASCII/halftone: luminância pura apaga cores saturadas escuras (vermelho); misture com `max(r,g,b)` e normalize por percentis.
- Simulação cara cujo resultado não depende de um asset: guarde em cache de módulo por chave (o `setup` roda de novo
  quando o asset termina de carregar).
- `shader()`: textura gerada no `setup` → passe `ImageData` (sobe uma vez, em cache); canvas é reenviado a cada frame.
  Sem arrays nem `int` em uniform (use `vec4`/`float`); nunca passe `null` (omita a chave). Simplex por pixel em tela cheia
  fica caro: pré-calcule ruído estático numa textura pequena e/ou rode o shader em meia resolução. Hash sem `sin`
  (hash12 de Dave Hoskins) é bem mais barato que `fract(sin(...))` aqui. `sin(k·atan(y,x))` com k não inteiro tem emenda em ±π.
- Blur no `setup` (`ctx.filter`) só custa no primeiro `drawImage` — meça forçando o desenho. Halos e sombras borradas:
  pinte num canvas 1/3–1/4 menor e amplie. Fotos grandes reduzidas a cada frame (cards, avatares): pré-recorte no `setup`
  no tamanho final. Sombra de card: sprite borrado no setup, ou 2–3 `roundRect` pretos com alpha ~0,09 — não `shadowBlur`.
- `globalCompositeOperation = 'lighter'`: sobreposição de 1 px entre faixas vira linha clara, e pontas `round` de lotes
  vizinhos viram contas. Use px inteiros e polilinhas contínuas com `lineCap: 'butt'`.
- Fade de muitos polígonos vizinhos com `globalAlpha` expõe as frestas de antialias: pinte opaco e cubra com o fundo a `1 − vis`.
  Furo `evenodd` do tamanho da tela: o retângulo externo tem que ser exatamente `(0, 0, W, H)`, senão sobra um anel.
- Texturas de milhares de pontos de 1 px ficam "salgadas" na miniatura: reduza o alpha junto com `px`.
- Grade de células (hash) que se desloca com `progress` só fecha o loop se o deslocamento for múltiplo do período do hash.
  Objeto que gira 180° para fechar o loop: detalhes de luz no referencial local precisam ser simétricos.
- Máscara por matiz em foto: exija croma mínimo (`sat*val`), senão os escuros do JPEG viram manchas.
- Medir texto no `setup` (sem `ctx`): `OffscreenCanvas(4, 4).getContext('2d')` em cache de módulo.
- `render.mjs --frame` sem `--alpha` sai RGB com fundo branco; para conferir `transparent`, use `--alpha`.
- Shader em resolução reduzida (`{w, h, px: px*k}`): uniforms em pixels (centro, raio) também × k. `smoothstep(a, b, x)` com
  `a > b` é indefinido em GLSL ES — use `1.0 - smoothstep(b, a, x)`. Normal de relevo: soma de senos com gradiente
  analítico (diferenças finitas do `snoise` riscam as arestas do simplex).
- Malha com milhares de triângulos: não passe `stroke()` para tapar frestas (3× o custo); infle cada triângulo ~0,7 px
  reais a partir do centróide. Faces coplanares de cubos: traço de `1.6 / px`.
- Feixe/raio com halo: sprite (gaussiana transversal × queda) pintado no setup, um `drawImage` por feixe — não `lineWidth` grande.
- Fade de objeto opaco em camadas (celular, card): `globalAlpha` mostra as camadas de baixo; cubra com o fundo a `k`.
- Layout que ordena por média ponderada: compare com tolerância e desempate pela ordem do texto (senão muda com o formato).
- Física sem atrito: a trajetória não depende de `g`; simule com qualquer `g` e estique o tempo para caber na `duration`.
  Loop com N objetos na mesma trajetória: defase em 1/N.
- O Chrome headless daqui renderiza Canvas e WebGL **por software** (SwiftShader): tempos medidos no render são 5–10×
  maiores que num navegador com GPU. Compare com os motions existentes, não com o orçamento absoluto.

### Convenções por tipo
- **Transições** (`category: 'transicoes'`): duração ~1,2–2 s. As formas cobrem a tela por completo no meio (`t = duration/2`)
  e descobrem até o fim (o editor corta a cena no meio). Params `colorA` (cena que sai) e `colorB` (cena que entra) pintam
  um fundo de prévia com "A" antes do meio e "B" depois; com `transparent: true` desenha **só** as formas (exporte com `--alpha`).
- **Overlays** (grão, light leaks, HUD…): `transparent` padrão `true`; com `false` pinta um fundo de prévia.
- **Alpha em geral**: param `transparent` (boolean) → não pinta o fundo.
- **Áudio**: param `audio` + `audioAt(asset(p.track), t)` → `{ bands: Float32Array(32) 0..1, rms }`. O renderizador mixa o
  áudio no vídeo sozinho.

### Helpers (`src/lib/`)
- `anim.js`: `TAU`, `clamp`, `lerp`, `seg(t,a,b)`, `win(t,a,b,easeFn)`, `ease.*` (linear, in/out/inOut Cubic, Expo, Sine,
  outQuart, outBack, inBack, outElastic), `spring(x,bounce)`, `springWin(t,a,b,bounce)`, `stagger(i,n,spread)`,
  `keys(t, [[t, valor|{obj}], ...])`, `fract`, `smoothstep`, `rng(seed)`, `rgba(hex,a)`, `mixHex(a,b,t)`, `hexToRgb`.
- `noise.js`: `createNoise(seed)` → `{ noise2, noise3, fbm2, fbm3, loop2(x, y, progress, speed) }` (simplex, ~[-1,1]).
- `space.js`: `rotate([x,y,z], {rx,ry,rz})`, `project(p, {cx,cy,fov,dist})` → `{x,y,s,z,visible}`, `iso(x,y,z,{cx,cy,scale})`,
  `byDepth(items)`, `cube(r)`, `sphereFib(n,r)`.
- `text-points.js`: `sampleText(text, {font,w,h,x,y,step,maxWidth})`, `sampleImage(img, {box,step})` → pontos (use no `setup`).
- `gl.js`: `shader(ctx, FRAG, uniforms, env)` — fragment shader num contexto WebGL2 **compartilhado** (nunca crie
  `getContext('webgl')` próprio: o Chrome só mantém ~16 vivos). `GLSL_NOISE` dá `snoise(vec3)`. Uniforms automáticos:
  `u_res` (px reais), `u_time`; valores: número, `[a,b(,c,d)]`, `'#hex'` → vec3, boolean, imagem/canvas → `sampler2D`
  (enviada já virada: `texture(u_img, gl_FragCoord.xy / u_res)` desenha em pé).
- `bake.js`: `bake({ duration, fps, init, step, snapshot })` → `{ at(t), index(t), frames }` para simulações (no `setup`).
- `image.js`: `coverRect(img, w, h, {zoom, fx, fy})`, `drawCover(ctx, img, w, h, opts)`, `imageGrid(img, {w, h, cell})` →
  `{cols, rows, cell, rgb, lum}` (cor/luminância por célula), `imagePixels(img, W, H)` → ImageData. No retrato em 16:9
  use `fy ≈ 0.3` para não cortar o rosto.
- `source.js`: motion dentro de motion. `params.source = SOURCE_PARAM('aurora')`; no setup
  `createSource(p.source, env, {scale: 0.5, overrides})`; no render `src.frame(t)` → canvas (drawImage, máscara, ou
  sampler no shader). Custa um render extra do motion de origem por frame.
- `skeleton.js`: `skeleton(texto, fontFn)` → traços da linha central dos glifos (Zhang-Suen), na ordem de escrita.
  Usado por `handwriting` e `neon-sign`. No `setup`.
- `physics.js`: `verlet({gravity, damping, iterations, bounds})` → `point()`, `link()`, `step(dt, force)`. Use dentro do `bake`.
- `assets.js`: `asset(url)` → imagem/áudio carregado (ou `null` enquanto carrega — desenhe algo neutro), `audioAt(a, t)`.

### Conferir o resultado
`node scripts/render.mjs --motion <id> --frame <t> --url http://127.0.0.1:5179 --out <arquivo.png>` (rápido, usa o dev server)
e `--w 1080 --h 1920` para o vertical. Olhe vários tempos (entrada, meio, saída; t=0 e t≈duration para loops).

## Criar uma composição

Arquivo em `src/compositions/<id>.js` (aparece sozinho na galeria). Exemplo completo: `pauta-launch.js`.

```js
export default {
  id, title, description, tags, duration, size: { w: 1920, h: 1080 }, poster, params: { ... },
  mount(root, p) {          // monta o DOM UMA vez (root = quadro 1920×1080)
    return { update(t) {} } // define TODOS os estilos animados a partir de t
  },
};
```

Regras:
- **Tudo é função de `t`**: nada de `transition`/`animation` CSS, `setTimeout` ou estado acumulado. O renderizador faz seek
  em qualquer tempo e em sub-frames (motion blur).
- Mudança de parâmetro remonta a composição (`mount` de novo), então `mount` pode ler `p` livremente.
- Helpers em `src/comp/core.js`: `win(t,a,b,ease)`, `springWin`, `keys(t, [[t, {..}], ...])`, `show(node, on)` (preserva
  display), `tf({...})`, `set(node, styles)`, `camera(plane, {fx, fy, zoom, rx, rz, blur}, lens)`, `typedCount/typedChars`,
  `caretOn`, `rng`.
- **Câmera 2.5D**: um plano grande (`plane`) dentro de um palco do tamanho da tela com `perspective` e `overflow:hidden`.
  O desfoque vai no palco (`lens`), **nunca no plano** — blur em nó gigante deixa o render 10× mais lento.
- Kit de UI em `src/comp/ui/` (cursor + ripple, prompt bar, task card, week board). Cores via variáveis CSS `--accent`,
  `--ink`, `--paper` definidas no root da composição. Componentes novos entram aqui, parametrizados por estado.
- Motion de canvas dentro da cena: `canvasLayer('dot-wave', {params})` → `{ el, update(t) }`.
- Fontes: Inter, Instrument Serif (itálico para palavras de destaque), JetBrains Mono.
- Para conferir visualmente: `npm run render -- --comp <id> --frame 12.5` gera um PNG em `renders/`.

## Renderizador (`scripts/render.mjs`)

Gera um build congelado do projeto, serve num servidor efêmero, abre `render.html` no Chrome headless
(`/usr/bin/google-chrome`), faz `window.__seek(t)` frame a frame e envia PNGs para o ffmpeg.
- `--fps 30|60`, `--mblur N` (N sub-amostras por frame, obturador 180°), `--alpha` (ProRes 4444 .mov), `--frame t` (PNG),
  `--from/--to`, `--params '{...}'`, `--w/--h` (motions). Saída em `renders/` (fora do git).
- O front chama o mesmo script pelo endpoint `POST /__render` do dev server (plugin em `vite.config.js`); o download sai
  por `/__renders/<arquivo>`. Um render por vez.
- Custo típico: ~0,1–0,5 s por captura. Com motion blur ×4 o tempo multiplica por 4.
