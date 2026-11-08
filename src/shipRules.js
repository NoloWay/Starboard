// Mécaniques du vaisseau, reprises de l'« Excel de gestion du RP ».
// Les choix d'interprétation sont notés dans CLAUDE.md (section vaisseau).

export const STATES = ['En marche', 'Désactivé', 'Hors service']
export const RUNNING = 'En marche'

// ---------- Valeurs de départ (Gaïa en bon état) ----------
// order : ordre d'affichage. opti / tech : null quand la case vaut « --- » dans l'Excel.

const gen = (order, name, group, output, extra = {}) => ({ order, name, group, output, state: RUNNING, ...extra })
export const DEFAULT_GENERATORS = {
  'gen-p1': gen(1, 'Générateur principal n°1', 'Principaux', 10),
  'gen-p2': gen(2, 'Générateur principal n°2', 'Principaux', 10),
  'gen-p3': gen(3, 'Générateur principal n°3', 'Principaux', 10),
  'gen-p4': gen(4, 'Générateur principal n°4', 'Principaux', 10),
  'gen-s1': gen(5, 'Générateur secondaire n°1', 'Secondaires', 5),
  'gen-s2': gen(6, 'Générateur secondaire n°2', 'Secondaires', 5),
  'gen-r1': gen(7, 'Générateur de rechange', 'Rechange', 4, { connected: false }),
  // Générateurs tertiaires : alimentent seulement leur zone, hors du réseau principal
  'gen-t1': gen(8, 'Générateur tertiaire — Infirmerie', 'Tertiaires (local)', 3, { local: true, state: 'Désactivé' }),
  'gen-t2': gen(9, 'Générateur tertiaire — Passerelle', 'Tertiaires (local)', 3, { local: true, state: 'Désactivé' }),
}

export const SYSTEM_GROUPS = ['Déplacement', 'Systèmes internes', 'Systèmes externes']
const sys = (order, group, name, max, opti = null, tech = null) => ({
  order, group, name, max, alloc: max, state: RUNNING, integrity: 1, opti, tech,
})
export const DEFAULT_SYSTEMS = {
  reactor: sys(1, 0, 'Réacteur SL « Hélios »', 6, 0.3, 2),
  prop1: sys(2, 0, 'Propulseur « Héra » n°1', 4, 0.3, 2),
  prop2: sys(3, 0, 'Propulseur « Héra » n°2', 4, 0.3, 2),
  sec1: sys(4, 0, 'Propulseur secondaire n°1', 3, 0.3, 2),
  sec2: sys(5, 0, 'Propulseur secondaire n°2', 3, 0.3, 2),
  nav: sys(6, 0, 'Ordinateur de navigation « Astréos »', 1, 0.4, 2),
  survival: sys(7, 1, 'Système de survie', 4),
  water: sys(8, 1, 'Hydro-purification (eau)', 4, 0.05, 2),
  ventilation: sys(9, 1, 'Ventilation', 1),
  cameras: sys(10, 1, 'Caméras', 1),
  comInt: sys(11, 1, 'Communications internes', 1),
  consoles: sys(12, 1, 'Consoles secondaires', 1),
  radar: sys(13, 2, 'Radar', 4, 0.3, 2),
  comExt: sys(14, 2, 'Communications externes', 2),
  sensors: sys(15, 2, 'Capteurs externes', 1),
  turretF: sys(16, 2, 'Tourelle avant « Förvarsen »', 1, 0.05, 2),
  turretR1: sys(17, 2, 'Tourelle arrière n°1', 1, 0.05, 2),
  turretR2: sys(18, 2, 'Tourelle arrière n°2', 1, 0.05, 2),
}

