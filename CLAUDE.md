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
src/main.js       # identité/rôle, jets, journal, export/import (assemble les modules)
src/board.js      # plateau : scènes, image de fond partagée, caméra locale (pan/zoom), pions
src/dom.js        # utilitaire h() pour créer des éléments
src/music.js      # musique d'ambiance YouTube synchronisée (lecteur IFrame officiel, gratuit, sans compte)
src/rules.js      # règles : caractéristiques, compétences, badges, calcul des scores
src/dice.js       # jets sous la valeur, critiques, avantage/désavantage
src/sheets.js     # liste de l'équipage + fiche de personnage (données dans le Y.Doc)
src/style.css     # thème néon futuriste (variables CSS en tête de fichier)
scripts/import-excel.mjs  # npm run import-fiches : Excel de references/ → JSON importable
scripts/plan-vaisseau.mjs # npm run plan-vaisseau : feuille « Map » de l'Excel de gestion → un SVG par étage
```
- Plateau : `doc.getMap('scenes')` (id → `{name, order, image, width, height, grid, showGrid}`), `doc.getMap('images')` (id → `{type, data: Uint8Array}`, WebP ≤ 4096 px), `doc.getMap('board').get('scene')` = scène affichée chez tous (choisie par le MJ). Les pions ont un champ `scene` (absent = scène `main`). La caméra est locale à chaque joueur. L'export JSON encode les images en base64.
- Musique : `doc.getMap('music')` = `{videoId, playing, startedAt, position, loop}` (chaque client calcule la position attendue depuis `startedAt` et se recale au-delà de 2 s), `doc.getMap('musicTracks')` = pistes enregistrées par le MJ. Volume personnel en localStorage. Le lecteur reste visible (≥ 200 × 200 px, exigence des conditions YouTube). Les navigateurs peuvent bloquer la lecture automatique : un bouton « Activer la musique » apparaît alors. Certaines vidéos refusent l'intégration (erreurs 101/150).
- Plan Excel : remplissage noir = vide spatial, gris = sols, bordures noires moyennes = murs, bordures rouges = portes, bordures jaunes = accès techniques (gaines électriques, ventilation), cases orange = caméras de surveillance. Sens inconnu : bordures cyan épaisses (autour de la proue, rendues en vert), bordures bleues/grises fines et cases bleues (arrière, propulseurs ?). Cases blanches enfermées dans la coque = équipements / zones pleines (rendus en blocs sombres). Le script redessine en vectoriel : contour de coque tracé puis simplifié (Douglas-Peucker), murs chaînés en polylignes dont seuls les vrais escaliers (≥ 3 marches d'une case) deviennent des diagonales. Cases de 40 px → régler « Case » à 40 dans la scène.
- La salle = le hash de l'URL (`/#abc123`). Partager l'URL = inviter.
- Données partagées : `doc.getMap('tokens')` (id → `{x, y, color, label}`), `doc.getArray('log')` (`{who, text, t, secret, roll?}`), `doc.getMap('characters')` (id → Y.Map : champs texte, `hidden`, `player`, `stats` Y.Map `{base, mod}`, `skills` Y.Map nom → niveau, `talents`/`passives` Y.Array `{name, desc}`).
- Rôle (MJ / joueur) et nom : `localStorage`, par navigateur (rôle par salle). Le MJ voit les fiches cachées et les jets secrets ; une fiche avec un `player` n'est modifiable que par ce joueur et le MJ. Rien n'est réellement secret (tout est dans le Y.Doc de chacun).
- Toute nouvelle donnée partagée doit vivre dans le `Y.Doc` (jamais dans une variable locale), sinon elle ne se synchronise pas.

## Direction artistique
Futuriste / espace : fond très sombre bleu nuit, accents néon cyan (`--accent`) et magenta (`--accent-2`), lueurs (glow) légères, typographie technique. Rester sobre : lisibilité d'abord (on joue plusieurs heures). Les couleurs vivent dans `:root` de `style.css`.

## Commandes
- `npm install` puis `npm run dev` : serveur local (ouvrir deux onglets sur la même URL pour tester la synchro)
- `npm run build` : génère `dist/`
- `npm run preview` : teste le build

