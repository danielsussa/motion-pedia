// Título de pôster (kicker com traço + título grande em serifada), usado por ancient-harbor e painted-harbor.
// Params esperados: kicker, title, font ('Fraunces' | 'Instrument Serif'), ink, accent, intro (boolean).
import { seg, ease } from '../lib/anim.js';

const RW = 938; // largura da arte de referência

export const TITLE_PARAMS = {
  kicker: { type: 'text', label: 'Kicker', default: 'SIRACUSA' },
  title: { type: 'text', label: 'Title', default: '212 a.C.' },
  font: { type: 'select', label: 'Title font', options: ['Fraunces', 'Instrument Serif'], default: 'Fraunces' },
  ink: { type: 'color', label: 'Ink', default: '#16233f' },
  accent: { type: 'color', label: 'Accent', default: '#e2623a' },
  intro: { type: 'boolean', label: 'Title intro', default: true },
};

export function drawPosterTitle(ctx, t, { w, h, p }) {
    const uT = Math.min(w / RW, h / 1400);
    const x0 = Math.max(62 * uT, 0.06 * w);
    const e = (a, b) => (p.intro ? ease.outExpo(seg(t, a, b)) : 1);
    const ky = 145 * uT, kSize = 30 * uT;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 4 * uT;
    ctx.beginPath();
    ctx.moveTo(x0, ky);
    ctx.lineTo(x0 + 50 * uT * e(0.1, 0.9), ky);
    ctx.stroke();
    ctx.font = `700 ${kSize}px Inter`;
    ctx.letterSpacing = `${kSize * 0.16}px`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.accent;
    const ke = e(0.3, 1.1);
    ctx.globalAlpha = ke;
    ctx.fillText(p.kicker, x0 + 76 * uT - (1 - ke) * 20 * uT, ky + 1);
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';

    // título: Fraunces Black (a mais próxima, livre, da serifada da referência) ou Instrument Serif engrossada.
    // A fonte é medida em B px e desenhada com escala sc; B = F (sc = 1) para a Fraunces cair no corte de display
    // (o canvas escolhe o tamanho óptico pelo px da fonte: em px grande vem o contraste alto da referência).
    const fr = p.font === 'Fraunces';
    let B = 40;
    ctx.font = fr ? `900 ${B}px Fraunces` : `${B}px "Instrument Serif"`;
    const wB = ctx.measureText(p.title).width || 1;
    const tx = fr ? x0 + 62 * uT : x0; // na referência o título começa alinhado com o texto do kicker
    let F = Math.min((fr ? 300 : 230) * uT, ((w > h ? 0.5 : 0.94) * (w - tx - 0.05 * w) * B) / wB);
    if (fr) {
      // a largura muda com o tamanho óptico: mede de novo no tamanho final e corrige (com o tracking)
      ctx.font = `900 ${F}px Fraunces`;
      const wF = ctx.measureText(p.title).width - 0.025 * F * ([...p.title].length - 1);
      F = Math.min(F * ((w > h ? 0.36 : 0.94) * (w - tx - 0.05 * w)) / wF, (w > h ? 230 : 340) * uT);
      B = F;
      ctx.font = `900 ${B}px Fraunces`;
    }
    const sc = F / B;
    const track = fr ? -0.025 * F : 0; // a referência é bem apertada
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = p.ink;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = (fr ? 0.008 : 0.07) * B; // na Fraunces, só arredonda as quinas
    ctx.lineJoin = 'round';
    const chars = [...p.title];
    let acc = '';
    const by = ky + 30 * uT + F * 0.78;
    chars.forEach((ch, i) => {
      const cx = tx - F * 0.02 + ctx.measureText(acc).width * sc + track * i;
      acc += ch;
      const ce = e(0.35 + i * 0.06, 1.4 + i * 0.06);
      if (ce <= 0) return;
      // sobe de trás de uma máscara na linha de base (alpha faria o traço aparecer por cima do preenchimento)
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - F * 0.2, by - F * 1.2, F * 1.4, F * 1.2 + F * 0.12);
      ctx.clip();
      ctx.translate(cx, by + (1 - ce) * F * 1.1);
      ctx.scale(sc, sc);
      ctx.strokeText(ch, 0, 0);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });

}
