// Plan du Gaïa (onglet Vaisseau) : dessin vectoriel d'un étage, net à tous les zooms.
//
// Le plan est fait d'éléments (stockés dans le Y.Doc, carte `plan`, éditables) :
//   forme   : { deck, kind: 'shape', type, code, name, icon, radius, z, pts: [[x, y]…] | circle: { x, y, r } }
//   porte   : { deck, kind: 'door', seg: [x1, y1, x2, y2], level, defaultLevel, access (trappe technique), host, edge, t0, t1 }
//   vitre   : { deck, kind: 'window', seg, host, edge, t0, t1 }
//   Portes et vitres sont posées sur un mur de pièce : host = identifiant de la pièce, edge = n° du côté
//   (-1 pour un cercle), t0 / t1 = position le long du côté (0 → 1, ou fraction du tour pour un cercle).
//   seg n'est qu'une copie : la position réelle est recalculée depuis la pièce (resolveEntries).
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
  cold: ['Froid', 'M12 12L12 2M12 7.5L9.93 5.93M12 7.5L14.07 5.93M12 4.5L10.4 3.29M12 4.5L13.6 3.29M12 12L20.66 7M15.9 9.75L16.22 7.17M15.9 9.75L18.29 10.76M18.5 8.25L18.74 6.27M18.5 8.25L20.34 9.03M12 12L20.66 17M15.9 14.25L18.29 13.24M15.9 14.25L16.22 16.83M18.5 15.75L20.34 14.97M18.5 15.75L18.74 17.73M12 12L12 22M12 16.5L14.07 18.07M12 16.5L9.93 18.07M12 19.5L13.6 20.71M12 19.5L10.4 20.71M12 12L3.34 17M8.1 14.25L7.78 16.83M8.1 14.25L5.71 13.24M5.5 15.75L5.26 17.73M5.5 15.75L3.66 14.97M12 12L3.34 7M8.1 9.75L5.71 10.76M8.1 9.75L7.78 7.17M5.5 8.25L3.66 9.03M5.5 8.25L5.26 6.27'],
  water: ['Sanitaires', 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z'],
  fire: ['Incendie', 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 0-5 1-8z'],
  reactor: ['Réacteur', 'M2 12a10 4 0 1 0 20 0 10 4 0 1 0-20 0 M12 2a4 10 0 1 0 0 20 4 10 0 1 0 0-20 M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z'],
  thruster: ['Propulsion', 'M12 2c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11z M8 13l-3 3v3l4-2 M16 13l3 3v3l-4-2 M10 19l2 3 2-3'],
  bolt: ['Énergie', 'M13 2L4 14h7l-1 8 9-12h-7z'],
  fan: ['Ventilation', 'M12 11c0-5 2-8 5-7s1 5-4 7 M13 12c5 0 8 2 7 5s-5 1-7-4 M12 13c0 5-2 8-5 7s-1-5 4-7 M11 12c-5 0-8-2-7-5s5-1 7 4'],
  monitor: ['Contrôle', 'M3 4h18v12H3z M8 20h8 M12 16v4'],
  gear: ['Atelier / bureau de maintenance', 'M10.47 5.17L10.76 2.48L13.24 2.48L13.53 5.17A7 7 0 0 1 15.75 6.09L15.75 6.09L17.85 4.39L19.61 6.15L17.91 8.25A7 7 0 0 1 18.83 10.47L18.83 10.47L21.52 10.76L21.52 13.24L18.83 13.53A7 7 0 0 1 17.91 15.75L17.91 15.75L19.61 17.85L17.85 19.61L15.75 17.91A7 7 0 0 1 13.53 18.83L13.53 18.83L13.24 21.52L10.76 21.52L10.47 18.83A7 7 0 0 1 8.25 17.91L8.25 17.91L6.15 19.61L4.39 17.85L6.09 15.75A7 7 0 0 1 5.17 13.53L5.17 13.53L2.48 13.24L2.48 10.76L5.17 10.47A7 7 0 0 1 6.09 8.25L6.09 8.25L4.39 6.15L6.15 4.39L8.25 6.09A7 7 0 0 1 10.47 5.17ZM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'],
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
  [/générateurs/, 'bolt'], [/contrôle/, 'monitor'], [/maintenance|entretien|atelier/, 'gear'],
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

// ---------- Murs : portes et vitres accrochées aux pièces ----------

/** Segment [x1, y1, x2, y2] d'une portion de mur (corde pour un cercle). */
export function wallSeg(host, edge, t0, t1) {
  if (host.circle) {
    const { x, y, r } = host.circle
    const a0 = t0 * Math.PI * 2
    const a1 = t1 * Math.PI * 2
    return [x + r * Math.cos(a0), y + r * Math.sin(a0), x + r * Math.cos(a1), y + r * Math.sin(a1)]
  }
  const n = host.pts.length
  const [ax, ay] = host.pts[((edge % n) + n) % n]
  const [bx, by] = host.pts[(edge + 1) % n]
  return [ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1]
}

/** Position (0 → 1) du projeté d'un point sur un côté de pièce (ou sur le tour d'un cercle). */
export function wallParam(host, edge, x, y) {
  if (host.circle) {
    const a = Math.atan2(y - host.circle.y, x - host.circle.x) / (Math.PI * 2)
    return (a + 1) % 1
  }
  const n = host.pts.length
  const [ax, ay] = host.pts[edge % n]
  const [bx, by] = host.pts[(edge + 1) % n]
  const l = (bx - ax) ** 2 + (by - ay) ** 2
  return l ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l)) : 0
}

