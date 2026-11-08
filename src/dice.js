// Moteur de jets « sous la valeur » : on réussit si le dé est ≤ à la cible.

const CRITS = {
  20: { success: (v) => v === 1, fail: (v) => v === 20 },
  100: { success: (v) => v <= 5, fail: (v) => v >= 96 },
}

export const OUTCOME_LABEL = {
  'crit-success': 'Réussite critique',
  success: 'Réussite',
  fail: 'Échec',
  'crit-fail': 'Échec critique',
  'both-crits': 'Réussite ET échec critiques',
}

export const MODE_LABEL = { normal: '', adv: 'avantage', dis: 'désavantage' }

function rollDie(sides) {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return 1 + (buf[0] % sides)
}

/** Résultat d'un seul dé (20 sur un d20 est toujours un échec, critique). */
export function judge(sides, value, target) {
  const c = CRITS[sides]
  if (c.success(value)) return 'crit-success'
  if (c.fail(value)) return 'crit-fail'
  return value <= target ? 'success' : 'fail'
}

/**
 * Choisit le dé gardé parmi deux (avantage / désavantage).
 * Un critique passe avant un jet normal ; réussite + échec critiques => les deux.
 */
export function pick(sides, values, target, mode) {
  const judged = values.map((value) => ({ value, outcome: judge(sides, value, target) }))
  if (judged.length === 1) return { kept: judged[0].value, outcome: judged[0].outcome }

  const [a, b] = judged
  const crit = (o) => o.outcome.startsWith('crit')
  if (crit(a) && crit(b) && a.outcome !== b.outcome) return { kept: null, outcome: 'both-crits' }
  if (crit(a) || crit(b)) {
    const c = crit(a) ? a : b
    return { kept: c.value, outcome: c.outcome }
  }
  // Sous la valeur : le plus petit dé est le meilleur
  const best = a.value <= b.value ? a : b
  const worst = best === a ? b : a
  const chosen = mode === 'dis' ? worst : best
  return { kept: chosen.value, outcome: chosen.outcome }
}

/** Lance 1 ou 2 dés (selon le mode) contre une cible. */
export function roll(sides, target, mode = 'normal') {
  const values = mode === 'normal' ? [rollDie(sides)] : [rollDie(sides), rollDie(sides)]
  return { sides, target, mode, values, ...pick(sides, values, target, mode) }
}

/** Jet libre sans cible (d6, d20…) */
export function rollFree(sides) {
  return rollDie(sides)
}
