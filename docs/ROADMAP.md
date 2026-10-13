# Roadmap — próximos 50 motions

**Status (2026-10-12): os 50 estão implementados** — 55 motions na galeria (os 5 iniciais + estes 50), revisados em 16:9 e 9:16.
Observação: `ink` entrou em `particulas`; `film-overlay` e `light-leaks` estão em `transicoes`.

> Complemento: [ESTUDO-REVID.md](ESTUDO-REVID.md) — estudo de 43 vídeos de motion complexos, que propõe uma camada de **composição** (cenas, câmera, UI, templates) por cima destes 50 ingredientes.

## 1. O que o estudo mostrou

Testes rodados no Chrome 150 (headless) em 2026-10-12:

| Teste | Resultado | Consequência |
|---|---|---|
| `VideoEncoder` H.264 1080p60 | ✅ suportado | Dá para exportar **frame a frame** (sem frames perdidos e mais rápido que tempo real) em vez de gravar a tela com MediaRecorder |
| `VideoEncoder` VP8/VP9 com alpha | ❌ "Alpha encoding is not currently supported" | Vídeo com transparência não sai do navegador. Transições e overlays com alpha precisam de **sequência PNG** |
| `showSaveFilePicker` / File System Access | ✅ disponível | A sequência PNG pode ser gravada direto numa pasta, sem zip e sem dependência |
| WebGL2: 40 contextos criados | ⚠️ só **16 continuam vivos** | Uma galeria com dezenas de motions em shader **não pode** usar um contexto WebGL por card: precisa de **um contexto compartilhado** que renderiza e copia para canvases 2D |
| `strokeText` + `setLineDash` | ✅ respeita o tracejado | Dá para fazer "texto sendo desenhado" sem extrair o contorno das letras (sem opentype.js) |
| `ctx.filter` (blur etc.) | ✅ | Bokeh, glow e aurora baratos, sem shader. Validar se o raio do blur escala com o transform (provavelmente precisa de `* px`, como o `shadowBlur`) |
| `ctx.letterSpacing`, `OffscreenCanvas` | ✅ | Tracking real em títulos e amostragem de texto/imagem fora da tela |

Um limite estrutural que já existe: `render(t)` precisa ser função pura do tempo, por causa do seek. Motions de **simulação** (revoada, fluido, física) não cabem nisso diretamente. A solução é **pré-calcular (bake)** a simulação no `setup` em passo fixo e o `render` só ler o frame correspondente.

## 2. Infraestrutura necessária

Cada item tem um código; o catálogo abaixo indica qual motion depende de qual.

| Código | O que | Tamanho | Observação |
|---|---|---|---|
| **K** | Helpers de animação em `lib/anim.js`: `keys()` (keyframes com easing), `stagger()`, easing de mola (`spring`) | P | Usado por quase tudo; reduz cada motion pela metade |
| **CAT** | Campo `category` nos motions + galeria em seções + thumbnails *lazy* (IntersectionObserver) | P | Necessário a partir de ~20 motions |
| **EXP** | Exportação frame a frame em MP4 (WebCodecs + muxer) e **sequência PNG com alpha** numa pasta | M | O MP4 precisa de um muxer (`mediabunny`); a sequência PNG não precisa de nada |
| **N** | Ruído simplex 2D/3D/4D próprio, com versão *loopável* (amostra o ruído num círculo) | P | ~100 linhas, sem dependência |
| **3D** | Projeção 3D mínima: rotação, perspectiva, isométrico | P | Sem three.js; suficiente para wireframe, grid e isométrico |
| **T** | Amostragem de texto ou imagem em pontos (desenha offscreen, lê os pixels) | P | Base de partículas formando texto ou logo |
| **DATA** | Parâmetro `textarea` (listas, CSV, conversas) | P | Gráficos, legendas, chat |
| **B** | Bake de simulação no `setup` (passo fixo, guarda os frames, o render interpola) | M | Revoada, fluido, campo de fluxo com rastro |
| **GL** | Motions em fragment shader com **um contexto WebGL2 compartilhado** | M | Imposto pelo limite de 16 contextos |
| **IMG** | Parâmetro `image` (upload de PNG/SVG), persistido em IndexedDB | M | Logo reveal; depois, fotos (duotone, halftone) |
| **AUD** | Parâmetro de áudio + FFT offline (`OfflineAudioContext`), resultado determinístico | M | Visualizador de áudio |

