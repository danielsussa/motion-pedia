// Kit "luz": peças que deixam uma cena explicativa mais VIVA (luz com volume, calor na cor, coisas pequenas se mexendo).
// Tudo em SVG/DOM simples, quase sem filter (blur em render por software custa caro): o brilho sai de degradês com alpha.
// Pensado para composições com fundo transparente postas sobre um fundo à parte (o alpha soma; mix-blend não
// atravessa para o fundo), mas funciona igual sobre fundo próprio.
//
//   calor(root)             camada de cor que esquenta a tela inteira: aquece(k 0..1, brasa 0..1, foco [x,y])
//   feixe(svg)              cone de luz em degradê (forte na fonte, some no fim) + halo largo: poe(x1,y1,x2,y2,w0,w1,o)
//   halo(svg)               brilho grande + anéis que pulsam em volta de uma fonte de luz: poe({x,y,r,k,t})
//   brasas(svg)             fagulhas que sobem de um ponto, piscando: poe({x,y,k,t})
//   ondas(svg)              anéis de calor no chão (elipses em perspectiva) saindo de um ponto: poe({x,y,k,t})
//   vapor(svg)              fios de ar quente subindo, ondulando: poe({x,y,k,t})
//   cintila(svg)            estrelinha de brilho (reflexo num espelho, vidro, metal): poe({x,y,k,t})
//   quente(node, cores)     texto com preenchimento em degradê e brilho em volta (números grandes, "400 °C")
import { clamp, rng } from '../lib/anim.js';
import { svgEl } from './explica.js';

let uid = 0;
const novoId = (p) => `${p}-${++uid}`;
const defsDe = (svg) => svg.querySelector('defs') || svg.insertBefore(svgEl('defs'), svg.firstChild);
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// camada de calor: radial a partir do foco, âmbar → (com `brasa`) coral. Vai ATRÁS do conteúdo (append primeiro).
export function calor(root, { ambar = '#ffa62b', brasa = '#ff5a36', max = 0.55 } = {}) {
  const a = document.createElement('div'), b = document.createElement('div');
  for (const n of [a, b]) { n.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0'; root.append(n); }
  return { a, b, aquece(k, kb = 0, [x, y] = [540, 960]) {
    const g = (c) => `radial-gradient(130% 75% at ${x}px ${y}px, ${rgba(c, 0.85)} 0%, ${rgba(c, 0.45)} 38%, ${rgba(c, 0.12)} 80%, ${rgba(c, 0.05)} 100%)`;
    a.style.background = g(ambar); b.style.background = g(brasa);
    a.style.opacity = clamp(k) * max * (1 - 0.5 * clamp(kb)); b.style.opacity = clamp(kb) * max * 0.8;
  } };
}

// feixe: trapézio da fonte (largura w0) até o fim (w1) com degradê ao longo dele; o halo é o mesmo, 2,4× mais largo e fraco
export function feixe(svg, { cor = '#ffb020', fim = '#ff7a1a', a0 = 0.55, a1 = 0.2, halo = 0.35 } = {}) {
  const defs = defsDe(svg), id = novoId('feixe');
  const gr = svgEl('linearGradient', { id, gradientUnits: 'userSpaceOnUse' });
  gr.innerHTML = `<stop offset="0" stop-color="${cor}" stop-opacity="${a0}"/><stop offset="1" stop-color="${fim}" stop-opacity="${a1}"/>`;
  defs.append(gr);
  const largo = svgEl('polygon', { fill: `url(#${id})` }), nucleo = svgEl('polygon', { fill: `url(#${id})` });
  svg.append(largo, nucleo);
  const pts = (x1, y1, x2, y2, w0, w1) => {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    return `${x1 + nx * w0 / 2},${y1 + ny * w0 / 2} ${x2 + nx * w1 / 2},${y2 + ny * w1 / 2} ${x2 - nx * w1 / 2},${y2 - ny * w1 / 2} ${x1 - nx * w0 / 2},${y1 - ny * w0 / 2}`;
  };
  return { nucleo, largo, poe(x1, y1, x2, y2, w0, w1 = w0, o = 1) {
    for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) gr.setAttribute(k, v);
    nucleo.setAttribute('points', pts(x1, y1, x2, y2, w0, w1));
    largo.setAttribute('points', pts(x1, y1, x2, y2, w0 * 2.4, w1 * 2.4));
    nucleo.style.opacity = clamp(o); largo.style.opacity = clamp(o) * halo;
  } };
}

// halo: brilho radial grande + anéis concêntricos que saem da fonte e somem (loop)
export function halo(svg, { cor = '#ffc045', aneis = 4, periodo = 2.4 } = {}) {
  const defs = defsDe(svg), id = novoId('halo');
  const gr = svgEl('radialGradient', { id });
  gr.innerHTML = `<stop offset="0" stop-color="#fff4cf" stop-opacity=".95"/><stop offset=".3" stop-color="${cor}" stop-opacity=".45"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/>`;
  defs.append(gr);
  const n = svgEl('g'); svg.append(n);
  const disco = svgEl('circle', { fill: `url(#${id})` }); n.append(disco);
  const rs = Array.from({ length: aneis }, () => { const c = svgEl('circle', { fill: 'none', stroke: cor, 'stroke-width': 10 }); n.append(c); return c; });
  return { n, poe({ x, y, r = 100, k = 1, t = 0 }) {
    n.setAttribute('transform', `translate(${x} ${y})`);
    disco.setAttribute('r', r * 3.2 * (0.6 + 0.4 * k)); disco.style.opacity = clamp(k);
    rs.forEach((c, i) => {
      const f = ((t / periodo + i / aneis) % 1);
      c.setAttribute('r', r * (1.25 + f * 1.9)); c.setAttribute('stroke-width', 12 * (1 - f) + 2);
      c.style.opacity = clamp(k) * (1 - f) * 0.5;
    });
  } };
}

