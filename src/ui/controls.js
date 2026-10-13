import { el } from './dom.js';
import { OPTION_LABELS } from './option-labels.js';

async function upload(file) {
  // na galeria publicada (estática) não há servidor: o arquivo fica só no navegador
  if (!import.meta.env.DEV) return URL.createObjectURL(file);
  const res = await fetch('/__upload', { method: 'POST', headers: { 'x-filename': encodeURIComponent(file.name) }, body: file });
  if (!res.ok) throw new Error('upload failed');
  return (await res.json()).url;
}

// Gera o painel de controles a partir do schema `params` do motion.
export function buildControls(schema, values, onChange) {
  const rows = Object.entries(schema).map(([key, d]) => {
    const set = (v) => onChange(key, v);
    let input;
    let out = null;

    switch (d.type) {
      case 'range': {
        out = el('output', {}, String(values[key]));
        input = el('input', {
          type: 'range',
          min: d.min,
          max: d.max,
          step: d.step ?? 1,
          value: values[key],
          oninput: (e) => {
            const v = Number(e.target.value);
            out.textContent = String(v);
            set(v);
          },
        });
        break;
      }
      case 'color': {
        out = el('output', {}, values[key]);
        input = el('input', {
          type: 'color',
          value: values[key],
          oninput: (e) => ((out.textContent = e.target.value), set(e.target.value)),
        });
        break;
      }
      case 'boolean':
        input = el('input', { type: 'checkbox', checked: values[key], onchange: (e) => set(e.target.checked) });
        break;
      case 'select':
        input = el(
          'select',
          { onchange: (e) => set(e.target.value) },
          d.options.map((o) => el('option', { value: o, selected: o === values[key] }, OPTION_LABELS[o] ?? o)),
        );
        break;
      case 'textarea':
        input = el('textarea', { rows: d.rows ?? 5, value: values[key], oninput: (e) => set(e.target.value) });
        break;
      case 'image':
      case 'audio': {
        const name = el('span.file-name', {}, String(values[key] ?? '').split('/').pop() || '—');
        const file = el('input', {
          type: 'file',
          accept: d.type === 'image' ? 'image/*' : 'audio/*',
          onchange: async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            name.textContent = 'uploading…';
            try {
              set(await upload(f));
              name.textContent = f.name;
            } catch (err) {
              name.textContent = err.message;
            }
          },
        });
        const reset = el('button.btn.mini', { type: 'button', onclick: () => ((name.textContent = d.default.split('/').pop()), set(d.default)) }, 'default');
        input = el('div.file-row', {}, el('label.btn.mini', {}, 'Choose…', file), name, reset);
        break;
      }
      default:
        input = el('input', { type: 'text', value: values[key], oninput: (e) => set(e.target.value) });
    }

    return el(`label.ctl.ctl-${d.type ?? 'text'}`, {}, el('span.ctl-label', {}, d.label ?? key, out), input);
  });
  return el('div.controls', {}, rows);
}
