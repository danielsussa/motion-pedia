// Demonstração das peças `grade`, `ficha` e `salto` do kit explica: um tabuleiro "gentil" (casas alinhadas, a ficha
// pula e ganha ✓ na hora) que vira "perverso" (as casas saem do lugar, o ✓ vira ✗). 8 s, vertical, sem legenda.
import { ease, seg, clamp, set } from '../comp/core.js';
import { camera, palavras, grade, ficha, salto, marca, entra, texto } from '../comp/explica.js';

const W = 1080, H = 1920, DUR = 8;
const C = { tinta: '#0f2a3d', suave: '#4b6070', teal: '#0fa596', ambar: '#f29d1c', coral: '#e8564a' };
const SERIF = "'Fraunces', 'Instrument Serif', serif";
const CAM = [[0, 3], [1, 3], [1, 2], [2, 2], [2, 1], [3, 1], [3, 0]];
const T = [1.3, 1.8, 2.3, 2.8, 3.3, 3.8];

export default {
  id: 'explica-tabuleiro',
  title: 'Explica · board, token and hops',
  description: 'A tidy board where every hop gets an instant check turns into a shifting board where the check becomes an X.',
  tags: ['explica', 'vertical', 'metaphor'],
  duration: DUR,
  size: { w: W, h: H },
  poster: 7.4,
  params: {},

  mount(root) {
    const cam = camera(root, { dur: DUR, cor: '#fbf4e6', impactos: [[0.1, 16, 0.25, '#fff'], [4.6, 24, 0.2, C.coral], [6.6, 18, 0.15, C.coral]] });
    set(cam.fundo, { background: 'radial-gradient(80% 60% at 30% 20%, #fff7e8, #f6ead4 60%, #e9f3ef)' });
    const P = cam.palco;
    const tit = palavras(P, [{ txt: 'Clear', t: 0.1 }, { txt: 'rules', t: 0.35, cor: C.teal }], { y: 320, size: 104, font: SERIF, weight: 900, color: C.tinta });
    const tit2 = palavras(P, [{ txt: 'Shifting', t: 4.5, cor: C.coral }, { txt: 'rules', t: 4.8 }], { y: 320, size: 104, font: SERIF, weight: 900, color: C.tinta });
    const g = grade(P, { x: 300, y: 620, cols: 4, rows: 4, lado: 110, vao: 14, seed: 6 });
    const f = ficha(P, { cor: C.teal, lado: 66 });
    const oks = T.map(() => marca(P, 'v', { x: 0, y: 0, size: 70, cor: C.teal, larg: 15 }));
    const xx = marca(P, 'x', { x: 0, y: 0, size: 80, cor: C.coral, larg: 16 });
    const rod = texto(P, 'grade · ficha · salto — explica kit', { x: 0, y: 1680, w: W, align: 'center', size: 30, weight: 700, color: C.suave });
    const caos = (t) => (c) => ease.inOutSine(seg(t, 4.4, 5.4)) * (0.3 + 0.25 * c.d);

    return {
      update(t) {
        cam.update(t);
        tit.update(t); set(tit.box, { opacity: 1 - seg(t, 4.1, 4.4) }); tit2.update(t);
        g.update(t, { a: 0.1, caos: caos(t), cor: (c) => (t > 4.4 ? `color-mix(in srgb, #fff ${100 - 25 * seg(t, 4.4, 5.4) * (0.5 + c.d)}%, ${C.coral})` : '#fff') });
        const p = salto(t, CAM.map(([i, j]) => () => g.pos(i, j)), T, { d: 0.3, alto: 70 });
        f.poe({ ...p, s: ease.outBack(seg(t, 0.5, 0.9)), o: clamp(seg(t, 0.5, 0.7) * 3) });
        oks.forEach((m, k) => { const [x, y] = g.pos(...CAM[k + 1]); set(m.svg, { left: `${x - 35}px`, top: `${y - 120}px` }); m.update(t, T[k]); m.svg.style.opacity = t < T[k] ? 0 : 1 - seg(t, T[k] + 0.5, T[k] + 0.8); });
        const [xe, ye] = g.pos(...CAM[CAM.length - 1]);
        set(xx.svg, { left: `${xe - 40}px`, top: `${ye - 130}px` }); xx.update(t, 6.6);
        entra(rod, t, 6.9);
      },
    };
  },
};
