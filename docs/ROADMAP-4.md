# Roadmap 4 — mais 48 motions

**Status (2026-10-12): os 48 estão implementados** — 208 motions na galeria, revisados em 16:9 e 9:16 sem erros de página; build OK. `impossible-shapes` fez só o triângulo de Penrose (sem a escada).

Nenhum repete os 160 da galeria (ver [ROADMAP.md](ROADMAP.md), [ROADMAP-2.md](ROADMAP-2.md), [ROADMAP-3.md](ROADMAP-3.md)).
Mesmo contrato: `render` puro de `t`, Canvas 2D, `shader()` compartilhado ou `bake`. Dados auxiliares grandes
(ex.: contorno dos estados) ficam em `src/motions/_<nome>.js`, que a galeria ignora.

**α** = sai com fundo transparente. **∞** = loop sem emenda.

## Tipografia (5)

| id | O que é |
|---|---|
| `liquid-text` | Letras que derretem e escorrem em gotas, e voltam a se formar ∞ |
| `balloon-type` | Letras infladas como balão metalizado (reflexo, costura, leve balanço) α |
| `echo-type` | Palavra repetida em contornos deslocados, em eco, girando ou ondulando ∞ |
| `magnetic-type` | Grade de letras repelidas por um cursor invisível que passeia ∞ |
| `font-morph` | A palavra passa de serifada a grotesca e a mono, por crossfade com máscara por letra |

## Fundos (6)

| id | O que é |
|---|---|
| `rain-on-glass` | Gotas escorrendo na janela, com a cidade desfocada atrás refratada nas gotas ∞ |
| `underwater` | Raios de luz da superfície, cáusticas, bolhas e plâncton ∞ |
| `low-poly-terrain` | Voo sobre terreno low-poly com luz chapada por face e névoa ∞ |
| `holo-foil` | Gradiente holográfico de cartão metalizado, com reflexo passando ∞ |
| `memphis` | Formas anos 80 (zigue-zague, confete, círculos) flutuando em padrão ∞ |
| `skyline` | Silhueta de cidade à noite, janelas acendendo, trânsito e céu ∞ |

## Formas & jogos (8)

| id | O que é |
|---|---|
| `tetris` | Peças caindo, encaixando e completando linhas (jogo roteirizado no setup) |
| `breakout` | Demo de Breakout jogando sozinho, blocos quebrando com partículas |
| `marble-run` | Bolinha descendo trilhos em zigue-zague, com sinos/alavancas ∞ |
| `string-art` | Linhas retas entre pregos formando curvas (envelopes) que se desenham |
| `impossible-shapes` | Triângulo de Penrose / escada de Escher girando no ponto de ilusão |
| `voxel-build` | Objeto (coração, casa, logo) montando cubo a cubo em isométrica |
| `paper-layers` | Camadas de papel recortado com sombra, em parallax (paisagem ou túnel) ∞ |
| `solar-system` | Planetas em órbita com rastros, anéis e escala estilizada ∞ |

## Simulação & partículas (6)

| id | O que é |
|---|---|
| `jelly` | Corpo mole (gelatina) caindo e quicando, com wobble (PHY + bake) |
| `dandelion` | Dente-de-leão soprado, sementes com paraquedas voando ∞ α |
| `snow-globe` | Globo de neve sacudido, flocos assentando sobre uma miniatura |
| `laser-show` | Feixes de laser varrendo na fumaça, com padrões ∞ |
| `welding-sparks` | Faíscas de solda quicando no chão, com luz piscando α |
| `balloons` | Balões subindo, balançando e (opcional) estourando α |

## Transições (5) — α e convenção A/B

| id | O que é |
|---|---|
| `hyperspace` | Estrelas viram riscos no salto para a velocidade da luz e um flash cobre |
| `fold-transition` | A tela dobra em painéis, como sanfona/origami, revelando B |
| `spin-zoom` | Giro com blur radial e zoom que cobre e abre |
| `luma-fade` | Dissolve por textura de luminância (nuvem, tinta, papel) com borda brilhante |
| `comic-panels` | Quadros de HQ entram em sequência até cobrir e saem revelando B |

## UI, dados & broadcast (12)

| id | O que é |
|---|---|
| `mapa-brasil` | Mapa do Brasil por estado: estados acendem em escala de cor, valores e ranking (dados por UF) |
| `pix-checkout` | Fluxo Pix: valor, QR Code, leitura, "Pagamento aprovado" com check e comprovante |
| `radar-chart` | Gráfico de radar com 1–2 séries desenhando-se |
| `sankey` | Diagrama de Sankey com fluxos se dividindo |
| `treemap` | Treemap (squarified) com blocos crescendo e rótulos |
| `gauge` | Velocímetro/medidor com ponteiro em mola e zonas |
| `candlestick` | Gráfico de candles de bolsa com preço ao vivo e volume |
| `mind-map` | Mapa mental crescendo do centro, ramos com curvas |
| `live-overlay` | Overlay de live: alertas de inscrição/doação, chat lateral, contador α |
| `breaking-news` | Pacote de plantão: vinheta, tarja "URGENTE", manchete e ticker α |
| `pricing-table` | Tabela de planos, o recomendado sobe com selo |
| `rating` | Estrelas enchendo, nota contando e cards de review |

## Imagem & foto (6)

| id | O que é |
|---|---|
| `fluted-glass` | Foto atrás de vidro canelado (refração por coluna), o vidro desliza ∞ |
| `photo-mosaic` | A foto formada por miniaturas (recortes da própria foto/segunda foto) que se revelam |
| `magnifier` | Lupa passando sobre a foto, com ampliação e borda de vidro ∞ |
| `paint-strokes` | Foto virando pinceladas impressionistas que se pintam |
| `lenticular` | Cartão lenticular 3D que alterna entre duas fotos ao inclinar ∞ |
| `photo-booth` | Tira de cabine de fotos: flash, 4 poses (recortes) e a tira saindo |

(`torn-collage` ficou de fora: `paper-tear` + `polaroid-stack` já cobrem.)
