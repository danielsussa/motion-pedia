import { el, clamp } from '../core.js';
import './ui.css';

const ARROW = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Barra de prompt estilo assistente. segments: [{ t: 'texto', b: true|false }].
// update({ chars, caret, press }) — chars = quantos caracteres mostrar.
export function promptBar({ segments, icon, width = 1100 }) {
  const text = el('div.ui-prompt-text');
  const send = el('div.ui-send');
  send.innerHTML = ARROW;
  const node = el('div.ui-prompt', { style: { width: `${width}px` } }, icon ?? null, text, send);
  const total = segments.reduce((n, s) => n + s.t.length, 0);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let last = '';

  return {
    el: node,
    send,
    total,
    update({ chars, caret = true, press = 0 }) {
      let left = clamp(chars, 0, total);
      let html = '';
      for (const s of segments) {
        if (left <= 0) break;
        const part = esc(s.t.slice(0, left));
        html += s.b ? `<b>${part}</b>` : part;
        left -= s.t.length;
      }
      html += `<span class="ui-caret" style="opacity:${caret ? 1 : 0}"></span>`;
      if (html !== last) text.innerHTML = last = html;
      send.style.transform = `scale(${1 - press * 0.14})`;
    },
  };
}
