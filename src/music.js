import { h } from './dom.js'

// Musique d'ambiance : le MJ choisit une vidéo YouTube, elle est jouée en même temps chez tout le monde.
//
// Données partagées :
//   music          : { videoId, playing, startedAt (Date.now() du lancement), position (s au lancement), loop,
//                     playlistId, index (morceau joué dans la playlist ; absents = piste seule) }
//   musicTracks    : id → { name, videoId, start, order }   (pistes enregistrées par le MJ)
//   musicPlaylists : id → { name, order, tracks: [{ videoId, name }] }
// Playlist : à la fin d'un morceau, n'importe quel client passe au suivant (même valeur écrite par tous,
// donc sans conflit) ; « En boucle » reprend la playlist au début (ou la piste seule).
// Chaque joueur règle son propre volume (localStorage). Le lecteur YouTube reste visible
// (les conditions de YouTube imposent un lecteur d'au moins 200 × 200 px).

const DRIFT = 2 // écart toléré (secondes) avant de recaler la lecture

/** Identifiant de playlist d'un lien YouTube (…&list=PL…), ou null. */
export function parsePlaylist(input) {
  try { return new URL(String(input).trim()).searchParams.get('list') } catch { return null }
}

/** Titre d'une vidéo (oEmbed public de YouTube, sans clé). */
async function videoTitle(videoId) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${videoId}`)
    return r.ok ? (await r.json()).title : null
  } catch { return null }
}

/** Liste des vidéos d'une playlist YouTube, via un lecteur caché (l'API IFrame la donne sans clé). */
function fetchPlaylistIds(YT, listId) {
  return new Promise((resolve) => {
    const holder = h('div', { style: 'position:absolute;left:-9999px;width:200px;height:200px' }, h('div'))
    document.body.append(holder)
    let tries = 0
    let p = null
    const done = (ids) => { try { p?.destroy() } catch { /* déjà détruit */ } holder.remove(); resolve(ids) }
    p = new YT.Player(holder.firstChild, {
      width: 200, height: 200,
      playerVars: { listType: 'playlist', list: listId, autoplay: 0 },
      events: {
        onReady: () => {
          const poll = () => {
            const ids = p.getPlaylist()
            if (ids?.length) return done(ids)
            if (++tries > 40) return done([])
            setTimeout(poll, 250)
          }
          poll()
        },
        onError: () => done([]),
      },
    })
  })
}

/** Extrait l'identifiant et le temps de départ d'un lien YouTube (ou d'un identifiant brut). */
export function parseYouTube(input) {
  const s = String(input).trim()
  let id = null
  let start = 0
  try {
    const url = new URL(s)
    if (url.hostname.endsWith('youtu.be')) id = url.pathname.slice(1)
    else if (url.searchParams.get('v')) id = url.searchParams.get('v')
    else id = url.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ?? null
    const t = url.searchParams.get('t') ?? url.searchParams.get('start')
    if (t) {
      const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t)
      start = m ? (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : 0
    }
  } catch {
    id = s
  }
  return /^[\w-]{11}$/.test(id ?? '') ? { videoId: id, start } : null
}

let apiPromise = null
function loadYouTubeApi() {
  apiPromise ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT)
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT) }
    document.head.append(h('script', { src: 'https://www.youtube.com/iframe_api' }))
  })
  return apiPromise
}

/** ctx : { doc, me() -> { isGM } } */
export function setupMusic(ctx) {
  const music = ctx.doc.getMap('music')
  const tracks = ctx.doc.getMap('musicTracks')
  const playlists = ctx.doc.getMap('musicPlaylists')
  const root = document.getElementById('music')

  let player = null
  let ready = false
  let loadedId = null
  let blocked = false // lecture automatique bloquée par le navigateur
  let error = ''

  const state = () => music.toJSON()
  const volumeKey = 'starboard:volume'
  let volume = 60
  try { volume = Number(localStorage.getItem(volumeKey) ?? 60) } catch { /* stockage indisponible */ }

  /** Position attendue (secondes) d'après l'horloge partagée. */
  function expected() {
    const m = state()
    if (!m.playing) return Number(m.position) || 0
    let pos = (Number(m.position) || 0) + (Date.now() - (Number(m.startedAt) || Date.now())) / 1000
    const duration = ready ? player.getDuration() : 0
    if (m.loop && !m.playlistId && duration > 0) pos %= duration
    return pos
  }

  // ---------- Synchronisation du lecteur avec l'état partagé ----------
  function sync() {
    if (!ready) return
    const m = state()
    if (!m.videoId) {
      if (loadedId) player.stopVideo()
      loadedId = null
      render()
      return
    }
    if (m.videoId !== loadedId) {
      loadedId = m.videoId
      error = ''
      if (m.playing) player.loadVideoById({ videoId: m.videoId, startSeconds: expected() })
      else player.cueVideoById({ videoId: m.videoId, startSeconds: expected() })
      setTimeout(checkBlocked, 2500)
      render()
      return
    }
    const ps = player.getPlayerState()
    const YTS = window.YT.PlayerState
    if (m.playing) {
      const duration = player.getDuration()
      const target = expected()
      if ((!m.loop || m.playlistId) && duration > 0 && target >= duration) { // morceau terminé
        if (m.playlistId) next(m.index)
        return
      }
      if (Math.abs(player.getCurrentTime() - target) > DRIFT) player.seekTo(target, true)
      if (ps !== YTS.PLAYING && ps !== YTS.BUFFERING) {
        player.playVideo()
        setTimeout(checkBlocked, 1500)
      }
    } else if (ps === YTS.PLAYING || ps === YTS.BUFFERING) {
      player.pauseVideo()
      player.seekTo(expected(), true)
    }
    render()
  }

  function checkBlocked() {
    if (!ready) return
    const should = state().playing && state().videoId
    const ps = player.getPlayerState()
    blocked = !!should && ps !== window.YT.PlayerState.PLAYING && ps !== window.YT.PlayerState.BUFFERING
    render()
  }

  // ---------- Commandes du MJ ----------
  function play(videoId, start = 0, playlistId = null, index = 0) {
    ctx.doc.transact(() => {
      music.set('playlistId', playlistId)
      music.set('index', index)
      music.set('videoId', videoId)
      music.set('position', start)
      music.set('startedAt', Date.now())
      music.set('playing', true)
      if (!music.has('loop')) music.set('loop', true)
    })
  }
  function pause() {
    const pos = expected()
    ctx.doc.transact(() => { music.set('position', pos); music.set('playing', false) })
  }
  function resume() {
    ctx.doc.transact(() => { music.set('startedAt', Date.now()); music.set('playing', true) })
  }
  function stop() {
    ctx.doc.transact(() => { music.set('videoId', null); music.set('playlistId', null); music.set('playing', false); music.set('position', 0) })
  }
  /** Joue le morceau i d'une playlist. */
  function playAt(playlistId, i) {
    const t = playlists.get(playlistId)?.tracks?.[i]
    if (t) play(t.videoId, 0, playlistId, i)
    else stop()
  }
  /** Morceau suivant / précédent (from = morceau en cours : évite d'avancer deux fois si plusieurs clients le voient finir). */
  function next(from = state().index, step = 1) {
    const m = state()
    if (!m.playlistId || m.index !== from) return
    const n = playlists.get(m.playlistId)?.tracks?.length ?? 0
    let i = from + step
    if (i >= n || i < 0) {
      if (!m.loop && step > 0) return stop()
      i = (i + n) % n
    }
    playAt(m.playlistId, i)
  }
  const nextOrder = (map) => Math.max(0, ...[...map.values()].map((t) => t.order ?? 0)) + 1
  function newPlaylist(name, list = []) {
    playlists.set(crypto.randomUUID(), { name, order: nextOrder(playlists), tracks: list })
  }
  let importing = false
  const openLists = new Set() // playlists dépliées (local : le panneau est redessiné toutes les 5 s)
  async function importPlaylist(link) {
    const listId = parsePlaylist(link)
    if (!listId) return alert('Lien de playlist YouTube non reconnu (il doit contenir « list= »).')
    importing = true
    render()
    const ids = await fetchPlaylistIds(await loadYouTubeApi(), listId)
    if (!ids.length) {
      importing = false
      render()
      return alert('Playlist introuvable ou privée.')
    }
    const titles = await Promise.all(ids.map(videoTitle))
    importing = false
    const name = prompt(`${ids.length} morceaux trouvés. Nom de la playlist ?`, 'Playlist YouTube')?.trim()
    if (name) newPlaylist(name, ids.map((videoId, i) => ({ videoId, name: titles[i] ?? `Morceau ${i + 1}` })))
    render()
  }

  function fromInput(value) {
    const parsed = parseYouTube(value)
    if (!parsed) { alert('Lien YouTube non reconnu.'); return null }
    return parsed
  }

  // ---------- Interface ----------
  const playerBox = h('div', { class: 'music-player' }, h('div', { id: 'yt-player' }))
  const controls = h('div', { class: 'music-controls' })
  // Saisie du lien (MJ) : construite une seule fois pour ne pas perdre ce qu'on tape lors des rafraîchissements
  const url = h('input', { placeholder: 'Lien YouTube (vidéo ou playlist)', class: 'music-url' })
  const launch = () => {
    // Lien de playlist sans vidéo : import comme playlist du site
    if (parsePlaylist(url.value) && !parseYouTube(url.value)) { importPlaylist(url.value); url.value = ''; return }
    const p = fromInput(url.value)
    if (p) { play(p.videoId, p.start); url.value = '' }
  }
  url.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch() })
  const urlRow = h('div', { class: 'music-row' }, url, h('button', { class: 'small', onclick: launch }, 'Lancer'))
  const gmControls = h('div', { class: 'music-controls' })
  const volumeRow = h('label', { class: 'check volume', title: 'Volume (réglage personnel)' }, 'Volume',
    h('input', {
      type: 'range', min: 0, max: 100, value: volume,
      oninput: (e) => {
        volume = Number(e.target.value)
        try { localStorage.setItem(volumeKey, volume) } catch { /* stockage indisponible */ }
        if (ready) player.setVolume(volume)
      },
    }))
  root.append(h('h2', {}, 'Musique'), playerBox, controls, volumeRow, urlRow, gmControls)

  function render() {
    const m = state()
    const isGM = ctx.me().isGM
    const title = ready && m.videoId ? player.getVideoData()?.title : ''
    const pl = m.playlistId && playlists.get(m.playlistId)
    controls.innerHTML = ''
    playerBox.hidden = !m.videoId

    controls.append(...[
      h('div', { class: 'music-title' }, m.videoId ? (title || 'Chargement…') : 'Aucune musique',
        m.videoId && !m.playing && h('span', { class: 'muted' }, ' · en pause')),
      pl && h('div', { class: 'muted small-text' }, `Playlist « ${pl.name} » · ${(m.index ?? 0) + 1} / ${pl.tracks.length}`),
      error && h('p', { class: 'bad small-text' }, error),
      blocked && h('button', {
        class: 'music-unlock',
        onclick: () => { blocked = false; player.playVideo(); setTimeout(checkBlocked, 1500); render() },
      }, '▶ Activer la musique'),
    ].filter(Boolean))

    urlRow.hidden = !isGM
    gmControls.innerHTML = ''
    if (!isGM) return

    // Commandes MJ
    gmControls.append(...[
      m.videoId && h('div', { class: 'music-row' },
        m.playing
          ? h('button', { class: 'small', onclick: pause }, '❚❚ Pause')
          : h('button', { class: 'small', onclick: resume }, '▶ Reprendre'),
        h('button', { class: 'small', onclick: stop }, '■ Arrêter'),
        pl && h('button', { class: 'small', title: 'Morceau précédent', onclick: () => next(m.index, -1) }, '⏮'),
        pl && h('button', { class: 'small', title: 'Morceau suivant', onclick: () => next(m.index, 1) }, '⏭'),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: m.loop !== false, onchange: (e) => music.set('loop', e.target.checked) }),
          'En boucle'),
        h('button', {
          class: 'small', title: 'Enregistrer cette musique dans la liste',
          onclick: () => {
            const name = prompt('Nom de la piste ?', title || 'Ambiance')?.trim()
            if (!name) return
            const order = Math.max(0, ...[...tracks.values()].map((t) => t.order ?? 0)) + 1
            tracks.set(crypto.randomUUID(), { name, videoId: m.videoId, start: 0, order })
          },
        }, '+ Liste')),
      tracks.size > 0 && h('ul', { class: 'music-tracks' },
        [...tracks.entries()].sort(([, a], [, b]) => a.order - b.order).map(([id, t]) => h('li', {},
          h('button', {
            class: `link${t.videoId === m.videoId ? ' current' : ''}`, title: 'Lancer pour tout le monde',
            onclick: () => play(t.videoId, t.start ?? 0),
          }, `▶ ${t.name}`),
          h('button', { class: 'icon', title: 'Retirer de la liste', onclick: () => tracks.delete(id) }, '×')))),
      // Playlists du site
      h('div', { class: 'music-row playlists-head' }, h('b', {}, 'Playlists'),
        h('button', { class: 'small', onclick: () => { const n = prompt('Nom de la playlist ?')?.trim(); if (n) newPlaylist(n) } }, '+ Nouvelle'),
        h('button', {
          class: 'small', title: 'Créer une playlist du site à partir d’une playlist YouTube publique ou non répertoriée',
          disabled: importing,
          onclick: () => { const l = prompt('Lien de la playlist YouTube ?'); if (l) importPlaylist(l) },
        }, importing ? 'Import…' : '↧ YouTube')),
      ...[...playlists.entries()].sort(([, a], [, b]) => a.order - b.order).map(([pid, p]) => h('details', { class: 'music-playlist', open: openLists.has(pid), ontoggle: (e) => openLists[e.target.open ? 'add' : 'delete'](pid) },
        h('summary', {},
          h('span', { class: pid === m.playlistId ? 'current' : '' }, `${p.name} (${p.tracks.length})`),
          h('button', { class: 'small', title: 'Lancer la playlist pour tout le monde', onclick: (e) => { e.preventDefault(); playAt(pid, 0) } }, '▶'),
          h('button', { class: 'icon', title: 'Supprimer la playlist', onclick: (e) => { e.preventDefault(); if (confirm(`Supprimer « ${p.name} » ?`)) playlists.delete(pid) } }, '×')),
        h('ul', { class: 'music-tracks' }, p.tracks.map((t, i) => h('li', {},
          h('button', {
            class: `link${pid === m.playlistId && i === m.index ? ' current' : ''}`, title: 'Lancer ce morceau',
            onclick: () => playAt(pid, i),
          }, `${i + 1}. ${t.name}`),
          h('button', { class: 'icon', title: 'Retirer', onclick: () => playlists.set(pid, { ...p, tracks: p.tracks.filter((_, j) => j !== i) }) }, '×')))),
        m.videoId && h('button', {
          class: 'small', title: 'Ajouter la musique en cours à cette playlist',
          onclick: () => playlists.set(pid, { ...p, tracks: [...p.tracks, { videoId: m.videoId, name: title || 'Morceau' }] }),
        }, '+ Musique en cours'))),
    ].filter(Boolean))
  }

  // ---------- Démarrage ----------
  loadYouTubeApi().then((YT) => {
    player = new YT.Player('yt-player', {
      width: '100%',
      height: '200',
      playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: () => {
          ready = true
          player.setVolume(volume)
          sync()
        },
        onStateChange: (e) => {
          // Fin du morceau : on relance si la boucle est active
          if (e.data === YT.PlayerState.ENDED && state().playing && state().playlistId) next(state().index)
          else if (e.data === YT.PlayerState.ENDED && state().loop && state().playing) {
            player.seekTo(0, true)
            player.playVideo()
          }
          if (e.data === YT.PlayerState.PLAYING) blocked = false
          render()
        },
        onError: (e) => {
          error = [101, 150].includes(e.data)
            ? 'Cette vidéo ne peut pas être lue hors de YouTube (choix de son auteur).'
            : 'Vidéo introuvable ou illisible.'
          render()
        },
      },
    })
  })

  music.observe(sync)
  tracks.observe(render)
  playlists.observe(render)
  setInterval(sync, 5000) // recalage régulier
  render()

  return { rerender: render }
}