## Feuille de route suggérée (ordre de priorité)
1. ~~Rôles MJ / joueur~~ (fait : fiches cachées, jets secrets ; reste : pions cachés).
2. ~~Caméra~~ (fait : glisser / clic milieu, molette, recadrer).
3. ~~Fond de carte~~ (fait : scènes avec image partagée, plans du Gaïa générés depuis l'Excel).
4. ~~Fiches de personnage~~ (fait) et ~~gestion du vaisseau~~ (fait).
5. **Brouillard de guerre / zones révélées** par le MJ.
6. ~~Dés personnalisés~~ (fait : d20/d100 sous la valeur, critiques, avantage/désavantage, jets secrets).
7. **Dessin libre et mesure de distance** (règle, rayon d'action, portée).
8. **Cartes / jetons / ressources** (carburant, énergie, etc., selon le jeu).
9. **Ambiance** : bruitages, musique locale, effets visuels d'alerte.

## Règles du jeu (source : `references/`, dossier non versionné)
Univers : équipage du vaisseau scientifique **Gaïa** (Confédération d'Althémion). Le code des règles vit dans `src/rules.js` et `src/dice.js`.
- **Référence des règles = le PDF « Présentation du JDR Science Fiction »** (choix de l'utilisateur), même quand les Excel diffèrent.
- **Caractéristiques innées** (/20, 70 points) : Force, Endurance, Adresse (physiques) ; Analyse, Volonté, Intelligence (mentales).
- **Compétences** (/100) = bonus de niveau (0 à 5 → +0 à +50) + somme des 2 caractéristiques liées (ou caractéristique ×2 si une seule).
- **Jets** : compétence = 1d100 ≤ score ; caractéristique = 1d20 ≤ valeur (20 = toujours échec).
  - Critiques d20 : 1 = réussite critique, 20 = échec critique. Critiques d100 : 1-5 réussite critique, 96-100 échec critique.
  - Avantage / désavantage : 2 dés, on garde le meilleur / le pire. Un critique est prioritaire sur un jet normal. Réussite critique + échec critique sur les 2 dés : afficher les deux.
- **États passifs** : bonus/malus sur les caractéristiques (rarement sur les compétences), avantages/désavantages.
- **Badges d'accréditation** : Rouge, Gris, Noir, Bleu, Orange, Violet, Jaune, Rose, Vert.
- **Personnages joueurs** : Arkhelos Philia, Emelisa Breaenna, Cal Atilkis, Zadya Alipha, Mulgan (certains sans fiche Excel). Les autres fiches sont des PNJ.
- **MJ** : une autre personne que l'utilisateur (l'utilisateur est joueur et seul développeur).
- **Gestion du vaisseau et des ressources** (« Excel de gestion du RP », ancienne version mais mécaniques toujours valables) : énergie des générateurs répartie entre systèmes, état des systèmes, stats du vaisseau, vivres/munitions/matériel médical, plan du vaisseau sur 4 étages (2, 1, 0, -1).

### Écarts relevés entre le PDF et les fiches Excel (on suit le PDF)
- **Linguistique** : PDF = Analyse + Intelligence ; Excel = Intelligence + Volonté.
- **Perspicacité** : PDF = Analyse + Volonté ; Excel = Intelligence + Analyse.
- **Électronique** (Intelligence + Adresse) : présente dans le PDF, absente des fiches Excel (importée au niveau 0).
- **Niveau 3** : « Connaissance » dans le PDF, « Compétence » dans les Excel.
- L'exemple du PDF cite « Arme à feu (Adresse + Perception) » alors que la liste dit « Arme de tir (Adresse + Volonté) » et qu'il n'existe pas de caractéristique « Perception ».

### Vaisseau (`src/shipRules.js` pour les calculs, `src/shipPanel.js` pour l'interface)
Données : `doc.getMap('ship')` = sous-Y.Map `generators`, `systems`, `stats`, `supplies` (id → objet) + valeurs simples (`hull`, `aphirium`, `lythrium`, `waterEfficiency`, `waterRatio`, `crewLarge`, `crewSmall`, `situation`). Valeurs de départ dans `defaultShip()`.
- **Énergie** : principaux 4 × 10, secondaires 2 × 5, rechange 4 (s'il est connecté), en marche seulement. Disponible = produite − énergie allouée aux systèmes en marche.
- **Malus des stats (/20)** : défaillance = moyenne des dégâts (1 − intégrité) + moyenne du manque d'énergie, ×20 puis tronqué. Navigation ← ordinateur Astréos ; Vitesse ← propulseurs Héra ; Manoeuvrabilité ← propulseurs secondaires ; Détection et Ciblage ← radar ; Résistance ← (1 − coque) × 5. Situation « Agitée » : −1 en navigation.
- **Lythrium** : consommation par jour = énergie utilisée. **Eau** : ratio × 2 × équipage × k + 7 × équipage × (k × 0,6 si recyclage, sinon 1), avec k = efficacité du traitement si l'hydro-purification tourne. **Nourriture** : 3 portions/jour (grande portion), 2 (petite).
- Droits : joueurs = état et énergie des systèmes, état des générateurs, carburants, équipage, inventaire ; MJ seul = production, intégrité, optimisations, niveaux tech, stats de base/bonus, coque, ratio et efficacité de l'eau, situation.

Interprétations et écarts par rapport à l'Excel de gestion :
- Autonomie en nourriture = stock / consommation par jour (l'Excel divisait par le nombre de passagers, ce qui semblait être une erreur).
- La navigation et la détection subissent aussi les dégâts et le manque d'énergie, comme les propulseurs (l'Excel ne regardait que « en marche / arrêté »).
- Ciblage dépend du radar comme dans l'Excel (pas des tourelles).
- « Opti. techno. » et « Niveau tech » sont affichés et modifiables mais n'entrent dans aucun calcul (l'Excel ne les utilisait pas) : à préciser.
- Les générateurs tertiaires (infirmerie, passerelle, 3 pts) n'alimentent pas le réseau principal.
- Jets de vaisseau : 1d20 ≤ stat (supposé, à confirmer).
- Inventaire de départ = quantités de l'Excel (ancienne campagne), à ajuster par le MJ.

## Questions ouvertes
- Quel type de plateau : grille carrée, hexagones, carte libre, plusieurs vues (vaisseau + carte stellaire) ?

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
