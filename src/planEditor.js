import * as Y from 'yjs'
import { h, liveRender } from './dom.js'
import { DOOR_LEVELS } from './rules.js'
import {
  CELL, DECKS, SHAPE_TYPES, ICON_NAMES, bbox, shapeAt, doorAt, cameraAt, shapePath, isRoomType, titleAnchor, autoTitleSize,
  attachToWall, resolveItem, wallParam, wallSeg,
} from './shipMap.js'

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
  ['door', '⊟', 'Porte : glisser le long du mur d’une pièce (elle y reste accrochée)'],
  ['window', '▤', 'Vitre : glisser le long du mur d’une pièce (elle y reste accrochée)'],
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

const LINKED = new Set(['hull', 'engine']) // même nom = même objet sur tous les étages
const onWall = (it) => it.kind === 'door' || it.kind === 'window'
/** Coque verrouillée par défaut : un glisser dessus déplace la vue, pas la coque. */
const isLocked = (it) => it?.kind === 'shape' && (it.locked ?? it.type === 'hull')
const geomOf = (it) => (it.circle ? { circle: it.circle } : { pts: it.pts })
const centerOf = (it) => { const b = bbox(it); return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] }
/** Valeur v (ou v ± 1) la plus proche de ref : position sur un cercle, qui boucle. */
const nearTurn = (v, ref) => [v - 1, v, v + 1].reduce((a, b) => (Math.abs(b - ref) < Math.abs(a - ref) ? b : a))

