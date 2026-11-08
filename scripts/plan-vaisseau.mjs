// Génère le plan du Gaïa (onglet Vaisseau) depuis la feuille « Map » de l'Excel de gestion.
// Usage : npm run plan-vaisseau → src/data/gaia-plan.json (dessiné par src/shipMap.js)
//
// Dans l'Excel, chaque case d'une pièce porte une formule de surbrillance qui cite la pièce :
//   =IF($A$1="0_12 Passerelle du réacteur"," ","")  → étage 0, code 12, nom « Passerelle du réacteur »
// On s'en sert pour savoir exactement quelles cases forment chaque pièce (les couleurs de fond
// varient d'une case à l'autre et ne sont pas fiables). Les cases grises hors pièce = structure de la coque.
// Les contours en escalier sont lissés : marches → diagonales, puis angles arrondis (courbes).
import ExcelJS from 'exceljs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { stricterLevel } from '../src/rules.js'

const SRC = new URL('../references/Excel de gestion du RP.xlsx', import.meta.url)
const OUT = new URL('../src/data/gaia-plan.json', import.meta.url)
const CELL = 40 // pixels « monde » par case de l'Excel
const RED = 'FFFF0000' // bordures : portes
const YELLOW = 'FFFFFF00' // bordures : accès techniques
const ENGINE = 'FF6D9EEB' // remplissage : propulseurs
const CAMERA = 'FFFF9900' // remplissage : caméras

const key = (r, c) => `${r},${c}`
const n = (v) => Math.round(v * 10) / 10

function cellText(cell) {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'object') return 'result' in v ? String(v.result ?? '').trim() : ''
  return String(v).trim()
}

// ---------- Géométrie ----------

/** Contours (boucles de coins [x, y] en unités de case) d'un ensemble de cases "r,c". */
function contours(mask) {
  const edges = new Map()
  const add = (x1, y1, x2, y2) => {
    const k = `${x1},${y1}`
    if (!edges.has(k)) edges.set(k, [])
    edges.get(k).push({ x1, y1, x2, y2, used: false })
  }
  for (const k of mask) {
    const [r, c] = k.split(',').map(Number)
    if (!mask.has(key(r - 1, c))) add(c, r, c + 1, r)
    if (!mask.has(key(r, c + 1))) add(c + 1, r, c + 1, r + 1)
    if (!mask.has(key(r + 1, c))) add(c + 1, r + 1, c, r + 1)
    if (!mask.has(key(r, c - 1))) add(c, r + 1, c, r)
  }
  const loops = []
  for (const list of edges.values()) {
    for (const start of list) {
      if (start.used) continue
      const loop = []
      let e = start
      while (e && !e.used) {
        e.used = true
        loop.push([e.x1, e.y1])
        e = edges.get(`${e.x2},${e.y2}`)?.find((x) => !x.used)
      }
      if (loop.length >= 4) loops.push(loop)
    }
  }
  return loops
}

const len = (a, b) => Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
const cross = (a, p, b) => (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])

/** Boucle fermée : retire les points alignés. */
function simplifyLoop(loop) {
  return loop.filter((p, i) => cross(loop.at(i - 1), p, loop[(i + 1) % loop.length]) !== 0)
}

/**
 * Boucle fermée : les escaliers (≥ 3 marches d'une case, virages alternés) deviennent une diagonale.
 * Les vrais angles des pièces sont conservés.
 */
function destairLoop(loop) {
  const pts = simplifyLoop(loop)
  // On démarre sur un point qui suit un long segment, pour ne pas couper un escalier en deux
  const start = pts.findIndex((p, i) => len(pts.at(i - 1), p) > 1)
  if (start < 0) return pts
  const P = [...pts.slice(start), ...pts.slice(0, start)]
  const m = P.length
  const at = (i) => P[i % m]
  const turn = (i) => Math.sign(cross(at(i - 1 + m), at(i), at(i + 1)))
  const out = []
  let i = 0
  while (i < m) {
    out.push(at(i))
    let j = i
    while (j - i < m && len(at(j), at(j + 1)) === 1 && (j === i || turn(j) === -turn(j - 1 + m))) j++
    i = j - i >= 3 ? j : i + 1
  }
  return out
}

