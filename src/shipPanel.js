import * as Y from 'yjs'
import { h } from './dom.js'
import {
  STATES, RUNNING, SYSTEM_GROUPS, SHIP_STATS, SITUATIONS, SUPPLY_CATEGORIES,
  defaultShip, energyProduced, energyUsed, failureRate, shipStat, provisions,
} from './shipRules.js'

const MAPS = ['generators', 'systems', 'stats', 'supplies'] // sous-collections (Y.Map id → objet)

/** Remplace tout l'état du vaisseau (initialisation, import JSON). */
export function writeShip(doc, json) {
  const ship = doc.getMap('ship')
  doc.transact(() => {
    ship.clear()
    for (const [key, value] of Object.entries(json)) {
      if (MAPS.includes(key)) {
        const m = new Y.Map()
        ship.set(key, m)
        Object.entries(value).forEach(([id, v]) => m.set(id, v))
      } else ship.set(key, value)
    }
  })
}

const fmt = (n, digits = 1) => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: digits }) : '∞')
const pct = (v) => Math.round((Number(v) || 0) * 100)
const sorted = (obj) => Object.entries(obj ?? {}).sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))

/**
 * Panneau « Vaisseau » : énergie, systèmes, statistiques, ressources et inventaire.
 * ctx : { doc, me() -> { isGM }, onRoll(label, target, sides), onOpen() }
 */
