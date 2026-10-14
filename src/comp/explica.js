// Kit "explica": peças de DOM para vídeos explicativos verticais (9:16) em que o motion conta a história sozinho, sem
// legenda: texto cinético na hora da fala, gráficos que crescem, carimbos, marcas desenhadas, cartas que se reorganizam
// e uma câmera com tremor/clarão por impactos. Tudo é função pura do tempo (`update(t)`), como o resto das composições.
//
//   const cam = camera(root, { impactos: [[2.4, 18, 0.3, '#fbbf24']] });   // [tempo, força, clarão, cor]
//   const fala = palavras(cam.palco, [{ txt: 'treino', t: 1.5 }, { txt: 'engana', t: 3.0, cor: '#f0645a' }], { y: 600 });
//   update(t) { cam.update(t); fala.update(t); }
//
// Exemplo completo: src/compositions/explica-demo.js.
import { el, ease, seg, lerp, clamp, set, rng } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
export const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
const env = (t, a, k) => (t < a ? 0 : Math.exp(-(t - a) * k));

// Câmera: tudo dentro de `palco` treme, dá um leve soco de escala e ganha clarão nos impactos; `push` é um zoom lento
// ao longo do vídeo (dá vida a cenas paradas). `fundo` (opcional) é um nó que fica atrás e anda mais devagar (paralaxe).
export function camera(root, { w = 1080, h = 1920, impactos = [], push = 0.04, dur = 10, cor = '#0b0d14' } = {}) {
  set(root, { background: cor, overflow: 'hidden' });
  const fundo = el('div', { style: { position: 'absolute', inset: '-40px', transformOrigin: '50% 45%' } });
  const cena = el('div', { style: { position: 'absolute', inset: '-60px', transformOrigin: '50% 45%' } });
  const palco = el('div', { style: { position: 'absolute', left: '60px', top: '60px', width: `${w}px`, height: `${h}px` } });
  cena.append(palco);
  const flash = el('div', { style: { position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', mixBlendMode: 'screen' } });
  root.append(fundo, cena, flash);
  return {
    palco, fundo,
    update(t) {
      let x = 0, y = 0, r = 0, s = 1, o = 0, c = '#fff';
      impactos.forEach(([a, f, cl = 0, k = '#fff'], i) => {
        const e = env(t, a, 11) * f, u = (t - a) * 60;
        x += Math.sin(u * 1.7 + i) * e; y += Math.cos(u * 2.3 + i * 2) * e * 0.8; r += Math.sin(u * 1.3 + i * 3) * e * 0.03;
        s += env(t, a, 16) * f * 0.0022;
        const fl = env(t, a, 14) * cl; if (fl > o) { o = fl; c = k; }
      });
      const p = ease.inOutSine(clamp(t / dur));
      set(fundo, { transform: `scale(${1 + push * 0.6 * p}) translate(${x * 0.3}px, ${y * 0.3 - 18 * p}px)` });
      set(cena, { transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s * (1 + push * p)})` });
      set(flash, { opacity: o, background: c });
    },
  };
}

// Imagem de fundo em "cover" dentro de `camera().fundo`, com um véu opcional (cor + opacidade) para o texto ler bem.
export function fundoImg(alvo, src, { veu = null } = {}) {
  const img = el('img', { src, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } });
  alvo.append(img);
  if (veu) alvo.append(el('div', { style: { position: 'absolute', inset: 0, background: veu } }));
  return img;
}

// Texto em px absolutos (nó simples, sem animação).
export function texto(root, html, { x = 120, y, size = 48, font = "'Inter', sans-serif", weight = 800, color = '#fff', w, lh = 1.05, track = 0, align = 'left', upper = false } = {}) {
  const n = el('div', { style: { position: 'absolute', left: `${x}px`, top: `${y}px`, font: `${weight} ${size}px/${lh} ${font}`, color, letterSpacing: `${track}em`,
    textAlign: align, width: w ? `${w}px` : 'auto', whiteSpace: w ? 'normal' : 'nowrap', textTransform: upper ? 'uppercase' : 'none', willChange: 'transform, opacity' } });
  n.innerHTML = html; root.append(n); return n;
}

// Entrada com mola (sobe, desfoca → nítido) entre a e a+d. Devolve o progresso com overshoot.
export function entra(node, t, a, { d = 0.5, dy = 40, s0 = 0.9, blur = 10, base = '' } = {}) {
  const k = ease.outBack(seg(t, a, a + d)), o = ease.outCubic(seg(t, a, a + d * 0.7));
  set(node, { opacity: o, transform: `${base} translateY(${(1 - k) * dy}px) scale(${lerp(s0, 1, k)})`, filter: o < 0.99 && o > 0 ? `blur(${(1 - o) * blur}px)` : 'none' });
  return k;
}

// Saída (sobe um pouco, desfoca e some) entre a e a+d.
export function sai(node, t, a, { d = 0.35, dy = -30 } = {}) {
  const k = ease.inCubic(seg(t, a, a + d));
  if (k > 0) set(node, { opacity: 1 - k, transform: `translateY(${k * dy}px)`, filter: `blur(${k * 12}px)` });
  return k;
}

// Texto cinético: palavras que entram uma a uma no tempo da fala, quebrando linha dentro de `w`. Cada item:
// { txt, t, cor?, peso?, tam?, marca? (cor do marca-texto que passa por trás), quebra? (força nova linha antes) }.
export function palavras(root, itens, { x = 120, y, w = 840, size = 72, font = "'Inter', sans-serif", weight = 800, color = '#fff', lh = 1.12, gap = 0.26, sai: saiEm = null } = {}) {
  const box = el('div', { style: { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, font: `${weight} ${size}px/${lh} ${font}`, color, display: 'flex', flexWrap: 'wrap', columnGap: `${gap}em`, rowGap: '0.08em', alignItems: 'baseline' } });
  const nos = itens.map((it) => {
    if (it.quebra) box.append(el('div', { style: { flexBasis: '100%', height: 0 } }));
    const n = el('span', { style: { position: 'relative', display: 'inline-block', color: it.cor || color, fontWeight: it.peso || weight, fontSize: it.tam ? `${it.tam}px` : 'inherit', opacity: 0, willChange: 'transform, opacity' } });
    if (it.marca) {
      const m = el('span', { style: { position: 'absolute', left: '-0.12em', right: '-0.12em', bottom: '0.06em', height: '0.42em', background: it.marca, borderRadius: '0.12em', transformOrigin: '0 50%', transform: 'scaleX(0)', zIndex: -1 } });
      n.append(m); n._m = m;
    }
    n.append(document.createTextNode(it.txt)); box.append(n); return n;
  });
  root.append(box);
  return {
    box,
    update(t) {
      nos.forEach((n, i) => {
        entra(n, t, itens[i].t - 0.08, { d: 0.42, dy: 34, s0: 0.82, blur: 8 });
        if (n._m) set(n._m, { transform: `scaleX(${ease.outCubic(seg(t, itens[i].t + 0.25, itens[i].t + 0.6))})` });
      });
      if (saiEm != null) sai(box, t, saiEm);
    },
  };
}

// Barras verticais que crescem com o número contando. itens: [{ rotulo, valor, cor, t }] (t = quando cresce).
export function barras(root, itens, { x = 160, base = 1500, alt = 760, larg = 260, vao = 120, max = 100, sufixo = '%', font = "'Inter', sans-serif", tinta = '#fff', d = 0.9 } = {}) {
  const nos = itens.map((it, i) => {
    const left = x + i * (larg + vao);
    const barra = el('div', { style: { position: 'absolute', left: `${left}px`, top: `${base}px`, width: `${larg}px`, height: '0px', borderRadius: '22px 22px 6px 6px', background: it.cor, transform: 'translateY(-100%)', boxShadow: '0 18px 50px rgba(0,0,0,.18)' } });
    const num = el('div', { style: { position: 'absolute', left: `${left}px`, width: `${larg}px`, textAlign: 'center', font: `900 120px/1 ${font}`, color: it.cor, opacity: 0, letterSpacing: '-0.03em' } });
    const rot = el('div', { style: { position: 'absolute', left: `${left - 40}px`, width: `${larg + 80}px`, top: `${base + 26}px`, textAlign: 'center', font: `800 40px/1.1 ${font}`, color: tinta, opacity: 0 } });
    rot.innerHTML = it.rotulo;
    root.append(barra, num, rot);
    return { barra, num, rot };
  });
  return {
    nos,
    update(t) {
      itens.forEach((it, i) => {
        const k = ease.outCubic(seg(t, it.t, it.t + d)), hpx = alt * (it.valor / max) * k;
        set(nos[i].barra, { height: `${hpx}px` });
        set(nos[i].num, { top: `${base - hpx - 140}px`, opacity: clamp(k * 3) });
        nos[i].num.textContent = `${Math.round(it.valor * k)}${sufixo}`;
        set(nos[i].rot, { opacity: ease.outCubic(seg(t, it.t - 0.4, it.t)) });
      });
    },
  };
}

// Carimbo: vem grande e girado, bate (use o mesmo tempo num impacto da câmera). update(t, a).
export function carimbo(root, html, { x, y, cor = '#fbbf24', tinta = '#0b0d14', rz = -5, size = 60, font = "'Inter', sans-serif" } = {}) {
  const n = el('div', { style: { position: 'absolute', left: `${x}px`, top: `${y}px`, padding: '12px 26px 14px', borderRadius: '14px', background: cor, color: tinta,
    font: `900 ${size}px/1 ${font}`, textTransform: 'uppercase', letterSpacing: '-0.01em', whiteSpace: 'nowrap', boxShadow: '0 18px 60px rgba(0,0,0,.25)', opacity: 0 } });
  n.innerHTML = html; root.append(n);
  return { n, update(t, a) { const k = seg(t, a, a + 0.22), s = k < 1 ? lerp(2.4, 1, ease.inCubic(k)) : 1 + 0.06 * Math.exp(-(t - a - 0.22) * 9) * Math.cos((t - a) * 30);
    set(n, { opacity: t < a ? 0 : clamp(k * 3), transform: `rotate(${lerp(rz - 14, rz, ease.outCubic(k))}deg) scale(${s})` }); } };
}

// Marca desenhada (✓ ou ✗) com traço que se desenha. update(t, a).
export function marca(root, tipo, { x, y, size = 90, cor = '#14b8a6', larg = 14 } = {}) {
  const svg = svgEl('svg', { width: size, height: size, viewBox: '0 0 100 100', style: `position:absolute;left:${x}px;top:${y}px;overflow:visible` });
  const ds = tipo === 'x' ? ['M22,22 L78,78', 'M78,22 L22,78'] : ['M18,54 L42,78 L84,24'];
  const ps = ds.map((d) => { const p = svgEl('path', { d, fill: 'none', stroke: cor, 'stroke-width': larg, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 100, 'stroke-dasharray': '100 100', 'stroke-dashoffset': 100 }); svg.append(p); return p; });
  root.append(svg);
  return { svg, update(t, a) { ps.forEach((p, i) => { p.setAttribute('stroke-dashoffset', 100 * (1 - ease.outCubic(seg(t, a + i * 0.12, a + i * 0.12 + 0.25)))); p.style.opacity = t < a + i * 0.12 ? 0 : 1; }); } };
}

// Traço SVG qualquer que se desenha (setas, sublinhados, contornos). d em coordenadas do palco. update(t, a, b).
export function traco(root, d, { cor = '#fff', larg = 10, w = 1080, h = 1920, tracejado = null } = {}) {
  const svg = svgEl('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, style: 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none' });
  const p = svgEl('path', { d, fill: 'none', stroke: cor, 'stroke-width': larg, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 100 });
  svg.append(p); root.append(svg);
  return { svg, p, update(t, a, b) { const k = ease.inOutCubic(seg(t, a, b)); p.setAttribute('stroke-dasharray', tracejado || '100 100'); p.setAttribute('stroke-dashoffset', tracejado ? 0 : 100 * (1 - k)); p.style.opacity = tracejado ? k : (t < a ? 0 : 1); } };
}

// Carta com um símbolo (triângulo, círculo, quadrado, hexágono) — "um tipo de problema". Posição/rotação/escala são
// do chamador (keyframes): devolve o nó e `poe({x, y, r, s, o})`.
const FORMAS = {
  tri: '<polygon points="50,14 88,82 12,82"/>', circ: '<circle cx="50" cy="50" r="36"/>',
  quad: '<rect x="16" y="16" width="68" height="68" rx="8"/>', hex: '<polygon points="50,10 85,30 85,70 50,90 15,70 15,30"/>',
};
export function carta(root, forma, { cor = '#14b8a6', fundo = '#fff', lado = 130 } = {}) {
  const n = el('div', { style: { position: 'absolute', left: 0, top: 0, width: `${lado}px`, height: `${lado * 1.25}px`, marginLeft: `${-lado / 2}px`, marginTop: `${-lado * 0.625}px`,
    borderRadius: `${lado * 0.14}px`, background: fundo, boxShadow: '0 10px 30px rgba(15,42,61,.18), 0 2px 0 rgba(15,42,61,.06)', display: 'grid', placeItems: 'center', opacity: 0, willChange: 'transform' } });
  n.innerHTML = `<svg viewBox="0 0 100 100" width="${lado * 0.62}" height="${lado * 0.62}" fill="${cor}">${FORMAS[forma]}</svg>`;
  root.append(n);
  return { n, poe({ x, y, r = 0, s = 1, o = 1 }) { set(n, { transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`, opacity: o }); } };
}

// Número que conta de `de` até `ate` entre a e b.
export const conta = (t, a, b, ate, de = 0) => Math.round(lerp(de, ate, ease.outCubic(seg(t, a, b))));

// Tabuleiro de casas (lado × lado px) com início em (x, y). `caos` 0 → 1 tira as casas do lugar: elas derivam, giram e
// pulsam (de "regras claras" para "regras que mudam"). update(t, { a, caos, cor, o }): a = quando as casas entram;
// caos/cor/o podem ser número/texto ou função (casa) → valor, por casa. pos(i, j) = centro atual da casa (segue o caos).
export function grade(root, { x, y, cols = 4, rows = 3, lado = 100, vao = 14, cor = '#fff', borda = 'rgba(15,42,61,.10)', seed = 3 } = {}) {
  const r = rng(seed), cel = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const n = el('div', { style: { position: 'absolute', left: 0, top: 0, width: `${lado}px`, height: `${lado}px`, marginLeft: `${-lado / 2}px`, marginTop: `${-lado / 2}px`,
      borderRadius: `${lado * 0.16}px`, background: cor, boxShadow: `0 6px 16px rgba(15,42,61,.12), inset 0 0 0 2px ${borda}`, opacity: 0, willChange: 'transform' } });
    root.append(n);
    cel.push({ n, i, j, ph: [r() * 6.28, r() * 6.28, r() * 6.28], f: 0.7 + r() * 0.9, d: r(), dir: [r() - 0.5, r() - 0.5] });
  }
  let tt = 0, kaos = () => 0;
  const val = (v, c) => (typeof v === 'function' ? v(c) : v);
  const centro = (c) => {
    const k = kaos(c), a = k * lado * 0.6;
    return [x + c.i * (lado + vao) + lado / 2 + Math.sin(tt * c.f * 2.2 + c.ph[0]) * a + c.dir[0] * k * lado * 0.8,
      y + c.j * (lado + vao) + lado / 2 + Math.cos(tt * c.f * 2.6 + c.ph[1]) * a + c.dir[1] * k * lado * 0.8,
      Math.sin(tt * c.f * 1.8 + c.ph[2]) * k * 34 + c.dir[0] * k * 30];
  };
  return {
    cel,
    pos(i, j) { return centro(cel[j * cols + i]).slice(0, 2); },
    update(t, { a = 0, caos = 0, cor: fc, o = 1 } = {}) {
      tt = t; kaos = (c) => val(caos, c);
      cel.forEach((c) => {
        const e = ease.outBack(seg(t, a + c.d * 0.4, a + c.d * 0.4 + 0.45)), [px, py, rz] = centro(c);
        set(c.n, { opacity: clamp(e * 2) * val(o, c), transform: `translate(${px}px, ${py}px) rotate(${rz}deg) scale(${lerp(0.3, 1, e)})`, ...(fc && { background: val(fc, c) }) });
      });
    },
  };
}

