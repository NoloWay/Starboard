// Plan du Gaïa (onglet Vaisseau) : dessin vectoriel d'un étage sur le canvas, net à tous les zooms.
// Données générées par `npm run plan-vaisseau` (scripts/plan-vaisseau.mjs) depuis l'Excel de gestion.
import plan from './data/gaia-plan.json'

export const CELL = plan.cell
export const DECKS = plan.decks.map((d) => d.name) // du haut vers le bas : 1, 0, -1

// Couleurs par type de zone
const STYLE = {
  room: { fill: '#14204a', text: '#eaf6ff' },
  corridor: { fill: '#0f1838', text: '#9fb3d9' },
  electric: { fill: '#4b4428', text: '#e3d39a' }, // vieux jaune pâle
  ventilation: { fill: '#3b4250', text: '#cfd6e0' }, // gris argenté
  maintenance: { fill: '#1b2236', text: '#8da0c4' },
}
const WALL = 'rgba(56, 232, 255, 0.5)'
const HULL = 'rgba(56, 232, 255, 0.65)'

// Icônes (traits, repère 24 × 24), choisies d'après le nom de la pièce
const ICONS = {
  stairs: 'M3 20h5v-5h5v-5h5V5h3',
  elevator: 'M5 3h14v18H5z M9 10l3-3 3 3 M9 14l3 3 3-3',
  ramp: 'M3 19h18 M3 19L21 8',
  bed: 'M2 18V7 M2 14h20v4 M22 14v-3a2 2 0 0 0-2-2H10v5 M6 11.5h.01',
  medical: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  lab: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3 M7 15h10',
  plant: 'M12 21v-9 M12 12c0-4 3-7 8-7 0 5-3 7-8 7z M12 15c0-3-2-5-6-5 0 4 2 5 6 5z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  transit: 'M4 8h15 M15 4l4 4-4 4 M20 16H5 M9 12l-4 4 4 4',
  helm: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 3v6 M12 15v6 M3 12h6 M15 12h6',
  food: 'M7 3v8 M5 3v5a2 2 0 0 0 4 0V3 M7 11v10 M17 3c-2 0-3 2-3 6h3v12',
  kitchen: 'M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z M2 10h20 M9 7V4 M15 7V4',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
  cold: 'M12 2v20 M3.3 7l17.4 10 M20.7 7L3.3 17 M9 4l3 3 3-3 M9 20l3-3 3 3',
  water: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  fire: 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 0-5 1-8z',
  reactor: 'M2 12a10 4 0 1 0 20 0 10 4 0 1 0-20 0 M12 2a4 10 0 1 0 0 20 4 10 0 1 0 0-20 M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  thruster: 'M12 2c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11z M8 13l-3 3v3l4-2 M16 13l3 3v3l-4-2 M10 19l2 3 2-3',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  fan: 'M12 11c0-5 2-8 5-7s1 5-4 7 M13 12c5 0 8 2 7 5s-5 1-7-4 M12 13c0 5-2 8-5 7s-1-5 4-7 M11 12c-5 0-8-2-7-5s5-1 7 4',
  monitor: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  wrench: 'M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2z',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  shuttle: 'M12 2l3 7v8l-3 3-3-3V9z M9 13l-4 4v2l4-1 M15 13l4 4v2l-4-1',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
}
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

// Chemins compilés une fois (Path2D accepte les chemins SVG)
const cache = new Map()
function compiled(deckName) {
  if (cache.has(deckName)) return cache.get(deckName)
  const deck = plan.decks.find((d) => d.name === deckName)
  if (!deck) return null
  const lower = (s) => s.toLowerCase()
  const data = {
    ...deck,
    hullPath: new Path2D(deck.hull),
    enginePath: deck.engines ? new Path2D(deck.engines) : null,
    rooms: deck.rooms.map((r) => {
      const name = lower(r.name)
      const icon = TYPE_ICON[r.type] ?? ICON_RULES.find(([re]) => re.test(name))?.[1]
      return { ...r, path: new Path2D(r.d), icon: icon && new Path2D(ICONS[icon]) }
    }),
  }
  cache.set(deckName, data)
  return data
}

export function deckSize(deckName) {
  const d = plan.decks.find((x) => x.name === deckName)
  return d ? { width: d.width, height: d.height } : { width: 0, height: 0 }
}

/** Pièce sous un point (coordonnées monde), pour l'infobulle. */
export function roomAt(g, deckName, x, y) {
  const deck = compiled(deckName)
  if (!deck) return null
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  const room = deck.rooms.find((r) => g.isPointInPath(r.path, x, y))
  g.restore()
  return room ?? null
}

/** Texte ajusté à une largeur (null s'il devient trop petit pour être lu). */
function fitFont(g, text, maxWidth, size, min) {
  for (let s = size; s >= min; s -= 1) {
    g.font = `600 ${s}px "Segoe UI", system-ui`
    if (g.measureText(text).width <= maxWidth) return s
  }
  return null
}

