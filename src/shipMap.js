// Plan du Gaïa (onglet Vaisseau) : dessin vectoriel d'un étage, net à tous les zooms.
//
// Le plan est fait d'éléments (stockés dans le Y.Doc, carte `plan`, éditables) :
//   forme   : { deck, kind: 'shape', type, code, name, icon, radius, z, pts: [[x, y]…] | circle: { x, y, r } }
//   porte   : { deck, kind: 'door', seg: [x1, y1, x2, y2], level, defaultLevel, access (trappe technique) }
//   caméra  : { deck, kind: 'camera', x, y, angle (degrés) }
// Tant qu'un étage n'a jamais été modifié, on affiche sa version d'origine, générée depuis l'Excel
// par `npm run plan-vaisseau` (src/data/gaia-plan.json) : voir seedItems().
import plan from './data/gaia-plan.json'
import { BADGES } from './rules.js'

export const CELL = plan.cell
export const DECKS = plan.decks.map((d) => d.name) // du haut vers le bas : 2, 1, 0, -1

export const SHAPE_TYPES = {
  room: 'Pièce', corridor: 'Couloir', electric: 'Gaine électrique', ventilation: 'Ventilation',
  maintenance: 'Conduit technique', dome: 'Dôme de verre', hull: 'Coque', engine: 'Propulseur',
}
const STYLE = {
  room: { fill: '#14204a', text: '#eaf6ff' },
  corridor: { fill: '#0f1838', text: '#9fb3d9' },
  electric: { fill: '#4b4428', text: '#e3d39a' }, // vieux jaune pâle
  ventilation: { fill: '#3b4250', text: '#cfd6e0' }, // gris argenté
  maintenance: { fill: '#1b2236', text: '#8da0c4' },
  dome: { fill: 'rgba(110, 210, 255, 0.12)', text: '#dff6ff' }, // dômes de verre
  hull: { fill: '#0a1024', text: '#6c85b3' },
  engine: { fill: '#2a5bd7', text: '#cfe6ff' },
}
const LAYER = { engine: 0, hull: 1 } // dessinés sous les pièces, quel que soit leur ordre
const WALL = 'rgba(56, 232, 255, 0.5)'
const HULL = 'rgba(56, 232, 255, 0.65)'
export const isRoomType = (type) => !(type in LAYER)

