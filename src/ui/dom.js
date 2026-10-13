// Mini helper: el('div.card', { onclick }, ...children)
export function el(sel, props = {}, ...children) {
  const [tag, ...classes] = sel.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(node.style, v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

export const fmtTime = (t) => `${t.toFixed(2)}s`;
