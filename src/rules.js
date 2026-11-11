// Règles du JDR (source : PDF « Présentation du JDR Science Fiction »).
// Les écarts avec les anciennes fiches Excel sont listés dans CLAUDE.md.

export const STATS = [
  { key: 'force', label: 'Force', group: 'Physique' },
  { key: 'endurance', label: 'Endurance', group: 'Physique' },
  { key: 'adresse', label: 'Adresse', group: 'Physique' },
  { key: 'analyse', label: 'Analyse', group: 'Mentale' },
  { key: 'volonte', label: 'Volonté', group: 'Mentale' },
  { key: 'intelligence', label: 'Intelligence', group: 'Mentale' },
]
export const STAT_LABEL = Object.fromEntries(STATS.map((s) => [s.key, s.label]))
export const STAT_POINTS = 70
export const STAT_MAX = 20

// Niveaux de maîtrise : bonus = niveau × 10
export const LEVELS = ['Incompétence', 'Inexpérience', 'Apprentissage', 'Connaissance', 'Expertise', 'Maîtrise']
export const BASE_SKILL_LEVELS = 5 // niveaux donnés par le poste
export const FREE_SKILL_LEVELS = 20 // niveaux à répartir librement

// Catégories reprises des fiches Excel (Électronique, absente des Excel, est rangée en pratique).
export const SKILL_GROUPS = ['Aptitudes physiques', 'Aptitudes théoriques', 'Aptitudes pratiques']

// stats : une seule caractéristique => elle compte double
export const SKILLS = [
  { name: 'Acrobatie', group: 0, stats: ['force', 'adresse'] },
  { name: 'Apesanteur', group: 0, stats: ['endurance', 'adresse'] },
  { name: 'Arme de tir', group: 0, stats: ['adresse', 'volonte'] },
  { name: 'Armement fixe', group: 0, stats: ['analyse', 'volonte'] },
  { name: 'Athlétisme', group: 0, stats: ['force', 'endurance'] },
  { name: 'Combat', group: 0, stats: ['force', 'endurance'] },
  { name: 'Discrétion', group: 0, stats: ['adresse', 'volonte'] },
  { name: 'Esquive', group: 0, stats: ['endurance', 'adresse'] },
  { name: 'Aérospatiale', group: 1, stats: ['intelligence'] },
  { name: 'Astrophysique', group: 1, stats: ['intelligence'] },
  { name: 'Biologie', group: 1, stats: ['intelligence'] },
  { name: 'Climatologie', group: 1, stats: ['intelligence'] },
  { name: 'Géologie', group: 1, stats: ['intelligence'] },
  { name: 'Informatique', group: 1, stats: ['intelligence'] },
  { name: 'Linguistique', group: 1, stats: ['analyse', 'intelligence'] },
  { name: 'Médecine', group: 1, stats: ['intelligence'] },
  { name: 'Chirurgie', group: 2, stats: ['adresse', 'volonte'] },
  { name: 'Cuisine', group: 2, stats: ['adresse', 'analyse'] },
  { name: 'Électronique', group: 2, stats: ['intelligence', 'adresse'] },
  { name: 'Influence', group: 2, stats: ['volonte'] },
  { name: 'Manoeuvre', group: 2, stats: ['analyse', 'volonte'] },
  { name: 'Mécanique', group: 2, stats: ['analyse', 'adresse'] },
  { name: 'Perspicacité', group: 2, stats: ['analyse', 'volonte'] },
  { name: 'Pilotage', group: 2, stats: ['adresse', 'analyse'] },
  { name: 'Premiers soins', group: 2, stats: ['adresse', 'intelligence'] },
]

export const BADGES = [
  { name: 'Rouge', color: '#e0353b' },
  { name: 'Gris', color: '#9aa4b5' },
  { name: 'Noir', color: '#2b2f3a' },
  { name: 'Bleu', color: '#3f7bff' },
  { name: 'Orange', color: '#ff8a2a' },
  { name: 'Violet', color: '#9b6bff' },
  { name: 'Jaune', color: '#f2cc2f' },
  { name: 'Rose', color: '#ff7ac8' },
  { name: 'Vert', color: '#41c05a' },
]

