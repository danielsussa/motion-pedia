import { el } from '../core.js';
import './ui.css';

// Card de tarefa/evento. variant: '' | 'dark' | 'accent' | 'hatch' | 'outline'.
export function taskCard({ title, time, variant = '', w = 230, h = 86 }) {
  return el(`div.ui-task${variant ? '.' + variant : ''}`, { style: { width: `${w}px`, height: `${h}px` } }, title, time ? el('small', {}, time) : null);
}
