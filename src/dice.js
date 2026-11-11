// Moteur de jets « sous la valeur » : on réussit si le dé est ≤ à la cible.

// Critiques ; sur un d100, une compétence trop faible (≤ 20) ne peut plus réussir critique
// et une compétence trop haute (> 80) ne peut plus échouer critique.
const CRITS = {
  20: { success: (v) => v === 1, fail: (v) => v === 20 },
  100: { success: (v, t) => v <= 5 && t > 20, fail: (v, t) => v >= 96 && t <= 80 },
}

export const OUTCOME_LABEL = {
  'crit-success': 'Réussite critique',
  success: 'Réussite',
  fail: 'Échec',
  'crit-fail': 'Échec critique',
  'both-crits': 'Réussite ET échec critiques', // anciens jets du journal
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
  if (c.success(value, target)) return 'crit-success'
  if (c.fail(value, target)) return 'crit-fail'
  return value <= target ? 'success' : 'fail'
}

/**
 * Choisit le dé gardé parmi deux (avantage / désavantage).
 * Un critique passe avant un jet normal ; réussite + échec critiques => la réussite en avantage,
 * l'échec en désavantage.
 */
export function pick(sides, values, target, mode) {
  const judged = values.map((value) => ({ value, outcome: judge(sides, value, target) }))
  if (judged.length === 1) return { kept: judged[0].value, outcome: judged[0].outcome }

  const [a, b] = judged
  const crit = (o) => o.outcome.startsWith('crit')
  if (crit(a) && crit(b) && a.outcome !== b.outcome) {
    const c = (a.outcome === 'crit-success') === (mode !== 'dis') ? a : b
    return { kept: c.value, outcome: c.outcome }
  }
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

// Vérification rapide : node src/dice.js
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('dice.js')) {
  const eq = (x, y) => { if (x !== y) throw new Error(`${x} ≠ ${y}`) }
  eq(judge(100, 3, 15), 'success') //       stat ≤ 20 : 3 n'est plus critique
  eq(judge(100, 3, 21), 'crit-success')
  eq(judge(100, 18, 15), 'fail')
  eq(judge(100, 98, 85), 'fail') //         stat > 80 : 98 n'est plus un échec critique
  eq(judge(100, 98, 80), 'crit-fail')
  eq(judge(20, 1, 10), 'crit-success')
  eq(pick(20, [1, 20], 10, 'adv').outcome, 'crit-success')
  eq(pick(20, [1, 20], 10, 'dis').outcome, 'crit-fail')
  eq(pick(100, [50, 99], 60, 'adv').outcome, 'crit-fail') // un critique passe avant un jet normal
  console.log('dice.js : ok')
}
