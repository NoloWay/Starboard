import { h } from './dom.js'
import { BADGES, DOOR_ACCESS, DOOR_LEVELS, stricterLevel } from './rules.js'
import { CHARACTER_MIME } from './sheets.js'
import { CELL, DECKS, bbox, deckSize, doorAt, drawPlan, isRoomType, labelOf, roomsAround, seedItems, shapeAt } from './shipMap.js'
import { setupPlanEditor } from './planEditor.js'

// Plateau : scènes (cartes), image de fond partagée, pions, caméra locale (pan + zoom).
//
// Données partagées (Y.Doc) :
//   scenes : id → { name, order, image (id | null), width, height, grid (= taille des jetons) }
//   images : id → { type, data: Uint8Array }   (image compressée en WebP, partagée en P2P)
//   board  : 'scene' → id de la scène affichée chez tout le monde (choisie par le MJ)
//   tokens : id → { x, y, color, label, scene }  (coordonnées « monde », en pixels de la carte)
// La caméra reste locale : chacun cadre comme il veut.

const DEFAULT_SCENE = 'main'
const SHIP_SCENE = 'ship' // préfixe des scènes de l'onglet Vaisseau (ship:1, ship:0, ship:-1)
const MAX_IMAGE = 4096 // côté max après compression
const ZOOM_MIN = 0.1
const ZOOM_MAX = 4
const COLORS = ['#38e8ff', '#ff3dd8', '#9dff4a', '#ffb02e', '#a78bff', '#ff5a5a']

/** Compresse une image (PNG, JPG, SVG…) en WebP ; renvoie { type, data, width, height }. */
async function compressImage(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    let { naturalWidth: w, naturalHeight: hgt } = img
    if (!w || !hgt) throw new Error('Image vide')
    const scale = Math.min(1, MAX_IMAGE / Math.max(w, hgt))
    w = Math.round(w * scale)
    hgt = Math.round(hgt * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = hgt
    canvas.getContext('2d').drawImage(img, 0, 0, w, hgt)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.85))
    return { type: blob.type, data: new Uint8Array(await blob.arrayBuffer()), width: w, height: hgt }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * ctx : { doc, me() -> { name, isGM } }
 */