/**
 * Mur de pièce le plus proche d'un segment : { host, edge, t0, t1 } ou null (aucun mur à moins de tol).
 * shapes : [[id, forme]…] ; seules les pièces (pas la coque ni les propulseurs) portent des murs.
 */
export function attachToWall(shapes, seg, tol = CELL * 0.3) {
  const [x1, y1, x2, y2] = seg
  let best = null
  for (const [id, sh] of shapes) {
    if (sh.kind !== 'shape' || !isRoomType(sh.type)) continue
    const edges = sh.circle ? [-1] : sh.pts.map((_, i) => i)
    for (const edge of edges) {
      let t0 = wallParam(sh, edge, x1, y1)
      let t1 = wallParam(sh, edge, x2, y2)
      if (sh.circle && Math.abs(t1 - t0) > 0.5) { if (t0 < t1) t0 += 1; else t1 += 1 } // passage par l'angle 0
      if (t0 > t1) [t0, t1] = [t1, t0]
      // Écart au mur : distance des deux extrémités au côté (ou au cercle)
      const off = (x, y) => (sh.circle ? Math.abs(Math.hypot(x - sh.circle.x, y - sh.circle.y) - sh.circle.r) : distToSeg(x, y, wallSeg(sh, edge, 0, 1)))
      const d = Math.max(off(x1, y1), off(x2, y2))
      if (d <= tol && (!best || d < best.d) && Math.abs(t1 - t0) > 1e-3) best = { d, host: id, edge, t0, t1 }
    }
  }
  return best && { host: best.host, edge: best.edge, t0: best.t0, t1: best.t1 }
}

/**
 * Éléments d'un étage avec la position réelle des portes et vitres (recalculée depuis leur pièce).
 * Une porte ou une vitre dont la pièce a disparu n'est pas affichée.
 */
export function resolveEntries(entries) {
  const byId = new Map(entries)
  const out = []
  for (const [id, it] of entries) {
    if (!it.host) { out.push([id, it]); continue }
    const r = resolveItem(it, byId.get(it.host))
    if (r) out.push([id, r])
  }
  return out
}
/** Porte ou vitre placée sur le mur de sa pièce (null si la pièce ou le côté n'existe plus). */
export function resolveItem(it, host) {
  if (!host || host.kind !== 'shape' || (!host.circle && !(it.edge < host.pts.length))) return null
  return { ...it, seg: wallSeg(host, it.edge, it.t0, it.t1), ...(host.circle ? { arc: { ...host.circle, a0: it.t0, a1: it.t1 } } : {}) }
}