/** Chemin SVG d'un polygone (points en pixels) aux angles arrondis (rayon en cases, plafonné par les segments). */
function roundedPath(P, radius) {
  const m = P.length
  const R = radius * CELL
  const toward = (a, b, d) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l]
  }
  let d = ''
  for (let i = 0; i < m; i++) {
    const prev = P[(i - 1 + m) % m]
    const p = P[i]
    const next = P[(i + 1) % m]
    const r = Math.min(R, Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 2, Math.hypot(next[0] - p[0], next[1] - p[1]) / 2)
    const a = toward(p, prev, r)
    const b = toward(p, next, r)
    d += `${i ? 'L' : 'M'}${n(a[0])},${n(a[1])}Q${n(p[0])},${n(p[1])},${n(b[0])},${n(b[1])}`
  }
  return `${d}Z`
}

/** Arêtes unitaires alignées → segments fusionnés { o, line, from, to } (unités de case). */
function mergeEdges(list) {
  const groups = new Map()
  for (const [o, line, pos] of list) {
    const g = `${o}|${line}`
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(pos)
  }
  const out = []
  for (const [g, positions] of groups) {
    const [o, line] = g.split('|')
    positions.sort((a, b) => a - b)
    let s = positions[0]
    let prev = s
    for (const p of [...positions.slice(1), Infinity]) {
      if (p === prev + 1) { prev = p; continue }
      out.push({ o, line: Number(line), from: s, to: prev + 1 })
      s = p
      prev = p
    }
  }
  return out
}

// ---------- Types de pièces, corrections manuelles ----------

// Noms corrigés (étage|code)
const NAME_OVERRIDES = { '0|3': 'Salle de transit' }
// Formes redessinées (étage|code) : hexagone régulier pointe en haut, côtés verticaux (là où sont les portes)
const HEXAGONS = new Set(['0|1'])

// Taille visée (en cases) pour la plus petite dimension d'une zone, une fois la grille redimensionnée
const TARGET_SPAN = { room: 2.6, corridor: 1.4, electric: 1.1, ventilation: 1.1, maintenance: 1.1 }
const STRUCTURE_SPAN = 0.6 // colonnes / rangées sans pièce (structure vide de la coque) : resserrées

// Niveau d'accréditation par défaut des portes, d'après la pièce desservie (« Base de donnée générale »)
const LEVEL_RULES = [
  [/commandant second/, 'Gris'], [/quartiers du commandant/, 'Rouge'], [/armurerie/, 'Bleu'],
  [/commandement|manoeuvre/, 'Noir'], [/laboratoire médical/, 'Violet'],
  [/laboratoire|botanique|serre|observatoire/, 'Rose'],
  [/réacteur|générateur|propulseur|contrôle|maintenance|entretien|atelier|hangar|systèmes de vie/, 'Jaune'],
]
const TYPE_LEVEL = { electric: 'Jaune', ventilation: 'Jaune', maintenance: 'Jaune' }

function classify(code, name) {
  if (/^el\d/.test(code)) return { type: 'electric', label: `Gaine électrique ${code.toUpperCase()}` }
  if (/^v\d/.test(code)) return { type: 'ventilation', label: `Ventilation ${code.toUpperCase()}` }
  if (/^m\d/.test(code)) return { type: 'maintenance', label: `Conduit technique ${code.toUpperCase()}` }
  if (/^[a-z]\d/.test(code)) return { type: 'corridor', label: `Couloir ${code.toUpperCase()}` }
  return { type: 'room', label: name }
}

// ---------- Lecture ----------

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(SRC)
const ws = wb.getWorksheet('Map')
const lastCol = ws.columnCount

const decks = []
ws.eachRow((row, r) => {
  const m = /^Etage (-?\d+)$/.exec(cellText(row.getCell(1)))
  if (m && !decks.some((d) => d.name === m[1])) decks.push({ name: m[1], from: r })
})
decks.forEach((d, i) => { d.to = (decks[i + 1]?.from ?? ws.rowCount + 1) - 1 })

const plan = { cell: CELL, decks: [] }