// brasas: n fagulhas com vida própria (nascem no ponto, sobem com deriva lateral, piscam e apagam). k = quantas vivas.
export function brasas(svg, { n = 36, cores = ['#ffcf4a', '#ff9a2e', '#ff5a36'], sobe = 380, abre = 90, vida = 1.8, seed = 7 } = {}) {
  const r = rng(seed);
  const ps = Array.from({ length: n }, () => {
    const c = svgEl('circle', { fill: cores[Math.floor(r() * cores.length)] }); svg.append(c);
    return { c, fase: r(), dx: (r() - 0.5) * 2, ond: r() * 6.28, tam: 3 + r() * 6, vel: 0.7 + r() * 0.6 };
  });
  return { poe({ x, y, k = 1, t = 0 }) {
    ps.forEach((p, i) => {
      const vivo = i / n < k;
      const a = ((t / (vida * p.vel) + p.fase) % 1);
      const px = x + p.dx * abre * a + Math.sin(t * 3 + p.ond) * 14 * a, py = y - sobe * a * p.vel;
      p.c.setAttribute('cx', px); p.c.setAttribute('cy', py); p.c.setAttribute('r', p.tam * (1 - a * 0.6));
      p.c.style.opacity = vivo ? (1 - a) * (0.6 + 0.4 * Math.sin(t * 23 + p.ond * 5)) : 0;
    });
  } };
}

// ondas de calor no chão: elipses (ry = rx·achata) que crescem do ponto e somem
export function ondas(svg, { cor = '#ff5a36', n = 4, periodo = 1.6, raio = 260, achata = 0.28 } = {}) {
  const es = Array.from({ length: n }, () => { const e = svgEl('ellipse', { fill: 'none', stroke: cor }); svg.append(e); return e; });
  return { poe({ x, y, k = 1, t = 0 }) {
    es.forEach((e, i) => {
      const f = ((t / periodo + i / n) % 1), rx = raio * (0.15 + f);
      e.setAttribute('cx', x); e.setAttribute('cy', y); e.setAttribute('rx', rx); e.setAttribute('ry', rx * achata);
      e.setAttribute('stroke-width', 10 * (1 - f) + 2); e.style.opacity = clamp(k) * (1 - f) * 0.7;
    });
  } };
}

// vapor: fios de ar quente subindo (curvas que ondulam e esmaecem no alto)
export function vapor(svg, { cor = '#ff8a3d', fios = 3, alto = 220, larg = 6 } = {}) {
  const ps = Array.from({ length: fios }, () => { const p = svgEl('path', { fill: 'none', stroke: cor, 'stroke-width': larg, 'stroke-linecap': 'round' }); svg.append(p); return p; });
  return { poe({ x, y, k = 1, t = 0 }) {
    ps.forEach((p, i) => {
      const x0 = x + (i - (fios - 1) / 2) * 34;
      let d = '';
      for (let s = 0; s <= 12; s++) {
        const f = s / 12, yy = y - f * alto * (0.7 + 0.3 * k), xx = x0 + Math.sin(f * 7 - t * 4 + i * 2) * 16 * f;
        d += `${s ? 'L' : 'M'}${xx.toFixed(1)} ${yy.toFixed(1)}`;
      }
      p.setAttribute('d', d); p.style.opacity = clamp(k) * (0.45 + 0.2 * Math.sin(t * 3 + i));
    });
  } };
}

// cintila: estrela de quatro pontas que acende e gira um pouco (k 0..1)
export function cintila(svg, { cor = '#ffffff', tam = 26 } = {}) {
  const n = svgEl('path', { fill: cor, d: `M0 ${-tam} Q3 -3 ${tam} 0 Q3 3 0 ${tam} Q-3 3 ${-tam} 0 Q-3 -3 0 ${-tam}Z` });
  svg.append(n);
  return { n, poe({ x, y, k = 1, t = 0 }) { n.setAttribute('transform', `translate(${x} ${y}) rotate(${t * 40}) scale(${clamp(k)})`); n.style.opacity = clamp(k); } };
}

// texto "quente": preenchimento em degradê (de cima para baixo) e brilho em volta (o único filter do kit: num texto só, é barato)
export function quente(node, { cores = ['#ffb020', '#ff5a36', '#d6262b'], brilho = '#ffb347' } = {}) {
  Object.assign(node.style, {
    backgroundImage: `linear-gradient(180deg, ${cores.join(', ')})`, WebkitBackgroundClip: 'text', backgroundClip: 'text',
    color: 'transparent', WebkitTextFillColor: 'transparent', filter: `drop-shadow(0 0 22px ${rgba(brilho, 0.6)})`,   // text-shadow pintaria por cima do degradê
  });
  return node;
}