// Icônes (traits, repère 24 × 24)
const ICONS = {
  stairs: ['Escalier', 'M3 20h5v-5h5v-5h5V5h3'],
  elevator: ['Ascenseur', 'M5 3h14v18H5z M9 10l3-3 3 3 M9 14l3 3 3-3'],
  ramp: ['Rampe', 'M3 19h18 M3 19L21 8'],
  bed: ['Quartiers', 'M2 18V7 M2 14h20v4 M22 14v-3a2 2 0 0 0-2-2H10v5 M6 11.5h.01'],
  medical: ['Médical', 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z'],
  lab: ['Laboratoire', 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3 M7 15h10'],
  plant: ['Botanique', 'M12 21v-9 M12 12c0-4 3-7 8-7 0 5-3 7-8 7z M12 15c0-3-2-5-6-5 0 4 2 5 6 5z'],
  eye: ['Observation', 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  transit: ['Transit', 'M4 8h15 M15 4l4 4-4 4 M20 16H5 M9 12l-4 4 4 4'],
  helm: ['Commandement', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 3v6 M12 15v6 M3 12h6 M15 12h6'],
  food: ['Réfectoire', 'M7 3v8 M5 3v5a2 2 0 0 0 4 0V3 M7 11v10 M17 3c-2 0-3 2-3 6h3v12'],
  kitchen: ['Cuisine', 'M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z M2 10h20 M9 7V4 M15 7V4'],
  box: ['Stockage', 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10'],
  cold: ['Froid', 'M12 2v20 M3.3 7l17.4 10 M20.7 7L3.3 17 M9 4l3 3 3-3 M9 20l3-3 3 3'],
  water: ['Sanitaires', 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z'],
  fire: ['Incendie', 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 0-5 1-8z'],
  reactor: ['Réacteur', 'M2 12a10 4 0 1 0 20 0 10 4 0 1 0-20 0 M12 2a4 10 0 1 0 0 20 4 10 0 1 0 0-20 M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z'],
  thruster: ['Propulsion', 'M12 2c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11z M8 13l-3 3v3l4-2 M16 13l3 3v3l-4-2 M10 19l2 3 2-3'],
  bolt: ['Énergie', 'M13 2L4 14h7l-1 8 9-12h-7z'],
  fan: ['Ventilation', 'M12 11c0-5 2-8 5-7s1 5-4 7 M13 12c5 0 8 2 7 5s-5 1-7-4 M12 13c0 5-2 8-5 7s-1-5 4-7 M11 12c-5 0-8-2-7-5s5-1 7 4'],
  monitor: ['Contrôle', 'M3 4h18v12H3z M8 20h8 M12 16v4'],
  wrench: ['Maintenance', 'M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2z'],
  shield: ['Sécurité', 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z'],
  shuttle: ['Hangar', 'M12 2l3 7v8l-3 3-3-3V9z M9 13l-4 4v2l4-1 M15 13l4 4v2l-4-1'],
  pulse: ['Systèmes de vie', 'M3 12h4l2-5 4 10 2-5h6'],
}
export const ICON_NAMES = Object.fromEntries(Object.entries(ICONS).map(([k, [label]]) => [k, label]))
const ICON_PATHS = Object.fromEntries(Object.entries(ICONS).map(([k, [, d]]) => [k, new Path2D(d)]))
const ICON_RULES = [
  [/escalier/, 'stairs'], [/ascenseur|monte-charge/, 'elevator'], [/rampe/, 'ramp'],
  [/quartiers/, 'bed'], [/médical|baie médicale|infirmerie/, 'medical'], [/botanique|jardin/, 'plant'],
  [/laboratoire/, 'lab'], [/observ/, 'eye'], [/transit/, 'transit'], [/commandement|manoeuvre/, 'helm'],
  [/réfectoire/, 'food'], [/cuisine/, 'kitchen'], [/réfrigér/, 'cold'], [/stockage|laverie/, 'box'],
  [/toilettes|douches/, 'water'], [/incendie/, 'fire'], [/réacteur/, 'reactor'], [/propulseur/, 'thruster'],
  [/générateurs/, 'bolt'], [/contrôle/, 'monitor'], [/maintenance|entretien|atelier/, 'wrench'],
  [/armurerie/, 'shield'], [/hangar/, 'shuttle'], [/systèmes de vie/, 'pulse'],
]
const TYPE_ICON = { electric: 'bolt', ventilation: 'fan', maintenance: 'wrench' }
/** Icône d'une forme : choisie explicitement, sinon déduite du type ou du nom ('none' = aucune). */
export function iconOf(item) {
  if (item.icon === 'none' || !isRoomType(item.type)) return null
  if (item.icon && ICONS[item.icon]) return item.icon
  return TYPE_ICON[item.type] ?? ICON_RULES.find(([re]) => re.test((item.name ?? '').toLowerCase()))?.[1] ?? null
}

// ---------- Étages d'origine (depuis l'Excel) ----------

const seeds = new Map()
/** Éléments d'origine d'un étage : [[id, élément]…], identifiants stables (même résultat chez tous). */
export function seedItems(deckName) {
  if (seeds.has(deckName)) return seeds.get(deckName)
  const d = plan.decks.find((x) => x.name === deckName)
  const list = !d ? [] : [
    ...d.shapes.map((s, i) => [`s:${deckName}:${i}`, { deck: deckName, kind: 'shape', icon: '', z: i, ...s }]),
    ...d.doors.map((x) => [x.id, { deck: deckName, kind: 'door', seg: x.seg, level: x.level, defaultLevel: x.level, access: false }]),
    ...d.access.map((seg, i) => [`a:${deckName}:${i}`, { deck: deckName, kind: 'door', seg, level: 'Jaune', defaultLevel: 'Jaune', access: true }]),
    ...d.cameras.map(([x, y], i) => [`c:${deckName}:${i}`, { deck: deckName, kind: 'camera', x, y, angle: 0 }]),
  ]
  seeds.set(deckName, list)
  return list
}

export function deckSize(deckName) {
  const d = plan.decks.find((x) => x.name === deckName)
  return d ? { width: d.width, height: d.height } : { width: 0, height: 0 }
}

// ---------- Géométrie ----------

/** Boîte englobante d'une forme. */
export function bbox(item) {
  if (item.circle) {
    const { x, y, r } = item.circle
    return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r }
  }
  const xs = item.pts.map(([x]) => x)
  const ys = item.pts.map(([, y]) => y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

const area = (item) => (item.circle
  ? Math.PI * item.circle.r ** 2
  : Math.abs(item.pts.reduce((s, [x, y], i) => { const [x2, y2] = item.pts[(i + 1) % item.pts.length]; return s + x * y2 - x2 * y }, 0)) / 2)

/** Chemin d'une forme, angles arrondis (rayon en cases, plafonné par la moitié des côtés). Mis en cache par élément. */
const paths = new WeakMap()
export function shapePath(item) {
  if (paths.has(item)) return paths.get(item)
  const p = new Path2D()
  if (item.circle) {
    p.arc(item.circle.x, item.circle.y, item.circle.r, 0, Math.PI * 2)
  } else {
    const P = item.pts
    const m = P.length
    const R = (item.radius ?? 0.3) * CELL
    const toward = (a, b, d) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      return [a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l]
    }
    for (let i = 0; i < m; i++) {
      const prev = P[(i - 1 + m) % m]
      const pt = P[i]
      const next = P[(i + 1) % m]
      const r = Math.min(R, Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) / 2, Math.hypot(next[0] - pt[0], next[1] - pt[1]) / 2)
      const a = toward(pt, prev, r)
      const b = toward(pt, next, r)
      if (i === 0) p.moveTo(...a)
      else p.lineTo(...a)
      p.quadraticCurveTo(pt[0], pt[1], b[0], b[1])
    }
    p.closePath()
  }
  paths.set(item, p)
  return p
}

/** Ordre de dessin : propulseurs, coque, puis les autres formes selon z. */
export const drawOrder = (a, b) => (LAYER[a.type] ?? 2) - (LAYER[b.type] ?? 2) || (a.z ?? 0) - (b.z ?? 0)

const inPath = (g, path, x, y) => {
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  const hit = g.isPointInPath(path, x, y)
  g.restore()
  return hit
}

/** Forme sous un point (la plus en avant), éventuellement filtrée. entries : [[id, élément]…] */
export function shapeAt(g, entries, x, y, filter = () => true) {
  const shapes = entries.filter(([, it]) => it.kind === 'shape' && filter(it)).sort(([, a], [, b]) => drawOrder(b, a))
  return shapes.find(([, it]) => inPath(g, shapePath(it), x, y)) ?? null
}

const distToSeg = (x, y, [x1, y1, x2, y2]) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l)) : 0
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy)
}
export function doorAt(entries, x, y, tolerance = CELL * 0.33) {
  return entries.find(([, it]) => it.kind === 'door' && distToSeg(x, y, it.seg) <= tolerance) ?? null
}
export function cameraAt(entries, x, y) {
  return entries.find(([, it]) => it.kind === 'camera' && Math.hypot(x - it.x, y - it.y) <= CELL * 0.3) ?? null
}

/** Nom affiché d'une forme (« numéro · nom » si le numéro est un nombre). */
export const labelOf = (it) => (/^\d/.test(it.code ?? '') ? `${it.code} · ${it.name}` : it.name || it.code || '')

/** Pièces de part et d'autre d'une porte. */
export function roomsAround(g, entries, door) {
  const [x1, y1, x2, y2] = door.seg
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const nx = (-(y2 - y1) / len) * CELL * 0.35
  const ny = ((x2 - x1) / len) * CELL * 0.35
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  return [[mx + nx, my + ny], [mx - nx, my - ny]]
    .map(([x, y]) => shapeAt(g, entries, x, y, (it) => isRoomType(it.type))?.[1])
    .filter(Boolean)
    .map(labelOf)
}

// ---------- Dessin ----------

/** Texte ajusté à une largeur (null s'il devient trop petit pour être lu). */
function fitFont(g, text, maxWidth, size, min) {
  for (let s = size; s >= min; s -= 1) {
    g.font = `600 ${s}px "Segoe UI", system-ui`
    if (g.measureText(text).width <= maxWidth) return s
  }
  return null
}

/**
 * Dessine un étage. Le contexte est déjà dans le repère monde (zoom / déplacement appliqués).
 * entries : [[id, élément]…] de l'étage.
 */
export function drawPlan(g, entries, zoom) {
  const px = 1 / zoom // un pixel écran, en unités monde
  const items = entries.map(([, it]) => it)
  const shapes = items.filter((it) => it.kind === 'shape').sort(drawOrder)

  // Fonds
  for (const s of shapes) {
    g.fillStyle = STYLE[s.type]?.fill ?? STYLE.room.fill
    if (s.type === 'engine') { g.shadowColor = '#3f7bff'; g.shadowBlur = 18 }
    g.fill(shapePath(s))
    g.shadowBlur = 0
  }
  // Murs (pièces), puis contour lumineux de la coque et des dômes
  g.lineJoin = 'round'
  g.strokeStyle = WALL
  g.lineWidth = CELL * 0.07
  for (const s of shapes) if (isRoomType(s.type) && s.type !== 'dome') g.stroke(shapePath(s))
  for (const s of shapes.filter((x) => x.type === 'hull')) {
    g.strokeStyle = HULL
    g.lineWidth = CELL * 0.14
    g.shadowColor = 'rgba(56, 232, 255, 0.35)'
    g.shadowBlur = 10
    g.stroke(shapePath(s))
    g.shadowBlur = 0
  }
  for (const s of shapes.filter((x) => x.type === 'dome')) {
    const b = bbox(s)
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    const r = Math.min(b.maxX - b.minX, b.maxY - b.minY) / 2
    g.strokeStyle = 'rgba(160, 230, 255, 0.75)'
    g.lineWidth = CELL * 0.1
    g.shadowColor = 'rgba(110, 210, 255, 0.6)'
    g.shadowBlur = 16
    g.stroke(shapePath(s))
    g.shadowBlur = 0
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)'
    g.lineWidth = CELL * 0.18
    g.lineCap = 'round'
    g.beginPath(); g.arc(cx, cy, r * 0.82, Math.PI * 1.1, Math.PI * 1.45); g.stroke()
  }

  // Trappes techniques (pointillés jaunes) et portes (ouverture, battant rouge, pastille du badge requis)
  for (const d of items.filter((it) => it.kind === 'door')) {
    const [x1, y1, x2, y2] = d.seg
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const ix = ((x2 - x1) / len) * Math.min(CELL * 0.12, len / 4)
    const iy = ((y2 - y1) / len) * Math.min(CELL * 0.12, len / 4)
    const a = [x1 + ix, y1 + iy]
    const b = [x2 - ix, y2 - iy]
    g.lineCap = 'butt'
    if (d.access) {
      g.setLineDash([CELL * 0.16, CELL * 0.1])
      g.strokeStyle = '#e3d39a'
      g.lineWidth = CELL * 0.1
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
      g.setLineDash([])
    } else {
      g.lineWidth = CELL * 0.22
      g.strokeStyle = STYLE.room.fill
      g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke()
      g.lineWidth = CELL * 0.1
      g.strokeStyle = '#ff5a6a'
      g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke()
    }
    g.fillStyle = BADGES.find((x) => x.name === d.level)?.color ?? '#41c05a'
    g.strokeStyle = 'rgba(234, 246, 255, 0.8)' // anneau clair : lisible même pour les badges sombres
    g.lineWidth = CELL * 0.035
    g.beginPath(); g.arc((x1 + x2) / 2, (y1 + y2) / 2, CELL * 0.13, 0, Math.PI * 2); g.fill(); g.stroke()
  }

  // Caméras : boîtier et champ de vision orienté
  for (const c of items.filter((it) => it.kind === 'camera')) {
    const t = ((c.angle ?? 0) * Math.PI) / 180
    const spread = 0.55
    const reach = CELL * 0.75
    g.fillStyle = 'rgba(255, 138, 42, 0.28)'
    g.beginPath(); g.moveTo(c.x, c.y); g.arc(c.x, c.y, reach, t - spread, t + spread); g.closePath(); g.fill()
    g.fillStyle = '#ff8a2a'
    g.beginPath(); g.arc(c.x, c.y, CELL * 0.18, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#05070f'
    g.beginPath(); g.arc(c.x + Math.cos(t) * CELL * 0.07, c.y + Math.sin(t) * CELL * 0.07, CELL * 0.07, 0, Math.PI * 2); g.fill()
  }

  // Titres (« numéro · nom » en haut de la pièce) et icônes
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const s of shapes.filter((x) => isRoomType(x.type))) {
    const style = STYLE[s.type] ?? STYLE.room
    const b = bbox(s)
    const w = b.maxX - b.minX
    const hgt = b.maxY - b.minY
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    const rows = hgt / CELL
    const titleY = b.minY + (s.circle ? CELL * 1.1 : CELL * 0.5)
    const full = labelOf(s)
    const isNumber = /^\d/.test(s.code ?? '')
    const maxW = (s.circle ? w * 0.7 : w) - CELL * 0.3
    let titleShown = false
    if (full && area(s) >= CELL * CELL * 3.5) {
      // Nom complet sur une ligne, sinon sur deux (pièce assez haute), sinon le numéro seul (nom en infobulle)
      const words = full.split(' ')
      const half = Math.ceil(words.length / 2)
      const twoLines = rows >= 3 && words.length > 2 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : null
      const options = [[full], twoLines, isNumber && [s.code]].filter(Boolean)
      const min = Math.round(CELL * 0.24)
      const lines = options.find((ls) => ls.every((t) => fitFont(g, t, maxW, Math.round(CELL * 0.42), ls[0] === s.code ? 6 : min)))
      if (lines) {
        const longest = lines.reduce((a, c) => (c.length > a.length ? c : a))
        fitFont(g, longest, maxW, Math.round(CELL * 0.42), 6)
        g.fillStyle = style.text
        g.globalAlpha = 0.92
        lines.forEach((t, i) => g.fillText(t, cx, titleY + i * CELL * 0.45))
        g.globalAlpha = 1
        titleShown = true
      }
    }
    const icon = iconOf(s)
    if (icon) {
      const big = area(s) >= CELL * CELL * 3.5
      const size = big ? CELL * 0.8 : CELL * 0.6
      const iy = titleShown && rows >= 3 ? Math.max(cy, titleY + CELL) : cy
      g.save()
      g.translate(cx - size / 2, iy - size / 2)
      g.scale(size / 24, size / 24)
      g.strokeStyle = style.text
      g.globalAlpha = s.type === 'room' ? 0.55 : 0.7
      g.lineWidth = Math.max(1.6, ((px * 24) / size) * 1.4)
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.stroke(ICON_PATHS[icon])
      g.restore()
    }
  }
}
