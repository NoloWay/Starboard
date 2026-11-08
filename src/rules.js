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