// ---------- Portes du Gaïa (« Base de donnée générale », niveaux d'accréditation des badges) ----------
// Niveau requis par une porte → badges qui l'ouvrent.
//   Rouge / Gris / Noir : accès universel hiérarchique. Bleu (sécurité) : armurerie, zones médicales restreintes.
//   Orange (chefs de service) et Violet (secours) : tout sauf armurerie et défense.
//   Jaune : zones techniques, pas les laboratoires. Rose : laboratoires, pas les zones techniques.
export const DOOR_ACCESS = {
  Vert: ['Rouge', 'Gris', 'Noir', 'Bleu', 'Orange', 'Violet', 'Jaune', 'Rose', 'Vert'],
  Jaune: ['Rouge', 'Gris', 'Noir', 'Bleu', 'Orange', 'Violet', 'Jaune'],
  Rose: ['Rouge', 'Gris', 'Noir', 'Bleu', 'Orange', 'Violet', 'Rose'],
  Violet: ['Rouge', 'Gris', 'Noir', 'Bleu', 'Orange', 'Violet'],
  Orange: ['Rouge', 'Gris', 'Noir', 'Orange'],
  Bleu: ['Rouge', 'Gris', 'Noir', 'Bleu'],
  Noir: ['Rouge', 'Gris', 'Noir'],
  Gris: ['Rouge', 'Gris'],
  Rouge: ['Rouge'],
}
export const DOOR_LEVELS = Object.keys(DOOR_ACCESS) // du plus ouvert au plus restreint
// Rang de restriction (Jaune / Rose et Orange / Bleu sont des accès parallèles de même rang)
const DOOR_RANK = { Vert: 0, Jaune: 1, Rose: 1, Violet: 2, Orange: 3, Bleu: 3, Noir: 4, Gris: 5, Rouge: 6 }
/** Le plus restrictif des deux niveaux (à égalité, on garde le premier). */
export const stricterLevel = (a, b) => ((DOOR_RANK[b] ?? 0) > (DOOR_RANK[a] ?? 0) ? b : a)

/** Valeur effective d'une caractéristique (base + bonus/malus des états passifs). */
export function statValue(stats, key) {
  const s = stats?.[key] ?? {}
  return (Number(s.base) || 0) + (Number(s.mod) || 0)
}

/** Score d'une compétence sur 100 : niveau × 10 + caractéristiques liées. */
export function skillValue(skill, stats, level = 0) {
  const fromStats = skill.stats.length === 1
    ? statValue(stats, skill.stats[0]) * 2
    : skill.stats.reduce((sum, k) => sum + statValue(stats, k), 0)
  return (Number(level) || 0) * 10 + fromStats
}

export function skillStatsLabel(skill) {
  return skill.stats.map((k) => STAT_LABEL[k]).join(' + ') + (skill.stats.length === 1 ? ' ×2' : '')
}

// Joueurs de la table : pseudo → personnage (gm = le MJ ; hide = champs de fiche cachés à ce joueur). Sert au choix du nom,
// au rôle par défaut et au propriétaire d'une fiche dont le champ « Joueur » est vide.
// Ordre alphabétique des pseudos ; « Observateur » = rôle neutre, sans personnage.
export const OBSERVER = 'Observateur'
export const PLAYERS = [
  { name: 'Baptracien', character: 'Zadya Alipha' },
  { name: 'Luneloup', character: 'Cal Atilkis' },
  { name: 'Noloway', character: 'Arkhelos Philia' },
  { name: 'Rodag', character: 'Mulgan' },
  { name: 'Walter', gm: true },
  { name: 'Withex', character: 'Emelisa Breaenna', hide: ['medical'] }, // ne voit pas les bilans médicaux
  { name: OBSERVER },
]
const norm = (s) => (s || '').trim().toLowerCase()
export const presetOf = (name) => PLAYERS.find((p) => norm(p.name) === norm(name))
// Joueur d'un personnage : le champ « Joueur » de la fiche, sinon le préréglage
export const ownerOf = (charName, player) =>
  (player || '').trim() || PLAYERS.find((p) => p.character && norm(p.character) === norm(charName))?.name || ''
