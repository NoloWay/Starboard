import { connect } from './net.js'
import { roll, rollFree, OUTCOME_LABEL, MODE_LABEL } from './dice.js'
import { setupSheets, replaceCharacters } from './sheets.js'

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

let playerName = store.get('starboard:name')
if (!playerName) {
  playerName = prompt('Ton nom de joueur ?') || 'Anonyme'
  store.set('starboard:name', playerName)
}
// Le rôle est propre à chaque salle (on peut être MJ d'une partie et joueur d'une autre)
const roleKey = `starboard:role:${roomId}`
let role = store.get(roleKey) === 'gm' ? 'gm' : 'player'
const me = () => ({ name: playerName, isGM: role === 'gm' })

$('room-label').textContent = `Salle : ${roomId}`
$('btn-name').textContent = playerName
$('role-select').value = role

// ---------- État partagé ----------
const { doc } = connect(roomId, {
  onPeers: (n) => ($('peer-count').textContent = `${n} pair${n > 1 ? 's' : ''}`),
})
const tokens = doc.getMap('tokens') // id -> { x, y, color, label }
const log = doc.getArray('log') //     [{ who, text, t, secret?, roll? }]

// ---------- Rendu ----------
const canvas = $('board')
const ctx = canvas.getContext('2d')
const GRID = 50
const RADIUS = 20

function resize() {
  const r = canvas.getBoundingClientRect()
  canvas.width = r.width * devicePixelRatio
  canvas.height = r.height * devicePixelRatio
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
  draw()
}
addEventListener('resize', resize)

function draw() {
  const { width, height } = canvas.getBoundingClientRect()
  ctx.clearRect(0, 0, width, height)

  ctx.strokeStyle = '#12203f'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x < width; x += GRID) { ctx.moveTo(x, 0); ctx.lineTo(x, height) }
  for (let y = 0; y < height; y += GRID) { ctx.moveTo(0, y); ctx.lineTo(width, y) }
  ctx.stroke()

  tokens.forEach((t) => {
    ctx.shadowColor = t.color
    ctx.shadowBlur = 14
    ctx.fillStyle = t.color
    ctx.beginPath()
    ctx.arc(t.x, t.y, RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#05070f'
    ctx.font = '600 12px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t.label, t.x, t.y)
  })
}

tokens.observe(draw)

// ---------- Déplacement des pions ----------
let dragId = null
let offset = { x: 0, y: 0 }

function pos(e) {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

canvas.addEventListener('pointerdown', (e) => {
  const p = pos(e)
  let hit = null
  tokens.forEach((t, id) => {
    if (Math.hypot(t.x - p.x, t.y - p.y) <= RADIUS) hit = id
  })
  if (!hit) return
  dragId = hit
  const t = tokens.get(hit)
  offset = { x: t.x - p.x, y: t.y - p.y }
  canvas.classList.add('dragging')
  canvas.setPointerCapture(e.pointerId)
})

canvas.addEventListener('pointermove', (e) => {
  if (!dragId) return
  const p = pos(e)
  const t = tokens.get(dragId)
  if (t) tokens.set(dragId, { ...t, x: p.x + offset.x, y: p.y + offset.y })
})

function endDrag() {
  if (!dragId) return
  const t = tokens.get(dragId)
  if (t) {
    // Aimantation à la grille au relâchement
    const snap = (v) => Math.round((v - GRID / 2) / GRID) * GRID + GRID / 2
    tokens.set(dragId, { ...t, x: snap(t.x), y: snap(t.y) })
  }
  dragId = null
  canvas.classList.remove('dragging')
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)

// ---------- Pions ----------
const COLORS = ['#38e8ff', '#ff3dd8', '#9dff4a', '#ffb02e', '#a78bff', '#ff5a5a']

$('btn-add').addEventListener('click', () => {
  const label = prompt('Nom du pion (2-3 lettres) ?', playerName.slice(0, 2).toUpperCase())
  if (!label) return
  const id = crypto.randomUUID()
  tokens.set(id, {
    x: GRID * 2 + GRID / 2,
    y: GRID * 2 + GRID / 2,
    color: COLORS[tokens.size % COLORS.length],
    label: label.slice(0, 3),
  })
})

canvas.addEventListener('dblclick', (e) => {
  const p = pos(e)
  tokens.forEach((t, id) => {
    if (Math.hypot(t.x - p.x, t.y - p.y) <= RADIUS) tokens.delete(id)
  })
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

// Jet depuis une fiche (caractéristique en d20, compétence en d100)
function rollCheck(character, label, target, sides) {
  const r = roll(sides, target, rollMode)
  pushLog({
    text: `${character.get('name')} · ${label}`,
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

// ---------- Fiches ----------
const sheets = setupSheets({ doc, me, onRoll: rollCheck })

// ---------- Identité : nom & rôle ----------
$('btn-name').addEventListener('click', () => {
  const name = prompt('Ton nom de joueur ?', playerName)?.trim()
  if (!name) return
  playerName = name
  store.set('starboard:name', name)
  $('btn-name').textContent = name
  renderLog()
  sheets.rerender()
})

$('role-select').addEventListener('change', (e) => {
  role = e.target.value
  store.set(roleKey, role)
  document.body.classList.toggle('is-gm', role === 'gm')
  renderLog()
  sheets.rerender()
})
document.body.classList.toggle('is-gm', role === 'gm')

// ---------- Export / import JSON ----------
$('btn-export').addEventListener('click', () => {
  const data = {
    version: 2,
    tokens: tokens.toJSON(),
    log: log.toJSON(),
    characters: doc.getMap('characters').toJSON(),
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
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    alert('Fichier JSON illisible.')
    return
  }
  const parts = ['tokens', 'log', 'characters'].filter((k) => data[k])
  const names = { tokens: 'pions', log: 'journal', characters: 'fiches' }
  if (!parts.length) return alert('Aucune donnée Starboard dans ce fichier.')
  if (!confirm(`Remplacer pour tout le monde : ${parts.map((k) => names[k]).join(', ')} ?`)) return
  doc.transact(() => {
    if (data.tokens) {
      tokens.clear()
      Object.entries(data.tokens).forEach(([id, t]) => tokens.set(id, t))
    }
    if (data.log) {
      log.delete(0, log.length)
      log.push(data.log)
    }
  })
  if (data.characters) replaceCharacters(doc, data.characters)
})

// ---------- Démarrage ----------
resize()
renderLog()
