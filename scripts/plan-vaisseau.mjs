// Convertit la feuille « Map » de l'Excel de gestion (plan dessiné en cases colorées)
// en une image SVG par étage, aux couleurs de Starboard, avec la légende des salles.
// Usage : npm run plan-vaisseau → references/plans/gaia-etage-N.svg
// Puis, dans le site (MJ) : « + Scène », « Image de fond », choisir le SVG.
import ExcelJS from 'exceljs'
import { mkdirSync, writeFileSync } from 'node:fs'

const SRC = new URL('../references/Excel de gestion du RP.xlsx', import.meta.url)
const OUT = new URL('../references/plans/', import.meta.url)
const CELL = 24 // pixels par case (= taille de grille conseillée dans la scène)
const LEGEND_W = 380

// Remplissages Excel → couleurs du thème (le noir de l'Excel = le vide spatial, laissé en fond)
const PALETTE = {
  FFCCCCCC: '#16213d', // sols
  FF6D9EEB: '#2a5bd7', // cases bleues
  FFFF9900: '#ffb02e', // cases orange
}
// Bordures Excel (murs, portes…) → couleurs du thème. Les fines bordures grises = quadrillage, ignorées.
const BORDER_COLORS = {
  FF000000: '#38e8ff', // murs
  FFFF0000: '#ff5a5a',
  FFFFFF00: '#ffd84a',
  FF00FFFF: '#4dffa6',
  FF76A5AF: '#76a5af',
  FF6D9EEB: '#5b8cff',
  FFB7B7B7: '#9aa4b5',
}
const BORDER_WIDTH = { thin: 2, medium: 3, thick: 5 }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function cellText(cell) {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'object') return 'result' in v ? String(v.result ?? '').trim() : ''
  return String(v).trim()
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(SRC)
const ws = wb.getWorksheet('Map')

// Repère les étages grâce aux titres « Etage N » en colonne A
const decks = []
ws.eachRow((row, r) => {
  const m = /^Etage (-?\d+)$/.exec(cellText(row.getCell(1)))
  if (m && !decks.some((d) => d.name === m[1])) decks.push({ name: m[1], from: r })
})
decks.forEach((d, i) => { d.to = (decks[i + 1]?.from ?? ws.rowCount + 1) - 1 })

mkdirSync(OUT, { recursive: true })

for (const deck of decks) {
  const fills = [] // { r, c, color }
  const labels = [] // { r, c, text }
  const lines = [] // { r, c, side, color, width }
  const rooms = new Map() // code → nom
  for (let r = deck.from; r <= deck.to; r++) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell, c) => {
      if (c === 1) return // colonne des titres
      const argb = cell.fill?.type === 'pattern' && cell.fill.pattern !== 'none' ? cell.fill.fgColor?.argb : null
      if (argb && PALETTE[argb]) fills.push({ r, c, color: PALETTE[argb] })
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const b = cell.border?.[side]
        const color = BORDER_COLORS[b?.color?.argb]
        if (b?.style && color) lines.push({ r, c, side, color, width: BORDER_WIDTH[b.style] ?? 2 })
      }
      const text = cellText(cell)
      if (text && !cell.isMerged) labels.push({ r, c, text })
      // Les formules de surbrillance contiennent le nom complet : $A$1="0_12 Passerelle du réacteur"
      const f = cell.value?.formula ?? ''
      for (const m of f.matchAll(/\$A\$1="(-?\d+)_([^\s"]+)\s*([^"]*)"/g)) {
        if (m[1] === deck.name && !rooms.has(m[2])) rooms.set(m[2], m[3].trim())
      }
    })
  }
  if (!fills.length) continue

  const minR = Math.min(...fills.map((f) => f.r)) - 1
  const maxR = Math.max(...fills.map((f) => f.r)) + 1
  const minC = Math.min(...fills.map((f) => f.c)) - 1
  const maxC = Math.max(...fills.map((f) => f.c)) + 1
  const mapW = (maxC - minC + 1) * CELL
  const mapH = (maxR - minR + 1) * CELL
  const legend = [...rooms.entries()].filter(([, name]) => name).sort(([a], [b]) => a.localeCompare(b, 'fr', { numeric: true }))
  const width = mapW + LEGEND_W
  const height = Math.max(mapH, 90 + legend.length * 26)

  // Regroupe les cases voisines de même couleur sur une ligne (SVG plus léger)
  const rects = []
  const byRow = Map.groupBy(fills, (f) => f.r)
  for (const [r, cells] of byRow) {
    cells.sort((a, b) => a.c - b.c)
    let run = null
    for (const f of cells) {
      if (run && f.c === run.c + run.n && f.color === run.color) run.n++
      else { run = { r, c: f.c, n: 1, color: f.color }; rects.push(run) }
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
    `<rect width="${width}" height="${height}" fill="#05070f"/>`,
    ...rects.map((x) => `<rect x="${(x.c - minC) * CELL}" y="${(x.r - minR) * CELL}" width="${x.n * CELL}" height="${CELL}" fill="${x.color}"/>`),
    ...lines
      .filter((l) => l.r >= minR && l.r <= maxR && l.c >= minC && l.c <= maxC)
      .map((l) => {
        const x0 = (l.c - minC) * CELL
        const y0 = (l.r - minR) * CELL
        const [x1, y1, x2, y2] = {
          top: [x0, y0, x0 + CELL, y0],
          bottom: [x0, y0 + CELL, x0 + CELL, y0 + CELL],
          left: [x0, y0, x0, y0 + CELL],
          right: [x0 + CELL, y0, x0 + CELL, y0 + CELL],
        }[l.side]
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${l.color}" stroke-width="${l.width}" stroke-linecap="square"/>`
      }),
    ...labels
      .filter((l) => l.r >= minR && l.r <= maxR && l.c >= minC && l.c <= maxC)
      .map((l) => `<text x="${(l.c - minC + 0.5) * CELL}" y="${(l.r - minR + 0.5) * CELL}" font-family="Segoe UI, sans-serif" font-size="${CELL * 0.75}" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central" shape-rendering="auto">${esc(l.text)}</text>`),
    `<g font-family="Segoe UI, sans-serif" shape-rendering="auto">`,
    `<text x="${mapW + 24}" y="44" font-size="26" font-weight="700" fill="#38e8ff" letter-spacing="3">GAÏA · ÉTAGE ${esc(deck.name)}</text>`,
    ...legend.map(([code, name], i) => `<text x="${mapW + 24}" y="${84 + i * 26}" font-size="16" fill="#cfe6ff"><tspan fill="#ff3dd8" font-weight="700">${esc(code)}</tspan>  ${esc(name)}</text>`),
    `</g>`,
    `</svg>`,
  ].join('\n')

  const file = `gaia-etage-${deck.name}.svg`
  writeFileSync(new URL(file, OUT), svg)
  console.log(`${file} : ${maxC - minC + 1}×${maxR - minR + 1} cases, ${legend.length} salles nommées`)
}
console.log(`Taille de case à régler dans la scène : ${CELL} px`)
