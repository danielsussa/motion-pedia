import { seg, ease, lerp, rgba } from '../lib/anim.js';
import { asset } from '../lib/assets.js';

const SANS = 'Inter, system-ui, sans-serif';
const SERIF = "'Instrument Serif', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

// Linhas "Função | Nome"; "| Nome" continua a função anterior; linha sem "|" = título de seção;
// linha vazia = respiro extra.
function parse(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim();
    if (!l) {
      out.push({ kind: 'gap' });
      continue;
    }
    const i = l.indexOf('|');
    if (i < 0) out.push({ kind: 'head', text: l });
    else out.push({ kind: 'row', role: l.slice(0, i).trim(), name: l.slice(i + 1).trim() });
  }
  return out;
}

let mc = null;
const measure = () => (mc ??= new OffscreenCanvas(4, 4).getContext('2d'));

// Encolhe a fonte até caber em maxW (devolve o tamanho).
function fit(text, fontFn, size, maxW) {
  const c = measure();
  c.font = fontFn(size);
  const tw = c.measureText(text).width;
  return tw > maxW ? (size * maxW) / tw : size;
}

export default {
  id: 'credits-roll',
  title: 'Credits Roll',
  description: 'Créditos de filme subindo em duas colunas (função · nome) que desaceleram até parar no título e no logo.',
  category: 'tipografia',
  tags: ['tipografia', 'broadcast', 'alpha'],
  duration: 16,
  poster: 7,

  params: {
    title: { type: 'text', label: 'Título', default: 'Entre Quadros' },
    credits: {
      type: 'textarea',
      label: 'Créditos (Função | Nome · linha sem | = seção)',
      rows: 8,
      default:
        'Direção | Helena Duarte\nRoteiro | Helena Duarte\n| Rafael Mendes\nProdução | Camila Ito\nDireção de fotografia | Tomás Albuquerque\nMontagem | Júlia Fontes\nDireção de arte | Pedro Nakamura\nTrilha original | Lia Moreau\n\nElenco\nClara | Marina Saldanha\nOtto | Gabriel Rocha\nVera | Beatriz Lemos\nO maquinista | Caio Venturini\n\nPós-produção\nMotion design | Nina Albers\nColorização | André Kowalski\nMixagem de som | Davi Okafor\nEfeitos visuais | Sofia Brandão\n| Léo Marçal',
    },
    logo: { type: 'image', label: 'Logo', default: '/samples/logo.svg' },
    footer: { type: 'text', label: 'Rodapé', default: '© 2026 · Motion Pedia Filmes' },
    size: { type: 'range', label: 'Tamanho do texto', min: 0.7, max: 1.4, step: 0.01, default: 1 },
    color: { type: 'color', label: 'Texto', default: '#ece8e1' },
    accent: { type: 'color', label: 'Destaque', default: '#d9a45b' },
    bg: { type: 'color', label: 'Fundo', default: '#0a0a0b' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const u = m * 0.03 * p.size;
    const cx = w / 2;
    const gutter = u * 0.9;
    const colW = w / 2 - gutter - Math.max(w * 0.06, u * 1.5);
    const roleF = (s) => `400 ${s}px ${SANS}`;
    const nameF = (s) => `600 ${s}px ${SANS}`;
    const headF = (s) => `600 ${s}px ${SANS}`;
    const titleF = (s) => `italic 400 ${s}px ${SERIF}`;
    const items = [];

    // Abertura: título (y = 0 é o centro da tela quando a rolagem está em 0).
    const ts = fit(p.title, titleF, u * 3.6, w * 0.84);
    items.push({ kind: 'title', y: 0, size: ts });
    let y = ts * 0.55 + u * 7;

    let first = true;
    for (const it of parse(p.credits)) {
      if (it.kind === 'gap') {
        if (!first) y += u * 1.6;
        continue;
      }
      if (it.kind === 'head') {
        if (!first) y += u * 1.4;
        const text = it.text.toUpperCase();
        const s = fit(text, headF, u * 0.62, w * 0.8 - text.length * u * 0.25);
        items.push({ kind: 'head', y, text, size: s });
        y += u * 2.2;
      } else {
        items.push({
          kind: 'row',
          y,
          role: it.role,
          name: it.name,
          rs: fit(it.role, roleF, u * 0.82, colW),
          ns: fit(it.name, nameF, u * 0.92, colW),
        });
        y += u * 1.55;
      }
      first = false;
    }
    // Cartela final: logo + título + rodapé, centrada em E.
    const logo = u * 4.2;
    const es = fit(p.title, titleF, u * 2.3, w * 0.8);
    const block = logo + u * 1.4 + es * 0.9 + u * 1.6 + u * 0.6;
    // Espaço suficiente para os últimos nomes saírem da tela quando a cartela parar no centro.
    const E = y + Math.max(u * 6 + block / 2, h * 0.62);
    const top = E - block / 2;
    items.push({ kind: 'end', y: E, top, logo, es });
    return { items, u, cx, gutter, E, roleF, nameF, headF, titleF };
  },

  render(ctx, t, { w, h, p, duration: D, state }) {
    const { items, u, cx, gutter, E } = state;
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }

    // Rolagem com perfil trapezoidal de velocidade: acelera, sobe constante e desacelera até parar.
    const T0 = 1.7, T1 = D - 2.4, ru = 1.2, rd = 2.6;
    const v = E / (T1 - T0 - ru / 2 - rd / 2);
    let s;
    if (t <= T0) s = 0;
    else if (t < T0 + ru) s = (v * (t - T0) ** 2) / (2 * ru);
    else if (t < T1 - rd) s = v * (ru / 2 + (t - T0 - ru));
    else if (t < T1) s = E - (v * (T1 - t) ** 2) / (2 * rd);
    else s = E;
    const off = h / 2 - s;

    ctx.textBaseline = 'middle';
    const ink = p.color;
    const roleCol = rgba(p.color, 0.55);
    const margin = u * 4;

    for (const it of items) {
      const y = it.y + off;
      if (it.kind !== 'end' && (y < -margin * 2 || y > h + margin * 2)) continue;
      if (it.kind === 'title') {
        const a = ease.outCubic(seg(t, 0.15, 1.2));
        const rise = (1 - ease.outExpo(seg(t, 0.15, 1.6))) * u * 0.8;
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.fillStyle = ink;
        ctx.font = state.titleF(it.size);
        ctx.fillText(p.title, cx, y + rise);
        // filete de destaque que abre do centro
        const lw = u * 3.2 * ease.inOutCubic(seg(t, 0.6, 1.6));
        ctx.fillStyle = p.accent;
        ctx.fillRect(cx - lw / 2, y + it.size * 0.62, lw, Math.max(1.5, u * 0.07));
        ctx.globalAlpha = 1;
      } else if (it.kind === 'head') {
        ctx.textAlign = 'center';
        ctx.fillStyle = p.accent;
        ctx.font = state.headF(it.size);
        ctx.letterSpacing = `${(it.size * 0.32).toFixed(2)}px`;
        // letterSpacing com center desloca meio espaçamento: compensa.
        ctx.fillText(it.text, cx + it.size * 0.16, y);
        ctx.letterSpacing = '0px';
      } else if (it.kind === 'row') {
        if (it.role) {
          ctx.textAlign = 'right';
          ctx.fillStyle = roleCol;
          ctx.font = state.roleF(it.rs);
          ctx.fillText(it.role, cx - gutter, y);
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = ink;
        ctx.font = state.nameF(it.ns);
        ctx.fillText(it.name, cx + gutter, y);
      } else if (it.kind === 'end') {
        const top = it.top + off;
        if (top > h + margin) continue;
        const settle = seg(t, D - 2.4, D - 1.2);
        // logo
        const img = asset(p.logo);
        const L = it.logo * lerp(0.94, 1, ease.outCubic(settle));
        const ly = top + it.logo / 2;
        if (img && img.width) {
          const r = img.width / img.height;
          const lw = r >= 1 ? L : L * r;
          const lh = r >= 1 ? L / r : L;
          ctx.drawImage(img, cx - lw / 2, ly - lh / 2, lw, lh);
        }
        let yy = top + it.logo + u * 1.4 + it.es * 0.45;
        ctx.textAlign = 'center';
        ctx.fillStyle = ink;
        ctx.font = state.titleF(it.es);
        ctx.fillText(p.title, cx, yy);
        yy += it.es * 0.45 + u * 1.6;
        ctx.font = `500 ${u * 0.5}px ${MONO}`;
        ctx.fillStyle = rgba(p.color, 0.45 * ease.outCubic(seg(t, D - 1.6, D - 0.6)));
        ctx.letterSpacing = `${(u * 0.08).toFixed(2)}px`;
        ctx.fillText(p.footer.toUpperCase(), cx + u * 0.04, yy);
        ctx.letterSpacing = '0px';
      }
    }

    // Bordas que esfumam o texto (mesma cor variando só o alpha).
    const fh = h * 0.16;
    const fades = [
      [0, fh, 0, fh],
      [h, h - fh, h - fh, fh],
    ];
    if (p.transparent) ctx.globalCompositeOperation = 'destination-out';
    const col = p.transparent ? '#000000' : p.bg;
    for (const [y0, y1, ry, rh] of fades) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba(col, 1));
      g.addColorStop(0.35, rgba(col, 0.75));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, ry, w, rh);
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};
