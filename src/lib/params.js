export const defaults = (motion) =>
  Object.fromEntries(Object.entries(motion.params ?? {}).map(([k, d]) => [k, d.default]));

const key = (id) => `motion-pedia:params:${id}`;

// Parâmetros editados ficam salvos por motion neste navegador (conveniência; o padrão vive no arquivo).
export function loadParams(motion) {
  const base = defaults(motion);
  try {
    const saved = JSON.parse(localStorage.getItem(key(motion.id)) ?? '{}');
    for (const k of Object.keys(base)) if (k in saved) base[k] = saved[k];
  } catch {}
  return base;
}

export function saveParams(motion, params) {
  try {
    localStorage.setItem(key(motion.id), JSON.stringify(params));
  } catch {}
}

export function clearParams(motion) {
  try {
    localStorage.removeItem(key(motion.id));
  } catch {}
}
