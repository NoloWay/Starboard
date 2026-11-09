import * as Y from 'yjs'
import { h, liveRender } from './dom.js'
import { DOOR_LEVELS } from './rules.js'
import { CELL, SHAPE_TYPES, ICON_NAMES, shapeAt, doorAt, cameraAt, shapePath } from './shipMap.js'

// Éditeur du plan du Gaïa (MJ) : formes, portes, caméras. Toutes les modifications vont dans la carte
// `plan` du Y.Doc (partagées en direct, annulables avec Ctrl+Z).

const SNAP = CELL / 4 // aimantation des points (Alt : désactivée)
const TOOLS = [
  ['select', '⬚', 'Sélection : cliquer pour choisir, glisser pour déplacer, poignées pour modifier'],
  ['rect', '▭', 'Rectangle : glisser d’un coin à l’autre'],
  ['ngon', '⬡', 'Polygone régulier : glisser du centre vers un sommet'],
  ['triangle', '△', 'Triangle : glisser du centre vers un sommet'],
  ['circle', '◯', 'Cercle : glisser du centre vers le bord'],
  ['poly', '✎', 'Polyligne : cliquer pour poser chaque sommet, puis recliquer sur le premier (ou Entrée, double-clic) pour refermer'],
  ['door', '⊟', 'Porte : glisser le long du mur'],
  ['camera', '◉', 'Caméra : cliquer pour la poser, puis l’orienter avec sa poignée'],
]

/** Polygone régulier ; avec des côtés droits, orienté pour avoir des côtés horizontaux / verticaux. */
function regular(cx, cy, r, n, start) {
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / n
    return [round(cx + r * Math.cos(a)), round(cy + r * Math.sin(a))]
  })
}
const round = (v) => Math.round(v * 10) / 10
/** append() qui ignore les éléments conditionnels absents (false / null) */
const add = (el, ...kids) => el.append(...kids.flat().filter(Boolean))
const orthoStart = (n) => -Math.PI / 2 + (n % 4 === 0 ? Math.PI / n : 0)

/** Redresse les côtés presque horizontaux / verticaux (moins de 20°). */
function straighten(pts) {
  const P = pts.map((p) => [...p])
  const tan = Math.tan((20 * Math.PI) / 180)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i]
      const b = P[(i + 1) % P.length]
      const dx = Math.abs(b[0] - a[0])
      const dy = Math.abs(b[1] - a[1])
      if (dy <= dx * tan) a[1] = b[1] = round((a[1] + b[1]) / 2)
      else if (dx <= dy * tan) a[0] = b[0] = round((a[0] + b[0]) / 2)
    }
  }
  return P
}

/**
 * Déplace le sommet i en p. Avec des côtés droits, les voisins suivent pour que les côtés
 * horizontaux / verticaux le restent (un coin de rectangle redimensionne le rectangle).
 */
function moveVertex(pts, i, p, ortho) {
  const P = pts.map((q) => [...q])
  const old = P[i]
  const x = round(p.x)
  const y = round(p.y)
  if (ortho) {
    for (const j of [(i - 1 + P.length) % P.length, (i + 1) % P.length]) {
      const q = P[j]
      if (Math.abs(q[0] - old[0]) < 0.5) q[0] = x // côté vertical : le voisin garde la même verticale
      else if (Math.abs(q[1] - old[1]) < 0.5) q[1] = y // côté horizontal
    }
  }
  P[i] = [x, y]
  return P
}

/** Déplace le côté i → i+1 de (dx, dy) ; avec des côtés droits, un côté droit ne bouge que perpendiculairement. */
function moveEdge(pts, i, dx, dy, ortho) {
  const j = (i + 1) % pts.length
  const [a, b] = [pts[i], pts[j]]
  if (ortho && Math.abs(a[1] - b[1]) < 0.5) dx = 0 // côté horizontal : glisse en hauteur
  else if (ortho && Math.abs(a[0] - b[0]) < 0.5) dy = 0 // côté vertical : glisse en largeur
  let P = moveVertex(pts, i, { x: a[0] + dx, y: a[1] + dy }, ortho)
  P = moveVertex(P, j, { x: b[0] + dx, y: b[1] + dy }, ortho)
  return P
}