## 3. Catálogo — 50 motions

Esforço: **P** ≈ menos de 1h · **M** ≈ meio dia · **G** ≈ 1 dia ou mais. **α** = pensado para sair com fundo transparente. **∞** = loop sem emenda.

### Tipografia (11)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 1 | `typewriter` | Typewriter | Digitação com cursor piscando, um "erro" com backspace e correção | K | P |
| 2 | `text-scramble` | Text Scramble | Caracteres aleatórios que vão se resolvendo no texto (estilo decode) | K | P |
| 3 | `rotating-words` | Rotating Words | "A gente faz [vídeos / marcas / apps]": a palavra troca com slide e a largura do bloco anima | K | P |
| 4 | `odometer` | Odometer | Contador com dígitos rolando até N, com prefixo e sufixo (R$, %, k) | K | P |
| 5 | `split-reveal` | Split Reveal | Texto cortado ao meio; as metades deslizam em sentidos opostos e revelam a 2ª linha | K | P |
| 6 | `marquee` | Marquee | Faixas inclinadas de texto em loop infinito, em direções alternadas | — | P ∞ |
| 7 | `captions` | Karaoke Captions | Legenda estilo Reels/TikTok: a palavra ativa ganha destaque com um "pop" | K DATA | M α |
| 8 | `glitch-title` | Glitch Title | Separação RGB, fatias deslocadas, jitter determinístico | K | M |
| 9 | `split-flap` | Split-Flap | Painel de aeroporto (Solari) com as placas virando até formar a palavra | K | M |
| 10 | `particle-text` | Particle Text | Partículas se juntam formando o texto, seguram e explodem | T K | M |
| 11 | `stroke-draw` | Stroke Draw | O contorno das letras é desenhado (dash em `strokeText`, já testado) e depois preenchido | K | M |

### Fundos & loops (9)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 12 | `domain-warp` | Domain Warp | Ruído distorcido sobre si mesmo: mármore ou fluido orgânico | GL | M ∞ |
| 13 | `mesh-gradient` | Mesh Gradient | Gradiente de malha suave, estilo Stripe/Apple | GL | M ∞ |
| 14 | `aurora` | Aurora | Cortinas de luz ondulando, com blur via `ctx.filter` | N | M ∞ |
| 15 | `flow-field` | Flow Field | Milhares de linhas seguindo um campo de ruído, deixando rastro | N B | G |
| 16 | `starfield` | Starfield Warp | Estrelas em velocidade de dobra, com rastro | — | P ∞ |
| 17 | `synthwave` | Synthwave Grid | Grid em perspectiva correndo, sol listrado, montanhas | 3D | P ∞ |
| 18 | `topo-contours` | Topographic | Curvas de nível de um ruído animado (marching squares) | N | G ∞ |
| 19 | `bokeh` | Bokeh | Círculos desfocados flutuando em camadas de profundidade | — | P ∞ |
| 20 | `metaballs` | Metaballs | Bolhas líquidas que se fundem e se separam | GL | M ∞ |

### Formas & geometria (9)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 21 | `shape-morph` | Shape Morph | Círculo → quadrado → triângulo → estrela, com reamostragem de pontos | K | M ∞ |
| 22 | `bauhaus-grid` | Bauhaus Grid | Grade suíça de semicírculos e quartos de círculo girando e trocando em sequência | K | M ∞ |
| 23 | `iso-wave` | Isometric Wave | Colunas isométricas subindo e descendo em onda | 3D | M ∞ |
| 24 | `spirograph` | Spirograph | Hipotrocoides sendo desenhadas, com várias camadas | — | P |
| 25 | `kaleidoscope` | Kaleidoscope | Formas espelhadas em N setores | K | M ∞ |
| 26 | `polygon-tunnel` | Polygon Tunnel | Túnel infinito de polígonos girando | — | P ∞ |
| 27 | `truchet` | Truchet Tiles | Azulejos de arcos girando e reconectando os caminhos | K | M ∞ |
| 28 | `ridge-lines` | Ridge Lines | Linhas de cumeeira empilhadas, estilo capa de "Unknown Pleasures" | N | P ∞ |
| 29 | `wireframe` | Wireframe Solids | Sólidos platônicos em wireframe girando e trocando de forma | 3D | M ∞ |

