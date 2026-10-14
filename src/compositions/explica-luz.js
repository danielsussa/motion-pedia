// Demonstração do kit `luz` (src/comp/luz.js): um sol com halo, seis espelhos que viram um a um para o mesmo alvo
// (feixes em cone que se somam), a tela inteira esquentando com a soma, cintila em cada espelho que acerta, ondas de
// calor, vapor e fagulhas no alvo e o número final em degradê "quente". 8 s, vertical, sem legenda.
import { ease, seg, clamp, set } from '../comp/core.js';
import { camera, palavras, texto, svgEl, conta } from '../comp/explica.js';
import { calor, feixe, halo, brasas, ondas, vapor, cintila, quente } from '../comp/luz.js';

const W = 1080, H = 1920, DUR = 8;
const C = { tinta: '#0f2a3d', suave: '#4b6070', ambar: '#f29d1c', coral: '#e8564a' };
const SERIF = "'Fraunces', 'Instrument Serif', serif";
const S = [780, 640], T = [330, 1000];
const M = Array.from({ length: 6 }, (_, i) => [230 + i * 124, 1380 + 30 * (1 - ((i - 2.5) / 2.5) ** 2)]);
const VIRA = M.map((_, i) => 1.6 + i * 0.45);

export default {
  id: 'explica-luz',
  title: 'Explica · light that adds up',
  description: 'Six mirrors turn one by one toward the same spot: cone beams add up, the whole screen warms, sparks and heat rise.',
  tags: ['explica', 'vertical', 'light'],
  duration: DUR,
  size: { w: W, h: H },
  poster: 7.4,
  params: {},

  mount(root) {
    const cam = camera(root, { dur: DUR, cor: '#fbf4e6', impactos: [[0.1, 14, 0.2, '#fff'], [VIRA[5] + 0.4, 18, 0.2, '#fff'], [6.2, 26, 0.3, C.coral]] });
    set(cam.fundo, { background: 'radial-gradient(80% 60% at 60% 30%, #fff9ee, #f6ead4 70%)' });
    const P = cam.palco;
    const ca = calor(P);                                   // primeiro: fica atrás de tudo
    const tit = palavras(P, [{ txt: 'Light', t: 0.1 }, { txt: 'adds up', t: 0.4, cor: C.ambar }], { y: 300, size: 104, font: SERIF, weight: 900, color: C.tinta });
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'position:absolute;inset:0;overflow:visible' });
    P.append(svg);
    const ha = halo(svg);
    const ent = M.map(() => feixe(svg, { cor: '#ffe08a', fim: '#ffc64a', a0: 0.5, a1: 0.22, halo: 0.25 }));
    const sai = M.map(() => feixe(svg, { cor: '#ffb52e', fim: '#ff6a1f', a0: 0.22, a1: 0.42 }));
    const sol = svgEl('circle', { cx: S[0], cy: S[1], r: 80, fill: '#f6a723' }); svg.append(sol);
    const alvo = svgEl('circle', { cx: T[0], cy: T[1], r: 70, fill: '#fff', stroke: C.tinta, 'stroke-width': 8 }); svg.append(alvo);
    const on = ondas(svg, { raio: 220, achata: 0.4 }), va = vapor(svg), br = brasas(svg);
    const es = M.map(([x, y]) => { const n = svgEl('rect', { x: -32, y: -8, width: 64, height: 16, rx: 5, fill: '#c9d4de', stroke: C.tinta, 'stroke-width': 4 }); svg.append(n); return n; });
    const ci = M.map(() => cintila(svg));
    const num = quente(texto(P, '', { x: 0, y: 1520, w: W, align: 'center', size: 190, font: SERIF, weight: 900, color: C.coral, lh: 1 }));
    const rod = texto(P, 'calor · feixe · halo · brasas · ondas · vapor · cintila · quente — luz kit', { x: 0, y: 1760, w: W, align: 'center', size: 26, weight: 700, color: C.suave });

    return {
      update(t) {
        cam.update(t);
        tit.update(t);
        let soma = 0;
        M.forEach(([x, y], i) => {
          const k = ease.outCubic(seg(t, VIRA[i], VIRA[i] + 0.4));
          // espelho: gira do "de lado" para a bissetriz entre o sol e o alvo
          const a1 = Math.atan2(S[1] - y, S[0] - x), a2 = Math.atan2(T[1] - y, T[0] - x), ang = ((a1 + a2) / 2) * 180 / Math.PI + 90;
          es[i].setAttribute('transform', `translate(${x} ${y}) rotate(${ang + (1 - k) * 35})`);
          ent[i].poe(S[0], S[1], x, y, 30, 60, clamp(t / 0.5));
          sai[i].poe(x, y, T[0], T[1], 60, 44, k);
          const d = t - VIRA[i] - 0.4;
          ci[i].poe({ x: x + 10, y: y - 14, k: d > 0 ? Math.exp(-d * 3.5) * clamp(d / 0.08) : 0, t });
          soma += k;
        });
        const h = soma / M.length, fogo = seg(t, 6.2, 7);
        ha.poe({ x: S[0], y: S[1], r: 80, k: 0.5 + 0.5 * h, t });
        ca.aquece(0.2 + 0.8 * h, fogo, T);
        alvo.setAttribute('fill', `color-mix(in srgb, #fff ${100 - 80 * h}%, ${C.coral})`);
        on.poe({ x: T[0], y: T[1] + 30, k: seg(h, 0.3, 0.8), t });
        va.poe({ x: T[0], y: T[1] - 70, k: seg(h, 0.5, 1), t });
        br.poe({ x: T[0], y: T[1] - 40, k: 0.2 * h + 0.8 * fogo, t });
        num.textContent = t < 6.2 ? `${Math.round(soma)}×` : `${conta(t, 6.2, 6.9, 400, 100)} °C`;
        set(num, { opacity: clamp((t - VIRA[0]) / 0.3) });
        set(rod, { opacity: clamp((t - 0.6) / 0.4) * 0.8 });
      },
    };
  },
};