function translate(it, dx, dy) {
  if (onWall(it)) { const [a, b, c, d] = it.seg; return { ...it, seg: [a + dx, b + dy, c + dx, d + dy].map(round) } }
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
  let selected = null // élément principal (panneau de propriétés)
  let group = new Set() // tous les éléments sélectionnés (Ctrl+clic pour en ajouter / retirer)
  const multi = () => group.size > 1
  const groupItems = () => [...group].map((id) => [id, get(id)]).filter(([, it]) => it)
  let action = null // glisser en cours : move | handle | create
  const undo = new Y.UndoManager(ctx.plan, { captureTimeout: 400 }) // le chargement initial (origine 'seed') n'est pas annulable

  const raw = (id) => ctx.plan.get(id)
  /** Élément ; portes et vitres avec leur position réelle sur le mur de leur pièce. */
  const get = (id) => { const it = raw(id); return (it?.host && resolveItem(it, raw(it.host))) || it }
  const hostedBy = (hostId) => [...ctx.plan.entries()].filter(([, x]) => x.host === hostId)

  /**
   * Écrit un élément. Pour une forme dont la géométrie change :
   * - ses portes / vitres sont raccrochées au côté le plus proche si le nombre de côtés change ;
   * - coque et propulseurs : la même géométrie va aux objets de même type et de même nom des autres étages.
   */
  function set(id, { arc, ...it }) {
    const old = raw(id)
    ctx.plan.set(id, it)
    if (it.kind !== 'shape' || old?.kind !== 'shape') return
    if (JSON.stringify(geomOf(old)) === JSON.stringify(geomOf(it)) && old.radius === it.radius) return
    if (!!old.circle !== !!it.circle || (old.pts && it.pts && old.pts.length !== it.pts.length)) {
      for (const [cid, c] of hostedBy(id)) {
        const seg = resolveItem(c, old)?.seg ?? c.seg
        const at = seg && attachToWall([[id, it]], seg, Infinity)
        if (at) ctx.plan.set(cid, { ...c, ...at, seg })
        else ctx.plan.delete(cid)
      }
    }
    if (LINKED.has(it.type) && it.name) {
      const [ox, oy] = centerOf(old)
      for (const d of DECKS.filter((x) => x !== it.deck)) {
        ctx.ensureSeeded(d)
        const twin = [...ctx.plan.entries()]
          .filter(([, x]) => x.deck === d && x.kind === 'shape' && x.type === it.type && x.name === it.name)
          .map(([tid, x]) => [tid, x, Math.hypot(centerOf(x)[0] - ox, centerOf(x)[1] - oy)])
          .sort((a, b) => a[2] - b[2])[0]
        if (twin) {
          const { pts, circle, ...rest } = twin[1]
          ctx.plan.set(twin[0], { ...rest, ...geomOf(it), radius: it.radius })
        }
      }
    }
  }
  /** Supprime un élément et, pour une pièce, les portes et vitres de ses murs. */
  function del(id) {
    ctx.plan.delete(id)
    for (const [cid] of hostedBy(id)) ctx.plan.delete(cid)
  }
  /** Raccroche aux murs les portes d'un étage copié avant que les portes ne suivent leurs pièces. */
  function attachLoose() {
    const entries = [...ctx.plan.entries()].filter(([, x]) => x.deck === ctx.deck())
    const loose = entries.filter(([, x]) => onWall(x) && !x.host)
    if (!loose.length) return
    ctx.doc.transact(() => loose.forEach(([id, x]) => {
      const at = attachToWall(entries, x.seg)
      if (at) ctx.plan.set(id, { ...x, ...at })
    }), 'seed') // origine 'seed' : pas dans l'historique d'annulation
  }
  const shapesZ = () => ctx.entries().filter(([, it]) => it.kind === 'shape').map(([, it]) => it.z ?? 0)

  // ---------- Copier / coller (entre étages) ----------
  let clipboard = [] // éléments copiés (Ctrl+C)

  /**
   * Copie un élément sur un étage (même position, au premier plan) et renvoie son nouvel identifiant.
   * Porte / vitre : sur la copie de sa pièce si elle est copiée aussi (idMap), sinon sur le mur le plus proche
   * de l'étage cible (pas de copie s'il n'y a pas de mur à cet endroit).
   */
  function copyTo(it, deck, idMap = new Map(), oldId = null) {
    if (!it) return null
    ctx.ensureSeeded(deck)
    let wall = {}
    if (it.host) {
      const host = idMap.get(it.host) ?? (deck === it.deck ? it.host : null)
      wall = host ? { host } : attachToWall([...ctx.plan.entries()].filter(([, x]) => x.deck === deck), it.seg)
      if (!wall) return null
    }
    const zs = [...ctx.plan.values()].filter((x) => x.deck === deck && x.kind === 'shape').map((x) => x.z ?? 0)
    const id = crypto.randomUUID()
    if (oldId) idMap.set(oldId, id)
    set(id, { ...it, ...wall, deck, ...(it.kind === 'shape' ? { z: Math.max(0, ...zs) + 1 } : {}) })
    return id
  }
  /** Copie plusieurs éléments [[id, élément]…] : les pièces d'abord, pour y raccrocher leurs portes et vitres. */
  function copyAll(pairs, deck) {
    const idMap = new Map()
    return [...pairs].sort(([, a], [, b]) => !!a.host - !!b.host).map(([oid, it]) => copyTo(it, deck, idMap, oid)).filter(Boolean)
  }
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
        }, 'Réinitialiser l’étage'),
        h('button', {
          class: 'small', title: 'Cale tous les points de l’étage sur la grille d’aimantation (bords qui ne se superposent pas)',
          onclick: () => ctx.doc.transact(() => ctx.entries().forEach(([id, it]) => {
            const s = (v) => Math.round(v / SNAP) * SNAP
            if (it.kind === 'door') set(id, { ...it, seg: it.seg.map(s) })
            else if (it.kind === 'camera') set(id, { ...it, x: s(it.x), y: s(it.y) })
            else if (it.circle) set(id, { ...it, circle: { x: s(it.circle.x), y: s(it.circle.y), r: Math.max(SNAP, s(it.circle.r)) } })
            else if (it.pts) set(id, { ...it, pts: it.pts.map(([x, y]) => [s(x), s(y)]) })
          })),
        }, 'Aligner l’étage sur la grille')),
      h('p', { class: 'hint' }, 'Alt : sans aimantation · Flèches : déplacer d’un cran (Maj : une case) · Suppr : effacer · Ctrl+clic : sélection multiple · Ctrl+C / Ctrl+V : copier, y compris vers un autre étage · Échap : désélectionner · molette / clic milieu : vue'),
    )
  }

  function field(label, input) { return h('label', { class: 'field' }, h('span', {}, label), input) }

  function removeGroup() {
    ctx.doc.transact(() => group.forEach((id) => del(id)))
    select(null)
  }

  function buildProps() {
    if (multi()) {
      const target = h('select', {}, DECKS.filter((d) => d !== ctx.deck()).map((d) => h('option', { value: d }, `Étage ${d.replace('-', '−')}`)))
      add(props,
        h('h4', {}, `${group.size} éléments sélectionnés`),
        h('p', { class: 'hint' }, 'Glisser l’un d’eux ou utiliser les flèches pour tout déplacer ; tirer un coin du cadre pour tout redimensionner (Maj : proportions gardées). Ctrl+clic pour ajouter ou retirer un élément.'),
        h('div', { class: 'tool-row' }, target,
          h('button', { class: 'small', title: 'Copier la sélection sur l’étage choisi, au même endroit', onclick: () => copyAll(groupItems(), target.value) }, 'Copier vers')),
        h('button', { class: 'small danger', onclick: removeGroup }, 'Supprimer la sélection'))
      return
    }
    const it = selected && get(selected)
    if (!it) {
      add(props, h('h4', {}, 'Plan'), h('p', { class: 'muted' }, 'Choisis un outil pour dessiner, ou clique sur une pièce, une porte ou une caméra pour la modifier.'))
      return
    }
    const patch = (changes) => set(selected, { ...get(selected), ...changes })
    const remove = h('button', { class: 'small danger', onclick: () => { ctx.doc.transact(() => del(selected)); select(null) } }, 'Supprimer')
    // Copier vers un autre étage (même position)
    const target = h('select', {}, DECKS.filter((d) => d !== ctx.deck()).map((d) => h('option', { value: d }, `Étage ${d.replace('-', '−')}`)))
    const copyRow = h('div', { class: 'tool-row' }, target,
      h('button', { class: 'small', title: 'Copier cet élément sur l’étage choisi, au même endroit', onclick: () => copyTo(get(selected), target.value) }, 'Copier vers'))

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
        it.type === 'hull' && h('label', { class: 'check', title: 'Verrouillée : un glisser sur la coque déplace la vue au lieu de la coque' },
          h('input', { type: 'checkbox', checked: isLocked(it), onchange: (e) => patch({ locked: e.target.checked }) }),
          ' Verrouillée (ne bouge pas)'),
        LINKED.has(it.type) && h('p', { class: 'hint' }, 'Liée aux objets de même type et de même nom des autres étages : ses modifications s’y appliquent aussi.'),
        isRoomType(it.type) && it.code && h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: !!it.numberOnly, onchange: (e) => patch({ numberOnly: e.target.checked }) }),
          ' Numéro seul (sans le nom)'),
        isRoomType(it.type) && field('Taille du nom (vide = automatique)', h('div', { class: 'tool-row' },
          h('input', {
            type: 'number', min: 4, max: 120, step: 1, value: it.titleSize ?? '', placeholder: 'auto',
            onchange: (e) => patch({ titleSize: Number(e.target.value) || null }),
          }),
          h('button', {
            class: 'small', title: 'Plus grande taille qui fait tenir le nom sur une ligne dans la largeur de la pièce',
            onclick: () => patch({ titleSize: autoTitleSize(ctx.g, it) }),
          }, 'Ajuster à la pièce'))),
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
          }, 'Dupliquer'),
          (it.titleDx || it.titleDy) && h('button', { class: 'small', title: 'Remettre le titre en haut, au centre', onclick: () => patch({ titleDx: 0, titleDy: 0 }) }, 'Recentrer le titre')),
        h('p', { class: 'hint' }, 'Le losange jaune déplace le titre.'),
        copyRow, remove)
    } else if (it.kind === 'door') {
      const levels = (value, key) => h('select', { onchange: (e) => patch({ [key]: e.target.value }) },
        DOOR_LEVELS.map((l) => h('option', { value: l, selected: l === value }, `Badge ${l}`)))
      add(props,
        h('h4', {}, it.access ? 'Trappe technique' : 'Porte'),
        field('Accréditation requise', levels(it.level, 'level')),
        field('Niveau par défaut (commande « toutes les portes »)', levels(it.defaultLevel ?? it.level, 'defaultLevel')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!it.access, onchange: (e) => patch({ access: e.target.checked }) }),
          'Trappe technique (pointillés)'),
        copyRow, remove)
    } else if (it.kind === 'window') {
      add(props,
        h('h4', {}, 'Vitre'),
        h('p', { class: 'hint' }, 'Accrochée au mur de sa pièce, elle la suit. Glisser pour la faire coulisser, tirer ses extrémités pour l’allonger.'),
        copyRow, remove)
    } else if (it.kind === 'camera') {
      add(props,
        h('h4', {}, 'Caméra de surveillance'),
        field(`Orientation (${Math.round(it.angle ?? 0)}°)`, h('input', {
          type: 'range', min: 0, max: 359, step: 1, value: Math.round(((it.angle ?? 0) % 360 + 360) % 360),
          oninput: (e) => patch({ angle: Number(e.target.value) }),
        })),
        copyRow, remove)
    }
  }

  /** Sélectionne un élément ; additive (Ctrl+clic) : l'ajoute au groupe, ou l'en retire s'il y est déjà. */
  function select(id, additive = false) {
    if (additive && id) {
      if (group.has(id)) group.delete(id)
      else group.add(id)
      selected = group.has(id) ? id : [...group].at(-1) ?? null
    } else {
      group = new Set(id ? [id] : [])
      selected = id
    }
    renderProps()
    ctx.draw()
  }
  /** Sélectionne plusieurs éléments d'un coup (collage). */
  function selectAll(ids) {
    group = new Set(ids)
    selected = ids.at(-1) ?? null
    renderProps()
    ctx.draw()
  }

  // ---------- Groupe : cadre englobant et mise à l'échelle ----------
  function itemBox(it) {
    if (onWall(it)) { const [x1, y1, x2, y2] = it.seg; return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) } }
    if (it.kind === 'camera') return { minX: it.x - CELL * 0.3, minY: it.y - CELL * 0.3, maxX: it.x + CELL * 0.3, maxY: it.y + CELL * 0.3 }
    return bbox(it)
  }
  function groupBox(items) {
    const boxes = items.map(([, it]) => itemBox(it))
    return {
      minX: Math.min(...boxes.map((b) => b.minX)), minY: Math.min(...boxes.map((b) => b.minY)),
      maxX: Math.max(...boxes.map((b) => b.maxX)), maxY: Math.max(...boxes.map((b) => b.maxY)),
    }
  }
  /** Coins du cadre du groupe ; o = coin opposé (point fixe de la mise à l'échelle). */
  function groupCorners() {
    const b = groupBox(groupItems())
    return [[b.minX, b.minY, b.maxX, b.maxY], [b.maxX, b.minY, b.minX, b.maxY], [b.maxX, b.maxY, b.minX, b.minY], [b.minX, b.maxY, b.maxX, b.minY]]
      .map(([x, y, ox, oy]) => ({ k: 'gcorner', x, y, o: { x: ox, y: oy } }))
  }
  /** Met un élément à l'échelle depuis le point o ; les points sont recalés sur la grille (sauf free). */
  function scaleItem(it, o, sx, sy, free) {
    const q = (v) => (free ? round(v) : Math.round(v / SNAP) * SNAP)
    const f = (x, y) => [q(o.x + (x - o.x) * sx), q(o.y + (y - o.y) * sy)]
    if (it.kind === 'door') { const [x1, y1, x2, y2] = it.seg; return { ...it, seg: [...f(x1, y1), ...f(x2, y2)] } }
    if (it.kind === 'camera') { const [x, y] = f(it.x, it.y); return { ...it, x, y } }
    const title = { titleDx: round((it.titleDx ?? 0) * sx), titleDy: round((it.titleDy ?? 0) * sy) }
    if (it.circle) {
      const [x, y] = f(it.circle.x, it.circle.y)
      return { ...it, ...title, circle: { x, y, r: Math.max(SNAP, q(it.circle.r * Math.sqrt(sx * sy))) } }
    }
    return { ...it, ...title, pts: it.pts.map(([x, y]) => f(x, y)) }
  }

  // ---------- Poignées ----------
  function handles(it) {
    if (onWall(it)) return [{ k: 'end', i: 0, x: it.seg[0], y: it.seg[1] }, { k: 'end', i: 1, x: it.seg[2], y: it.seg[3] }]
    if (it.kind === 'camera') {
      const t = ((it.angle ?? 0) * Math.PI) / 180
      return [{ k: 'rotate', x: it.x + Math.cos(t) * CELL * 0.9, y: it.y + Math.sin(t) * CELL * 0.9 }]
    }
    // Poignée du titre en premier : prioritaire si elle recouvre un sommet
    const title = isRoomType(it.type) ? [{ k: 'title', ...titleAnchor(it) }] : []
    if (it.circle) return [...title, { k: 'radius', x: it.circle.x + it.circle.r, y: it.circle.y }]
    return [
      ...title,
      ...it.pts.map(([x, y], i) => ({ k: 'vertex', i, x, y })),
      ...it.pts.map(([x, y], i) => { const [x2, y2] = it.pts[(i + 1) % it.pts.length]; return { k: 'edge', i, x: (x + x2) / 2, y: (y + y2) / 2 } }),
    ]
  }

  /** it : l'élément au début du glisser ; from : point de départ du glisser. */
  function applyHandle(it, hd, p, free, from) {
    if (hd.k === 'title') return { ...it, titleDx: round((it.titleDx ?? 0) + p.x - from.x), titleDy: round((it.titleDy ?? 0) + p.y - from.y) }
    if (hd.k === 'vertex') return { ...it, pts: moveVertex(it.pts, hd.i, p, ortho) }
    if (hd.k === 'edge') return { ...it, pts: moveEdge(it.pts, hd.i, p.x - from.x, p.y - from.y, ortho) }
    if (hd.k === 'radius') return { ...it, circle: { ...it.circle, r: round(Math.max(CELL * 0.3, Math.hypot(p.x - it.circle.x, p.y - it.circle.y))) } }
    if (hd.k === 'rotate') {
      let a = (Math.atan2(p.y - it.y, p.x - it.x) * 180) / Math.PI
      if (!free) a = Math.round(a / 15) * 15
      return { ...it, angle: Math.round(a) }
    }
    // extrémité de porte / vitre accrochée : glisse le long de son mur
    if (it.host) {
      const host = raw(it.host)
      if (!host) return it
      let t = wallParam(host, it.edge, p.x, p.y)
      if (host.circle) t = nearTurn(t, hd.i ? it.t1 : it.t0)
      const [t0, t1] = hd.i ? [it.t0, t] : [t, it.t1]
      if (Math.abs(t1 - t0) < 0.02) return it
      return { ...it, t0: Math.min(t0, t1), t1: Math.max(t0, t1) }
    }
    // extrémité de porte libre (ancien format)
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
    if (tool === 'door' || tool === 'window') {
      // Toujours sur le mur d'une pièce : pas de porte ni de vitre dans le vide
      const at = attachToWall(ctx.entries(), [from.x, from.y, to.x, to.y], CELL * 0.5)
      const host = at && new Map(ctx.entries()).get(at.host)
      if (!host) return null
      const seg = wallSeg(host, at.edge, at.t0, at.t1)
      if (Math.hypot(seg[2] - seg[0], seg[3] - seg[1]) < CELL * 0.3) return null
      const wall = { deck, ...at, seg }
      return tool === 'window' ? { ...wall, kind: 'window' } : { ...wall, kind: 'door', level: 'Vert', defaultLevel: 'Vert', access: false }
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
    const near = (hd) => Math.hypot(hd.x - w.x, hd.y - w.y) <= tol
    // Ce que bougent un glisser, un redimensionnement ou les flèches : ni la coque verrouillée,
    // ni les portes / vitres accrochées (elles suivent leur pièce)
    const movable = () => groupItems().filter(([, it]) => !it.host && !isLocked(it))
    if (multi() && !e.ctrlKey) {
      const corner = groupCorners().find(near)
      if (corner) {
        action = { kind: 'gscale', corner, starts: movable(), from: p }
        return true
      }
    }
    const sel = !multi() && selected && get(selected)
    const hd = sel && !isLocked(sel) && handles(sel).find(near)
    if (hd) {
      action = { kind: 'handle', id: selected, hd, start: sel, from: p }
      return true
    }
    const entries = ctx.entries()
    const hit = doorAt(entries, w.x, w.y, Math.max(tol, CELL * 0.2), ['door', 'window']) ?? cameraAt(entries, w.x, w.y) ?? shapeAt(ctx.g, entries, w.x, w.y)
    if (e.ctrlKey) { // Ctrl+clic : ajoute / retire du groupe, sans déplacer
      if (hit) select(hit[0], true)
      return !!hit
    }
    if (!hit) { select(null); return false } // clic dans le vide : la vue se déplace
    if (isLocked(hit[1])) { select(hit[0]); return false } // coque verrouillée : sélectionnée, mais la vue se déplace
    if (!group.has(hit[0])) select(hit[0])
    const one = !multi() && get(hit[0])
    if (one?.host) { action = { kind: 'slide', id: hit[0], start: one, from: p }; return true } // coulisse le long du mur
    action = { kind: 'move', from: p, starts: movable() } // déplace tout le groupe
    return true
  }

  function pointerMove(w, e) {
    if (!action) return false
    const p = snap(w, e.altKey)
    if (action.kind === 'move') {
      const dx = p.x - action.from.x
      const dy = p.y - action.from.y
      if (dx || dy) ctx.doc.transact(() => action.starts.forEach(([id, it]) => set(id, translate(it, dx, dy))))
    } else if (action.kind === 'gscale') {
      const { corner: c, starts } = action
      const o = c.o
      const ratio = (v, a, b) => (Math.abs(b - a) < 1 ? 1 : Math.max(0.05, (v - a) / (b - a)))
      let sx = ratio(p.x, o.x, c.x)
      let sy = ratio(p.y, o.y, c.y)
      if (e.shiftKey) sx = sy = Math.max(sx, sy) // Maj : garde les proportions
      ctx.doc.transact(() => starts.forEach(([id, it]) => set(id, scaleItem(it, o, sx, sy, e.altKey))))
    } else if (action.kind === 'slide') {
      const { start, from } = action
      const host = raw(start.host)
      if (host) {
        const t = (q) => wallParam(host, start.edge, q.x, q.y)
        let dt = t(p) - t(from)
        if (host.circle) dt = nearTurn(dt, 0)
        const len = start.t1 - start.t0
        const t0 = host.circle ? start.t0 + dt : Math.max(0, Math.min(1 - len, start.t0 + dt))
        set(action.id, { ...start, t0, t1: t0 + len })
      }
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
    // Grille d'aimantation (1/4 de case) et de cases, sur la zone visible
    {
      const inv = g.getTransform().inverse()
      const a = inv.transformPoint(new DOMPoint(0, 0))
      const b = inv.transformPoint(new DOMPoint(g.canvas.width, g.canvas.height))
      const lines = (step, color) => {
        g.strokeStyle = color
        g.lineWidth = px
        g.beginPath()
        for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) { g.moveTo(x, a.y); g.lineTo(x, b.y) }
        for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) { g.moveTo(a.x, y); g.lineTo(b.x, y) }
        g.stroke()
      }
      if (SNAP * zoom >= 6) lines(SNAP, 'rgba(56, 232, 255, 0.07)')
      if (CELL * zoom >= 6) lines(CELL, 'rgba(56, 232, 255, 0.16)')
    }
    g.save()
    // Contour de chaque élément sélectionné
    g.strokeStyle = '#ff3dd8'
    g.lineWidth = 2 * px
    g.setLineDash([6 * px, 4 * px])
    for (const [, x] of groupItems()) {
      if (x.kind === 'shape') g.stroke(shapePath(x))
      else if (onWall(x)) { g.beginPath(); g.moveTo(x.seg[0], x.seg[1]); g.lineTo(x.seg[2], x.seg[3]); g.stroke() }
      else { g.beginPath(); g.arc(x.x, x.y, CELL * 0.3, 0, Math.PI * 2); g.stroke() }
    }
    g.setLineDash([])
    if (multi()) { // cadre du groupe et ses coins
      const b = groupBox(groupItems())
      g.strokeStyle = '#38e8ff'
      g.setLineDash([4 * px, 4 * px])
      g.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
      g.setLineDash([])
      g.fillStyle = '#38e8ff'
      for (const c of groupCorners()) g.fillRect(c.x - 5 * px, c.y - 5 * px, 10 * px, 10 * px)
      g.strokeStyle = '#ff3dd8'
    }
    const it = !multi() && selected && get(selected)
    if (it) {
      for (const hd of handles(it)) {
        if (hd.k === 'rotate') { g.beginPath(); g.moveTo(it.x, it.y); g.lineTo(hd.x, hd.y); g.stroke() }
        if (hd.k === 'title') { // titre : losange jaune
          g.fillStyle = '#ffd84a'
          g.beginPath(); g.moveTo(hd.x, hd.y - 6 * px); g.lineTo(hd.x + 6 * px, hd.y); g.lineTo(hd.x, hd.y + 6 * px); g.lineTo(hd.x - 6 * px, hd.y); g.closePath()
          g.fill(); g.stroke()
          continue
        }
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
        else if (onWall(preview)) { g.beginPath(); g.moveTo(preview.seg[0], preview.seg[1]); g.lineTo(preview.seg[2], preview.seg[3]); g.stroke() }
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
    // Flèches : déplace la sélection d'un cran (aimantation) ; Maj = une case, Alt = 1 px
    const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (ARROWS[e.key] && group.size) {
      const step = e.shiftKey ? CELL : e.altKey ? 1 : SNAP
      const [dx, dy] = ARROWS[e.key]
      ctx.doc.transact(() => groupItems().filter(([, it]) => !it.host && !isLocked(it)).forEach(([id, it]) => set(id, translate(it, dx * step, dy * step))))
      e.preventDefault()
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && group.size) { removeGroup(); e.preventDefault() }
    else if (e.key === 'Escape') { tool = 'select'; renderTools(); select(null) }
    else if (e.ctrlKey && e.key.toLowerCase() === 'z') { (e.shiftKey ? undo.redo() : undo.undo()); e.preventDefault() }
    else if (e.ctrlKey && e.key.toLowerCase() === 'y') { undo.redo(); e.preventDefault() }
    else if (e.ctrlKey && e.key.toLowerCase() === 'c' && group.size) clipboard = groupItems()
    else if (e.ctrlKey && e.key.toLowerCase() === 'v' && clipboard.length) { selectAll(copyAll(clipboard, ctx.deck())); e.preventDefault() }
  })

  return {
    get active() { return active },
    pointerDown, pointerMove, pointerUp, drawOverlay, dblclick, hover,
    setActive(on) {
      active = on
      action = null
      draft = null
      selected = null
      group = new Set()
      if (on) {
        // Tous les étages copiés d'emblée (hors annulation) : la liaison coque / propulseurs écrit sur les autres étages
        DECKS.forEach((d) => ctx.ensureSeeded(d))
        attachLoose()
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
      group = new Set([...group].filter((id) => get(id)))
      if (selected && !get(selected)) selected = [...group].at(-1) ?? null
      renderProps()
    },
    deckChanged() {
      if (!active) return
      selected = null
      group = new Set()
      ctx.ensureSeeded(ctx.deck())
      attachLoose()
      renderProps()
    },
  }
}
