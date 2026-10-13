# Roadmap 2 — mais 50 motions

**Status (2026-10-12): os 50 estão implementados.** São 105 motions na galeria. Foram revisados em 16:9 e 9:16 sem erros de página, e o build passa.
Infra entregue: VAR, PIX (`lib/image.js` + fotos em `public/samples/`), SRC (`lib/source.js`), PHY (`lib/physics.js`, com 3D opcional), textura no `shader()` e a categoria `imagem`. A FB não foi necessária, porque o reaction-diffusion roda na CPU com bake.

Proposta original de 2026-10-12. Todos foram pensados para não repetir os 55 que já estão na galeria
(ver [ROADMAP.md](ROADMAP.md)). Também se encaixam no contrato atual: `render` puro de `t`, Canvas 2D, shader compartilhado
ou bake.

Esforço: **P** ≈ menos de 1h · **M** ≈ meio dia · **G** ≈ 1 dia ou mais. **α** = sai com fundo transparente. **∞** = loop sem emenda.

## 1. Infraestrutura nova

| Código | O que | Tamanho | Usado por |
|---|---|---|---|
| **VAR** | Carregar o Inter com o eixo de peso inteiro (100–900). Hoje só vão 400–900 | P | variable-wave, stretch-stack |
| **SRC** | "Motion dentro de motion": renderizar outro motion num canvas offscreen e usar como textura, máscara ou fonte. Param `source` (select com os ids) | M | knockout-title, slit-scan, ascii-art, glitch-transition |
| **PHY** | Helper de física Verlet (pontos, restrições, colisão com chão e caixas) para rodar dentro do `bake` | M | cloth, falling-letters |
| **PIX** | Leitura de pixels de imagem no `setup` (`getImageData` numa grade) e uma **foto de exemplo** em `public/samples/` | P | halftone, duotone, pixel-sort, ascii-art |
| **FB** | Shader com feedback (ping-pong entre duas texturas) no contexto WebGL compartilhado, avançado em passo fixo e "assado" como o `bake` | G | reaction-diffusion (e depois fluido) |
| **NOW** | Categoria nova `imagem` em `CATEGORIES` | P | 6 motions de foto |

## 2. Catálogo

### Tipografia (9)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 1 | `variable-wave` | Variable Wave | Onda de peso (fino → black) percorrendo as letras de uma palavra; a largura do bloco "respira" | VAR | P ∞ |
| 2 | `text-on-path` | Text on Path | Texto correndo sobre um círculo ou uma curva (selo giratório "• NOVO • NOVO •", faixa em S) | — | P ∞ α |
| 3 | `stretch-stack` | Stretch Stack | Palavras empilhadas que esticam na vertical até preencher a tela, no estilo pôster suíço, e trocam de altura entre si | VAR | M |
| 4 | `knockout-title` | Knockout Title | Título gigante vazado, preenchido por outro motion (domain-warp, aurora…) que corre dentro das letras | SRC | M |
| 5 | `falling-letters` | Falling Letters | As letras soltam, caem com física, quicam e empilham, e depois voltam ao lugar (rebobinado) | PHY | M |
| 6 | `hand-annotations` | Hand Annotations | Marca-texto passando, sublinhado e círculo "à mão" e seta desenhada sobre uma frase | — | M α |
| 7 | `quote-card` | Quote Card | Aspas serif enormes se desenham, a citação entra palavra a palavra em itálico e o autor sobe | — | P |
| 8 | `matrix-rain` | Code Rain | Colunas de caracteres caindo com a cabeça clara e o rastro esmaecendo; opção de formar uma palavra no meio | — | P ∞ |
| 9 | `zoom-through` | Zoom Through | Zoom infinito para dentro da letra "O" (ou de outra letra escolhida) que revela a palavra seguinte, em cadeia | — | M ∞ |

### Fundos & loops (8)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 10 | `voronoi` | Voronoi Cells | Células orgânicas respirando, com bordas finas e brilho no centro (shader) | GL | P ∞ |
| 11 | `caustics` | Caustics | Luz de fundo de piscina, as cáusticas da água em movimento (shader) | GL | M ∞ |
| 12 | `clouds` | Clouds | Céu com nuvens volumétricas em fbm passando, nos modos dia, pôr do sol e noite (shader) | GL | M ∞ |
| 13 | `liquid-chrome` | Liquid Chrome | Superfície de metal líquido iridescente com reflexo de ambiente falso (shader) | GL | M ∞ |
| 14 | `reaction-diffusion` | Reaction Diffusion | Padrões de coral e pele de animal crescendo (Gray-Scott) | FB | G |
| 15 | `moire` | Moiré | Dois padrões de linhas ou anéis sobrepostos girando devagar, gerando ondas de interferência | — | P ∞ |
| 16 | `dither` | Dither | Gradiente ou ruído animado em 1-bit com dithering Bayer, no estilo Obra Dinn/Playdate | GL | P ∞ |
| 17 | `hex-pulse` | Hex Pulse | Grade hexagonal escura com pulsos de luz que percorrem caminhos aleatórios | — | M ∞ |

