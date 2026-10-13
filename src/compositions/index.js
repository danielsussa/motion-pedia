// Todo arquivo .js nesta pasta (exceto index.js e _*.js) vira uma composição na galeria.
const mods = import.meta.glob(['./*.js', '!./index.js', '!./_*.js'], { eager: true, import: 'default' });

export const compositions = Object.values(mods).sort((a, b) => a.title.localeCompare(b.title));
