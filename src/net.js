import * as Y from 'yjs'
import { joinRoom } from 'trystero/torrent'
import { IndexeddbPersistence } from 'y-indexeddb'

// Identifiant d'application : change-le pour isoler ton jeu des autres utilisateurs de Trystero.
// En développement (npm run dev), un identifiant à part : la version locale ne peut jamais rejoindre
// une salle du site en ligne, même avec le même #code.
const APP_ID = import.meta.env.DEV ? 'Noloway-dev' : 'Noloway'

/**
 * Ouvre (ou rejoint) une salle.
 * - Yjs garde l'état partagé (fusion automatique des modifications).
 * - Trystero relaie les mises à jour entre navigateurs en WebRTC (aucun serveur à héberger).
 * - IndexedDB sauvegarde l'état localement : on retrouve la partie en revenant sur la même salle.
 */
export function connect(roomId, { onPeers } = {}) {
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(`starboard:${roomId}`, doc)

  // Si le réseau échoue (WebRTC indisponible…), l'outil reste utilisable en local au lieu de planter.
  let room
  try {
    room = joinRoom({ appId: APP_ID }, roomId)
  } catch (err) {
    console.error('Connexion P2P impossible, mode hors ligne :', err)
    onPeers?.(-1)
    return { doc, room: null, persistence }
  }
  const [sendUpdate, onUpdate] = room.makeAction('ydoc')
  const [sendState, onState] = room.makeAction('ystate')

  // Les modifications locales partent vers tous les pairs.
  doc.on('update', (update, origin) => {
    if (origin !== 'remote') sendUpdate(update)
  })

  onUpdate((update) => Y.applyUpdate(doc, new Uint8Array(update), 'remote'))
  onState((update) => Y.applyUpdate(doc, new Uint8Array(update), 'remote'))

  // Quand quelqu'un arrive, on lui envoie l'état complet.
  room.onPeerJoin((peerId) => {
    sendState(Y.encodeStateAsUpdate(doc), peerId)
    onPeers?.(Object.keys(room.getPeers()).length)
  })
  room.onPeerLeave(() => onPeers?.(Object.keys(room.getPeers()).length))

  return { doc, room, persistence }
}