export function setupShip(ctx) {
  const ship = ctx.doc.getMap('ship')
  const panel = document.getElementById('ship-panel')
  const summaryEl = document.getElementById('ship-summary')
  let isOpen = false
  let pending = false // rendu différé pendant qu'on écrit dans un champ

  const gm = () => ctx.me().isGM
  const sub = (key) => ship.get(key)
  const patch = (key, id, changes) => sub(key).set(id, { ...sub(key).get(id), ...changes })

  // Champ numérique enregistré à la sortie (pourcentage : affiché 0-100, stocké 0-1)
  function numInput(value, commit, { gmOnly = false, percent = false, min, max, step = 'any', cls = '' } = {}) {
    return h('input', {
      type: 'number', class: `num ${cls}`, step, min, max,
      value: percent ? pct(value) : value ?? '',
      disabled: gmOnly && !gm(),
      title: gmOnly && !gm() ? 'Réservé au MJ' : null,
      onchange: (e) => {
        let v = e.target.value === '' ? '' : Number(e.target.value)
        if (v !== '' && percent) v = Math.max(0, Math.min(100, v)) / 100
        commit(v)
      },
    })
  }
  const textInput = (value, commit, opts = {}) => h('input', {
    value: value ?? '', placeholder: opts.placeholder, disabled: opts.gmOnly && !gm(),
    onchange: (e) => commit(e.target.value),
  })
  const stateSelect = (value, commit) => h('select', {
    class: `state state-${STATES.indexOf(value)}`,
    onchange: (e) => commit(e.target.value),
  }, STATES.map((s) => h('option', { value: s, selected: s === value }, s)))

  // ---------- Sections ----------

  function summary(data) {
    const prod = energyProduced(data.generators)
    const used = energyUsed(data.systems)
    const p = provisions(data)
    const card = (label, value, sub, cls = '') => h('div', { class: `card ${cls}` },
      h('span', { class: 'card-label' }, label), h('span', { class: 'card-value' }, value), sub && h('span', { class: 'card-sub' }, sub))
    const days = (d) => `${fmt(d)} jours`
    const warnDays = (d) => (d < 3 ? 'bad' : d < 7 ? 'warn' : '')
    return h('div', { class: 'cards' },
      card('Énergie disponible', `${prod - used}`, `${used} utilisés / ${prod} produits`, prod - used < 0 ? 'bad' : ''),
      card('Coque', `${pct(data.hull)} %`, 'intégrité', data.hull < 0.5 ? 'bad' : data.hull < 0.8 ? 'warn' : ''),
      card('Aphirium', `${pct(data.aphirium)} %`, 'carburant SL', data.aphirium < 0.2 ? 'bad' : ''),
      card('Lythrium', fmt(data.lythrium, 0), days(p.lythriumDays), warnDays(p.lythriumDays)),
      card('Eau', fmt(p.water, 0), days(p.waterDays), warnDays(p.waterDays)),
      card('Nourriture', fmt(p.food, 0), days(p.foodDays), warnDays(p.foodDays)),
    )
  }

  function generatorsBlock(data) {
    return h('section', { class: 'block' },
      h('h3', {}, 'Générateurs', h('span', { class: 'counter' }, `${energyProduced(data.generators)} pts produits`)),
      h('table', { class: 'grid-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Générateur'), h('th', {}, 'Production'), h('th', {}, 'État'))),
        h('tbody', {}, sorted(data.generators).map(([id, g]) => h('tr', { class: g.local ? 'muted-row' : '' },
          h('td', {}, g.name,
            g.connected !== undefined && h('label', { class: 'check inline' },
              h('input', { type: 'checkbox', checked: g.connected, onchange: (e) => patch('generators', id, { connected: e.target.checked }) }),
              'connecté au réseau'),
            g.local && h('span', { class: 'muted' }, ' · hors réseau')),
          h('td', {}, numInput(g.output, (v) => patch('generators', id, { output: v }), { gmOnly: true, min: 0, cls: 'short' })),
          h('td', {}, stateSelect(g.state, (v) => patch('generators', id, { state: v }))),
        )))))
  }

  function systemsBlock(data) {
    const prod = energyProduced(data.generators)
    const used = energyUsed(data.systems)
    return h('section', { class: 'block wide' },
      h('h3', {}, 'Systèmes', h('span', { class: `counter ${prod - used < 0 ? 'bad' : ''}` }, `${prod - used} pts disponibles`)),
      h('p', { class: 'hint' }, 'Énergie : points alloués / maximum. Intégrité : 100 % = intact (anomalie = 100 % - intégrité). Les champs grisés sont réservés au MJ.'),
      h('div', { class: 'systems-grid' }, SYSTEM_GROUPS.map((group, gi) => h('div', {},
        h('h4', {}, group),
        h('table', { class: 'grid-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Système'), h('th', {}, 'État'), h('th', {}, 'Énergie'), h('th', {}, 'Intégr.'), h('th', { title: 'Optimisation technologique' }, 'Opti.'), h('th', { title: 'Niveau technologique' }, 'Niv.'))),
          h('tbody', {}, sorted(data.systems).filter(([, s]) => s.group === gi).map(([id, s]) => h('tr', { class: s.state !== RUNNING ? 'off' : '' },
            h('td', { class: 'sys-name' }, s.name),
            h('td', {}, stateSelect(s.state, (v) => patch('systems', id, { state: v }))),
            h('td', { class: 'alloc' }, numInput(s.alloc, (v) => patch('systems', id, { alloc: Math.max(0, Math.min(s.max, v || 0)) }), { min: 0, max: s.max, step: 1, cls: 'short' }),
              h('span', { class: 'muted' }, `/ ${s.max}`)),
            h('td', {}, numInput(s.integrity, (v) => patch('systems', id, { integrity: v }), { gmOnly: true, percent: true, cls: 'short' })),
            h('td', {}, s.opti == null ? '—' : numInput(s.opti, (v) => patch('systems', id, { opti: v }), { gmOnly: true, percent: true, cls: 'short' })),
            h('td', {}, s.tech == null ? '—' : numInput(s.tech, (v) => patch('systems', id, { tech: v }), { gmOnly: true, cls: 'short' })),
          ))))))))
  }

  function statsBlock(data) {
    return h('section', { class: 'block' },
      h('h3', {}, 'Statistiques du vaisseau',
        h('label', { class: 'check' }, 'Situation',
          h('select', { onchange: (e) => ship.set('situation', e.target.value), disabled: !gm() },
            SITUATIONS.map((s) => h('option', { value: s, selected: s === data.situation }, s))))),
      h('p', { class: 'hint' }, 'Base − malus (systèmes, coque, situation) + bonus. Cliquer sur la valeur pour lancer 1d20.'),
      h('table', { class: 'grid-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Statistique'), h('th', {}, 'Base'), h('th', {}, 'Malus'), h('th', {}, 'Bonus'), h('th', {}, '/20'))),
        h('tbody', {}, SHIP_STATS.map((def) => {
          const s = shipStat(data, def)
          const why = def.hull
            ? `Coque à ${pct(data.hull)} %`
            : `Défaillance ${pct(failureRate(data.systems, def.sources))} % (${def.sources.map((k) => data.systems[k]?.name).join(', ')})`
          return h('tr', {},
            h('td', {}, def.label),
            h('td', {}, numInput(s.base, (v) => patch('stats', def.key, { base: v }), { gmOnly: true, cls: 'short' })),
            h('td', { class: s.malus ? 'bad' : 'muted', title: why }, s.malus ? `−${s.malus}` : '0'),
            h('td', {}, numInput(s.bonus, (v) => patch('stats', def.key, { bonus: v }), { gmOnly: true, cls: 'short' })),
            h('td', {}, h('button', { class: 'roll-btn', title: why, onclick: () => ctx.onRoll(`Gaïa · ${def.label}`, s.value, 20) }, s.value)),
          )
        }))))
  }

  function resourcesBlock(data) {
    const p = provisions(data)
    const row = (label, input, note) => h('tr', {}, h('td', {}, label), h('td', {}, input), h('td', { class: 'muted' }, note ?? ''))
    const set = (key) => (v) => ship.set(key, v)
    return h('section', { class: 'block' },
      h('h3', {}, 'Ressources & équipage'),
      h('table', { class: 'grid-table' }, h('tbody', {},
        row('Intégrité de la coque (%)', numInput(data.hull, set('hull'), { gmOnly: true, percent: true, cls: 'short' })),
        row('Poudre d\'Aphirium (%)', numInput(data.aphirium, set('aphirium'), { percent: true, cls: 'short' }), 'carburant du réacteur SL'),
        row('Lythrium', numInput(data.lythrium, set('lythrium'), { min: 0, cls: 'short' }), `−${p.lythriumPerDay} / jour (énergie utilisée)`),
        row('Membres « grande portion »', numInput(data.crewLarge, set('crewLarge'), { min: 0, step: 1, cls: 'short' })),
        row('Membres « petite portion »', numInput(data.crewSmall, set('crewSmall'), { min: 0, step: 1, cls: 'short' }), `${p.crew} à bord`),
        row('Ratio de consommation d\'eau', numInput(data.waterRatio, set('waterRatio'), { gmOnly: true, cls: 'short' })),
        row('Efficacité du traitement des eaux (%)', numInput(data.waterEfficiency, set('waterEfficiency'), { gmOnly: true, percent: true, cls: 'short' }),
          data.systems?.water?.state === RUNNING ? 'recyclage actif' : 'recyclage arrêté'),
      )),
      h('p', { class: 'hint' },
        `Eau : ${fmt(p.waterPerDay)} portions / jour → ${fmt(p.waterDays)} jours. `,
        `Nourriture : ${fmt(p.foodPerDay)} portions / jour → ${fmt(p.foodDays)} jours.`))
  }

  function suppliesBlock(data, cat) {
    const list = sorted(data.supplies).filter(([, i]) => i.cat === cat.key)
    const COLS = { qty: 'Quantité', portions: 'Portions / unité', notes: 'Notes', magazine: 'Chargeur', ammo: 'Munitions' }
    const total = cat.fields.includes('portions') ? list.reduce((s, [, i]) => s + (Number(i.qty) || 0) * (Number(i.portions) || 0), 0) : null
    const add = () => {
      const id = `${cat.key}-${crypto.randomUUID().slice(0, 8)}`
      const order = Math.max(-1, ...list.map(([, i]) => i.order ?? 0)) + 1
      sub('supplies').set(id, { cat: cat.key, order, name: '', qty: 0, ...Object.fromEntries(cat.fields.filter((f) => f !== 'qty').map((f) => [f, ''])) })
    }
    return h('section', { class: 'block' },
      h('h3', {}, cat.label,
        total != null && h('span', { class: 'counter' }, `${fmt(total)} portions`),
        h('button', { class: 'small', onclick: add }, '+ Ajouter')),
      h('table', { class: 'grid-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Nom'), cat.fields.map((f) => h('th', {}, COLS[f])), h('th', {}))),
        h('tbody', {}, list.map(([id, item]) => h('tr', {},
          h('td', {}, textInput(item.name, (v) => patch('supplies', id, { name: v }), { placeholder: 'Nom' })),
          cat.fields.map((f) => h('td', {}, f === 'notes'
            ? textInput(item[f], (v) => patch('supplies', id, { [f]: v }))
            : numInput(item[f], (v) => patch('supplies', id, { [f]: v }), { min: 0, cls: 'short' }))),
          h('td', {}, h('button', { class: 'icon', title: 'Supprimer', onclick: () => sub('supplies').delete(id) }, '×')),
        )))))
  }

  // ---------- Rendu ----------

  function renderSummary() {
    if (!ship.has('systems')) { summaryEl.textContent = 'Non initialisé'; return }
    const data = ship.toJSON()
    const left = energyProduced(data.generators) - energyUsed(data.systems)
    const off = Object.values(data.systems).filter((s) => s.state === 'Hors service').length
    summaryEl.textContent = `Énergie ${left} dispo${off ? ` · ${off} hors service` : ''}`
    summaryEl.classList.toggle('bad', left < 0 || off > 0)
  }

  function render() {
    renderSummary()
    if (!isOpen) return
    if (panel.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      pending = true // on attend que le champ perde le focus
      return
    }
    pending = false
    const scroll = panel.scrollTop
    panel.innerHTML = ''
    const head = h('header', { class: 'sheet-head' },
      h('h2', { class: 'sheet-name' }, 'Gaïa', h('span', { class: 'muted' }, ' — vaisseau scientifique de classe Gaïa')),
      gm() && ship.has('systems') && h('button', {
        class: 'danger small',
        onclick: () => { if (confirm('Remettre le vaisseau à son état de départ (systèmes, ressources, inventaire) ?')) writeShip(ctx.doc, defaultShip()) },
      }, 'Réinitialiser'),
      h('button', { class: 'icon close', title: 'Fermer', onclick: close }, '×'))

    if (!ship.has('systems')) {
      panel.append(head, h('div', { class: 'empty-state' },
        h('p', {}, 'Le vaisseau n\'est pas encore configuré dans cette salle.'),
        h('button', { onclick: () => writeShip(ctx.doc, defaultShip()) }, 'Initialiser le Gaïa')))
      return
    }
    const data = ship.toJSON()
    panel.append(head, summary(data),
      h('div', { class: 'ship-body' },
        systemsBlock(data),
        statsBlock(data),
        generatorsBlock(data),
        resourcesBlock(data),
        SUPPLY_CATEGORIES.map((c) => suppliesBlock(data, c))))
    panel.scrollTop = scroll
  }

  panel.addEventListener('focusout', () => setTimeout(() => { if (pending) render() }))

  function open() {
    ctx.onOpen?.()
    isOpen = true
    panel.hidden = false
    document.getElementById('ship-item').classList.add('active')
    render()
  }
  function close() {
    isOpen = false
    panel.hidden = true
    panel.innerHTML = ''
    document.getElementById('ship-item').classList.remove('active')
  }

  ship.observeDeep(render)
  document.getElementById('ship-item').addEventListener('click', open)
  renderSummary()

  return { close, rerender: render }
}
