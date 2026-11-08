// Convertit la feuille « Map » de l'Excel de gestion (plan dessiné en cases colorées, faute de mieux
// dans Google Sheets) en un plan vectoriel net, une image SVG par étage, avec la légende des salles.
//   - coque et moteurs : contours tracés puis simplifiés (les « escaliers » de cases deviennent des diagonales)
//   - murs, portes, accès techniques : traits continus fusionnés, symboles dédiés
//   - caméras : icônes ; numéros de salles : pastilles
// Usage : npm run plan-vaisseau → references/plans/gaia-etage-N.svg
// Puis, dans le site (MJ) : « + Scène », « Image de fond », choisir le SVG, « Case » = CELL.
import ExcelJS from 'exceljs'
import { mkdirSync, writeFileSync } from 'node:fs'

const SRC = new URL('../references/Excel de gestion du RP.xlsx', import.meta.url)
const OUT = new URL('../references/plans/', import.meta.url)
const CELL = 40 // pixels par case de l'Excel (= taille de case à régler dans la scène)
const LEGEND_W = 520
const SIMPLIFY = 1.05 // tolérance de lissage des contours, en cases

const C = {
  bg: '#05070f',
  floor: '#131c36',
  hull: '#38e8ff',
  wall: '#38e8ff',
  door: '#ff4d5e',
  access: '#ffd84a',
  camera: '#ff8a2a',
  engine: '#3f7bff',
  obstacle: '#0a0f20',
  obstacleLine: '#2a3a66',
  label: '#ff3dd8',
  text: '#cfe6ff',
}
// Remplissages Excel
const FILL = { FFCCCCCC: 'floor', FFFF9900: 'cam', FF6D9EEB: 'engine', FF000000: 'black' }
// Bordures Excel → type de trait (les fines bordures grises = quadrillage, ignorées)
const BORDER = {
  FF000000: { type: 'wall', color: C.wall, prio: 1 },
  FFFF0000: { type: 'door', color: C.door, prio: 4 },
  FFFFFF00: { type: 'access', color: C.access, prio: 3 },
  FF00FFFF: { type: 'deco', color: '#4dffa6', prio: 2 },
  FF76A5AF: { type: 'deco', color: '#76a5af', prio: 2 },
  FF6D9EEB: { type: 'deco', color: '#5b8cff', prio: 2 },
  FFB7B7B7: { type: 'deco', color: '#9aa4b5', prio: 2 },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const key = (r, c) => `${r},${c}`
const n = (v) => Math.round(v * 100) / 100 // nombres courts dans le SVG

function cellText(cell) {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'object') return 'result' in v ? String(v.result ?? '').trim() : ''
  return String(v).trim()
}

// ---------- Géométrie ----------

/** Contours (boucles de points [x, y] en unités de case) d'un ensemble de cases. */
function contours(mask) {
  const edges = new Map() // "x,y" de départ → liste d'arêtes
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

function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

/** Douglas-Peucker sur une polyligne ouverte. */
function dp(points, tol) {
  if (points.length < 3) return points
  let max = 0
  let idx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i], points[0], points.at(-1))
    if (d > max) { max = d; idx = i }
  }
  if (max <= tol) return [points[0], points.at(-1)]
  return [...dp(points.slice(0, idx + 1), tol).slice(0, -1), ...dp(points.slice(idx), tol)]
}