const seeds = new Map()
/** Éléments d'origine d'un étage : [[id, élément]…], identifiants stables (même résultat chez tous). */
export function seedItems(deckName) {
  if (seeds.has(deckName)) return seeds.get(deckName)
  const d = plan.decks.find((x) => x.name === deckName)
  const shapes = !d ? [] : d.shapes.map((s, i) => [`s:${deckName}:${i}`, { deck: deckName, kind: 'shape', icon: '', z: i, ...s }])
  // Portes d'origine accrochées au mur de pièce le plus proche (elles suivent ensuite la pièce)
  const onWall = (seg) => ({ seg, ...attachToWall(shapes, seg) })
  const list = !d ? [] : [
    ...shapes,
    ...d.doors.map((x) => [x.id, { deck: deckName, kind: 'door', ...onWall(x.seg), level: x.level, defaultLevel: x.level, access: false }]),
    ...d.access.map((seg, i) => [`a:${deckName}:${i}`, { deck: deckName, kind: 'door', ...onWall(seg), level: 'Jaune', defaultLevel: 'Jaune', access: true }]),
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
export function doorAt(entries, x, y, tolerance = CELL * 0.33, kinds = ['door']) {
  return entries.find(([, it]) => kinds.includes(it.kind) && distToSeg(x, y, it.seg) <= tolerance) ?? null
}
export function cameraAt(entries, x, y) {
  return entries.find(([, it]) => it.kind === 'camera' && Math.hypot(x - it.x, y - it.y) <= CELL * 0.3) ?? null
}

/** Nom affiché d'une forme (« numéro · nom » si le numéro est un nombre). */
export const labelOf = (it) => (/^\d/.test(it.code ?? '') ? `${it.code} · ${it.name}` : it.name || it.code || '')

/** Position du titre d'une forme : en haut, centré, plus le décalage choisi dans l'éditeur (titleDx, titleDy). */
export function titleAnchor(s) {
  const b = bbox(s)
  return { x: (b.minX + b.maxX) / 2 + (s.titleDx ?? 0), y: b.minY + (s.circle ? CELL * 1.1 : CELL * 0.5) + (s.titleDy ?? 0) }
}

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

/** Texte du titre affiché sur le plan : le numéro seul si la case « numéro seul » est cochée (nom en infobulle). */
const titleText = (s) => (s.numberOnly && s.code ? s.code : labelOf(s))

/** Largeur disponible pour le titre d'une forme. */
const titleWidth = (s) => { const b = bbox(s); return (s.circle ? (b.maxX - b.minX) * 0.7 : b.maxX - b.minX) - CELL * 0.3 }

const LINE = 1.15 // interligne des titres (× taille)

/**
 * Titre découpé en lignes qui tiennent dans la largeur de la pièce, sans couper les mots
 * (le numéro peut aller seul sur sa ligne). ok = false si un mot seul est trop large.
 */
function wrapTitle(g, s, size) {
  g.font = `600 ${size}px "Segoe UI", system-ui`
  const maxW = titleWidth(s)
  const numbered = /^\d/.test(s.code ?? '') && !s.numberOnly && s.name
  const tokens = numbered ? [`${s.code} ·`, ...s.name.split(/\s+/)] : titleText(s).split(/\s+/)
  const lines = []
  let ok = true
  for (const t of tokens) {
    const last = lines.at(-1)
    if (last !== undefined && g.measureText(`${last} ${t}`).width <= maxW) lines[lines.length - 1] = `${last} ${t}`
    else { lines.push(t); if (g.measureText(t).width > maxW) ok = false }
  }
  return { lines: lines.map((l) => l.replace(/ ·$/, '')), ok, height: lines.length * size * LINE }
}

/** Taille de titre (unités monde) la plus grande qui tienne dans la pièce (largeur, et moitié de la hauteur). */
export function autoTitleSize(g, s) {
  const b = bbox(s)
  for (let size = Math.round(CELL * 1.2); size > 6; size -= 1) {
    const w = wrapTitle(g, s, size)
    if (w.ok && w.height <= (b.maxY - b.minY) * 0.5) return size
  }
  return 6
}

/**
 * Dessine un étage. Le contexte est déjà dans le repère monde (zoom / déplacement appliqués).
 * entries : [[id, élément]…] de l'étage.
 */
export function drawPlan(g, entries, zoom, gm = false) {
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

  // Vitres : double trait bleu clair sur le mur (arc pour un dôme)
  for (const w of items.filter((it) => it.kind === 'window')) {
    g.lineCap = 'butt'
    const stroke = (width, color) => {
      g.lineWidth = width
      g.strokeStyle = color
      g.beginPath()
      if (w.arc) g.arc(w.arc.x, w.arc.y, w.arc.r, w.arc.a0 * Math.PI * 2, w.arc.a1 * Math.PI * 2)
      else { g.moveTo(w.seg[0], w.seg[1]); g.lineTo(w.seg[2], w.seg[3]) }
      g.stroke()
    }
    stroke(CELL * 0.2, '#0b1d3a')
    stroke(CELL * 0.14, '#8fe3ff')
    stroke(CELL * 0.05, '#e9fbff')
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
    // Pastille : niveau réel pour le MJ, niveau par défaut pour les joueurs
    const shown = gm ? d.level : d.defaultLevel ?? d.level
    g.fillStyle = BADGES.find((x) => x.name === shown)?.color ?? '#41c05a'
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
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    const titleY = b.minY + (s.circle ? CELL * 1.1 : CELL * 0.5)
    const full = titleText(s)
    const isNumber = /^\d/.test(s.code ?? '')
    const maxW = titleWidth(s)
    let titleShown = false
    let title = null // { lines, size }
    if (full && s.titleSize) {
      // Taille choisie dans l'éditeur : passage à la ligne entre les mots pour rester dans la largeur
      title = { lines: wrapTitle(g, s, s.titleSize).lines, size: s.titleSize }
    } else if (full && area(s) >= CELL * CELL * 3.5) {
      // Plus grande taille (≤ 0,42 case) où le titre, découpé en lignes, tient dans la pièce ;
      // sinon le numéro seul (nom en infobulle)
      const room = b.maxY - titleY + CELL * 0.25
      for (let size = Math.round(CELL * 0.42); size >= Math.round(CELL * 0.24) && !title; size -= 1) {
        const w = wrapTitle(g, s, size)
        if (w.ok && w.height <= room) title = { lines: w.lines, size }
      }
      if (!title && isNumber) {
        const size = fitFont(g, s.code, maxW, Math.round(CELL * 0.42), 6)
        if (size) title = { lines: [s.code], size }
      }
    }
    if (title) {
      g.font = `600 ${title.size}px "Segoe UI", system-ui`
      g.fillStyle = style.text
      g.globalAlpha = 0.92
      title.lines.forEach((t, i) => g.fillText(t, cx + (s.titleDx ?? 0), titleY + (s.titleDy ?? 0) + i * title.size * LINE))
      g.globalAlpha = 1
      titleShown = true
    }
    const icon = iconOf(s)
    const big = area(s) >= CELL * CELL * 3.5
    // Dômes : grand logo proportionnel au rayon
    const size = s.type === 'dome' && s.circle ? s.circle.r * 0.75 : big ? CELL * 0.8 : CELL * 0.6
    // Logo au centre, ou sous le titre s'il le chevaucherait ; masqué s'il ne tient plus dans la pièce
    const under = titleShown ? titleY + (s.titleDy ?? 0) + (title.lines.length - 1) * title.size * LINE + title.size * 0.6 + size * 0.55 : -Infinity
    const iy = Math.max(cy, under)
    if (icon && iy + size / 2 <= b.maxY - CELL * 0.05) {
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
