# Starboard

Plateau de jeu de rôle spatial en ligne, gratuit, sans serveur. Voir `CLAUDE.md` pour le contexte complet et la feuille de route.

## Lancer en local
```bash
npm install
npm run dev
```
Ouvre l'URL affichée dans **deux onglets** (même adresse, avec le `#code` de salle) pour voir la synchronisation.

## Utilisation
- **Plateau** : glisser dans le vide (ou clic milieu) pour déplacer la vue, molette pour zoomer, « Recadrer » pour voir toute la carte. Chacun cadre comme il veut.
- **Scènes** (MJ, en haut du plateau) : créer une scène, lui donner une image de fond (partagée automatiquement), régler la taille des cases. La scène choisie par le MJ s'affiche chez tout le monde.
- **Plans du Gaïa** : `npm run plan-vaisseau` génère `references/plans/gaia-etage-*.svg` depuis l'Excel de gestion ; les mettre en image de fond d'une scène, avec des cases de 24.
- **+ Pion** : ajoute un pion au centre de la vue, sur la scène affichée. Glisser pour déplacer (aimanté à la grille). Double-clic pour le supprimer.
- **Nom / rôle** (en haut) : cliquer sur le nom pour le changer ; choisir **MJ** ou **Joueur**.
- **Équipage** (à gauche) : cliquer sur un personnage pour ouvrir sa fiche. Les scores se calculent seuls ; cliquer sur un score lance le dé (1d20 caractéristique, 1d100 compétence).
- **Normal / Avantage / Désavantage** et **Jet secret** (visible seulement par toi et le MJ) s'appliquent aux jets suivants.
- **Fiches** : le MJ peut cacher une fiche aux joueurs. Le champ « Joueur » réserve la modification au joueur de ce nom (et au MJ).
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
