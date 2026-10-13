# Estudo: os motions "complexos" da galeria revid.ai

Fonte: https://www.revid.ai/claude-motion-graphics. São os 64 vídeos de motion mais curtidos no X na semana de lançamento do Opus 5.5.
Estudados em 2026-10-12: **43 vídeos** feitos com Claude (Opus/Claude Code). Ficaram de fora os gerados por IA de vídeo
(Seedance, Pexo, Tesseract), o feito em Blender e o tutorial de 23 min. De cada vídeo foram extraídos quadros: uma folha de 20–30
frames e folhas densas nas transições.

## 1. Conclusão principal

**Esses vídeos não são efeitos isolados. São composições.** Um vídeo típico tem de 7 a 12 cenas de 1,5–3 s, cortadas no ritmo,
e cada cena combina vários "ingredientes": tipografia cinética, um mock de UI, um cursor, um contador e um fundo. Tudo fica
amarrado por transições autorais e por uma câmera.

O motion·pedia hoje produz **ingredientes**. Uns 25 dos 50 do roadmap aparecem nesses vídeos como peças: odômetro,
typewriter, marquee, truchet, Bauhaus, metaballs, synthwave, confete, íris, gráficos e logo reveal. Isso valida o catálogo.
O que falta é **a camada de cima: compor ingredientes em cenas e cenas em filmes**.

Exemplo, o *tessel* (link de referência, 33 s):

| Tempo | O que acontece | Técnica |
|---|---|---|
| 0–2 s | Linha vermelha com ponto no centro; cards de agenda flutuam em camadas com desfoque por profundidade; "Your week / doesn't fit." entra com motion blur | parallax + DOF + motion blur |
| 2,1 s | A composição inteira inclina em 3D, borra e colapsa **no ponto vermelho** | match-cut pelo ponto da marca |
| 5–8 s | Logo "tessel" nasce no escuro, ícone sozinho | logo lockup |
| 9–12 s | Campo de prompt digitando sobre a UI desfocada; a câmera segue o cursor até o botão de enviar | typing + câmera que segue + DOF |
| 13 s | O botão vermelho cresce até virar tela cheia; uma faixa vermelha diagonal varre e **vira a linha do "agora"** do calendário inclinado | elemento de UI → transição → elemento de UI |
| 14–23 s | App de calendário em perspectiva; frases "Meetings move over. / Mornings stay yours. / Overruns fit too." com close nos blocos | câmera 2.5D sobre UI + kinetic type |
| 24–28 s | Zoom-out de uma janela para uma **grade infinita de cópias** inclinadas, que desfoca e vira fundo de "Everything fits." (o ponto final é o ponto vermelho) | pull-back + tile infinito + DOF |
| 30–33 s | Lockup final, depois ícone | end card |

## 2. Como foram feitos (e o que isso significa para nós)

| Tecnologia | Vídeos | Observação |
|---|---|---|
| **HTML/CSS (React, Framer Motion, estilo Remotion/Hyperframes)** | a maioria: launches, UI e explainers | UI, layout de texto, `perspective`, `filter: blur`, `backdrop-filter` saem de graça |
| Canvas 2D embutido | partículas, gráficos, globos, pixel art | o que já fazemos |
| three.js / WebGL | 03, 14, 24, 25, 55 (cromo, vidro, cubos com DOF, cutaway 3D) | uma minoria; o "cromo/vidro" é o único ponto realmente fora do alcance de 2D |
| After Effects via script | 33, provavelmente 58 | |
| Imagens geradas por IA | 02, 07, 55, partes de 08 e 37 | ilustração com qualidade de pintor **não sai de código**; o código só compõe |

**Implicação arquitetural:** desenhar UI (cards, tabelas, chat, calendário, texto com quebra de linha, rich text) em Canvas 2D
dá muito trabalho, e o Canvas 2D não faz perspectiva em imagem (só transformação afim). Os vídeos que viralizaram usam DOM/CSS
justamente por isso. Ver a decisão 1 na seção 6.

## 3. Técnicas recorrentes (ranking por frequência × impacto nos 43 vídeos)