// Statistiques du vaisseau (/20). sources : systèmes dont l'état et l'énergie créent un malus.
export const SHIP_STATS = [
  { key: 'navigation', label: 'Navigation', base: 9, sources: ['nav'] },
  { key: 'vitesse', label: 'Vitesse', base: 6, sources: ['prop1', 'prop2'] },
  { key: 'manoeuvrabilite', label: 'Manoeuvrabilité', base: 6, sources: ['sec1', 'sec2'] },
  { key: 'resistance', label: 'Résistance', base: 4, hull: true },
  { key: 'detection', label: 'Détection', base: 6, sources: ['radar'] },
  { key: 'ciblage', label: 'Ciblage', base: 6, sources: ['radar'] },
]
export const SITUATIONS = ['Calme', 'Agitée'] // situation agitée : -1 en navigation (9 → 8 dans l'Excel)

export const DEFAULT_RESOURCES = {
  hull: 1, // intégrité de la coque (0 à 1)
  aphirium: 1, // carburant du réacteur SL (0 à 1)
  lythrium: 868, // carburant des générateurs (unités ; consommation = énergie utilisée par jour)
  waterEfficiency: 0.5, // « efficacité du traitement des eaux » (multiplie la consommation quand l'hydro-purification tourne)
  waterRatio: 1.25, // ratio de consommation d'eau
  crewLarge: 0, // membres en « grande portion »
  crewSmall: 28, // membres en « petite portion »
  situation: 'Calme',
}

// Inventaire de départ = valeurs de l'Excel (à ajuster par le MJ)
export const SUPPLY_CATEGORIES = [
  { key: 'water', label: 'Eau', fields: ['qty', 'portions'] },
  { key: 'food', label: 'Nourriture', fields: ['qty', 'portions'] },
  { key: 'medical', label: 'Matériel médical (1 = 1 utilisation)', fields: ['qty'] },
  { key: 'misc', label: 'Matériel divers', fields: ['qty', 'notes'] },
  { key: 'weapons', label: 'Armement', fields: ['qty', 'magazine', 'ammo'] },
]
const items = (cat, list) => list.map(([name, qty, a, b], i) => [`${cat}-${i}`, {
  cat, order: i, name, qty,
  ...(cat === 'water' || cat === 'food' ? { portions: a } : {}),
  ...(cat === 'misc' ? { notes: a ?? '' } : {}),
  ...(cat === 'weapons' ? { magazine: a ?? '', ammo: b ?? '' } : {}),
}])
export const DEFAULT_SUPPLIES = Object.fromEntries([
  ...items('water', [['Bouteilles d\'eau de 5 L', 67, 5], ['Cuve d\'eau', 1990, 1], ['Canettes de soda', 100, 0.5]]),
  ...items('food', [
    ['Conserves de viande', 10, 6], ['Conserves de fruits', 8, 4], ['Conserves de légumes', 15, 4],
    ['Sachets de féculents', 15, 6], ['Barres de céréales', 36, 0.25], ['Sachets de pain', 10, 4],
    ['Sachets de céréales', 8, 6], ['Paquets de chips', 15, 0.75], ['Poches nutritives', 30, 5],
  ]),
  ...items('medical', [
    ['Tissus stériles', 145], ['Antiseptiques', 47], ['Antalgiques', 40],
    ['Antibiotiques', 84], ['Vitamines', 30], ['Médicaments génériques', 190],
  ]),
  ...items('misc', [['Matériaux de système de coms', 1], ['Matériel divers', 4], ['Systèmes de chauffage', 3], ['Combinaisons spatiales', 10]]),
  ...items('weapons', [
    ['Pistolet à impulsion', 4, '', 57], ['Pistolet', 7, 10, 79], ['Pistolet-mitrailleur', 1, 40, 120],
    ['Pistolet lance-grenade', 2, '', 0], ['Fusil d\'assaut', 4, 30, 220], ['Fusil lourd', 4, 15, 88],
    ['Couteau militaire', 0], ['Grenade flash', 15], ['Grenade fumigène', 12], ['C4', 2], ['Gilet en kevlar', 4],
  ]),
])

