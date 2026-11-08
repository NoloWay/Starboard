// Convertit les fiches Excel (Google Sheets exportés) en fichier JSON importable dans Starboard.
// Usage : npm run import-fiches
// Résultat : references/fiches-starboard.json (dossier non versionné) → bouton « Importer » du site.
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { SKILLS, STATS, BADGES } from '../src/rules.js'

const DIR = new URL('../references/', import.meta.url)
const ALL = 'Excel de tous les personnages.xlsx'
const MINE = 'Exemple de ma fiche perso complete.xlsx' // plus récente : prioritaire
const OUT = 'fiches-starboard.json'
const SKIP = new Set(['Registre du personnel', 'Listes', 'Notes', 'Histoire'])

// Personnages joueurs sans fiche Excel : créés à partir du registre du personnel
const MISSING_PCS = ['Cal Atilkis', 'Zadya Alipha', 'Mulgan']

/** Valeur lisible d'une cellule (texte riche, formule, nombre…). */
function text(cell) {
  let v = cell?.value
  if (v && typeof v === 'object') {
    if ('result' in v) v = v.result
    else if (v.richText) v = v.richText.map((t) => t.text).join('')
    else if (v.text) v = v.text
    else v = ''
  }
  return v == null ? '' : String(v).trim()
}

/** Toutes les cellules « maîtresses » d'une feuille (sans les doublons des cellules fusionnées). */
function cells(ws) {
  const out = []
  ws.eachRow((row) => row.eachCell((c) => {
    if (c.isMerged && c.master !== c) return
    out.push(c)
  }))
  return out
}

function readSheet(ws) {
  const all = cells(ws)
  // Les libellés d'identité sont en colonne C ; certaines fiches ont des doublons ailleurs
  const find = (label) => all.find((c) => text(c) === label && c.col === 3) ?? all.find((c) => text(c) === label)
  const right = (c, n = 1) => (c ? ws.getCell(c.row, c.col + n) : null)
  const at = (c, col) => (c ? ws.getCell(c.row, col) : null)

  const badgeCell = find("Niv. d'accréditation")
  const badge = text(right(badgeCell))
  const data = {
    name: text(ws.getCell('A1')) || ws.name,
    post: text(right(find('Poste'))),
    age: text(right(find('Âge'))),
    country: text(right(find("Pays d'origine"))),
    badge: BADGES.some((b) => b.name === badge) ? badge : 'Vert',
    medical: text(at(badgeCell, 6)), // colonne F « Bilan médical »
    observations: text(at(badgeCell, 10)), // colonne J « Observations »
    player: '',
    hidden: false,
    stats: {},
    skills: {},
    talents: [],
    passives: [],
  }

  for (const { key, label } of STATS) {
    data.stats[key] = { base: Number(text(right(find(label)))) || 0, mod: 0 }
  }
  for (const { name } of SKILLS) {
    // « 3 - Compétence » → 3 (Électronique n'existe pas dans les Excel → 0)
    data.skills[name] = Number.parseInt(text(right(find(name))), 10) || 0
  }

  // Talents : lignes sous l'en-tête « Nom | Description » qui suit « Talents spéciaux »
  const title = find('Talents spéciaux')
  if (title) {
    const header = all.find((c) => c.row > title.row && text(c) === 'Nom')
    for (let r = (header?.row ?? title.row) + 1; r < (header?.row ?? title.row) + 30; r++) {
      const name = text(ws.getCell(r, 1))
      const desc = text(ws.getCell(r, 2))
      if (!name && !desc) continue
      if (name === '?' && desc === '?') continue
      data.talents.push({ name, desc })
    }
  }
  return data
}

/** Registre : nom → { post, badge } */
function readRegistry(ws) {
  const reg = {}
  ws.eachRow((row) => {
    const name = text(row.getCell(2))
    const badge = text(row.getCell(3)).replace("Niveau d'accréditation : ", '')
    if (name && !['-', '?', 'Décédé'].includes(name)) reg[name] = { post: text(row.getCell(1)), badge }
  })
  return reg
}

async function load(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(new URL(file, DIR))
  return wb
}

const characters = {}
const byName = {}
const add = (data) => {
  const id = byName[data.name] ?? randomUUID()
  byName[data.name] = id
  characters[id] = data
}

const all = await load(ALL)
all.eachSheet((ws) => { if (!SKIP.has(ws.name)) add(readSheet(ws)) })
const mine = await load(MINE)
mine.eachSheet((ws) => { if (!SKIP.has(ws.name)) add(readSheet(ws)) })

const registry = readRegistry(all.getWorksheet('Registre du personnel'))
for (const name of MISSING_PCS) {
  if (byName[name]) continue
  const reg = registry[name] ?? (name === 'Mulgan' ? { post: 'Extraéorien', badge: '' } : {})
  const empty = Object.fromEntries(STATS.map(({ key }) => [key, { base: 10, mod: 0 }]))
  add({
    name, post: reg.post ?? '', badge: BADGES.some((b) => b.name === reg.badge) ? reg.badge : 'Vert',
    stats: empty, skills: {}, talents: [], passives: [],
  })
}

writeFileSync(new URL(OUT, DIR), JSON.stringify({ version: 2, characters }, null, 2))
console.log(`${Object.keys(characters).length} fiches écrites dans references/${OUT}`)
for (const c of Object.values(characters)) {
  const total = Object.values(c.stats).reduce((s, v) => s + v.base, 0)
  const levels = Object.values(c.skills).reduce((s, v) => s + v, 0)
  console.log(`- ${c.name.padEnd(22)} ${c.post.padEnd(28)} ${c.badge.padEnd(7)} caract. ${total}/70  niveaux ${levels}  talents ${c.talents.length}`)
}
