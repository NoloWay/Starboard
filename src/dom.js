/** Petit utilitaire de création d'éléments DOM : h('div', { class: 'x', onclick }, enfants…) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'class') el.className = v
    else if (k in el && k !== 'list') el[k] = v
    else el.setAttribute(k, v)
  }
  el.append(...children.flat().filter((c) => c != null && c !== false))
  return el
}