// Ficha (um "personagem" redondo) com sombra no chão: poe({ x, y, z, s, o }), z = altura do pulo (a sombra fica no chão).
export function ficha(root, { cor = '#14b8a6', lado = 72 } = {}) {
  const sombra = el('div', { style: { position: 'absolute', left: 0, top: 0, width: `${lado}px`, height: `${lado * 0.3}px`, marginLeft: `${-lado / 2}px`, marginTop: `${lado * 0.36}px`,
    borderRadius: '50%', background: 'rgba(15,42,61,.25)', filter: 'blur(5px)', opacity: 0 } });
  const n = el('div', { style: { position: 'absolute', left: 0, top: 0, width: `${lado}px`, height: `${lado}px`, marginLeft: `${-lado / 2}px`, marginTop: `${-lado / 2}px`, borderRadius: '50%',
    background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,.6), rgba(255,255,255,0) 42%), ${cor}`, boxShadow: '0 6px 14px rgba(15,42,61,.2)', opacity: 0, willChange: 'transform' } });
  root.append(sombra, n);
  return {
    n,
    poe({ x, y, z = 0, s = 1, o = 1 }) {
      const h = Math.min(Math.max(z, 0), 240) / 240;
      set(n, { transform: `translate(${x}px, ${y - z}px) scale(${s})`, opacity: o });
      set(sombra, { transform: `translate(${x}px, ${y}px) scale(${s * (1 - 0.5 * h)})`, opacity: o * (1 - 0.6 * h) });
    },
  };
}

// Pulos de casa em casa: pontos [[x, y], …] (ou funções () → [x, y], para casas que se mexem), tempos [t1, …] (chegada
// em cada ponto a partir do 2º). Devolve { x, y, z } com um arco de altura `alto` em cada pulo de `d` s.
export function salto(t, pontos, tempos, { d = 0.32, alto = 90 } = {}) {
  const p = (k) => (typeof pontos[k] === 'function' ? pontos[k]() : pontos[k]);
  let k = 0;
  while (k < tempos.length && t >= tempos[k]) k++;
  const de = p(k), prox = k < tempos.length ? p(k + 1) : null;
  if (!prox) return { x: de[0], y: de[1], z: 0 };
  const u = seg(t, tempos[k] - d, tempos[k]);
  const e = ease.inOutSine(u);
  return { x: lerp(de[0], prox[0], e), y: lerp(de[1], prox[1], e), z: Math.sin(u * Math.PI) * alto };
}

// Quadro: uma imagem numa moldura de papel (borda clara, sombra, leve giro), que entra se revelando do centro e dá um
// zoom lento por dentro (Ken Burns). Bom para trazer uma ilustração escura para dentro de uma cena clara.
// update(t, a, { sai, d }) — entra em a, sai (encolhe e some) em `sai`. `legenda` = faixa de texto embaixo, dentro da moldura.
export function quadro(root, src, { x, y, w = 480, h = 720, rz = -3, borda = 14, cor = '#fffaf1', raio = 18, legenda = null, font = "'Inter', sans-serif" } = {}) {
  const n = el('div', { style: { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, padding: `${borda}px`, paddingBottom: legenda ? `${borda * 4}px` : `${borda}px`,
    boxSizing: 'border-box', background: cor, borderRadius: `${raio}px`, boxShadow: '0 30px 70px rgba(15,42,61,.30), 0 4px 0 rgba(15,42,61,.06)', opacity: 0, transformOrigin: '50% 50%', willChange: 'transform, opacity' } });
  const jan = el('div', { style: { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: `${Math.max(4, raio - borda / 2)}px` } });
  const img = el('img', { src, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transformOrigin: '50% 45%' } });
  jan.append(img); n.append(jan);
  if (legenda) {
    const l = el('div', { style: { position: 'absolute', left: 0, right: 0, bottom: `${borda * 1.1}px`, textAlign: 'center', font: `800 ${borda * 2}px/1 ${font}`, color: '#0f2a3d' } });
    l.textContent = legenda; n.append(l);
  }
  root.append(n);
  return {
    n,
    update(t, a, { sai: s = Infinity, d = 0.55 } = {}) {
      const k = ease.outCubic(seg(t, a, a + d)), mola = ease.outBack(seg(t, a, a + d * 1.2)), out = Number.isFinite(s) ? ease.inCubic(seg(t, s, s + 0.4)) : 0;
      const abre = 50 * (1 - k);
      set(n, { opacity: t < a ? 0 : clamp(k * 3) * (1 - out), transform: `rotate(${lerp(rz - 8, rz, mola)}deg) scale(${lerp(0.82, 1, mola) * (1 - 0.25 * out)}) translateY(${-out * 60}px)`,
        clipPath: k < 1 ? `inset(${abre}% ${abre * 0.6}% ${abre}% ${abre * 0.6}% round ${raio}px)` : 'none' });
      set(img, { transform: `scale(${1.14 - 0.12 * clamp((t - a) / 8)})` });
    },
  };
}
