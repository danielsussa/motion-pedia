# Roadmap 3 — mais 55 motions

**Status (2026-10-12): os 55 estão implementados** — 160 motions na galeria, revisados em 16:9 e 9:16 sem erros de página; build OK. Origami saiu como avião de papel (não grou). Helper novo: `lib/skeleton.js`.

Proposta de 2026-10-12. Nenhum destes repete os 105 que já estão na galeria (ver [ROADMAP.md](ROADMAP.md) e
[ROADMAP-2.md](ROADMAP-2.md)). Todos seguem o contrato atual: `render` é função pura de `t`, em Canvas 2D, shader
compartilhado ou `bake`. Não entra infra compartilhada nova: o que for específico (fluido, autômato celular, detecção
de borda) fica dentro do próprio motion.

Esforço: **P** ≈ menos de 1h · **M** ≈ meio dia · **G** ≈ 1 dia ou mais. **α** = sai com fundo transparente. **∞** = loop sem emenda.
Infra existente: **GL** `shader()` · **B** `bake` · **PHY** `physics.js` · **PIX** `image.js` · **SRC** `source.js` · **AUD** `audioAt` · **3D** `space.js`.

## Catálogo

### Tipografia (6)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 1 | `neon-sign` | Neon Sign | Letreiro de neon: os tubos acendem com falhas, uma letra fica piscando, o halo cai na parede de tijolo | — | M ∞ |
| 2 | `handwriting` | Handwriting | Frase escrita à mão traço a traço (caneta ou giz), com a ponta seguindo o traço | — | M α |
| 3 | `extrude-3d` | Extrude 3D | Texto extrudado em 3D girando, com a lateral sombreada e um brilho correndo na frente | 3D | M ∞ |
| 4 | `word-cloud` | Word Cloud | Nuvem de palavras que se organiza em espiral; a principal cresce no centro | — | M |
| 5 | `credits-roll` | Credits Roll | Créditos de filme subindo em duas colunas (função · nome), com título e logo no fim | — | P |
| 6 | `lyric-video` | Lyric Video | Palavras da letra entrando no ritmo do áudio (batida = troca de palavra), em layouts variados | AUD | M |

### Fundos & loops (7)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 7 | `parallax-landscape` | Parallax Landscape | Montanhas em camadas com parallax e o dia virando noite (sol, lua, estrelas) | — | M ∞ |
| 8 | `ocean-waves` | Ocean Waves | Ondas estilizadas em camadas, estilo ilustração/ukiyo-e, com espuma | — | M ∞ |
| 9 | `god-rays` | God Rays | Feixes de luz entrando por uma janela, com poeira flutuando | GL | M ∞ |
| 10 | `plasma` | Plasma | Plasma retrô de demoscene com paleta cíclica | GL | P ∞ |
| 11 | `stained-glass` | Stained Glass | Vitral (células com chumbo) com luz atravessando e passando de cor | GL | M ∞ |
| 12 | `galaxy` | Galaxy | Galáxia espiral girando, com braços de poeira e núcleo brilhante | — | M ∞ |
| 13 | `vhs` | VHS | Overlay de VHS: tracking, ruído de cabeça, sangramento de cor e data no canto | — | M ∞ α |

### Formas & mecânica (8)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 14 | `gears` | Gears | Engrenagens encaixadas girando em sincronia (relação de dentes exata) | — | M ∞ |
| 15 | `dominoes` | Dominoes | Fileira de dominós caindo em cadeia por um caminho curvo | 3D | M |
| 16 | `newton-cradle` | Newton's Cradle | Pêndulo de Newton com reflexo e sombra | — | P ∞ |
| 17 | `dna-helix` | DNA Helix | Hélice dupla girando, com pares de bases e profundidade | 3D | P ∞ |
| 18 | `maze` | Maze | Labirinto que se gera (backtracker) e depois é resolvido por uma linha que corre | — | M |
| 19 | `hourglass` | Hourglass | Ampulheta com a areia escorrendo e virando no fim | — | M ∞ |
| 20 | `origami` | Origami | Papel quadrado que se dobra em etapas até virar uma forma (grou, avião) | 3D | G |
| 21 | `analog-clock` | Analog Clock | Relógio analógico, com ponteiros girando rápido para mostrar o tempo passando | — | P ∞ α |

