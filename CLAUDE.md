# Starboard — plateau de jeu de rôle spatial en ligne

## Contexte du projet
Outil sur mesure pour un jeu de rôle (RP) **original de science-fiction spatiale**, aux règles assez différentes des systèmes classiques. Groupe : **5 joueurs + 1 MJ**, tous sur **PC** (pas de support mobile nécessaire). La voix passe par Discord, pas par l'outil.

## Contrainte principale : coût zéro
Aucun hébergement payant, aucun serveur à maintenir. Le seul coût accepté est du temps de développement.

- **Site** : 100 % statique (Vite), déployé gratuitement sur GitHub Pages (workflow dans `.github/workflows/deploy.yml`).
- **Synchro temps réel** : WebRTC pair-à-pair via **Trystero** (stratégie `torrent`, relais publics gratuits). Pas de serveur de jeu.
- **État partagé** : **Yjs** (CRDT). Chaque joueur a une copie complète, les modifications fusionnent automatiquement. Le premier qui arrive dans la salle n'est pas « l'hôte » : tout le monde est égal.
- **Persistance** : `y-indexeddb` (sauvegarde locale par salle) + export/import JSON.
- **Interdit sans accord explicite** : toute dépendance à un service payant, backend maison, base de données hébergée, compte à créer pour les joueurs.

## Architecture actuelle
```
index.html        # structure : barre du haut, canvas, journal
src/net.js        # connect(roomId) : Y.Doc + Trystero + IndexedDB
src/main.js       # rendu canvas, pions, dés, journal, export/import
src/style.css     # thème néon futuriste (variables CSS en tête de fichier)
```
- La salle = le hash de l'URL (`/#abc123`). Partager l'URL = inviter.
- Données partagées : `doc.getMap('tokens')` (id → `{x, y, color, label}`) et `doc.getArray('log')`.
- Toute nouvelle donnée partagée doit vivre dans le `Y.Doc` (jamais dans une variable locale), sinon elle ne se synchronise pas.

## Direction artistique
Futuriste / espace : fond très sombre bleu nuit, accents néon cyan (`--accent`) et magenta (`--accent-2`), lueurs (glow) légères, typographie technique. Rester sobre : lisibilité d'abord (on joue plusieurs heures). Les couleurs vivent dans `:root` de `style.css`.

## Commandes
- `npm install` puis `npm run dev` : serveur local (ouvrir deux onglets sur la même URL pour tester la synchro)
- `npm run build` : génère `dist/`
- `npm run preview` : teste le build

## Feuille de route suggérée (ordre de priorité)
1. **Rôles MJ / joueur** : le MJ voit tout ; pions et zones cachés aux joueurs (champ `visibleTo` sur les objets).
2. **Caméra** : pan + zoom sur le plateau (clic milieu / molette), grand plateau (carte stellaire / vaisseau).
3. **Fond de carte** : importer une image (carte stellaire, plan de vaisseau) et la partager aux autres joueurs par WebRTC.
4. **Fiches de personnage** adaptées aux règles originales (à définir avec le groupe : voir « Questions ouvertes »).
5. **Brouillard de guerre / zones révélées** par le MJ.
6. **Dés personnalisés** correspondant aux règles du jeu, jets cachés ou publics.
7. **Dessin libre et mesure de distance** (règle, rayon d'action, portée).
8. **Cartes / jetons / ressources** (carburant, énergie, etc., selon le jeu).
9. **Ambiance** : bruitages, musique locale, effets visuels d'alerte.

## Questions ouvertes (à demander à l'utilisateur avant de coder les fonctions liées)
- Quelles sont les règles originales ? Quelles stats / ressources / jets ? (conditionne fiches et dés)
- Quel type de plateau : grille carrée, hexagones, carte libre, plusieurs vues (vaisseau + carte stellaire) ?
- Le MJ doit-il pouvoir cacher des informations (pions, zones, jets) ?
- Faut-il garder l'historique de la campagne entre les séances (oui probablement : IndexedDB + export JSON) ?

## Limites techniques connues
- Dans de rares cas (réseau d'entreprise, certaines 4G) la connexion directe WebRTC échoue : prévoir un relais TURN gratuit (Cloudflare / Metered) dans la config Trystero (`rtcConfig`) si ça arrive.
- Les relais de signalisation publics sont gratuits mais sans garantie. Si l'un d'eux tombe, changer de stratégie Trystero (`trystero/nostr`, `trystero/mqtt`, `trystero/torrent`).
- Pas de sécurité forte : tout pair connecté à la salle peut modifier l'état. Suffisant entre amis ; le « secret » d'une salle est son identifiant dans l'URL.
- `APP_ID` dans `src/net.js` doit être changé pour un identifiant unique au projet avant la mise en ligne.

## Conventions
- JavaScript moderne (ES modules), sans framework tant que ce n'est pas nécessaire. Si l'interface grossit (fiches, panneaux), envisager Svelte ou Preact (toujours buildé en statique).
- Code et commentaires en français, noms de variables en anglais.
- Garder l'app 100 % statique : rien qui nécessite un serveur.
- Petits commits, une fonctionnalité à la fois, testée avec deux onglets ouverts.