for (const deck of decks) {
  const fill = new Map() // "r,c" → argb
  const roomOf = new Map() // "r,c" → identifiant de pièce
  const rooms = new Map() // identifiant → { code, name, cells:Set }
  const doorEdges = []
  const accessEdges = []

  for (let r = deck.from; r <= deck.to; r++) {
    for (let c = 2; c <= lastCol; c++) {
      const cell = ws.getCell(r, c)
      const k = key(r, c)
      const argb = cell.fill?.type === 'pattern' && cell.fill.pattern !== 'none' ? cell.fill.fgColor?.argb : null
      if (argb) fill.set(k, argb)
      // Cases fusionnées (souvent celles du numéro de pièce) : seule la case principale porte la formule
      const source = cell.isMerged ? cell.master : cell
      const m = /\$A\$1="(-?\d+)_([^\s"]+)\s*([^"]*)"/.exec(source.formula ?? '')
      if (m && m[1] === deck.name) {
        const id = `${m[2]}|${m[3].trim()}`
        roomOf.set(k, id)
        if (!rooms.has(id)) rooms.set(id, { code: m[2], name: m[3].trim(), cells: new Set() })
        rooms.get(id).cells.add(k)
      }
      for (const [side, ek] of [['top', ['h', r, c]], ['bottom', ['h', r + 1, c]], ['left', ['v', c, r]], ['right', ['v', c + 1, r]]]) {
        const argbB = cell.border?.[side]?.color?.argb
        if (!cell.border?.[side]?.style) continue
        if (argbB === RED) doorEdges.push(ek)
        if (argbB === YELLOW) accessEdges.push(ek)
      }
    }
  }

  // Pièce entièrement enfermée dans une autre (erreur de code dans l'Excel, ex. « 1_4 » au milieu de « 1_1 ») : fusionnée
  for (const [id, room] of rooms) {
    const around = new Set()
    for (const k of room.cells) {
      const [r, c] = k.split(',').map(Number)
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = key(r + a, c + b)
        if (!room.cells.has(nk)) around.add(roomOf.get(nk) ?? 'none')
      }
    }
    const [host] = around
    if (around.size === 1 && host !== 'none' && rooms.has(host)) {
      room.cells.forEach((k) => { rooms.get(host).cells.add(k); roomOf.set(k, host) })
      rooms.delete(id)
    }
  }

  // Vide spatial = cases noires ou sans couleur reliées au bord ; le reste = vaisseau
  const space = new Set()
  const stack = []
  const isVoid = (k) => !roomOf.has(k) && (!fill.has(k) || fill.get(k) === 'FF000000')
  for (let r = deck.from; r <= deck.to; r++) for (const c of [2, lastCol]) if (isVoid(key(r, c))) { space.add(key(r, c)); stack.push([r, c]) }
  for (let c = 2; c <= lastCol; c++) for (const r of [deck.from, deck.to]) if (isVoid(key(r, c))) { space.add(key(r, c)); stack.push([r, c]) }
  while (stack.length) {
    const [r, c] = stack.pop()
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + a
      const cc = c + b
      const k = key(rr, cc)
      if (rr < deck.from || rr > deck.to || cc < 2 || cc > lastCol || space.has(k) || !isVoid(k)) continue
      space.add(k)
      stack.push([rr, cc])
    }
  }
  const engines = new Set()
  const hull = new Set()
  for (let r = deck.from; r <= deck.to; r++) {
    for (let c = 2; c <= lastCol; c++) {
      const k = key(r, c)
      if (space.has(k)) continue
      if (fill.get(k) === ENGINE && !roomOf.has(k)) engines.add(k)
      else hull.add(k)
    }
  }
  if (!hull.size) continue

  // Îlots de cases sans pièce enfermés dans une seule pièce (fonds différents dans l'Excel) : rattachés à cette pièce
  const seen = new Set()
  for (const start of hull) {
    if (roomOf.has(start) || seen.has(start)) continue
    const island = []
    const hosts = new Set()
    const todo = [start]
    seen.add(start)
    while (todo.length) {
      const k = todo.pop()
      island.push(k)
      const [r, c] = k.split(',').map(Number)
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = key(r + a, c + b)
        if (roomOf.has(nk)) hosts.add(roomOf.get(nk))
        else if (!hull.has(nk)) hosts.add('outside')
        else if (!seen.has(nk)) { seen.add(nk); todo.push(nk) }
      }
    }
    const [host] = hosts
    if (hosts.size === 1 && host !== 'outside') island.forEach((k) => { roomOf.set(k, host); rooms.get(host).cells.add(k) })
  }

  // Portes / accès : seulement ceux qui bordent au moins une pièce (certaines bordures traînent dans la structure)
  const touchesRoom = ([o, line, pos]) => (o === 'h'
    ? roomOf.has(key(line - 1, pos)) || roomOf.has(key(line, pos))
    : roomOf.has(key(pos, line - 1)) || roomOf.has(key(pos, line)))
  doorEdges.splice(0, Infinity, ...doorEdges.filter(touchesRoom))
  accessEdges.splice(0, Infinity, ...accessEdges.filter(touchesRoom))

  const all = [...hull, ...engines].map((k) => k.split(',').map(Number))
  const minR = Math.min(...all.map(([r]) => r)) - 1
  const minC = Math.min(...all.map(([, c]) => c)) - 1
  const maxR = Math.max(...all.map(([r]) => r)) + 2
  const maxC = Math.max(...all.map(([, c]) => c)) + 2

  // Infos par pièce : type, nom affiché, emprise
  const info = new Map()
  for (const [id, room] of rooms) {
    const cells = [...room.cells].map((k) => k.split(',').map(Number))
    const { type, label } = classify(room.code, room.name)
    const name = NAME_OVERRIDES[`${deck.name}|${room.code}`] ?? room.name
    info.set(id, {
      type, cells, name,
      label: type === 'room' ? name : label,
      r0: Math.min(...cells.map(([r]) => r)), r1: Math.max(...cells.map(([r]) => r)),
      c0: Math.min(...cells.map(([, c]) => c)), c1: Math.max(...cells.map(([, c]) => c)),
    })
  }

  // Grille redimensionnée (comme les colonnes d'un tableur) : les petites pièces s'élargissent,
  // les grandes et la structure vide se resserrent ; toutes les pièces restent jointives.
  const colW = new Map()
  const rowH = new Map()
  for (let c = minC; c <= maxC; c++) colW.set(c, STRUCTURE_SPAN)
  for (let r = minR; r <= maxR; r++) rowH.set(r, STRUCTURE_SPAN)
  const clamp = (v) => Math.max(0.7, Math.min(2, v))
  for (const z of info.values()) {
    const fc = clamp(TARGET_SPAN[z.type] / (z.c1 - z.c0 + 1))
    const fr = clamp(TARGET_SPAN[z.type] / (z.r1 - z.r0 + 1))
    for (let c = z.c0; c <= z.c1; c++) colW.set(c, Math.max(colW.get(c), fc))
    for (let r = z.r0; r <= z.r1; r++) rowH.set(r, Math.max(rowH.get(r), fr))
  }
  const cumul = (sizes, from, to) => {
    const pos = new Map([[from, 0]])
    for (let i = from; i <= to; i++) pos.set(i + 1, pos.get(i) + sizes.get(i))
    return pos
  }
  const colPos = cumul(colW, minC, maxC)
  const rowPos = cumul(rowH, minR, maxR)
  // Coordonnée de grille (éventuellement fractionnaire) → pixels
  const gx = (v) => { const i = Math.floor(v); return n(((colPos.get(i) ?? colPos.get(maxC + 1)) + (v - i) * (colW.get(i) ?? 0)) * CELL) }
  const gy = (v) => { const i = Math.floor(v); return n(((rowPos.get(i) ?? rowPos.get(maxR + 1)) + (v - i) * (rowH.get(i) ?? 0)) * CELL) }
  const shape = (mask, radius) => contours(mask).map((l) => roundedPath(destairLoop(l).map(([x, y]) => [gx(x), gy(y)]), radius)).join('')
  const segment = ({ o, line, from, to }) => (o === 'h' ? [gx(from), gy(line), gx(to), gy(line)] : [gx(line), gy(from), gx(line), gy(to)])
  // Pièces de part et d'autre d'une arête (première case du segment)
  const sides = ({ o, line, from }) => (o === 'h' ? [key(line - 1, from), key(line, from)] : [key(from, line - 1), key(from, line)])
    .map((k) => roomOf.get(k)).filter(Boolean)
  const roomLevel = (id) => {
    const z = info.get(id)
    return TYPE_LEVEL[z.type] ?? LEVEL_RULES.find(([re]) => re.test(z.name.toLowerCase()))?.[1] ?? 'Vert'
  }

  const out = {
    name: deck.name,
    width: gx(maxC + 1),
    height: gy(maxR + 1),
    hull: shape(hull, 0.9),
    engines: shape(engines, 0.6),
    rooms: [],
    doors: mergeEdges(doorEdges).map((e) => {
      const ids = [...new Set(sides(e))]
      return {
        id: `${deck.name}:${e.o}${e.line}:${e.from}-${e.to}`, // stable tant que le plan Excel ne bouge pas
        seg: segment(e),
        level: ids.map(roomLevel).reduce(stricterLevel, 'Vert'),
        rooms: ids.map((id) => { const z = info.get(id); return /^\d/.test(rooms.get(id).code) ? `${rooms.get(id).code} · ${z.label}` : z.label }),
      }
    }),
    access: mergeEdges(accessEdges).map(segment),
    cameras: [...fill].filter(([k, a]) => a === CAMERA && hull.has(k)).map(([k]) => { const [r, c] = k.split(',').map(Number); return [gx(c + 0.5), gy(r + 0.5)] }),
  }

  for (const [id, room] of rooms) {
    const z = info.get(id)
    const { cells } = z
    // Emplacement du titre : la plus large rangée parmi les deux du haut
    let best = null
    for (const row of [z.r0, z.r0 + 1]) {
      const cols = cells.filter(([r]) => r === row).map(([, c]) => c).sort((a, b) => a - b)
      let s = cols[0]
      for (let i = 1; i <= cols.length; i++) {
        if (i < cols.length && cols[i] === cols[i - 1] + 1) continue
        const w = cols[i - 1] - s + 1
        if (!best || w > best.w) best = { row, s, w }
        s = cols[i]
      }
    }
    // Centre : moyenne des centres de cases (en pixels, grille redimensionnée)
    const cx = cells.reduce((a, [, c]) => a + gx(c + 0.5), 0) / cells.length
    const cy = cells.reduce((a, [r]) => a + gy(r + 0.5), 0) / cells.length
    let d = shape(room.cells, 0.3)
    let title = { x: n((gx(best.s) + gx(best.s + best.w)) / 2), y: gy(best.row + 0.5), w: n(gx(best.s + best.w) - gx(best.s)) }
    if (HEXAGONS.has(`${deck.name}|${room.code}`)) {
      // Hexagone régulier, pointe en haut et en bas, côtés verticaux sur l'emprise de la pièce
      const L = gx(z.c0)
      const R = gx(z.c1 + 1)
      const T = gy(z.r0)
      const B = gy(z.r1 + 1)
      const i = (R - L) / (2 * Math.sqrt(3))
      const mid = (L + R) / 2
      d = roundedPath([[mid, T], [R, T + i], [R, B - i], [mid, B], [L, B - i], [L, T + i]], 0.6)
      title = { x: n(mid), y: n(T + i + CELL * 0.5), w: n(R - L - CELL * 0.4) }
    }
    out.rooms.push({
      code: room.code,
      name: z.name,
      label: z.label,
      type: z.type,
      size: cells.length,
      d,
      title,
      center: { x: n(cx), y: n(cy) },
      rows: z.r1 - z.r0 + 1,
    })
  }
  out.rooms.sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }))
  plan.decks.push(out)
  const levels = out.doors.reduce((a, d) => ({ ...a, [d.level]: (a[d.level] ?? 0) + 1 }), {})
  console.log(`Étage ${deck.name} : ${out.width}×${out.height} px, ${out.rooms.length} pièces, ${out.doors.length} portes ${JSON.stringify(levels)}, ${out.access.length} accès, ${out.cameras.length} caméras`)
}

mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true })
writeFileSync(OUT, JSON.stringify(plan))
console.log('→ src/data/gaia-plan.json')