| # | Técnica | Onde | Como fazer aqui |
|---|---|---|---|
| 1 | **Sistema de cenas com cortes no ritmo** (beats de 0,75–3 s, às vezes em BPM fixo 120/128/144) | todos | timeline de cenas com sobreposição; helpers `beat(t)` |
| 2 | **Tipografia cinética**: reveal por máscara, stagger, blur→nítido por palavra, palavra-acento em serif itálica ou cor, troca de palavra no mesmo slot, fonte variável "respirando", troca de família, riscado + substituição, carimbo, extrusão, texto em círculo | todos | layout por glifo/palavra, rich text, fontes variáveis |
| 3 | **Match-cut por objeto**: um ponto ou bola sobrevive ao corte e vira o próximo elemento (pingo do i, fundo, logo, linha do "agora") | 01, 05, 11, 14, 19, 22, 24, 30, 47 | elementos compartilhados entre cenas (handoff de posição, escala e forma) |
| 4 | **Mock de UI em componentes** | ~25 vídeos | kit de componentes (lista na seção 4) |
| 5 | **Typing com caret + cursor falso clicando** (ripple, squash, câmera seguindo) | ~20 | `typed(text, t)`, ator cursor com path e eventos de clique que mudam o estado da UI |
| 6 | **Contadores, odômetro, stats** | ~20 | já no roadmap (#4); formatação com locale |
| 7 | **Câmera 2.5D**: tilt/de-tilt de painel, push-in até atravessar a UI ou o texto, pull-back para grade infinita, túnel de cards | 03, 08, 13, 14, 16, 17, 18, 19, 24, 26, 47, 56, 60, 61 | câmera com perspectiva sobre camadas; em CSS é nativo, em Canvas 2D só aproximado |
| 8 | **Blur: motion blur direcional, DOF por camada, rack focus** | ~20 | motion blur por **supersampling temporal** (média de N sub-frames; trivial porque `render(t)` é puro) |
| 9 | **Reveal/wipe circular a partir de um ponto** (às vezes com franja RGB) | 01, 05, 11, 19, 22, 24, 30, 59 | já no roadmap (#36 íris), + franja cromática |
| 10 | **Morph de contêiner único** ("one shape, one story": pílula → input → card → check → globo…) | 43, 58, 31, 49, 08 | interpolação de caixas (x, y, w, h, raio, cor) + troca de conteúdo com blur |
| 11 | **Partículas determinísticas**: galáxia espiral, esfera, partícula → texto, faíscas, shockwave, cometa até o alvo | ~15 | já no roadmap (#10, #30, #31) + galáxia e filotaxia |
| 12 | **HUD persistente**: cantoneiras, timecode, BPM, "SCENE 03/07", régua, contador que atravessa o vídeo | 01, 02, 03, 05, 11, 14, 17, 22, 24, 30, 47 | camada de overlay fora das cenas, com acesso a t, cena e progresso |
| 13 | **Legenda karaokê sincronizada** à narração ou letra | 02, 07, 23, 25, 52 | já no roadmap (#7); entrada = palavras com timestamps |
| 14 | **Stroke reveal**: riscos, setas, conectores, wireframe, traço desenhado à mão, linha de gráfico com "cabeça" luminosa | ~12 | dash por comprimento de path; variante "rough" (hachura) |
| 15 | **Glitch, RGB split, pixel art, ASCII** | 17, 33, 39, 47, 62 | já no roadmap (#8, #37) + filtro ASCII |
| 16 | **Grade 3D de tiles/barras com onda** (vista de cima → inclinada) | 03, 14, 24, 18 | projeção + painter's sort; já no roadmap (#23) |

## 4. Kit de componentes de UI que os vídeos usam

Por frequência: **prompt/input com caret** · **botão pílula com estados** · **cursor + ripple** · post card social (avatar,
handle, ações, contadores) · **calendário semanal com slots** · phone frame (status bar 9:41) · janela de browser/desktop ·
chat de agente (bolhas, tool call com JSON, spinner → check) · chips/tags · toggle, segmented control, slider, swatches ·
stat card · charts (linha com área, barras, gauge/donut) · progress stepper e barras de score · notificação/toast · lista
mobile/leaderboard que reordena · kanban/tabela com tags · bloco de código com syntax color · diálogo de permissão · logo wall.

## 5. Templates de vídeo (o "produto" que as pessoas fazem)

| Template | Duração | Estrutura | Exemplos |
|---|---|---|---|
| **Launch film** | 15–50 s | gancho/dor (2–4 s) → corte de impacto + logo (2 s) → 3–5 features, uma por cena: headline + UI em ação (3–5 s cada) → montagem rápida → prova social (contadores, logo wall) → logo + CTA | 06, 13, 15, 16, 18, 19, 21, 26, 27, 56, 60 |
| **Showreel 15 s** | 15 s | 7–11 cenas de ~1,5 s em BPM fixo, ponto condutor via match-cut, HUD, lockup final | 01, 05, 11, 14, 22, 24, 30 |
| **Explainer / lyric** | 30 s–3 min | roteiro com timestamps → 1 beat visual por frase (template por beat: número grande, lista acumulativa, diagrama, UI demo, ilustração), legenda karaokê, HUD com progresso | 02, 07, 23, 25, 32, 52 |
| **UI micro-animation** | 10–20 s | um contêiner que morfa por 8–12 estados com cursor | 43, 58 |
| **Keynote / produto hero** | 15–20 s | frases curtas com blur→nítido, foto hero com push-in, medidas e specs | 37, 08 |

**O roteiro é separado do tema.** Os vídeos 02 e 25 usam a mesma música e a mesma letra, com estilos opostos (riso/mangá vs.
HUD escuro). A mesma estrutura de dados `{cenas, textos, tempos}` com outro tema (paleta, fontes, textura, estilo de
legenda) gera outro filme.

## 6. O que muda no plano

### Decisão 1 — tecnologia de render das composições

| Opção | A favor | Contra |
|---|---|---|
| **A. Só Canvas 2D** (estender o atual) | um único modelo, export no navegador | UI e rich text dão muito trabalho; sem perspectiva real em imagem; blur caro |
| **B. Híbrido DOM + Canvas** (recomendado) | cada cena é DOM (UI, texto, CSS 3D, blur nativos) e os motions atuais viram **camadas canvas** dentro dela; é como os vídeos virais foram feitos | o export precisa de um **renderizador local** (Chrome headless: seek(t) → screenshot → ffmpeg) |

A opção B ainda resolve três limites do estudo anterior: **alpha** (ffmpeg gera ProRes 4444 ou WebM com alpha a partir dos PNGs),
**export frame a frame** e **motion blur** (sub-frames combinados no ffmpeg). Chrome headless e ffmpeg já estão instalados
nesta máquina. Regra que continua valendo: nada de animação CSS/transition por relógio; todo estilo é calculado a partir de `t`.

**Decidido em 2026-10-12: opção B.** Primeira entrega: `src/compositions/pauta-launch.js` (launch film de 26 s).

### Novas camadas de infraestrutura

| Código | O que | Destrava | Status |
|---|---|---|---|
| **SCN** | Composição: cenas com início/duração/sobreposição, camadas, transições `(A, B, p)` | tudo desta seção | 🟡 cenas por janelas de tempo na própria composição; falta uma API de cenas/transições reutilizável |
| **CAM** | Câmera 2.5D (pan, zoom, tilt, follow) sobre as camadas | push-in, pull-back, UI inclinada | ✅ `camera()` em `src/comp/core.js` |
| **SHR** | Elementos compartilhados entre cenas (match-cut, morph de contêiner) | ponto condutor, "one shape" | 🟡 feito à mão no Pauta (ponto da marca, app principal reaproveitado no pull-back) |
| **UI** | Kit de componentes da seção 4, parametrizado por estado | launch films | 🟡 cursor, ripple, prompt bar, task card, week board |
| **CUR** | Ator cursor (path, clique, ripple) que dispara estados da UI | demos de UI | ✅ |
| **FX** | Motion blur por sub-frames, DOF por camada, RGB split, grão | acabamento "caro" | 🟡 motion blur por sub-frames no render; DOF por blur no palco; falta RGB split e grão |
| **BEAT** | Grade de BPM, `beat(t)`, marcadores | showreels no ritmo | ⬜ |
| **REN** | Renderizador local (Chrome headless + ffmpeg): MP4, ProRes/WebM alpha, PNGs | export profissional | ✅ `scripts/render.mjs` + botão no front |
| **TPL** | Templates de vídeo (seção 5) alimentados por um JSON de roteiro | "um prompt → um filme" | ⬜ o Pauta é parametrizável por texto e cores, mas ainda não é um template genérico |

### Catálogo extra (além dos 50): blocos de composição

**Transições-assinatura (10):** ponto → círculo com franja RGB · elemento de UI cresce até virar tela · zoom-through em
letra · implosão com speed lines + shockwave · mosaic flood (tiles em onda diagonal) · troca de palavra por fatias · whip-zoom
com blur radial · colapso para linha → flash · faixa diagonal que vira elemento da próxima cena · flash de cor chapada no beat.

**Câmera (5):** UI inclinada que endireita (de-tilt) · câmera segue cursor até o botão · pull-back para grade infinita de
cópias · túnel de cards em z · rack focus entre camadas.

**Tipografia avançada (8):** fonte variável respirando (wdth/wght) · blur→nítido palavra a palavra · riscado + substituição ·
carimbo (stamp) com rotação · extrusão de texto · texto em círculo/trilho · light streak anamórfico · eco/cópias fantasmas.

**Overlays (3):** HUD de câmera (cantoneiras, timecode, BPM, cena X/Y) · régua de timeline com marcadores · stepper de
capítulos.

**Procedural (7):** galáxia espiral · filotaxia/girassol · raio procedural · globo de pontos com pins · low-poly montando
por facetas · filtro ASCII · sunburst rotativo.

**Templates (5):** os da seção 5.

## 7. Fora de alcance ou dependente de assets

- **Cromo, vidro e refração** (03, 24, 30): exigem WebGL com materiais PBR. Aproximar com gradiente + highlight, ou usar sprite pré-renderizado.
- **3D sólido real** (cutaway da casa no 55): three.js à parte ou pré-render.
- **Ilustração com qualidade de pintor** (02, 07): vem de imagens geradas. O engine só precisa de camada de imagem com Ken Burns, máscara e grão.
- **Vídeo real** (08): camada de vídeo com seek determinístico, viável no renderizador local.
