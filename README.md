# Starboard

Plateau de jeu de rôle spatial en ligne, gratuit, sans serveur. Voir `CLAUDE.md` pour le contexte complet et la feuille de route.

## Lancer en local
```bash
npm install
npm run dev
```
Ouvre l'URL affichée dans **deux onglets** (même adresse, avec le `#code` de salle) pour voir la synchronisation.

## Utilisation
- **+ Pion** : ajoute un pion. Glisser pour déplacer (aimanté à la grille). Double-clic pour le supprimer.
- **d6 / d20** : jets partagés, visibles dans le journal de tous.
- **Exporter / Importer** : sauvegarde et reprise de la partie en fichier JSON.
- Inviter les amis : leur envoyer l'URL complète (avec le `#code`).

## Mettre en ligne gratuitement (GitHub Pages)
1. Créer un dépôt GitHub et y pousser le projet (branche `main`).
2. Dans **Settings → Pages**, choisir **Source : GitHub Actions**.
3. Chaque push déploie automatiquement. Le site est à `https://<pseudo>.github.io/<dépôt>/`.

## Avant de jouer en vrai
Changer `APP_ID` dans `src/net.js` pour un identifiant unique.
