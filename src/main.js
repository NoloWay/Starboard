import { connect } from './net.js'

// ---------- Salle & identité ----------
if (!location.hash.slice(1)) {
  location.hash = Math.random().toString(36).slice(2, 8)
}
const roomId = location.hash.slice(1)

let playerName = localStorage.getItem('starboard:name')
if (!playerName) {
  playerName = prompt('Ton nom de joueur ?') || 'Anonyme'
  localStorage.setItem('starboard:name', playerName)
}

const $ = (id) => document.getElementById(id)
$('room-label').textContent = `Salle : ${roomId}`

// ---------- État partagé ----------
const { doc } = connect(roomId, {
  onPeers: (n) => ($('peer-count').textContent = `${n} pair${n > 1 ? 's' : ''}`),
})
const tokens = doc.getMap('tokens') // id -> { x, y, color, label }
const log = doc.getArray('log') //     [{ who, text, t }]

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

function endDrag(e) {
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

// ---------- Dés & journal ----------
function roll(sides) {
  const value = 1 + Math.floor(Math.random() * sides)
  log.push([{ who: playerName, text: `d${sides} → ${value}`, t: Date.now() }])
}
$('btn-d6').addEventListener('click', () => roll(6))
$('btn-d20').addEventListener('click', () => roll(20))

function renderLog() {
  const ul = $('log-list')
  ul.innerHTML = ''
  log.toArray().slice(-100).reverse().forEach((entry) => {
    const li = document.createElement('li')
    const b = document.createElement('b')
    b.textContent = entry.who
    li.append(b, ` ${entry.text}`)
    ul.append(li)
  })
}
log.observe(renderLog)

// ---------- Export / import JSON ----------
$('btn-export').addEventListener('click', () => {
  const data = { version: 1, tokens: tokens.toJSON(), log: log.toJSON() }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `starboard-${roomId}.json`
  a.click()
  URL.revokeObjectURL(a.href)
})

$('file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  if (!file) return
  const data = JSON.parse(await file.text())
  doc.transact(() => {
    tokens.clear()
    Object.entries(data.tokens ?? {}).forEach(([id, t]) => tokens.set(id, t))
    log.delete(0, log.length)
    log.push(data.log ?? [])
  })
  e.target.value = ''
})

// ---------- Démarrage ----------
resize()
renderLog()
