import { connect } from './net.js'
import { roll, rollFree, OUTCOME_LABEL, MODE_LABEL } from './dice.js'
import { setupSheets, replaceCharacters } from './sheets.js'
import { setupShip, writeShip } from './shipPanel.js'
import { setupBoard } from './board.js'
import { setupMusic } from './music.js'
import { PLAYERS, OBSERVER, presetOf } from './rules.js'

// ---------- Salle & identité ----------
if (!location.hash.slice(1)) {
  location.hash = Math.random().toString(36).slice(2, 8)
}
const roomId = location.hash.slice(1)

const $ = (id) => document.getElementById(id)
const store = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* stockage indisponible */ } },
}

// Un ancien nom libre (hors liste) redevient « Observateur »
let playerName = presetOf(store.get('starboard:name'))?.name || OBSERVER
// Le rôle est propre à chaque salle (on peut être MJ d'une partie et joueur d'une autre) ;
// sans choix enregistré, il vient du préréglage du joueur (Walter = MJ)
const roleKey = `starboard:role:${roomId}`
let role = store.get(roleKey) || (presetOf(playerName)?.gm ? 'gm' : 'player')
const me = () => ({ name: playerName, isGM: role === 'gm' })

$('room-label').textContent = `Salle : ${roomId}`
function renderNames() {
  const opts = PLAYERS.map((p) => [p.name, p.gm ? `${p.name} · MJ` : p.character ? `${p.name} · ${p.character.split(' ')[0]}` : p.name])
  $('name-select').replaceChildren(...opts.map(([v, t]) => new Option(t, v, false, v === playerName)))
}
renderNames()
$('role-select').value = role

// ---------- État partagé ----------
const { doc } = connect(roomId, {
  onPeers: (n) => ($('peer-count').textContent = n < 0 ? 'hors ligne' : `${n} pair${n > 1 ? 's' : ''}`),
})
const tokens = doc.getMap('tokens') // id -> { x, y, color, label, scene } (géré par board.js)
const log = doc.getArray('log') //     [{ who, text, t, secret?, roll? }]

// ---------- Plateau (scènes, caméra, pions) ----------
const board = setupBoard({ doc, me })

