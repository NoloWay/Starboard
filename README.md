# Starboard

Plateau de jeu de rôle spatial en ligne, gratuit, sans serveur. Voir `CLAUDE.md` pour le contexte complet et la feuille de route.

## Lancer en local
```bash
npm install
npm run dev
```
Ouvre l'URL affichée dans **deux onglets** (même adresse, avec le `#code` de salle) pour voir la synchronisation.

## Utilisation
- **Onglets Vaisseau / Carte** (en haut) : chacun choisit sa vue. « Vaisseau » = plan du Gaïa, étage par étage (2 = dômes de verre sur le toit, 1, 0, −1) (survoler une pièce affiche son nom) ; « Carte » = scènes et cartes importées par le MJ. Chaque vue a ses propres jetons.
- **Plateau** : glisser dans le vide (ou clic milieu) pour déplacer la vue, molette pour zoomer, « Recadrer » pour voir toute la carte. Chacun cadre comme il veut.
- **Scènes** (MJ, en haut du plateau) : créer une scène, lui donner une image de fond (partagée automatiquement), régler la taille des jetons. La scène choisie par le MJ s'affiche chez tout le monde.
- **Portes du Gaïa** : cliquer sur une porte affiche le badge requis pour l'ouvrir (modifiable par tous) ; la pastille de la porte a la couleur de ce badge. Le MJ peut imposer un niveau minimal à toutes les portes ou tout réinitialiser (barre en haut du plan).
- **Modifier le plan du Gaïa** (MJ, bouton « ✎ Modifier le plan ») : dessiner des pièces (rectangle, polygone à N côtés, triangle, cercle, ou polyligne libre refermée sur son premier point), déplacer ou retoucher leurs sommets et côtés (« Côtés droits » pour garder des côtés horizontaux / verticaux), les nommer, numéroter, déplacer leur titre (losange jaune), typer (pièce, couloir, gaine…) et choisir leur logo ; poser des portes (avec leur accréditation) et des caméras orientables. Ctrl+clic sélectionne plusieurs éléments à la fois pour les déplacer, les redimensionner (coins du cadre), les copier ou les supprimer ensemble. Copier un élément vers un autre étage (bouton « Copier vers », ou Ctrl+C puis Ctrl+V sur l'autre étage). Une grille s'affiche en mode modification ; « Aligner l'étage sur la grille » recale les pièces d'un étage déjà modifié. Les flèches du clavier déplacent la sélection d'un cran (Maj : d'une case). Ctrl+Z pour annuler, « Réinitialiser l'étage » pour revenir à l'Excel. Le plan d'origine vient de la feuille « Map » de l'Excel de gestion (`npm run plan-vaisseau`).
- **+ Pion** : ajoute un pion au centre de la vue, sur la scène affichée. Glisser pour déplacer. Double-clic pour le supprimer.
- **Nom / rôle** (en haut) : choisir son pseudo dans la liste (Noloway, Withex, Luneloup, Baptracien, Walter) ou « Autre nom… ». Le rôle se règle seul (Walter = MJ, les autres = Joueur) et reste modifiable.
- **Équipage** (à gauche) : cliquer sur un personnage pour ouvrir sa fiche. Les scores se calculent seuls ; cliquer sur un score lance le dé (1d20 caractéristique, 1d100 compétence).
- **Normal / Avantage / Désavantage** et **Jet secret** (visible seulement par toi et le MJ) s'appliquent aux jets suivants.
- **Fiches** : le MJ cache ou montre un personnage (fiche et jeton) avec la coche à gauche de son nom, et le glisse sur la carte pour placer son jeton (s'il existe déjà, il est déplacé). Le champ « Joueur » réserve la modification au joueur de ce nom (et au MJ).
- **Vaisseau** (en haut à gauche, « Gaïa ») : énergie, systèmes, statistiques, générateurs, ressources, vivres et armement. La première fois, cliquer sur « Initialiser le Gaïa ». Les joueurs pilotent (états, énergie, stocks) ; dégâts, production et stats de base sont réservés au MJ.
- **Musique** (colonne de droite) : le MJ colle un lien YouTube et clique « Lancer » ; la musique démarre chez tout le monde au même moment. Pause, arrêt, boucle, et « + Liste » pour garder ses ambiances sous la main. Chacun règle son propre volume.
- **d6 / d20 / d100** : jets libres, visibles dans le journal de tous.
- **Importer les fiches Excel** : mettre les Excel dans `references/`, lancer `npm run import-fiches`, puis importer `references/fiches-starboard.json` avec le bouton **Importer**.
- **Exporter / Importer** : sauvegarde et reprise de la partie en fichier JSON.
- Inviter les amis : leur envoyer l'URL complète (avec le `#code`).

## Mettre en ligne gratuitement (GitHub Pages)
1. Créer un dépôt GitHub et y pousser le projet (branche `main`).
2. Dans **Settings → Pages**, choisir **Source : GitHub Actions**.
3. Chaque push déploie automatiquement. Le site est à `https://<pseudo>.github.io/<dépôt>/`.

## Avant de jouer en vrai
Changer `APP_ID` dans `src/net.js` pour un identifiant unique.