### Partículas & simulação (5)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 30 | `confetti` | Confetti Burst | Explosão de confete com gravidade (fórmula fechada, sem bake) | — | P α |
| 31 | `fireworks` | Fireworks | Fogos com rastro, brilho e queda | K | M |
| 32 | `plexus` | Plexus | Pontos à deriva ligados por linhas conforme a distância | N | P ∞ |
| 33 | `boids` | Flocking | Revoada simulada e pré-calculada | B | G |
| 34 | `ink` | Ink & Smoke | Tinta ou fumaça em simulação de fluido | GL B | G |

### Transições & overlays (7) — todas com saída α

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 35 | `stripe-wipe` | Stripe Wipe | Faixas diagonais cobrem a tela e descobrem a próxima | K | P α |
| 36 | `iris` | Iris Zoom | Uma forma cresce até virar a tela inteira | K | P α |
| 37 | `pixel-dissolve` | Pixel Dissolve | Mosaico de blocos aparecendo em ordem aleatória ou em onda | K | P α |
| 38 | `liquid-wipe` | Liquid Wipe | Wipe com borda líquida ondulante | N | M α |
| 39 | `tile-flip` | Tile Flip | Grade de cards virando em cascata | 3D K | M α |
| 40 | `film-overlay` | Film / VHS | Grão, arranhões, poeira, flicker e vinheta; variante VHS com scanlines | — | P α ∞ |
| 41 | `light-leaks` | Light Leaks | Vazamentos de luz quentes para sobrepor a vídeo | N | P α ∞ |

### UI, dados & broadcast (9)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 42 | `bar-chart` | Bar Chart | Barras crescendo com valores contando e rótulos | DATA K | M |
| 43 | `progress-ring` | Progress Ring | Anel ou donut com a % contando | K | P α |
| 44 | `line-chart` | Line Chart | Linha sendo desenhada, com um ponto e o valor acompanhando | DATA K | M |
| 45 | `map-pin` | Map Pin | O pin cai, solta ondas e mostra o nome do local | K | P α |
| 46 | `subscribe` | Subscribe CTA | Botão "Inscreva-se" com cursor clicando, sino e like | K | M α |
| 47 | `chat` | Chat Bubbles | Conversa estilo WhatsApp/iMessage com "digitando…" | DATA K | M |
| 48 | `countdown` | Countdown | 3-2-1 com anel e flash | K | P |
| 49 | `logo-reveal` | Logo Reveal | Logo enviado (PNG/SVG) revelado por máscara e partículas | IMG T | M |
| 50 | `audio-viz` | Audio Visualizer | Barras ou círculo reagindo a um áudio enviado | AUD | G |

## 4. Ordem de produção

**Fase 0 — infra base:** K, CAT, EXP. É o que destrava produzir em volume e entregar as transições com alpha.

**Onda 1 — 18 motions só com Canvas 2D + K.** Rápidos, cobrem todas as categorias:
1 typewriter · 2 text-scramble · 3 rotating-words · 4 odometer · 5 split-reveal · 6 marquee · 16 starfield · 19 bokeh · 24 spirograph · 26 polygon-tunnel · 30 confetti · 35 stripe-wipe · 36 iris · 37 pixel-dissolve · 40 film-overlay · 43 progress-ring · 45 map-pin · 48 countdown

**Onda 2 — 23 motions, com N, 3D, T e DATA:**
7 · 8 · 9 · 10 · 11 · 14 · 17 · 21 · 22 · 23 · 25 · 27 · 28 · 29 · 31 · 32 · 38 · 39 · 41 · 42 · 44 · 46 · 47

**Onda 3 — 9 motions pesados, com GL, B, IMG e AUD:**
12 · 13 · 15 · 18 · 20 · 33 · 34 · 49 · 50

Cada onda termina com uma revisão visual de todos os motions dela em 16:9 e 9:16 (screenshot headless), antes de seguir.

## 5. Decisões em aberto

1. **Dependência para MP4 exato:** usar `mediabunny` (muxer) ou continuar com MediaRecorder em tempo real? A sequência PNG com alpha sai sem dependência de qualquer jeito.
2. **Brand kit global:** uma paleta e uma fonte escolhidas uma vez e aplicadas a todos os motions (útil para entregar um pacote coerente para um cliente) ou cada motion com as próprias cores?
3. **Prioridade:** seguir as ondas como estão ou puxar uma categoria antes (ex.: transições e broadcast, se o uso principal for edição de vídeo)?