function translate(it, dx, dy) {
  if (it.kind === 'door') { const [a, b, c, d] = it.seg; return { ...it, seg: [a + dx, b + dy, c + dx, d + dy].map(round) } }
  if (it.kind === 'camera') return { ...it, x: round(it.x + dx), y: round(it.y + dy) }
  if (it.circle) return { ...it, circle: { ...it.circle, x: round(it.circle.x + dx), y: round(it.circle.y + dy) } }
  return { ...it, pts: it.pts.map(([x, y]) => [round(x + dx), round(y + dy)]) }
}

/**
 * ctx : { doc, plan, deck(), entries(), ensureSeeded(deck), zoom(), draw(), g, stage }
 */
export function setupPlanEditor(ctx) {
  let active = false
  let tool = 'select'
  let sides = 6
  let ortho = true
  let selected = null
  let action = null // glisser en cours : move | handle | create
  const undo = new Y.UndoManager(ctx.plan, { captureTimeout: 400 }) // le chargement initial (origine 'seed') n'est pas annulable

  const get = (id) => ctx.plan.get(id)
  const set = (id, it) => ctx.plan.set(id, it)
  const shapesZ = () => ctx.entries().filter(([, it]) => it.kind === 'shape').map(([, it]) => it.z ?? 0)
  const snap = (w, free) => (free ? { x: round(w.x), y: round(w.y) } : { x: Math.round(w.x / SNAP) * SNAP, y: Math.round(w.y / SNAP) * SNAP })

  // ---------- Panneaux ----------
  const tools = h('div', { class: 'plan-tools' })
  const props = h('div', { class: 'plan-props' })
  const renderProps = liveRender(props, buildProps)

  function renderTools() {
    tools.innerHTML = ''
    add(tools,
      h('div', { class: 'tool-row' }, TOOLS.map(([k, icon, title]) => h('button', {
        class: `tool${tool === k ? ' on' : ''}`, title, onclick: () => { tool = k; draft = null; renderTools(); ctx.draw() },
      }, icon))),
      tool === 'ngon' && h('label', { class: 'check' }, 'Côtés',
        h('input', { type: 'number', min: 3, max: 12, value: sides, class: 'num', onchange: (e) => { sides = Math.max(3, Math.min(12, Number(e.target.value) || 6)) } })),
      h('label', { class: 'check', title: 'Les côtés modifiés restent horizontaux ou verticaux' },
        h('input', { type: 'checkbox', checked: ortho, onchange: (e) => { ortho = e.target.checked } }), 'Côtés droits'),
      h('div', { class: 'tool-row' },
        h('button', { class: 'small', title: 'Annuler (Ctrl+Z)', onclick: () => undo.undo() }, '↶'),
        h('button', { class: 'small', title: 'Rétablir (Ctrl+Y)', onclick: () => undo.redo() }, '↷'),
        h('button', {
          class: 'small danger', title: 'Remettre cet étage tel que dans l’Excel',
          onclick: () => {
            if (!confirm(`Remettre l'étage ${ctx.deck()} tel que dans l'Excel ? Toutes ses modifications seront perdues.`)) return
            ctx.doc.transact(() => {
              ctx.plan.forEach((it, id) => { if (it.deck === ctx.deck()) ctx.plan.delete(id) })
            })
            select(null)
            ctx.ensureSeeded(ctx.deck())
          },
        }, 'Réinitialiser l’étage')),
      h('p', { class: 'hint' }, 'Alt : sans aimantation · Suppr : effacer · Échap : désélectionner · molette / clic milieu : vue'),
    )
  }

  function field(label, input) { return h('label', { class: 'field' }, h('span', {}, label), input) }

  function buildProps() {
    const it = selected && get(selected)
    if (!it) {
      add(props, h('h4', {}, 'Plan'), h('p', { class: 'muted' }, 'Choisis un outil pour dessiner, ou clique sur une pièce, une porte ou une caméra pour la modifier.'))
      return
    }
    const patch = (changes) => set(selected, { ...get(selected), ...changes })
    const remove = h('button', { class: 'small danger', onclick: () => { ctx.plan.delete(selected); select(null) } }, 'Supprimer')

    if (it.kind === 'shape') {
      const z = shapesZ()
      add(props,
        h('h4', {}, SHAPE_TYPES[it.type] ?? 'Forme'),
        field('Nom', h('input', { value: it.name ?? '', onchange: (e) => patch({ name: e.target.value }) })),
        field('Numéro', h('input', { value: it.code ?? '', placeholder: 'ex. 12 ou 5.1', onchange: (e) => patch({ code: e.target.value.trim() }) })),
        field('Type', h('select', { onchange: (e) => patch({ type: e.target.value }) },
          Object.entries(SHAPE_TYPES).map(([k, l]) => h('option', { value: k, selected: k === it.type }, l)))),
        field('Logo', h('select', { onchange: (e) => patch({ icon: e.target.value }) },
          [['', 'Automatique (d’après le nom)'], ['none', 'Aucun'], ...Object.entries(ICON_NAMES)]
            .map(([k, l]) => h('option', { value: k, selected: k === (it.icon ?? '') }, l)))),
        !it.circle && field(`Arrondi des angles (${it.radius ?? 0.3})`, h('input', {
          type: 'range', min: 0, max: 1.5, step: 0.1, value: it.radius ?? 0.3, onchange: (e) => patch({ radius: Number(e.target.value) }),
        })),
        h('div', { class: 'tool-row' },
          !it.circle && h('button', { class: 'small', title: 'Rend horizontaux / verticaux les côtés presque droits', onclick: () => patch({ pts: straighten(it.pts) }) }, 'Redresser'),
          h('button', { class: 'small', title: 'Passer devant', onclick: () => patch({ z: Math.max(...z) + 1 }) }, 'Devant'),
          h('button', { class: 'small', title: 'Passer derrière', onclick: () => patch({ z: Math.min(...z) - 1 }) }, 'Derrière'),
          h('button', {
            class: 'small', title: 'Dupliquer',
            onclick: () => { const id = crypto.randomUUID(); set(id, { ...translate(it, CELL, CELL), z: Math.max(...z) + 1 }); select(id) },
          }, 'Dupliquer')),
        remove)
    } else if (it.kind === 'door') {
      const levels = (value, key) => h('select', { onchange: (e) => patch({ [key]: e.target.value }) },
        DOOR_LEVELS.map((l) => h('option', { value: l, selected: l === value }, `Badge ${l}`)))
      add(props,
        h('h4', {}, it.access ? 'Trappe technique' : 'Porte'),
        field('Accréditation requise', levels(it.level, 'level')),
        field('Niveau par défaut (commande « toutes les portes »)', levels(it.defaultLevel ?? it.level, 'defaultLevel')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!it.access, onchange: (e) => patch({ access: e.target.checked }) }),
          'Trappe technique (pointillés)'),
        remove)
    } else if (it.kind === 'camera') {
      add(props,
        h('h4', {}, 'Caméra de surveillance'),
        field(`Orientation (${Math.round(it.angle ?? 0)}°)`, h('input', {
          type: 'range', min: 0, max: 359, step: 1, value: Math.round(((it.angle ?? 0) % 360 + 360) % 360),
          oninput: (e) => patch({ angle: Number(e.target.value) }),
        })),
        remove)
    }
  }

  function select(id) {
    selected = id
    renderProps()
    ctx.draw()
  }

  // ---------- Poignées ----------
  function handles(it) {
    if (it.kind === 'door') return [{ k: 'end', i: 0, x: it.seg[0], y: it.seg[1] }, { k: 'end', i: 1, x: it.seg[2], y: it.seg[3] }]
    if (it.kind === 'camera') {
      const t = ((it.angle ?? 0) * Math.PI) / 180
      return [{ k: 'rotate', x: it.x + Math.cos(t) * CELL * 0.9, y: it.y + Math.sin(t) * CELL * 0.9 }]
    }
    if (it.circle) return [{ k: 'radius', x: it.circle.x + it.circle.r, y: it.circle.y }]
    return [
      ...it.pts.map(([x, y], i) => ({ k: 'vertex', i, x, y })),
      ...it.pts.map(([x, y], i) => { const [x2, y2] = it.pts[(i + 1) % it.pts.length]; return { k: 'edge', i, x: (x + x2) / 2, y: (y + y2) / 2 } }),
    ]
  }

  /** it : l'élément au début du glisser ; from : point de départ du glisser. */
  function applyHandle(it, hd, p, free, from) {
    if (hd.k === 'vertex') return { ...it, pts: moveVertex(it.pts, hd.i, p, ortho) }
    if (hd.k === 'edge') return { ...it, pts: moveEdge(it.pts, hd.i, p.x - from.x, p.y - from.y, ortho) }
    if (hd.k === 'radius') return { ...it, circle: { ...it.circle, r: round(Math.max(CELL * 0.3, Math.hypot(p.x - it.circle.x, p.y - it.circle.y))) } }
    if (hd.k === 'rotate') {
      let a = (Math.atan2(p.y - it.y, p.x - it.x) * 180) / Math.PI
      if (!free) a = Math.round(a / 15) * 15
      return { ...it, angle: Math.round(a) }
    }
    // extrémité de porte
    const s = [...it.seg]
    const o = hd.i ? 0 : 2 // l'autre extrémité
    let [x, y] = [p.x, p.y]
    if (ortho) { if (Math.abs(x - s[o]) > Math.abs(y - s[o + 1])) y = s[o + 1]; else x = s[o] }
    s[hd.i * 2] = round(x)
    s[hd.i * 2 + 1] = round(y)
    return { ...it, seg: s }
  }

  // ---------- Création ----------
  function created(from, to, free) {
    const deck = ctx.deck()
    const z = Math.max(0, ...shapesZ()) + 1
    const base = { deck, kind: 'shape', type: 'room', code: '', name: 'Nouvelle pièce', icon: '', radius: 0.3, z }
    const r = Math.hypot(to.x - from.x, to.y - from.y)
    if (tool === 'camera') return { deck, kind: 'camera', x: from.x, y: from.y, angle: 0 }
    if (tool === 'door') {
      let [x, y] = [to.x, to.y]
      if (ortho) { if (Math.abs(x - from.x) > Math.abs(y - from.y)) y = from.y; else x = from.x }
      if (Math.hypot(x - from.x, y - from.y) < CELL * 0.4) return null
      return { deck, kind: 'door', seg: [from.x, from.y, x, y].map(round), level: 'Vert', defaultLevel: 'Vert', access: false }
    }
    if (tool === 'rect') {
      if (Math.abs(to.x - from.x) < CELL * 0.4 || Math.abs(to.y - from.y) < CELL * 0.4) return null
      const [x1, x2] = [Math.min(from.x, to.x), Math.max(from.x, to.x)]
      const [y1, y2] = [Math.min(from.y, to.y), Math.max(from.y, to.y)]
      return { ...base, pts: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] }
    }
    if (r < CELL * 0.3) return null
    if (tool === 'circle') return { ...base, radius: 0, circle: { x: from.x, y: from.y, r: round(r) } }
    const n = tool === 'triangle' ? 3 : sides
    const start = ortho ? orthoStart(n) : Math.atan2(to.y - from.y, to.x - from.x)
    return { ...base, pts: regular(from.x, from.y, r, n, start) }
  }

  // ---------- Souris (appelé par le plateau ; renvoie true si l'éditeur prend la main) ----------
  // ---------- Polyligne : sommets posés un à un, refermée sur le premier point ----------
  let draft = null // { pts: [[x, y]…], cursor: { x, y } }

  /** Point suivant de la polyligne ; avec des côtés droits, aligné sur le précédent (horizontal ou vertical). */
  function nextPoint(p) {
    const last = draft?.pts.at(-1)
    if (!ortho || !last) return p
    return Math.abs(p.x - last[0]) > Math.abs(p.y - last[1]) ? { x: p.x, y: last[1] } : { x: last[0], y: p.y }
  }
  const nearFirst = (p) => draft?.pts.length >= 3 && Math.hypot(p.x - draft.pts[0][0], p.y - draft.pts[0][1]) <= 10 / ctx.zoom()

  function closeDraft() {
    if (draft?.pts.length >= 3) {
      const id = crypto.randomUUID()
      set(id, { deck: ctx.deck(), kind: 'shape', type: 'room', code: '', name: 'Nouvelle pièce', icon: '', radius: 0.3, z: Math.max(0, ...shapesZ()) + 1, pts: draft.pts })
      tool = 'select'
      renderTools()
      draft = null
      select(id)
    }
  }

  /** Survol (sans bouton) : aperçu du prochain côté de la polyligne. */
  function hover(w, e) {
    if (!active || tool !== 'poly' || !draft) return
    draft.cursor = snap(w, e.altKey)
    ctx.draw()
  }

  function pointerDown(w, e) {
    if (!active || e.button !== 0) return false
    const p = snap(w, e.altKey)
    if (tool === 'poly') {
      if (nearFirst(w)) { closeDraft(); return true }
      draft ??= { pts: [], cursor: p }
      const q = nextPoint(p)
      const last = draft.pts.at(-1)
      if (!last || last[0] !== q.x || last[1] !== q.y) draft.pts.push([round(q.x), round(q.y)]) // pas de doublon (double-clic)
      ctx.draw()
      return true
    }
    if (tool !== 'select') {
      action = { kind: 'create', from: p, to: p, free: e.altKey }
      return true
    }
    const tol = 9 / ctx.zoom()
    const sel = selected && get(selected)
    const hd = sel && handles(sel).find((x) => Math.hypot(x.x - w.x, x.y - w.y) <= tol)
    if (hd) {
      action = { kind: 'handle', id: selected, hd, start: sel, from: p }
      return true
    }
    const entries = ctx.entries()
    const hit = doorAt(entries, w.x, w.y, Math.max(tol, CELL * 0.2)) ?? cameraAt(entries, w.x, w.y) ?? shapeAt(ctx.g, entries, w.x, w.y)
    if (!hit) { select(null); return false } // clic dans le vide : la vue se déplace
    select(hit[0])
    action = { kind: 'move', id: hit[0], from: p, start: hit[1] }
    return true
  }

  function pointerMove(w, e) {
    if (!action) return false
    const p = snap(w, e.altKey)
    if (action.kind === 'move') {
      const dx = p.x - action.from.x
      const dy = p.y - action.from.y
      if (dx || dy) set(action.id, translate(action.start, dx, dy))
    } else if (action.kind === 'handle') {
      set(action.id, applyHandle(action.start, action.hd, p, e.altKey, action.from))
    } else {
      action.to = p
      ctx.draw()
    }
    return true
  }

  function pointerUp() {
    if (!action) return false
    if (action.kind === 'create') {
      const it = created(action.from, action.to, action.free)
      if (it) {
        const id = crypto.randomUUID()
        set(id, it)
        tool = 'select'
        renderTools()
        select(id)
      }
    }
    action = null
    ctx.draw()
    return true
  }

  /** Double-clic : sur un sommet, le retire ; sur le milieu d'un côté, y ajoute un sommet. */
  function dblclick(w) {
    if (active && tool === 'poly') return closeDraft()
    const it = active && selected && get(selected)
    if (!it?.pts) return
    const tol = 9 / ctx.zoom()
    const hd = handles(it).find((x) => Math.hypot(x.x - w.x, x.y - w.y) <= tol)
    if (hd?.k === 'vertex' && it.pts.length > 3) set(selected, { ...it, pts: it.pts.filter((_, i) => i !== hd.i) })
    if (hd?.k === 'edge') set(selected, { ...it, pts: [...it.pts.slice(0, hd.i + 1), [round(hd.x), round(hd.y)], ...it.pts.slice(hd.i + 1)] })
  }

  // ---------- Dessin des poignées et de l'aperçu ----------
  function drawOverlay(g, zoom) {
    if (!active) return
    const px = 1 / zoom
    g.save()
    const it = selected && get(selected)
    if (it) {
      g.strokeStyle = '#ff3dd8'
      g.lineWidth = 2 * px
      g.setLineDash([6 * px, 4 * px])
      if (it.kind === 'shape') g.stroke(shapePath(it))
      else if (it.kind === 'door') { g.beginPath(); g.moveTo(it.seg[0], it.seg[1]); g.lineTo(it.seg[2], it.seg[3]); g.stroke() }
      else { g.beginPath(); g.arc(it.x, it.y, CELL * 0.3, 0, Math.PI * 2); g.stroke() }
      g.setLineDash([])
      for (const hd of handles(it)) {
        if (hd.k === 'rotate') { g.beginPath(); g.moveTo(it.x, it.y); g.lineTo(hd.x, hd.y); g.stroke() }
        if (hd.k === 'edge') { // milieu de côté : petit rond
          g.fillStyle = '#38e8ff'
          g.beginPath(); g.arc(hd.x, hd.y, 3.5 * px, 0, Math.PI * 2); g.fill()
          continue
        }
        g.fillStyle = hd.k === 'vertex' ? '#eaf6ff' : '#ff3dd8'
        g.fillRect(hd.x - 4 * px, hd.y - 4 * px, 8 * px, 8 * px)
        g.strokeRect(hd.x - 4 * px, hd.y - 4 * px, 8 * px, 8 * px)
      }
    }
    if (draft?.pts.length) {
      const cur = nextPoint(draft.cursor)
      const closing = nearFirst(draft.cursor)
      g.strokeStyle = '#38e8ff'
      g.lineWidth = 2 * px
      g.beginPath()
      draft.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
      g.setLineDash([6 * px, 4 * px])
      g.beginPath(); g.moveTo(...draft.pts.at(-1)); g.lineTo(closing ? draft.pts[0][0] : cur.x, closing ? draft.pts[0][1] : cur.y); g.stroke()
      g.setLineDash([])
      for (const [x, y] of draft.pts) { g.fillStyle = '#eaf6ff'; g.fillRect(x - 3 * px, y - 3 * px, 6 * px, 6 * px) }
      // Premier point : cercle d'accroche, plus visible quand le curseur peut refermer
      g.strokeStyle = closing ? '#ff3dd8' : '#38e8ff'
      g.lineWidth = (closing ? 3 : 1.5) * px
      g.beginPath(); g.arc(draft.pts[0][0], draft.pts[0][1], 9 * px, 0, Math.PI * 2); g.stroke()
    }
    if (action?.kind === 'create') {
      const preview = created(action.from, action.to, action.free)
      if (preview) {
        g.strokeStyle = '#38e8ff'
        g.lineWidth = 2 * px
        g.setLineDash([6 * px, 4 * px])
        if (preview.kind === 'shape') g.stroke(shapePath(preview))
        else if (preview.kind === 'door') { g.beginPath(); g.moveTo(preview.seg[0], preview.seg[1]); g.lineTo(preview.seg[2], preview.seg[3]); g.stroke() }
      }
    }
    g.restore()
  }

  // ---------- Clavier ----------
  addEventListener('keydown', (e) => {
    if (!active || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return
    if (draft) { // polyligne en cours : Entrée referme, Retour arrière retire le dernier point, Échap abandonne
      if (e.key === 'Enter') closeDraft()
      else if (e.key === 'Backspace') { draft.pts.pop(); if (!draft.pts.length) draft = null; ctx.draw() }
      else if (e.key === 'Escape') { draft = null; ctx.draw() }
      else return
      e.preventDefault()
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { ctx.plan.delete(selected); select(null); e.preventDefault() }
    else if (e.key === 'Escape') { tool = 'select'; renderTools(); select(null) }
    else if (e.ctrlKey && e.key.toLowerCase() === 'z') { (e.shiftKey ? undo.redo() : undo.undo()); e.preventDefault() }
    else if (e.ctrlKey && e.key.toLowerCase() === 'y') { undo.redo(); e.preventDefault() }
  })

  return {
    get active() { return active },
    pointerDown, pointerMove, pointerUp, drawOverlay, dblclick, hover,
    setActive(on) {
      active = on
      action = null
      draft = null
      selected = null
      if (on) {
        ctx.ensureSeeded(ctx.deck())
        renderTools()
        renderProps()
        ctx.stage.append(tools, props)
      } else {
        tools.remove()
        props.remove()
      }
      ctx.draw()
    },
    /** Après un changement d'étage ou une modification du plan (même venant d'un autre joueur). */
    refresh() {
      if (!active) return
      if (selected && !get(selected)) selected = null
      renderProps()
    },
    deckChanged() {
      if (!active) return
      selected = null
      ctx.ensureSeeded(ctx.deck())
      renderProps()
    },
  }
}