### Partículas & simulação (7)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 22 | `fluid` | Fluid | Tinta em fluido (stable fluids em grade baixa, na CPU) com jatos coloridos | B | G |
| 23 | `falling-sand` | Falling Sand | Areia caindo grão a grão (autômato celular) e formando o logo | B | M |
| 24 | `game-of-life` | Game of Life | Jogo da Vida de Conway com rastro esmaecendo e glow | B | P |
| 25 | `iron-filings` | Iron Filings | Limalha de ferro alinhada ao campo de ímãs que se movem | — | M ∞ |
| 26 | `bubbles` | Bubbles | Bolhas de sabão iridescentes subindo, balançando e estourando | — | M ∞ α |
| 27 | `sparkler` | Sparkler | Estrelinha escrevendo uma palavra no ar, com faíscas e rastro de luz | — | M α |
| 28 | `fireflies` | Fireflies | Vaga-lumes piscando numa mata escura, com bokeh | — | P ∞ α |

### Transições (6) — todas com saída α e a convenção A/B

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 29 | `whip-pan` | Whip Pan | Chicote de câmera: A sai de lado com borrão de movimento e B entra | — | M α |
| 30 | `cube-turn` | Cube Turn | A tela gira como a face de um cubo 3D | 3D | M α |
| 31 | `blinds` | Blinds | Persianas fechando e abrindo, com sombra entre as lâminas | — | P α |
| 32 | `film-burn` | Film Burn | O filme queima no projetor: buraco que cresce com borda incandescente | GL | M α |
| 33 | `shatter` | Shatter | A tela se estilhaça em cacos que caem e revelam B | — | M α |
| 34 | `lens-warp` | Lens Warp | Distorção tipo buraco negro que suga A e cospe B | GL | M α |

### UI, dados & broadcast (14)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 35 | `bubble-chart` | Bubble Chart | Gráfico de bolhas ao estilo Gapminder, com os anos passando | — | M |
| 36 | `funnel` | Funnel | Funil de conversão: etapas se enchendo, com percentuais e queda entre elas | — | P |
| 37 | `waffle` | Waffle | Waffle de pictogramas ("7 em cada 10…"), com os ícones acendendo em stagger | — | P |
| 38 | `versus` | Versus | Comparação A × B com barras opostas e um vencedor por linha | — | P |
| 39 | `poll` | Poll | Resultado de enquete: opções enchendo, a vencedora com check | — | P α |
| 40 | `scoreboard` | Scoreboard | Placar esportivo de broadcast: tempo, gol e número virando | — | M α |
| 41 | `flight-route` | Flight Route | Avião traçando uma rota em arco sobre um mapa pontilhado, com pins nas cidades | — | M |
| 42 | `code-editor` | Code Editor | Código digitado num editor com syntax highlight, cursor e números de linha | — | M |
| 43 | `terminal` | Terminal | Comandos digitados num terminal, com saída, spinner e barra de progresso | — | M |
| 44 | `search-bar` | Search Bar | Busca sendo digitada, com sugestões e resultados caindo | — | M α |
| 45 | `phone-feed` | Phone Feed | Mockup de celular rolando um feed (cards, fotos, curtidas) | PIX | M |
| 46 | `audiogram` | Audiogram | Audiograma de podcast: capa, onda de áudio reagindo ao som e legenda | AUD | M |
| 47 | `skeleton-loading` | Skeleton Loading | Tela de skeleton com shimmer que vira o conteúdo real | — | P |
| 48 | `calendar` | Calendar | Calendário mensal: dias marcados, evento arrastado para um dia e contador | — | M |

### Imagem & foto (8)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 49 | `before-after` | Before / After | Slider de antes e depois sobre a foto (tratada × original), com a alça indo e voltando | PIX | P ∞ |
| 50 | `photo-puzzle` | Photo Puzzle | A foto se monta peça por peça (peças de quebra-cabeça reais) | PIX | M |
| 51 | `polaroid-stack` | Polaroid Stack | Polaroids caindo e empilhando, com a foto revelando no papel | PIX | M |
| 52 | `parallax-photo` | Parallax Photo | Foto com profundidade 2.5D falsa (camadas por luminância/região) e câmera flutuando | PIX GL | M ∞ |
| 53 | `riso-print` | Riso Print | Impressão risográfica em 2–3 cores com registro desalinhado e grão de papel | PIX GL | M ∞ |
| 54 | `line-drawing` | Line Drawing | A foto vira desenho a traço (detecção de borda), que se desenha e depois se colore | PIX GL | M |
| 55 | `color-pop` | Color Pop | Foto em preto e branco com só uma cor mantida; a cor escolhida varre a imagem | PIX GL | P ∞ |

`photo-shatter` foi absorvido por `shatter`, que aceita a foto como cena A.

## Ordem

Tudo em paralelo, por agentes de 4–5 motions agrupados por afinidade. Revisão final em 16:9 e 9:16 com mosaico.