### Formas & 3D (8)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 18 | `blob` | Blob | Blob orgânico de contorno em ruído, com gradiente e highlight; serve de "mancha" de fundo | — | P ∞ α |
| 19 | `iso-city` | Iso City | Cidade isométrica: os prédios brotam do chão em stagger e as janelas acendem | 3D | M |
| 20 | `pendulum-wave` | Pendulum Wave | Pêndulos de comprimentos diferentes saem e voltam de fase, formando serpentes e ondas | — | P ∞ |
| 21 | `fractal-tree` | Fractal Tree | Árvore recursiva crescendo galho a galho e balançando ao vento | — | M |
| 22 | `rubik` | Rubik | Cubo 3×3 girando as camadas, com sombras simples | 3D | M ∞ |
| 23 | `ribbon` | Ribbon | Fita 3D torcida em nó (torus knot) com as duas faces em cores diferentes | 3D | M ∞ |
| 24 | `squash-bounce` | Squash & Bounce | Formas quicando com squash & stretch, antecipação e follow-through (os princípios clássicos) | — | P ∞ α |
| 25 | `globe` | Dot Globe | Globo pontilhado girando, com arcos de conexão entre cidades e pulsos nos pontos | 3D | M ∞ |

### Partículas & simulação (6)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 26 | `cloth` | Cloth | Bandeira ou tecido ao vento, com textura de logo ou texto aplicada | PHY B | G |
| 27 | `weather` | Weather | Chuva com respingos no chão, ou neve com vento e profundidade (select) | — | M ∞ α |
| 28 | `smoke` | Smoke | Fumaça subindo com sprites suaves arrastados por ruído | — | M ∞ α |
| 29 | `fire` | Fire | Fogo procedural no estilo "Doom fire" ou chama em shader, com brasas soltas | GL | M ∞ α |
| 30 | `lightning` | Lightning | Raios ramificados (deslocamento de ponto médio) com flash na tela | — | P α |
| 31 | `petals` | Petals | Pétalas ou folhas caindo, girando em 3D e balançando | 3D | P ∞ α |

### Transições (6) — todas com saída α e a convenção A/B

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 32 | `zoom-punch` | Zoom Punch | Linhas de velocidade radiais + flash branco que fecha e abre a tela | — | P α |
| 33 | `logo-wipe` | Logo Wipe | O logo (upload) cresce até cobrir a tela e abre a cena seguinte por dentro | IMG | M α |
| 34 | `paper-tear` | Paper Tear | A tela rasga em papel, com borda irregular, fibra branca e sombra | — | M α |
| 35 | `page-curl` | Page Curl | Canto da página dobrando e virando, com sombra e verso | — | M α |
| 36 | `glitch-transition` | Glitch Cut | Blocos deslocados, separação RGB e "datamosh" no corte | SRC | M α |
| 37 | `brush-stroke` | Brush Stroke | Pinceladas de tinta (cerdas e respingos) cobrindo a tela em diagonal | — | M α |

### UI, dados & social (7)

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 38 | `donut-chart` | Donut Chart | Rosca desenhando fatia a fatia, com rótulos e a fatia de destaque saltando | DATA | P |
| 39 | `bar-race` | Bar Chart Race | Ranking ao longo do tempo: barras trocam de posição, valores e ano contando | DATA | M |
| 40 | `timeline` | Timeline | Linha do tempo que se desenha com marcos, datas e cards surgindo | DATA | M |
| 41 | `kpi-cards` | KPI Cards | Cards de métrica com número contando, seta de variação e sparkline | DATA | M α |
| 42 | `notifications` | Notifications | Notificações no estilo iOS caindo e empilhando ("Você vendeu R$…") | DATA | M α |
| 43 | `contrib-grid` | Contribution Grid | Grade de calendário estilo GitHub enchendo em ondas de intensidade | — | P |
| 44 | `social-post` | Social Post | Card de post (avatar, texto, imagem) com curtidas e reposts contando e o coração pulsando | IMG | M α |

### Imagem & foto (6) — categoria nova

| # | id | Motion | O que é | Infra | Esforço |
|---|---|---|---|---|---|
| 45 | `halftone` | Halftone | Foto em retícula de pontos que pulsam e crescem a partir do centro | PIX | P |
| 46 | `duotone` | Duotone | Foto em duas cores (estilo Spotify) com as cores trocando em ciclo e grão | PIX GL | P ∞ |
| 47 | `ken-burns` | Ken Burns | Foto com zoom e pan lento, vinheta, grão e título por cima: o fundo de vídeo mais usado | IMG | P |
| 48 | `pixel-sort` | Pixel Sort | Pixels da foto ordenados por brilho em faixas que escorrem, num glitch artístico | PIX | M |
| 49 | `ascii-art` | ASCII Art | Foto ou outro motion renderizado em caracteres mono, com a densidade pelo brilho | PIX SRC | M |
| 50 | `slit-scan` | Slit Scan | Cada coluna mostra outro instante de um motion fonte, o que deforma o tempo no espaço | SRC | M |

## 3. Ordem sugerida

**Fase 0 — infra P:** VAR, PIX (com uma foto de exemplo), categoria `imagem`.

**Onda 1 — 20 rápidos, só Canvas 2D ou shader simples:**
1 · 2 · 7 · 8 · 10 · 15 · 16 · 18 · 20 · 24 · 30 · 31 · 32 · 38 · 43 · 45 · 46 · 47 · 27 · 6

**Onda 2 — 23 médios:**
3 · 9 · 11 · 12 · 13 · 17 · 19 · 21 · 22 · 23 · 25 · 28 · 29 · 33 · 34 · 35 · 37 · 39 · 40 · 41 · 42 · 44 · 48

**Onda 3 — com SRC, PHY e FB:**
4 · 5 · 14 · 26 · 36 · 49 · 50

## 4. Decisões em aberto

1. **Foto de exemplo:** a categoria `imagem` precisa de uma foto padrão. Pode ser uma foto livre (Unsplash/Pexels, baixada uma vez para `public/samples/`) ou uma imagem gerada proceduralmente.
2. **SRC (motion dentro de motion):** é a peça de infra que mais rende (máscara, textura, ASCII, slit-scan), mas cada camada fonte dobra o custo de render.