/** Simplifie une boucle fermée : coupée en deux au point le plus éloigné du premier. */
function simplifyLoop(loop, tol) {
  let far = 0
  let max = 0
  loop.forEach((p, i) => {
    const d = Math.hypot(p[0] - loop[0][0], p[1] - loop[0][1])
    if (d > max) { max = d; far = i }
  })
  const a = dp(loop.slice(0, far + 1), tol)
  const b = dp([...loop.slice(far), loop[0]], tol)
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

/**
 * Chaîne des arêtes unitaires ([x1, y1, x2, y2]) en polylignes, coupées aux jonctions,
 * pour pouvoir lisser les murs en diagonale (escaliers de cases).
 */
function polylines(unitEdges) {
  const adj = new Map()
  const pk = (x, y) => `${x},${y}`
  unitEdges.forEach((e, i) => {
    for (const p of [pk(e[0], e[1]), pk(e[2], e[3])]) {
      if (!adj.has(p)) adj.set(p, [])
      adj.get(p).push(i)
    }
  })
  const used = new Set()
  const other = (i, p) => {
    const e = unitEdges[i]
    return pk(e[0], e[1]) === p ? pk(e[2], e[3]) : pk(e[0], e[1])
  }
  const walk = (startP, firstEdge) => {
    const pts = [startP]
    let p = startP
    let i = firstEdge
    while (i != null && !used.has(i)) {
      used.add(i)
      p = other(i, p)
      pts.push(p)
      const next = adj.get(p)
      i = next.length === 2 ? next.find((j) => !used.has(j)) : null // on s'arrête aux jonctions
    }
    return pts.map((s) => s.split(',').map(Number))
  }
  const out = []
  // D'abord depuis les extrémités et jonctions, puis les boucles restantes
  for (const [p, list] of adj) if (list.length !== 2) for (const i of list) if (!used.has(i)) out.push(walk(p, i))
  for (const [p, list] of adj) for (const i of list) if (!used.has(i)) out.push(walk(p, i))
  return out
}

/**
 * Remplace les « escaliers » (au moins 3 marches d'une case qui tournent alternativement à gauche et à droite)
 * par une diagonale, sans toucher aux vrais angles des pièces.
 */
function destair(points) {
  // Retire les points alignés
  const pts = points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true
    const [a, b] = [points[i - 1], points[i + 1]]
    return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0])
  })
  const len = (i) => Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1])
  const turn = (i) => { // signe du virage au point i
    const [a, p, b] = [pts[i - 1], pts[i], pts[i + 1]]
    return Math.sign((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]))
  }
  const out = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    // Segments i … j-1 : marches d'une case, virages alternés gauche / droite
    let j = i + 1
    if (len(i) === 1) {
      while (j < pts.length - 1 && len(j) === 1 && (j === i + 1 || turn(j) === -turn(j - 1))) j++
    }
    if (j - i >= 3) { out.push(pts[j]); i = j } else { out.push(pts[i + 1]); i++ }
  }
  return out
}

const toPath = (loops, ox, oy) => loops
  .map((l) => `M${l.map(([x, y]) => `${n((x - ox) * CELL)},${n((y - oy) * CELL)}`).join('L')}Z`)
  .join('')

// ---------- Lecture du classeur ----------

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(SRC)
const ws = wb.getWorksheet('Map')

// Étages repérés grâce aux titres « Etage N » en colonne A
const decks = []
ws.eachRow((row, r) => {
  const m = /^Etage (-?\d+)$/.exec(cellText(row.getCell(1)))
  if (m && !decks.some((d) => d.name === m[1])) decks.push({ name: m[1], from: r })
})
decks.forEach((d, i) => { d.to = (decks[i + 1]?.from ?? ws.rowCount + 1) - 1 })
const lastCol = ws.columnCount

mkdirSync(OUT, { recursive: true })

