import { registry } from '../lib/registry.js';

// Todo arquivo .js nesta pasta (exceto index.js e os que começam com _) vira um motion na galeria.
const mods = import.meta.glob(['./*.js', '!./index.js', '!./_*.js'], { eager: true, import: 'default' });

// Seções da galeria, na ordem. Todo motion declara `category` com um destes ids.
export const CATEGORIES = [
  { id: 'tipografia', label: 'Typography' },
  { id: 'fundos', label: 'Backgrounds & loops' },
  { id: 'formas', label: 'Shapes & geometry' },
  { id: 'particulas', label: 'Particles & simulation' },
  { id: 'transicoes', label: 'Transitions & overlays' },
  { id: 'dados', label: 'UI, data & broadcast' },
  { id: 'imagem', label: 'Image & photo' },
];

export const motions = Object.values(mods).sort((a, b) => a.title.localeCompare(b.title));
for (const m of motions) registry.set(m.id, m);