// Onglets Vaisseau / Carte (choix local, mémorisé)
function setView(v) {
  board.setMode(v)
  store.set('starboard:view', v)
  $('view-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.view === v))
}
$('view-tabs').addEventListener('click', (e) => { if (e.target.dataset.view) setView(e.target.dataset.view) })
setView(store.get('starboard:view') === 'map' ? 'map' : 'ship')

const music = setupMusic({ doc, me })

$('btn-add').addEventListener('click', () => {
  const label = prompt('Nom du pion (2-3 lettres) ?', playerName.slice(0, 2).toUpperCase())
  if (label) board.addToken(label)
})

// ---------- Jets ----------
let rollMode = 'normal'
$('roll-mode').addEventListener('click', (e) => {
  const mode = e.target.dataset?.mode
  if (!mode) return
  rollMode = mode
  $('roll-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode))
})

const isSecret = () => $('secret-roll').checked

function pushLog(entry) {
  log.push([{ who: playerName, t: Date.now(), secret: isSecret(), ...entry }])
}

// Jet libre (sans cible)
function rollPlain(sides) {
  pushLog({ text: `d${sides} → ${rollFree(sides)}` })
}
$('btn-d6').addEventListener('click', () => rollPlain(6))
$('btn-d20').addEventListener('click', () => rollPlain(20))
$('btn-d100').addEventListener('click', () => rollPlain(100))

// Jet contre une valeur (caractéristique ou stat du vaisseau en d20, compétence en d100)
function rollCheck(label, target, sides) {
  const r = roll(sides, target, rollMode)
  pushLog({
    text: label,
    roll: { sides, target, mode: r.mode, values: r.values, kept: r.kept, outcome: r.outcome },
  })
}

// ---------- Journal ----------
const canSeeEntry = (entry) => !entry.secret || role === 'gm' || entry.who === playerName

function renderLog() {
  const ul = $('log-list')
  ul.innerHTML = ''
  log.toArray().filter(canSeeEntry).slice(-100).reverse().forEach((entry) => {
    const li = document.createElement('li')
    if (entry.secret) li.classList.add('secret')
    const b = document.createElement('b')
    b.textContent = entry.who
    li.append(b, ` ${entry.text}`)
    if (entry.secret) li.title = 'Jet secret : visible par son auteur et le MJ'

    const r = entry.roll
    if (r) {
      li.classList.add(`outcome-${r.outcome}`)
      const detail = document.createElement('div')
      detail.className = 'roll-detail'
      const mode = MODE_LABEL[r.mode] ? ` (${MODE_LABEL[r.mode]})` : ''
      const dice = r.values.length > 1 ? `${r.values.join(' / ')}` : `${r.values[0]}`
      detail.textContent = `1d${r.sides} ≤ ${r.target}${mode} : ${dice}`
      const res = document.createElement('div')
      res.className = 'roll-result'
      res.textContent = OUTCOME_LABEL[r.outcome] + (r.kept != null && r.values.length > 1 ? ` (${r.kept})` : '')
      li.append(detail, res)
    }
    ul.append(li)
  })
}
log.observe(renderLog)

// ---------- Fiches & vaisseau (un seul panneau ouvert à la fois) ----------
const sheets = setupSheets({ doc, me, onRoll: rollCheck, onOpen: () => ship.close() })
const ship = setupShip({ doc, me, onRoll: rollCheck, onOpen: () => sheets.close() })

// ---------- Identité : nom & rôle ----------
$('name-select').addEventListener('change', (e) => {
  playerName = e.target.value
  store.set('starboard:name', playerName)
  setRole(presetOf(playerName).gm ? 'gm' : 'player')
})

$('role-select').addEventListener('change', (e) => setRole(e.target.value))
function setRole(r) {
  role = r
  $('role-select').value = r
  store.set(roleKey, role)
  document.body.classList.toggle('is-gm', role === 'gm')
  renderLog()
  sheets.rerender()
  ship.rerender()
  board.rerender()
  music.rerender()
}
document.body.classList.toggle('is-gm', role === 'gm')

// ---------- Export / import JSON ----------
$('btn-export').addEventListener('click', () => {
  const data = {
    version: 3,
    ...board.exportData(), // scenes, images (base64), board
    tokens: tokens.toJSON(),
    log: log.toJSON(),
    characters: doc.getMap('characters').toJSON(),
    musicTracks: doc.getMap('musicTracks').toJSON(),
    doorLevels: doc.getMap('doorLevels').toJSON(),
    plan: doc.getMap('plan').toJSON(),
    ship: doc.getMap('ship').toJSON(),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `starboard-${roomId}.json`
  a.click()
  URL.revokeObjectURL(a.href)
})

// Seules les parties présentes dans le fichier sont remplacées
// (un fichier qui ne contient que des fiches ne touche pas aux pions ni au journal).
$('file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (role !== 'gm') return // l'import écrase la partie de tout le monde : réservé au MJ
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    alert('Fichier JSON illisible.')
    return
  }
  const parts = ['scenes', 'tokens', 'log', 'characters', 'ship', 'musicTracks', 'doorLevels', 'plan'].filter((k) => data[k] && Object.keys(data[k]).length)
  const names = { scenes: 'scènes et cartes', tokens: 'pions', log: 'journal', characters: 'fiches', ship: 'vaisseau', musicTracks: 'pistes de musique', doorLevels: 'accréditations des portes (ancien format)', plan: 'plan du vaisseau' }
  if (!parts.length) return alert('Aucune donnée Starboard dans ce fichier.')
  if (!confirm(`Remplacer pour tout le monde : ${parts.map((k) => names[k]).join(', ')} ?`)) return
  if (parts.includes('scenes')) board.importData(data)
  doc.transact(() => {
    if (parts.includes('tokens')) {
      tokens.clear()
      Object.entries(data.tokens).forEach(([id, t]) => tokens.set(id, t))
    }
    if (parts.includes('log')) {
      log.delete(0, log.length)
      log.push(data.log)
    }
  })
  if (parts.includes('characters')) replaceCharacters(doc, data.characters)
  if (parts.includes('ship')) writeShip(doc, data.ship)
  // Collections simples (id → valeur) : remplacées telles quelles
  for (const k of ['musicTracks', 'doorLevels', 'plan'].filter((p) => parts.includes(p))) {
    const map = doc.getMap(k)
    doc.transact(() => { map.clear(); Object.entries(data[k]).forEach(([id, v]) => map.set(id, v)) })
  }
})

// ---------- Démarrage ----------
renderLog()
