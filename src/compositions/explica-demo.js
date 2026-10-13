// Demonstração do kit `explica` (src/comp/explica.js): um explicativo vertical de 9 s, sem legenda, em que o motion
// conta tudo — texto cinético na hora da "fala", cartas que se organizam, barras que crescem contando, seta desenhada,
// carimbo com tremor de câmera e marcas ✓/✗. Os tempos (t) fariam o papel das palavras de uma narração.
import { ease, seg, lerp, clamp, set } from '../comp/core.js';
import { camera, palavras, barras, carimbo, marca, traco, carta, entra, texto } from '../comp/explica.js';

const W = 1080, H = 1920, DUR = 9;
const C = { tinta: '#0f2a3d', suave: '#4b6070', teal: '#0fa596', ambar: '#f29d1c', coral: '#e8564a', roxo: '#6b5bd6' };
const SERIF = "'Fraunces', 'Instrument Serif', serif";

export default {
  id: 'explica-demo',
  title: 'Explica · vertical explainer kit',
  description: 'Kinetic text, cards, counting bars, a hand-drawn arrow and a shaking stamp: the explica kit in 9 s.',
  tags: ['explica', 'data', 'typography', 'vertical'],
  duration: DUR,
  size: { w: W, h: H },
  poster: 8.4,
  params: {},

  mount(root) {
    const cam = camera(root, { dur: DUR, cor: '#fbf4e6', impactos: [[0.1, 18, 0.3, '#fff'], [6.9, 26, 0.25, '#fff']] });
    set(cam.fundo, { background: 'radial-gradient(80% 60% at 30% 20%, #fff7e8, #f6ead4 60%, #e9f3ef)' });
    const P = cam.palco;
    const tit = palavras(P, [{ txt: 'Mixed', t: 0.1, cor: C.ambar, marca: 'rgba(242,157,28,.3)' }, { txt: 'practice', t: 0.45 }, { txt: 'feels worse...', t: 0.9 }],
      { y: 300, size: 96, font: SERIF, weight: 900, color: C.tinta });
    const formas = ['tri', 'circ', 'quad', 'hex'], cores = [C.teal, C.ambar, C.coral, C.roxo];
    const cs = [0, 1, 2, 3, 1, 0, 3, 2].map((f, i) => ({ ...carta(P, formas[f], { cor: cores[f], lado: 96 }), i }));
    const xs = [0, 1].map((i) => marca(P, 'x', { x: 700 + i * 90, y: 640, size: 70, cor: C.coral }));
    const b = barras(P, [{ rotulo: 'mixed', valor: 77, cor: C.ambar, t: 3.4 }, { rotulo: 'blocked', valor: 38, cor: C.teal, t: 4.4 }],
      { x: 200, base: 1560, alt: 640, larg: 260, vao: 160, font: SERIF, tinta: C.tinta });
    const seta = traco(P, 'M750,1180 C745,1100 650,1085 478,1100', { cor: C.tinta, larg: 9 });
    const ponta = traco(P, 'M510,1073 L474,1100 L512,1125', { cor: C.tinta, larg: 9 });
    const stamp = carimbo(P, '...but sticks more', { x: 300, y: 720, cor: C.coral, tinta: '#fff', rz: -5, size: 60 });
    const ok = marca(P, 'v', { x: 180, y: 712, size: 80, cor: C.teal });
    const rod = texto(P, 'explica kit · motion·pedia', { x: 0, y: 1680, w: W, align: 'center', size: 30, weight: 700, color: C.suave });

    return {
      update(t) {
        cam.update(t); tit.update(t);
        cs.forEach((c) => {
          const k = ease.outBack(seg(t, 1.2 + c.i * 0.08, 1.6 + c.i * 0.08)), sai = ease.inCubic(seg(t, 3.0, 3.4));
          c.poe({ x: 170 + c.i * 105, y: 700 - (1 - k) * 120 + Math.sin(t * 3 + c.i) * 6, r: (c.i % 2 ? 6 : -6) * k, s: lerp(0.4, 1, k) * (1 - 0.6 * sai), o: clamp(k * 2) * (1 - sai) });
        });
        xs.forEach((m, i) => { m.update(t, 2.2 + i * 0.3); m.svg.style.opacity = 1 - seg(t, 3.0, 3.4); });
        b.update(t);
        seta.update(t, 5.6, 6.3); ponta.update(t, 6.25, 6.45);
        stamp.update(t, 6.9); ok.update(t, 7.4);
        entra(rod, t, 7.8);
      },
    };
  },
};