export function defaultShip() {
  return {
    generators: DEFAULT_GENERATORS,
    systems: DEFAULT_SYSTEMS,
    stats: Object.fromEntries(SHIP_STATS.map((s) => [s.key, { base: s.base, bonus: 0 }])),
    supplies: DEFAULT_SUPPLIES,
    ...DEFAULT_RESOURCES,
  }
}

// ---------- Calculs ----------

const num = (v) => Number(v) || 0

/** Énergie produite par le réseau principal (générateurs en marche ; le rechange doit être connecté). */
export function energyProduced(generators) {
  return Object.values(generators).reduce((sum, g) => {
    if (g.local || g.state !== RUNNING) return sum
    if (g.connected === false) return sum
    return sum + num(g.output)
  }, 0)
}

/** Énergie allouée aux systèmes en marche. */
export function energyUsed(systems) {
  return Object.values(systems).reduce((sum, s) => sum + (s.state === RUNNING ? num(s.alloc) : 0), 0)
}

/** Énergie réellement reçue par un système (0 s'il n'est pas en marche). */
export const effectiveAlloc = (s) => (s?.state === RUNNING ? Math.min(num(s.alloc), num(s.max)) : 0)

/**
 * Part de défaillance (0 à 1) d'un groupe de systèmes :
 * moyenne des dégâts (1 - intégrité) + moyenne du manque d'énergie, plafonnée à 100 %.
 * Sans aucune énergie sur tout le groupe : 100 %.
 */
export function failureRate(systems, keys) {
  const list = keys.map((k) => systems[k]).filter(Boolean)
  if (!list.length) return 0
  if (list.every((s) => effectiveAlloc(s) === 0)) return 1
  const avg = (f) => list.reduce((sum, s) => sum + f(s), 0) / list.length
  const damage = avg((s) => 1 - num(s.integrity))
  const lack = avg((s) => (num(s.max) ? 1 - effectiveAlloc(s) / num(s.max) : 0))
  return Math.min(1, Math.max(0, damage + lack))
}

/** Statistique effective du vaisseau : base - malus + bonus (jamais négative). */
export function shipStat(ship, def) {
  const entry = ship.stats?.[def.key] ?? { base: def.base, bonus: 0 }
  let malus
  if (def.hull) malus = Math.trunc((1 - num(ship.hull)) * 5)
  else malus = Math.trunc(failureRate(ship.systems ?? {}, def.sources) * 20)
  if (def.key === 'navigation' && ship.situation === 'Agitée') malus += 1
  return { base: num(entry.base), bonus: num(entry.bonus), malus, value: Math.max(0, num(entry.base) - malus + num(entry.bonus)) }
}

const sumPortions = (supplies, cat) => Object.values(supplies)
  .filter((i) => i.cat === cat)
  .reduce((sum, i) => sum + num(i.qty) * num(i.portions), 0)

/** Vivres : stocks, consommation par jour et autonomie en jours. */
export function provisions(ship) {
  const supplies = ship.supplies ?? {}
  const crew = num(ship.crewLarge) + num(ship.crewSmall)
  const purifying = ship.systems?.water?.state === RUNNING
  const eff = purifying ? num(ship.waterEfficiency) : 1

  const water = sumPortions(supplies, 'water')
  // Boisson : ratio × 2 rations par personne ; hygiène : 7 par personne (× efficacité × 0,6 si l'eau est recyclée)
  const waterPerDay = num(ship.waterRatio) * 2 * crew * eff + (purifying ? 7 * crew * eff * 0.6 : 7 * crew)

  const food = sumPortions(supplies, 'food')
  const foodPerDay = 3 * num(ship.crewLarge) + 2 * num(ship.crewSmall)

  const used = energyUsed(ship.systems ?? {})
  return {
    crew,
    water, waterPerDay, waterDays: waterPerDay ? water / waterPerDay : Infinity,
    food, foodPerDay, foodDays: foodPerDay ? food / foodPerDay : Infinity,
    lythriumPerDay: used, lythriumDays: used ? num(ship.lythrium) / used : Infinity,
  }
}
