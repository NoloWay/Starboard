import { h } from './dom.js'

// Musique d'ambiance : le MJ choisit une vidéo YouTube, elle est jouée en même temps chez tout le monde.
//
// Données partagées :
//   music       : { videoId, playing, startedAt (Date.now() du lancement), position (s au lancement), loop }
//   musicTracks : id → { name, videoId, start, order }   (pistes enregistrées par le MJ)
// Chaque joueur règle son propre volume (localStorage). Le lecteur YouTube reste visible
// (les conditions de YouTube imposent un lecteur d'au moins 200 × 200 px).

const DRIFT = 2 // écart toléré (secondes) avant de recaler la lecture

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
    if (m.loop && duration > 0) pos %= duration
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
      if (!m.loop && duration > 0 && target >= duration) return // morceau terminé
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
  function play(videoId, start = 0) {
    ctx.doc.transact(() => {
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
    ctx.doc.transact(() => { music.set('videoId', null); music.set('playing', false); music.set('position', 0) })
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
  const url = h('input', { placeholder: 'Lien YouTube', class: 'music-url' })
  const launch = () => { const p = fromInput(url.value); if (p) { play(p.videoId, p.start); url.value = '' } }
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
    controls.innerHTML = ''
    playerBox.hidden = !m.videoId

    controls.append(...[
      h('div', { class: 'music-title' }, m.videoId ? (title || 'Chargement…') : 'Aucune musique',
        m.videoId && !m.playing && h('span', { class: 'muted' }, ' · en pause')),
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
          if (e.data === YT.PlayerState.ENDED && state().loop && state().playing) {
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
  setInterval(sync, 5000) // recalage régulier
  render()

  return { rerender: render }
}