export function setupBoard(ctx) {
  const { doc } = ctx
  const scenes = doc.getMap('scenes')
  const images = doc.getMap('images')
  const board = doc.getMap('board')
  const tokens = doc.getMap('tokens')
  const characters = doc.getMap('characters')
  const plan = doc.getMap('plan') // éléments du plan du Gaïa (formes, portes, caméras), voir shipMap.js
  const doorLevels = doc.getMap('doorLevels') // ancien stockage des niveaux de portes : repris à la première modification d'un étage

  const canvas = document.getElementById('board')
  const g = canvas.getContext('2d')
  const bar = document.getElementById('scene-bar')

  // ---------- Plan du Gaïa : version d'origine (Excel) tant que l'étage n'a jamais été modifié ----------
  const deckMarker = (d) => `deck:${d}`
  /** Éléments d'un étage : [[id, élément]…] */
  function deckEntries(d = deck) {
    if (!plan.has(deckMarker(d))) return seedItems(d)
    return [...plan.entries()].filter(([, it]) => it.deck === d && it.kind !== 'deck')
  }
  /** Copie l'étage d'origine dans le Y.Doc avant sa première modification (identifiants stables : sans doublons). */
  function ensureSeeded(d) {
    if (plan.has(deckMarker(d))) return
    doc.transact(() => {
      plan.set(deckMarker(d), { kind: 'deck', deck: d })
      for (const [id, it] of seedItems(d)) {
        plan.set(id, it.kind === 'door' && doorLevels.has(id) ? { ...it, level: doorLevels.get(id) } : it)
      }
    }, 'seed')
  }

  // ---------- Vue (onglet, local à chaque joueur) et scène courante ----------
  // « ship » : plan du Gaïa, un étage choisi localement (scène `ship:<étage>`) ; « map » : scènes du MJ.
  let mode = 'ship'
  let deck = (() => { try { return localStorage.getItem('starboard:deck') } catch { return null } })()
  if (!DECKS.includes(deck)) deck = '0'
  const mapScene = () => {
    const id = board.get('scene')
    return scenes.has(id) && !String(id).startsWith(SHIP_SCENE) ? id : DEFAULT_SCENE
  }
  const sceneId = () => (mode === 'ship' ? `${SHIP_SCENE}:${deck}` : mapScene())
  const scene = () => (mode === 'ship'
    ? { name: `Étage ${deck}`, grid: CELL, image: 'plan', ...deckSize(deck) } // image : permet le cadrage
    : scenes.get(sceneId()) ?? { name: 'Plateau', grid: 50, image: null })
  const tokenScene = (t) => t.scene ?? DEFAULT_SCENE
  const tokenSize = () => Number(scene().grid) || 50

  // ---------- Caméra (locale, une par scène) ----------
  const cams = {}
  // Une seule caméra pour tous les étages du vaisseau : changer d'étage garde le cadrage (les étages se superposent)
  const cam = () => (cams[mode === 'ship' ? SHIP_SCENE : sceneId()] ??= { x: 0, y: 0, zoom: 1, fitted: false })
  const toWorld = (sx, sy) => ({ x: (sx - cam().x) / cam().zoom, y: (sy - cam().y) / cam().zoom })
  const view = () => canvas.getBoundingClientRect()

  /** Cadre la carte entière (ou l'origine s'il n'y a pas d'image). */
  /** Emprise de tous les éléments de tous les étages (même cadre quel que soit l'étage affiché). */
  function shipBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    for (const d of DECKS) {
      for (const [, it] of deckEntries(d)) {
        if (it.kind === 'shape') { const b = bbox(it); add(b.minX, b.minY); add(b.maxX, b.maxY) }
        else if (it.kind === 'door') { add(it.seg[0], it.seg[1]); add(it.seg[2], it.seg[3]) }
        else if (it.kind === 'camera') add(it.x, it.y)
      }
    }
    return x0 < x1 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
  }

  function fit() {
    const s = mode === 'ship' ? { image: 'plan', ...(shipBounds() ?? { x: 0, y: 0, ...deckSize(deck) }) } : { x: 0, y: 0, ...scene() }
    const { width, height } = view()
    const c = cam()
    if (!width || !height) return // pas encore affiché (onglet en arrière-plan) : on cadrera au redimensionnement
    if (s.image && s.width && s.height) {
      c.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(width / s.width, height / s.height) * 0.95))
      c.x = (width - s.width * c.zoom) / 2 - s.x * c.zoom
      c.y = (height - s.height * c.zoom) / 2 - s.y * c.zoom
    } else {
      c.zoom = 1
      c.x = 0
      c.y = 0
    }
    c.fitted = true
    draw()
  }

  // ---------- Images (décodées une fois, gardées en cache) ----------
  const bitmaps = new Map() // id → ImageBitmap | 'loading'
  function bitmap(id) {
    if (!id) return null
    const cached = bitmaps.get(id)
    if (cached && cached !== 'loading') return cached
    if (!cached && images.has(id)) {
      bitmaps.set(id, 'loading')
      const { type, data } = images.get(id)
      createImageBitmap(new Blob([data], { type }))
        .then((bmp) => { bitmaps.set(id, bmp); if (!cam().fitted) fit(); else draw() })
        .catch(() => bitmaps.delete(id))
    }
    return null
  }

  // ---------- Rendu ----------
  function resize() {
    const r = view()
    canvas.width = r.width * devicePixelRatio
    canvas.height = r.height * devicePixelRatio
    if (!cam().fitted) fit()
    draw()
  }

  function draw() {
    const { width, height } = view()
    const c = cam()
    const s = scene()
    g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    g.clearRect(0, 0, width, height)
    g.setTransform(devicePixelRatio * c.zoom, 0, 0, devicePixelRatio * c.zoom, devicePixelRatio * c.x, devicePixelRatio * c.y)

    const bmp = mode === 'ship' ? null : bitmap(s.image)
    if (mode === 'ship') drawPlan(g, deckEntries(), c.zoom)
    else if (bmp) {
      g.imageSmoothingEnabled = c.zoom < 2 // plans en « pixel art » : net quand on zoome
      g.drawImage(bmp, 0, 0, s.width, s.height)
    }

    // Pions de la scène (ceux des personnages cachés : invisibles aux joueurs, translucides pour le MJ)
    const r = tokenSize() * 0.4
    tokens.forEach((t) => {
      if (!visible(t)) return
      const { label, color, hidden, isChar } = look(t)
      g.globalAlpha = hidden ? 0.45 : 1
      g.shadowColor = color
      g.shadowBlur = 14
      g.fillStyle = color
      g.beginPath()
      g.arc(t.x, t.y, r, 0, Math.PI * 2)
      g.fill()
      g.shadowBlur = 0
      if (isChar) { // anneau : distingue les personnages (et rend visibles les badges sombres)
        g.strokeStyle = 'rgba(234, 246, 255, 0.75)'
        g.lineWidth = r * 0.1
        g.stroke()
      }
      g.fillStyle = isLight(color) ? '#05070f' : '#eaf6ff'
      g.font = `600 ${Math.round(r * 0.6)}px system-ui`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(label, t.x, t.y)
      g.globalAlpha = 1
    })

    if (mode === 'ship') editor.drawOverlay(g, c.zoom)

    document.getElementById('zoom-label').textContent = `${Math.round(c.zoom * 100)} %`
  }

  // ---------- Souris : pions, déplacement de la vue, zoom ----------
  let drag = null // { kind: 'token', id, dx, dy } | { kind: 'pan', sx, sy, cx, cy }

  const pointer = (e) => {
    const r = view()
    return { sx: e.clientX - r.left, sy: e.clientY - r.top }
  }
  function hitToken(world) {
    let hit = null
    const r = tokenSize() * 0.4
    tokens.forEach((t, id) => {
      if (visible(t) && Math.hypot(t.x - world.x, t.y - world.y) <= r) hit = id
    })
    return hit
  }

  canvas.addEventListener('pointerdown', (e) => {
    const { sx, sy } = pointer(e)
    const world = toWorld(sx, sy)
    const editing = mode === 'ship' && editor.active
    if (editing && editor.pointerDown(world, e)) {
      drag = { kind: 'edit' }
      canvas.setPointerCapture(e.pointerId)
      return
    }
    const hit = e.button === 0 && !editing ? hitToken(world) : null
    if (hit) {
      const t = tokens.get(hit)
      drag = { kind: 'token', id: hit, dx: t.x - world.x, dy: t.y - world.y }
    } else if (e.button === 0 || e.button === 1) {
      e.preventDefault()
      drag = { kind: 'pan', sx, sy, cx: cam().x, cy: cam().y }
    } else return
    canvas.classList.add('dragging')
    canvas.setPointerCapture(e.pointerId)
  })

  canvas.addEventListener('pointermove', (e) => {
    const { sx, sy } = pointer(e)
    if (!drag) {
      // Vue Vaisseau : nom de la pièce survolée en infobulle
      if (mode === 'ship') {
        const w = toWorld(sx, sy)
        const room = shapeAt(g, deckEntries(), w.x, w.y, (it) => isRoomType(it.type))
        canvas.title = room ? labelOf(room[1]) : ''
        editor.hover(w, e) // aperçu de la polyligne en cours
      }
      return
    }
    if (drag.kind === 'edit') {
      editor.pointerMove(toWorld(sx, sy), e)
    } else if (drag.kind === 'pan') {
      cam().x = drag.cx + sx - drag.sx
      cam().y = drag.cy + sy - drag.sy
      draw()
    } else {
      const world = toWorld(sx, sy)
      const t = tokens.get(drag.id)
      if (t) tokens.set(drag.id, { ...t, x: world.x + drag.dx, y: world.y + drag.dy })
    }
  })

  function endDrag(e) {
    if (drag?.kind === 'edit') editor.pointerUp()
    // Simple clic (sans déplacement) dans la vue Vaisseau, hors édition : ouvre la fiche de la porte cliquée
    if (drag?.kind === 'pan' && e?.type === 'pointerup' && mode === 'ship' && !editor.active) {
      const { sx, sy } = pointer(e)
      if (Math.hypot(sx - drag.sx, sy - drag.sy) < 4) {
        const w = toWorld(sx, sy)
        const door = doorAt(deckEntries(), w.x, w.y)
        if (door) openDoor(door[0], sx, sy)
        else closeDoor()
      }
    }
    drag = null
    canvas.classList.remove('dragging')
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener('lostpointercapture', endDrag) // filet de sécurité si le relâchement n'arrive pas
  canvas.addEventListener('auxclick', (e) => e.preventDefault())

  function zoomAt(sx, sy, factor) {
    const c = cam()
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * factor))
    const world = toWorld(sx, sy)
    c.zoom = zoom
    c.x = sx - world.x * zoom
    c.y = sy - world.y * zoom
    draw()
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const { sx, sy } = pointer(e)
    zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015))
  }, { passive: false })

  canvas.addEventListener('dblclick', (e) => {
    const { sx, sy } = pointer(e)
    if (mode === 'ship' && editor.active) return editor.dblclick(toWorld(sx, sy))
    const hit = hitToken(toWorld(sx, sy))
    if (hit) tokens.delete(hit)
  })

  // ---------- Pions ----------


  /** Jeton lié à un personnage : nom et couleur de badge lus en direct sur la fiche. */
  function look(t) {
    const c = t.charId && characters.get(t.charId)
    if (!c) return { label: t.label, color: t.color, hidden: false, isChar: false }
    const initials = c.get('name').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    return { label: initials, color: BADGES.find((b) => b.name === c.get('badge'))?.color ?? '#9aa4b5', hidden: !!c.get('hidden'), isChar: true }
  }
  const visible = (t) => tokenScene(t) === sceneId() && (ctx.me().isGM || !look(t).hidden)

  /** MJ : place le jeton d'un personnage ; s'il existe déjà (sur n'importe quelle scène), il est déplacé ici. */
  function placeCharacter(charId, world) {
    const c = characters.get(charId)
    if (!c) return
    const existing = [...tokens.entries()].find(([, t]) => t.charId === charId)
    const pos = { x: world.x, y: world.y, scene: sceneId() }
    if (existing) tokens.set(existing[0], { ...existing[1], ...pos })
    else tokens.set(crypto.randomUUID(), { ...pos, charId, label: look({ charId }).label, color: look({ charId }).color })
  }

  canvas.addEventListener('dragover', (e) => {
    if (ctx.me().isGM && e.dataTransfer.types.includes(CHARACTER_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  })
  canvas.addEventListener('drop', (e) => {
    const id = e.dataTransfer.getData(CHARACTER_MIME)
    if (!id || !ctx.me().isGM) return
    e.preventDefault()
    const { sx, sy } = pointer(e)
    placeCharacter(id, toWorld(sx, sy))
  })

  function addToken(label) {
    const { width, height } = view()
    const center = toWorld(width / 2, height / 2)
    tokens.set(crypto.randomUUID(), {
      x: center.x, y: center.y,
      color: COLORS[tokens.size % COLORS.length],
      label: label.slice(0, 3),
      scene: sceneId(),
    })
  }

  // ---------- Portes du vaisseau : niveau d'accréditation (modifiable par tous) ----------
  let popup = null // { el, id }

  function closeDoor() {
    popup?.el.remove()
    popup = null
  }

  /** Modifie un élément du plan (l'étage est d'abord copié depuis l'Excel s'il n'a jamais été modifié). */
  function setItem(id, it) {
    ensureSeeded(it.deck)
    plan.set(id, it)
  }

  function openDoor(id, sx, sy) {
    closeDoor()
    const el = h('div', { class: 'door-popup' })
    popup = { el, id }
    renderDoor()
    canvas.parentElement.append(el)
    // Placée à côté du clic, sans sortir du plateau
    const { width, height } = view()
    el.style.left = `${Math.min(sx + 14, width - el.offsetWidth - 8)}px`
    el.style.top = `${Math.min(Math.max(8, sy - 20), height - el.offsetHeight - 8)}px`
  }

  function renderDoor() {
    if (!popup) return
    const { el, id } = popup
    const entries = deckEntries()
    const door = entries.find(([k]) => k === id)?.[1]
    if (!door) return closeDoor()
    const def = door.defaultLevel ?? door.level
    const color = (name) => BADGES.find((b) => b.name === name)?.color
    el.innerHTML = ''
    el.append(
      h('header', {}, h('b', {}, door.access ? 'Trappe technique' : 'Porte'), h('button', { class: 'icon', title: 'Fermer', onclick: closeDoor }, '×')),
      h('p', { class: 'door-rooms' }, roomsAround(g, entries, door).join('  ↔  ') || 'Accès'),
      h('label', { class: 'field' }, 'Accréditation requise',
        h('select', {
          style: `--badge:${color(door.level)}`,
          onchange: (e) => setItem(id, { ...door, level: e.target.value }),
        }, DOOR_LEVELS.map((l) => h('option', { value: l, selected: l === door.level }, `Badge ${l}`)))),
      h('div', { class: 'door-badges' }, h('span', { class: 'muted' }, 'Ouvrent :'),
        DOOR_ACCESS[door.level].map((b) => h('i', { title: `Badge ${b}`, style: `--badge:${color(b)}` }))),
      h('p', { class: 'muted door-default' }, `Par défaut : badge ${def}`,
        door.level !== def && h('button', { class: 'small', onclick: () => setItem(id, { ...door, level: def }) }, 'Rétablir')),
    )
  }

  /** MJ : applique `fn(porte) → niveau` à toutes les portes de tous les étages. */
  function setAllDoors(fn) {
    DECKS.forEach(ensureSeeded)
    doc.transact(() => plan.forEach((it, id) => {
      if (it.kind === 'door') plan.set(id, { ...it, level: fn(it) })
    }))
  }

  // ---------- Éditeur du plan (MJ) ----------
  const editor = setupPlanEditor({
    doc, plan, g,
    deck: () => deck,
    entries: () => deckEntries(),
    ensureSeeded,
    zoom: () => cam().zoom,
    draw: () => draw(),
    stage: canvas.parentElement,
  })

  // ---------- Barre des scènes ----------
  const sortedScenes = () => [...scenes.entries()].sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))

  function ensureDefaultScene() {
    if (!scenes.has(DEFAULT_SCENE)) scenes.set(DEFAULT_SCENE, { name: 'Plateau', order: 0, image: null, grid: 50 })
  }

  function patchScene(changes) {
    ensureDefaultScene()
    scenes.set(sceneId(), { ...scenes.get(sceneId()), ...changes })
  }

  async function chooseImage() {
    const input = h('input', { type: 'file', accept: 'image/*' })
    input.addEventListener('change', async () => {
      const file = input.files[0]
      if (!file) return
      try {
        const img = await compressImage(file)
        const id = crypto.randomUUID()
        const old = scene().image
        doc.transact(() => {
          images.set(id, { type: img.type, data: img.data })
          patchScene({ image: id, width: img.width, height: img.height })
          if (old && old !== id && ![...scenes.values()].some((s) => s.image === old)) images.delete(old)
        })
        cam().fitted = false
        const kb = Math.round(img.data.byteLength / 1024)
        if (kb > 3000) alert(`Image lourde (${kb} Ko) : la synchronisation peut prendre quelques secondes.`)
      } catch (err) {
        alert(`Impossible de lire cette image (${err.message}).`)
      }
    })
    input.click()
  }

  function newScene() {
    const name = prompt('Nom de la nouvelle scène ?', 'Nouvelle scène')?.trim()
    if (!name) return
    const id = crypto.randomUUID()
    const order = Math.max(0, ...[...scenes.values()].map((s) => s.order ?? 0)) + 1
    doc.transact(() => {
      ensureDefaultScene()
      scenes.set(id, { name, order, image: null, grid: 50 })
      board.set('scene', id)
    })
  }

  function deleteScene() {
    const id = sceneId()
    if (id === DEFAULT_SCENE) return alert('La scène principale ne peut pas être supprimée.')
    if (!confirm(`Supprimer la scène « ${scene().name} » et ses pions ?`)) return
    doc.transact(() => {
      const img = scenes.get(id)?.image
      scenes.delete(id)
      if (img && ![...scenes.values()].some((s) => s.image === img)) images.delete(img)
      tokens.forEach((t, tid) => { if (tokenScene(t) === id) tokens.delete(tid) })
      board.set('scene', DEFAULT_SCENE)
    })
  }

  function renderBar() {
    bar.innerHTML = ''
    if (mode === 'ship') {
      // Vue Vaisseau : choix de l'étage (local), pas de gestion de scènes ni de fond
      bar.append(h('span', { class: 'scene-name' }, 'Gaïa'), h('div', { class: 'seg' }, DECKS.map((d) => h('button', {
        class: d === deck ? 'on' : '',
        onclick: () => {
          deck = d
          closeDoor()
          try { localStorage.setItem('starboard:deck', d) } catch { /* stockage indisponible */ }
          lastScene = sceneId()
          if (!cam().fitted) fit()
          editor.deckChanged()
          renderBar()
          draw()
        },
      }, `Étage ${d.replace('-', '−')}`))))
      // MJ : niveau minimal pour toutes les portes (chaque porte garde son niveau par défaut s'il est plus élevé),
      // et mode modification du plan
      if (ctx.me().isGM) {
        const level = h('select', { title: 'Niveau à appliquer' }, DOOR_LEVELS.map((l) => h('option', { value: l }, `Badge ${l}`)))
        bar.append(h('span', { class: 'sep' }), h('span', { class: 'muted' }, 'Portes'), level,
          h('button', {
            class: 'small',
            title: 'Toutes les portes passent à ce niveau, sauf celles dont le niveau par défaut est plus élevé',
            onclick: () => setAllDoors((d) => stricterLevel(level.value, d.defaultLevel ?? d.level)),
          }, 'Appliquer à toutes'),
          h('button', {
            class: 'small danger',
            title: 'Rendre à toutes les portes leur niveau par défaut',
            onclick: () => { if (confirm('Remettre toutes les portes à leur niveau par défaut ?')) setAllDoors((d) => d.defaultLevel ?? d.level) },
          }, 'Réinitialiser'),
          h('span', { class: 'sep' }),
          h('button', {
            class: editor.active ? 'small primary' : 'small',
            title: 'Dessiner et modifier le plan (pièces, portes, caméras)',
            onclick: () => { closeDoor(); editor.setActive(!editor.active); renderBar() },
          }, editor.active ? 'Terminer' : '✎ Modifier le plan'))
      }
      return
    }
    const s = scene()
    const isGM = ctx.me().isGM
    const list = sortedScenes().filter(([id]) => !String(id).startsWith(SHIP_SCENE))
    bar.append(...[
      isGM && list.length
        ? h('select', { title: 'Scène affichée chez tout le monde', onchange: (e) => board.set('scene', e.target.value) },
          list.map(([id, sc]) => h('option', { value: id, selected: id === sceneId() }, sc.name)))
        : h('span', { class: 'scene-name' }, s.name),
      isGM && h('button', { class: 'small', onclick: newScene }, '+ Scène'),
      isGM && h('button', { class: 'small', onclick: chooseImage }, s.image ? 'Changer le fond' : 'Image de fond'),
      isGM && h('button', {
        class: 'small',
        onclick: () => { const n = prompt('Nom de la scène ?', s.name)?.trim(); if (n) patchScene({ name: n }) },
      }, 'Renommer'),
      isGM && h('label', { class: 'check', title: 'Taille des jetons, en pixels de la carte' }, 'Jetons',
        h('input', {
          type: 'number', min: 4, max: 400, value: tokenSize(), class: 'short',
          onchange: (e) => patchScene({ grid: Math.max(4, Math.min(400, Number(e.target.value) || 50)) }),
        })),
      isGM && sceneId() !== DEFAULT_SCENE && h('button', { class: 'small danger', onclick: deleteScene }, 'Supprimer'),
    ].filter(Boolean))
  }

  // ---------- Synchronisation ----------
  let lastScene = sceneId()
  let lastImage = scene().image
  function onSceneChange() {
    if (sceneId() !== lastScene) {
      lastScene = sceneId()
      lastImage = scene().image
      if (!cam().fitted) fit()
    } else if (scene().image !== lastImage) {
      // Nouvelle carte sur la scène affichée : on recadre
      lastImage = scene().image
      fit()
    }
    renderBar()
    draw()
  }
  scenes.observe(onSceneChange)
  board.observe(onSceneChange)
  images.observe(draw)
  tokens.observe(draw)
  characters.observeDeep(draw) // nom, badge ou visibilité d'un personnage
  plan.observe(() => { draw(); renderDoor(); editor.refresh() })

  addEventListener('resize', resize)
  document.getElementById('btn-fit').addEventListener('click', fit)
  document.getElementById('btn-zoom-in').addEventListener('click', () => { const { width, height } = view(); zoomAt(width / 2, height / 2, 1.25) })
  document.getElementById('btn-zoom-out').addEventListener('click', () => { const { width, height } = view(); zoomAt(width / 2, height / 2, 0.8) })

  resize()
  renderBar()

  return {
    addToken,
    rerender() {
      if (editor.active && !ctx.me().isGM) editor.setActive(false) // l'édition est réservée au MJ
      renderBar()
      draw()
    },
    /** Change d'onglet : 'ship' (Vaisseau) ou 'map' (Carte). */
    setMode(m) {
      mode = m === 'map' ? 'map' : 'ship'
      closeDoor()
      if (mode !== 'ship' && editor.active) editor.setActive(false)
      lastScene = sceneId()
      lastImage = scene().image
      if (!cam().fitted) fit()
      renderBar()
      draw()
    },
    /** Données à exporter (images encodées en base64 dans le JSON). */
    exportData() {
      const imgs = {}
      images.forEach((v, id) => { imgs[id] = { type: v.type, base64: toBase64(v.data) } })
      return { scenes: scenes.toJSON(), images: imgs, board: board.toJSON() }
    },
    importData({ scenes: sc, images: imgs, board: b }) {
      doc.transact(() => {
        if (sc) { scenes.clear(); Object.entries(sc).forEach(([id, v]) => scenes.set(id, v)) }
        if (imgs) {
          images.clear()
          Object.entries(imgs).forEach(([id, v]) => images.set(id, { type: v.type, data: fromBase64(v.base64) }))
        }
        if (b) { board.clear(); Object.entries(b).forEach(([k, v]) => board.set(k, v)) }
      })
      bitmaps.clear()
      Object.values(cams).forEach((c) => { c.fitted = false })
      fit()
    },
  }
}

function toBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
function fromBase64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** Couleur claire ? (pour choisir un texte sombre ou clair sur le jeton) */
function isLight(hex) {
  const n = Number.parseInt(String(hex).replace('#', ''), 16)
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 140
}
