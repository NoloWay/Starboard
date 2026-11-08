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

/**
 * Renvoie une fonction qui redessine `root` avec `render()`, sauf pendant qu'on écrit dans un de ses champs :
 * le rendu attend alors que le champ perde le focus (sinon le texte tapé serait écrasé).
 */
export function liveRender(root, render) {
  let pending = false
  const typing = () => {
    const a = document.activeElement
    return root.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'range', 'button'].includes(a.type)))
  }
  const run = () => {
    if (typing()) { pending = true; return }
    pending = false
    const scroll = root.scrollTop
    root.innerHTML = ''
    render()
    root.scrollTop = scroll
  }
  root.addEventListener('focusout', () => setTimeout(() => { if (pending) run() }))
  return run
}

/**
 * Barrettes de niveau (compétences, énergie). onSet(n) reçoit le nouveau niveau ;
 * recliquer sur la dernière barrette allumée la retire. Sans onSet : simple affichage.
 */
export function pips(count, filled, onSet, titleOf = () => null) {
  return h('span', { class: 'pips' }, Array.from({ length: count }, (_, i) => onSet
    ? h('button', { class: `pip${i < filled ? ' on' : ''}`, title: titleOf(i + 1), onclick: () => onSet(i + 1 === filled ? i : i + 1) })
    : h('span', { class: `pip${i < filled ? ' on' : ''}`, title: titleOf(i + 1) })))
}