/** Dessine un étage. Le contexte est déjà dans le repère monde (zoom / déplacement appliqués). */
export function drawDeck(g, deckName, zoom) {
  const deck = compiled(deckName)
  if (!deck) return
  const px = 1 / zoom // un pixel écran, en unités monde

  // Moteurs, puis coque (structure) avec sa lueur
  if (deck.enginePath) {
    g.fillStyle = '#2a5bd7'
    g.shadowColor = '#3f7bff'
    g.shadowBlur = 18
    g.fill(deck.enginePath)
    g.shadowBlur = 0
  }
  g.fillStyle = '#0a1024'
  g.fill(deck.hullPath)

  // Pièces : fonds, puis murs
  for (const r of deck.rooms) {
    g.fillStyle = STYLE[r.type].fill
    g.fill(r.path)
  }
  g.strokeStyle = WALL
  g.lineWidth = CELL * 0.07
  g.lineJoin = 'round'
  for (const r of deck.rooms) g.stroke(r.path)
  g.strokeStyle = HULL
  g.lineWidth = CELL * 0.14
  g.shadowColor = 'rgba(56, 232, 255, 0.35)'
  g.shadowBlur = 10
  g.stroke(deck.hullPath)
  g.shadowBlur = 0

  // Accès techniques (pointillés jaunes) et portes (ouverture + battant rouge)
  g.lineCap = 'butt'
  g.setLineDash([CELL * 0.16, CELL * 0.1])
  g.strokeStyle = '#e3d39a'
  g.lineWidth = CELL * 0.1
  for (const [x1, y1, x2, y2] of deck.access) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke() }
  g.setLineDash([])
  for (const [x1, y1, x2, y2] of deck.doors) {
    const inset = CELL * 0.12
    const h = y1 === y2
    const a = h ? [x1 + inset, y1] : [x1, y1 + inset]
    const b = h ? [x2 - inset, y2] : [x2, y2 - inset]
    g.lineWidth = CELL * 0.22
    g.strokeStyle = STYLE.room.fill
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke()
    g.lineWidth = CELL * 0.1
    g.strokeStyle = '#ff5a6a'
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke()
  }

  // Caméras
  for (const [x, y] of deck.cameras) {
    g.fillStyle = 'rgba(255, 138, 42, 0.3)'
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + CELL * 0.45, y - CELL * 0.3); g.lineTo(x + CELL * 0.45, y + CELL * 0.3); g.fill()
    g.fillStyle = '#ff8a2a'
    g.beginPath(); g.arc(x, y, CELL * 0.18, 0, Math.PI * 2); g.fill()
  }

  // Titres (« code · nom » en haut de la pièce) et icônes
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const r of deck.rooms) {
    const style = STYLE[r.type]
    const isNumber = /^\d/.test(r.code)
    const full = isNumber ? `${r.code} · ${r.label}` : r.label
    const maxW = r.title.w - CELL * 0.3
    let titleShown = false
    if (r.size >= 4) {
      // Nom complet sur une ligne, sinon sur deux (pièce assez haute), sinon le numéro seul (nom en infobulle)
      const words = full.split(' ')
      const half = Math.ceil(words.length / 2)
      const twoLines = r.rows >= 3 && words.length > 2 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : null
      const options = [[full], twoLines, isNumber && [r.code]].filter(Boolean)
      const min = Math.round(CELL * 0.24)
      const lines = options.find((ls) => ls.every((t) => fitFont(g, t, maxW, Math.round(CELL * 0.42), ls[0] === r.code ? 6 : min)))
      if (lines) {
        // même taille pour toutes les lignes : celle de la plus longue
        const longest = lines.reduce((a, b) => (b.length > a.length ? b : a))
        fitFont(g, longest, maxW, Math.round(CELL * 0.42), 6)
        g.fillStyle = style.text
        g.globalAlpha = 0.92
        lines.forEach((t, i) => g.fillText(t, r.title.x, r.title.y + i * CELL * 0.45))
        g.globalAlpha = 1
        titleShown = true
      }
    }
    if (r.icon) {
      // Icône sous le titre si la pièce est assez haute, sinon au centre
      const s = r.size >= 4 ? CELL * 0.8 : CELL * 0.6
      const cy = titleShown && r.rows >= 3 ? Math.max(r.center.y, r.title.y + CELL) : r.center.y
      g.save()
      g.translate(r.center.x - s / 2, cy - s / 2)
      g.scale(s / 24, s / 24)
      g.strokeStyle = style.text
      g.globalAlpha = r.type === 'room' ? 0.55 : 0.7
      g.lineWidth = Math.max(1.6, (px * 24) / s * 1.4)
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.stroke(r.icon)
      g.restore()
    }
  }
}