for (const deck of decks) {
  const kind = new Map() // "r,c" → floor | cam | engine | black
  const edges = new Map() // arête de case → { type, color, prio, width }
  const labels = []
  const rooms = new Map()

  for (let r = deck.from; r <= deck.to; r++) {
    for (let c = 2; c <= lastCol; c++) {
      const cell = ws.getCell(r, c)
      const argb = cell.fill?.type === 'pattern' && cell.fill.pattern !== 'none' ? cell.fill.fgColor?.argb : null
      if (FILL[argb]) kind.set(key(r, c), FILL[argb])
      // Arêtes « canoniques » : h,r,c = trait horizontal en haut de la case (r, c) ; v,r,c = trait vertical à gauche
      const sides = { top: `h,${r},${c}`, bottom: `h,${r + 1},${c}`, left: `v,${r},${c}`, right: `v,${r},${c + 1}` }
      for (const [side, ek] of Object.entries(sides)) {
        const b = cell.border?.[side]
        const def = BORDER[b?.color?.argb]
        if (!b?.style || !def) continue
        const width = { thin: 0.08, medium: 0.11, thick: 0.15 }[b.style] ?? 0.1
        if ((edges.get(ek)?.prio ?? 0) < def.prio) edges.set(ek, { ...def, width })
      }
      const text = cellText(cell)
      if (text && !cell.isMerged) labels.push({ r, c, text })
      const f = cell.value?.formula ?? ''
      for (const m of f.matchAll(/\$A\$1="(-?\d+)_([^\s"]+)\s*([^"]*)"/g)) {
        if (m[1] === deck.name && !rooms.has(m[2])) rooms.set(m[2], m[3].trim())
      }
    }
  }

  // Les cases noires ou sans couleur reliées au bord du dessin = le vide spatial ;
  // celles enfermées dans la coque = équipements / zones pleines
  const space = new Set()
  const queue = []
  const passable = (r, c) => {
    const k = kind.get(key(r, c))
    return !k || k === 'black'
  }
  for (let r = deck.from - 1; r <= deck.to + 1; r++) {
    for (let c = 1; c <= lastCol + 1; c++) {
      if (r === deck.from - 1 || r === deck.to + 1 || c === 1 || c === lastCol + 1) { space.add(key(r, c)); queue.push([r, c]) }
    }
  }
  while (queue.length) {
    const [r, c] = queue.pop()
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr
      const cc = c + dc
      if (rr < deck.from || rr > deck.to || cc < 2 || cc > lastCol) continue
      const k = key(rr, cc)
      if (space.has(k) || !passable(rr, cc)) continue
      space.add(k)
      queue.push([rr, cc])
    }
  }

  const hull = new Set()
  const engine = new Set()
  const obstacles = new Set()
  const cameras = []
  for (let r = deck.from; r <= deck.to; r++) {
    for (let c = 2; c <= lastCol; c++) {
      const k = key(r, c)
      const t = kind.get(k)
      if (t === 'engine') engine.add(k)
      else if (t === 'floor' || t === 'cam') hull.add(k)
      else if (!space.has(k)) { hull.add(k); obstacles.add(k) } // case vide ou noire enfermée dans la coque
      if (t === 'cam') cameras.push({ r, c })
    }
  }
  if (!hull.size) continue

  const all = [...hull, ...engine].map((k) => k.split(',').map(Number))
  const minR = Math.min(...all.map(([r]) => r)) - 1
  const maxR = Math.max(...all.map(([r]) => r)) + 1
  const minC = Math.min(...all.map(([, c]) => c)) - 1
  const maxC = Math.max(...all.map(([, c]) => c)) + 1
  const mapW = (maxC - minC + 1) * CELL
  const mapH = (maxR - minR + 1) * CELL
  const X = (c) => n((c - minC) * CELL)
  const Y = (r) => n((r - minR) * CELL)

  const hullLoops = contours(hull).map((l) => simplifyLoop(l, SIMPLIFY))
  const engineLoops = contours(engine).map((l) => simplifyLoop(l, SIMPLIFY))

  // Traits : on ignore les murs posés sur le bord de la coque (le contour lissé les remplace)
  const inShip = (r, c) => hull.has(key(r, c)) || engine.has(key(r, c))
  const segments = new Map() // portes et accès : groupe → positions alignées
  const strokes = new Map() // murs et décors : groupe → arêtes unitaires (lissées ensuite)
  for (const [ek, e] of edges) {
    const [o, r, c] = ek.split(',')
    const R = Number(r)
    const Cc = Number(c)
    const cells = o === 'h' ? [[R - 1, Cc], [R, Cc]] : [[R, Cc - 1], [R, Cc]]
    const [a, b] = cells.map(([rr, cc]) => inShip(rr, cc))
    if (!a && !b) continue
    if (e.type === 'wall' && a !== b) continue
    if (cells.every(([rr, cc]) => engine.has(key(rr, cc)))) continue // quadrillage des moteurs
    if (e.type === 'wall' || e.type === 'deco') {
      const group = `${e.type}|${e.color}|${e.width}`
      if (!strokes.has(group)) strokes.set(group, [])
      strokes.get(group).push(o === 'h' ? [Cc, R, Cc + 1, R] : [Cc, R, Cc, R + 1])
      continue
    }
    const group = `${o}|${o === 'h' ? R : Cc}|${e.type}|${e.color}|${e.width}`
    if (!segments.has(group)) segments.set(group, [])
    segments.get(group).push(o === 'h' ? Cc : R)
  }
  const lines = []
  for (const [group, positions] of segments) {
    const [o, line, type, color, width] = group.split('|')
    positions.sort((p, q) => p - q)
    let start = positions[0]
    let prev = start
    for (const p of [...positions.slice(1), Infinity]) {
      if (p === prev + 1) { prev = p; continue }
      lines.push({ o, line: Number(line), from: start, to: prev + 1, type, color, width: Number(width) })
      start = p
      prev = p
    }
  }

  // Obstacles : cases fusionnées en rectangles (lignes puis colonnes)
  const runs = []
  for (let r = minR; r <= maxR; r++) {
    let run = null
    for (let c = minC; c <= maxC + 1; c++) {
      if (obstacles.has(key(r, c))) {
        if (run) run.w++
        else { run = { r, c, w: 1, h: 1 }; runs.push(run) }
      } else run = null
    }
  }
  const rects = []
  for (const run of runs) {
    const above = rects.find((x) => x.c === run.c && x.w === run.w && x.r + x.h === run.r)
    if (above) above.h++
    else rects.push({ ...run })
  }

  // ---------- Dessin ----------
  const lineXY = (l, inset = 0) => (l.o === 'h'
    ? [X(l.from + inset), Y(l.line), X(l.to - inset), Y(l.line)]
    : [X(l.line), Y(l.from + inset), X(l.line), Y(l.to - inset)])

  const draw = []
  draw.push(`<path d="${toPath(engineLoops, minC, minR)}" fill="url(#engine)" stroke="${C.engine}" stroke-width="${n(CELL * 0.08)}" stroke-linejoin="round" filter="url(#glow)"/>`)
  draw.push(`<path d="${toPath(hullLoops, minC, minR)}" fill="${C.floor}" fill-rule="evenodd"/>`)
  draw.push(`<path d="${toPath(hullLoops, minC, minR)}" fill="none" stroke="${C.hull}" stroke-width="${n(CELL * 0.16)}" stroke-linejoin="round" filter="url(#glow)"/>`)
  draw.push(...rects.map((x) => `<rect x="${n(X(x.c) + CELL * 0.1)}" y="${n(Y(x.r) + CELL * 0.1)}" width="${n(x.w * CELL - CELL * 0.2)}" height="${n(x.h * CELL - CELL * 0.2)}" rx="${n(CELL * 0.12)}" fill="${C.obstacle}" stroke="${C.obstacleLine}" stroke-width="${n(CELL * 0.05)}"/>`))

  // Murs et décors : polylignes lissées (les marches d'une case deviennent des diagonales)
  draw.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-soft)">`)
  let strokeCount = 0
  for (const [group, unitEdges] of strokes) {
    const [, color, width] = group.split('|')
    const d = polylines(unitEdges)
      .map(destair)
      .map((pl) => `M${pl.map(([x, y]) => `${X(x)},${Y(y)}`).join('L')}`)
      .join('')
    strokeCount += unitEdges.length
    draw.push(`<path d="${d}" stroke="${color}" stroke-width="${n(CELL * Number(width))}"/>`)
  }
  draw.push(`</g>`)
  for (const l of lines.filter((x) => x.type === 'access')) {
    const [x1, y1, x2, y2] = lineXY(l, 0.1)
    draw.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.bg}" stroke-width="${n(CELL * 0.22)}"/>`)
    draw.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.access}" stroke-width="${n(CELL * 0.12)}" stroke-dasharray="${n(CELL * 0.18)} ${n(CELL * 0.12)}"/>`)
  }
  // Portes : ouverture dans le mur, battant rouge et montants cyan (un seul filtre de lueur pour toutes)
  const doors = lines.filter((x) => x.type === 'door').map((l) => {
    const [x1, y1, x2, y2] = lineXY(l, 0.08)
    const j = CELL * 0.22
    const jambs = l.o === 'h'
      ? [[x1, y1 - j, x1, y1 + j], [x2, y2 - j, x2, y2 + j]]
      : [[x1 - j, y1, x1 + j, y1], [x2 - j, y2, x2 + j, y2]]
    return { x1, y1, x2, y2, jambs }
  })
  draw.push(...doors.map((d) => `<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${C.floor}" stroke-width="${n(CELL * 0.3)}"/>`))
  draw.push(`<g filter="url(#glow-soft)" stroke-linecap="round">`,
    ...doors.map((d) => `<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${C.door}" stroke-width="${n(CELL * 0.14)}"/>`),
    ...doors.flatMap((d) => d.jambs.map(([a, b, c2, e]) => `<line x1="${n(a)}" y1="${n(b)}" x2="${n(c2)}" y2="${n(e)}" stroke="${C.wall}" stroke-width="${n(CELL * 0.1)}"/>`)),
    ...cameras.map(({ r, c }) => {
      const cx = X(c + 0.5)
      const cy = Y(r + 0.5)
      const s = CELL * 0.32
      return `<path d="M${n(cx)},${n(cy)} L${n(cx + s * 1.5)},${n(cy - s)} L${n(cx + s * 1.5)},${n(cy + s)} Z" fill="${C.camera}" opacity="0.35"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s * 0.7)}" fill="${C.camera}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s * 0.28)}" fill="${C.bg}"/>`
    }),
    `</g>`)
  for (const l of labels.filter((x) => x.r >= minR && x.r <= maxR && x.c >= minC && x.c <= maxC)) {
    const fs = CELL * 0.5
    const w = Math.max(fs * 1.4, l.text.length * fs * 0.62 + fs * 0.7)
    const cx = X(l.c + 0.5)
    const cy = Y(l.r + 0.5)
    draw.push(`<rect x="${n(cx - w / 2)}" y="${n(cy - fs * 0.75)}" width="${n(w)}" height="${n(fs * 1.5)}" rx="${n(fs * 0.75)}" fill="${C.bg}" stroke="${C.label}" stroke-width="${n(CELL * 0.04)}" opacity="0.92"/>`)
    draw.push(`<text x="${n(cx)}" y="${n(cy)}" font-size="${n(fs)}" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${esc(l.text)}</text>`)
  }

  // ---------- Légende ----------
  const legend = [...rooms.entries()].filter(([, name]) => name).sort(([a], [b]) => a.localeCompare(b, 'fr', { numeric: true }))
  const lx = mapW + 40
  const SYMBOLS = [
    [`<line x1="${lx}" y1="-6" x2="${lx + 34}" y2="-6" stroke="${C.wall}" stroke-width="5" stroke-linecap="round"/>`, 'Murs'],
    [`<line x1="${lx + 4}" y1="-6" x2="${lx + 30}" y2="-6" stroke="${C.door}" stroke-width="6" stroke-linecap="round"/><line x1="${lx + 2}" y1="-14" x2="${lx + 2}" y2="2" stroke="${C.wall}" stroke-width="4"/><line x1="${lx + 32}" y1="-14" x2="${lx + 32}" y2="2" stroke="${C.wall}" stroke-width="4"/>`, 'Portes'],
    [`<line x1="${lx}" y1="-6" x2="${lx + 34}" y2="-6" stroke="${C.access}" stroke-width="5" stroke-dasharray="7 5"/>`, 'Accès techniques (électricité, ventilation)'],
    [`<circle cx="${lx + 10}" cy="-6" r="8" fill="${C.camera}"/><circle cx="${lx + 10}" cy="-6" r="3" fill="${C.bg}"/><path d="M${lx + 10},-6 L${lx + 32},-18 L${lx + 32},6 Z" fill="${C.camera}" opacity="0.35"/>`, 'Caméras de surveillance'],
    [`<rect x="${lx + 4}" y="-16" width="24" height="20" rx="4" fill="${C.obstacle}" stroke="${C.obstacleLine}" stroke-width="2"/>`, 'Équipements, piliers'],
  ]
  const lineH = 34
  const roomsTop = 120 + SYMBOLS.length * lineH + 30
  const width = mapW + LEGEND_W
  const height = Math.max(mapH, roomsTop + legend.length * lineH + 20)

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, sans-serif">`,
    `<defs>`,
    // Zone de filtre en coordonnées absolues : sinon un trait parfaitement vertical/horizontal (boîte de largeur nulle) disparaît
    `<filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${mapW}" height="${mapH}"><feGaussianBlur stdDeviation="${n(CELL * 0.18)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    `<filter id="glow-soft" filterUnits="userSpaceOnUse" x="0" y="0" width="${mapW}" height="${mapH}"><feGaussianBlur stdDeviation="${n(CELL * 0.08)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    `<radialGradient id="engine" cx="70%" cy="50%" r="80%"><stop offset="0" stop-color="#9fd8ff"/><stop offset="0.45" stop-color="${C.engine}"/><stop offset="1" stop-color="#14245c"/></radialGradient>`,
    `<pattern id="dots" width="${CELL}" height="${CELL}" patternUnits="userSpaceOnUse"><circle cx="${CELL / 2}" cy="${CELL / 2}" r="1.2" fill="#1c2a4d"/></pattern>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="${C.bg}"/>`,
    `<rect width="${mapW}" height="${mapH}" fill="url(#dots)"/>`,
    ...draw,
    `<g>`,
    `<text x="${lx}" y="64" font-size="34" font-weight="700" fill="${C.hull}" letter-spacing="4">GAÏA · ÉTAGE ${esc(deck.name)}</text>`,
    ...SYMBOLS.map(([icon, label], i) => `<g transform="translate(0 ${120 + i * lineH})">${icon}<text x="${lx + 50}" y="0" font-size="20" fill="${C.text}">${esc(label)}</text></g>`),
    `<line x1="${lx}" y1="${roomsTop - 34}" x2="${width - 40}" y2="${roomsTop - 34}" stroke="#1c2a4d" stroke-width="2"/>`,
    ...legend.map(([code, name], i) => `<text x="${lx}" y="${roomsTop + i * lineH}" font-size="21" fill="${C.text}"><tspan fill="${C.label}" font-weight="700">${esc(code)}</tspan>  ${esc(name)}</text>`),
    `</g>`,
    `</svg>`,
  ].join('\n')

  const file = `gaia-etage-${deck.name}.svg`
  writeFileSync(new URL(file, OUT), svg)
  console.log(`${file} : ${width}×${height} px, ${strokeCount} arêtes de murs, ${lines.length} portes/accès, ${rects.length} équipements, ${cameras.length} caméras, ${legend.length} salles`)
}
console.log(`Taille de case à régler dans la scène : ${CELL} px`)
