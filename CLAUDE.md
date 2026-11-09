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
src/board.js      # plateau : onglets Vaisseau (plan du Gaïa par étage, sans fond importé) / Carte (scènes du MJ, image de fond partagée), caméra locale, jetons
src/dom.js        # h() pour créer des éléments, liveRender() (redessine sans écraser la saisie), pips() (barrettes de niveau)
src/music.js      # musique d'ambiance YouTube synchronisée (lecteur IFrame officiel, gratuit, sans compte)
src/rules.js      # règles : caractéristiques, compétences, badges, calcul des scores
src/dice.js       # jets sous la valeur, critiques, avantage/désavantage
src/sheets.js     # liste de l'équipage + fiche de personnage (données dans le Y.Doc)
src/style.css     # thème néon futuriste (variables CSS en tête de fichier)
scripts/import-excel.mjs  # npm run import-fiches : Excel de references/ → JSON importable
scripts/plan-vaisseau.mjs # npm run plan-vaisseau : feuille « Map » de l'Excel de gestion → src/data/gaia-plan.json
src/shipMap.js    # plan du Gaïa : dessin vectoriel des éléments (formes, portes, caméras), icônes, étages d'origine
src/planEditor.js # éditeur du plan (MJ) : formes, sommets, portes, caméras, propriétés, annuler
```
- Plateau : `doc.getMap('scenes')` (id → `{name, order, image, width, height, grid}` ; `grid` = taille des jetons, il n'y a pas de grille ni d'aimantation), `doc.getMap('images')` (id → `{type, data: Uint8Array}`, WebP ≤ 4096 px), `doc.getMap('board').get('scene')` = scène affichée chez tous (choisie par le MJ). Les pions ont un champ `scene` (absent = scène `main`) ; ceux d'un personnage ont `charId` : initiales, couleur de badge et visibilité sont lues en direct sur la fiche, et un personnage n'a qu'un jeton (le MJ le glisse depuis la liste de l'équipage ; le reglisser le déplace, même depuis une autre scène). La caméra est locale à chaque joueur. L'export JSON encode les images en base64.
- Musique : `doc.getMap('music')` = `{videoId, playing, startedAt, position, loop}` (chaque client calcule la position attendue depuis `startedAt` et se recale au-delà de 2 s), `doc.getMap('musicTracks')` = pistes enregistrées par le MJ. Volume personnel en localStorage. Le lecteur reste visible (≥ 200 × 200 px, exigence des conditions YouTube). Les navigateurs peuvent bloquer la lecture automatique : un bouton « Activer la musique » apparaît alors. Certaines vidéos refusent l'intégration (erreurs 101/150).
- Plan du Gaïa (onglet Vaisseau) : `npm run plan-vaisseau` lit la feuille « Map » de l'Excel de gestion et écrit `src/data/gaia-plan.json` (versionné, donc public sur GitHub Pages), dessiné en vectoriel par `src/shipMap.js`. Chaque case d'une pièce porte une formule `$A$1="<étage>_<code> <nom>"` : c'est elle qui définit les pièces (lire `cell.formula`, qui reconstitue les formules partagées, et la case principale des cases fusionnées). Codes : chiffres = pièces, lettre + chiffre = couloirs, `el` = gaines électriques (fond jaune pâle), `v` = ventilation (gris argenté), `m` = conduits techniques (sens supposé, à confirmer). Cases du vaisseau hors pièce = structure de la coque ; îlots sans pièce enfermés dans une pièce et pièces enfermées dans une autre = fusionnés. Bordures rouges = portes, jaunes = accès techniques, cases orange = caméras, cases bleues = propulseurs. Contours : marches d'escalier (≥ 3 marches d'une case) → diagonales, puis angles arrondis (courbes). Étage choisi localement ; jetons sur les scènes `ship:<étage>`. Bizarrerie connue de l'Excel : « 1 · Quartiers du commandant second » est en deux morceaux, dont un enfermé dans les quartiers du commandant.
- Plan du Gaïa, retouches du script : grille redimensionnée comme un tableur (colonnes / rangées élargies si elles traversent une petite pièce, resserrées pour les grandes pièces et la structure vide : `TARGET_SPAN`, `STRUCTURE_SPAN`) ; noms corrigés (`NAME_OVERRIDES`) ; formes redessinées en hexagone (`HEXAGONS`, ex. passerelle de commandement).
- Portes d'origine : `id` stable (`<étage>:<h|v><ligne>:<début>-<fin>` en coordonnées Excel), niveau par défaut déduit des pièces desservies (`LEVEL_RULES` du script, le plus restrictif des deux côtés). Niveau (`level`) modifiable par tous via la fenêtre de la porte ; pièces de part et d'autre retrouvées par `roomsAround`. Règles d'ouverture dans `DOOR_ACCESS` (`src/rules.js`). MJ : « Appliquer à toutes » (chaque porte prend le niveau choisi, sauf si son `defaultLevel` est plus restrictif) et « Réinitialiser » (`level` = `defaultLevel`). `doc.getMap('doorLevels')` = ancien stockage, seulement relu lors de la copie d'un étage.
- Étage 2 : absent de l'Excel, généré par le script (bloc « Étage 2 ») : trois dômes de verre alignés (1 Observatoire, 2 Serre botanique, 3 Jardin) au-dessus de la salle de transit 9 de l'étage 1, chacun avec le palier de sa rampe (9.4, 9.1, 9.3) ; contour du toit = coque de l'étage 1. Type de zone `dome` (rendu verre dans `shipMap.js`).
- Plan éditable : `doc.getMap('plan')` = éléments du plan, chacun avec `deck` : formes `{kind: 'shape', type, code, name, icon ('' = auto, 'none', clé d'icône), radius (arrondi en cases), z, pts | circle}`, portes `{kind: 'door', seg, level, defaultLevel, access}`, caméras `{kind: 'camera', x, y, angle}` ; plus un marqueur `deck:<étage>` par étage déjà copié. Un étage jamais modifié s'affiche depuis `gaia-plan.json` (`seedItems`, identifiants stables) ; il est copié dans le Y.Doc (origine 'seed', non annulable) à sa première modification (édition MJ ou niveau d'une porte), en reprenant les anciens niveaux de `doorLevels`. On ne copie jamais automatiquement au chargement : ça ressusciterait des éléments supprimés par un autre joueur.
- Éditeur (`src/planEditor.js`, MJ, bouton « ✎ Modifier le plan ») : outils sélection, rectangle, polygone régulier (N côtés), triangle, cercle, porte, caméra ; poignées de sommets, de milieux de côtés et de rayon / orientation ; double-clic sur un sommet = le retirer, sur un milieu de côté = ajouter un sommet ; « Côtés droits » (les côtés horizontaux / verticaux le restent, les portes et polygones créés s'alignent) ; aimantation à 1/4 de case (Alt : libre) ; Suppr, Échap, Ctrl+Z / Ctrl+Y (`Y.UndoManager`, historique local perdu au rechargement) ; panneau de propriétés (nom, numéro, type, logo, arrondi, redresser, devant / derrière, dupliquer ; niveaux de porte ; orientation de caméra) ; « Réinitialiser l'étage » = retour à l'Excel. Le plan est inclus dans l'export JSON.
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
1. ~~Rôles MJ / joueur~~ (fait : fiches et jetons de personnages cachés, jets secrets ; reste : pions libres cachés).
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
- Plateau : carte libre, sans grille (choix de l'utilisateur) ; plusieurs scènes possibles (étages du vaisseau, carte stellaire…).

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
