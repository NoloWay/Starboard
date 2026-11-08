import * as Y from 'yjs'
import { h, liveRender, pips } from './dom.js'
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
const STATE_CLASS = { 'En marche': 'on', Désactivé: 'off', 'Hors service': 'broken' }

/**
 * Panneau « Vaisseau » : état général, systèmes, statistiques, générateurs, ressources et inventaire.
 * En consultation, les joueurs pilotent (états, énergie, quantités) ; « Modifier » fait apparaître
 * les autres champs (ceux de structure étant réservés au MJ).
 * ctx : { doc, me() -> { isGM }, onRoll(label, target, sides), onOpen() }
 */
export function setupShip(ctx) {
  const ship = ctx.doc.getMap('ship')
  const panel = document.getElementById('ship-panel')
  const summaryEl = document.getElementById('ship-summary')
  let isOpen = false
  let editing = false
  let tab = SUPPLY_CATEGORIES[0].key

  const sub = (key) => ship.get(key)
  const patch = (key, id, changes) => sub(key).set(id, { ...sub(key).get(id), ...changes })
  const section = (title, extra, ...content) => h('section', { class: 'sec' },
    h('h3', { class: 'sec-title' }, h('span', {}, title), extra && h('span', { class: 'sec-extra' }, extra)), ...content)

  // Champ numérique (pourcentage : affiché 0-100, stocké 0-1)
  const numInput = (value, commit, { percent = false, min, max, step = 'any' } = {}) => h('input', {
    type: 'number', class: 'num', step, min, max,
    value: percent ? pct(value) : value ?? '',
    onchange: (e) => {
      let v = e.target.value === '' ? '' : Number(e.target.value)
      if (v !== '' && percent) v = Math.max(0, Math.min(100, v)) / 100
      commit(v)
    },
  })
  const stateSelect = (value, commit) => h('select', { class: `state ${STATE_CLASS[value]}`, onchange: (e) => commit(e.target.value) },
    STATES.map((s) => h('option', { value: s, selected: s === value }, s)))
  const bar = (ratio, cls = '') => h('span', { class: `bar ${cls}` }, h('i', { style: `width:${Math.max(0, Math.min(1, ratio)) * 100}%` }))
  const level = (ratio) => (ratio < 0.25 ? 'bad' : ratio < 0.6 ? 'warn' : '')

  // ---------- Sections ----------

  function overview(data) {
    const prod = energyProduced(data.generators)
    const used = energyUsed(data.systems)
    const p = provisions(data)
    const days = (d) => (Number.isFinite(d) ? `${fmt(d)} jours` : '—')
    const daysLevel = (d) => (d < 3 ? 'bad' : d < 7 ? 'warn' : '')
    const card = (label, value, sub, cls, ratio) => h('div', { class: `card ${cls}` },
      h('span', { class: 'card-label' }, label),
      h('span', { class: 'card-value' }, value),
      ratio != null && bar(ratio, cls),
      h('span', { class: 'card-sub' }, sub))
    return h('div', { class: 'cards' },
      card('Énergie disponible', `${prod - used}`, `${used} / ${prod} pts utilisés`, prod - used < 0 ? 'bad' : '', prod ? used / prod : 0),
      card('Coque', `${pct(data.hull)} %`, 'intégrité', level(data.hull), data.hull),
      card('Aphirium', `${pct(data.aphirium)} %`, 'carburant supraluminique', level(data.aphirium), data.aphirium),
      card('Lythrium', fmt(data.lythrium, 0), days(p.lythriumDays), daysLevel(p.lythriumDays)),
      card('Eau', days(p.waterDays), `${fmt(p.water, 0)} portions`, daysLevel(p.waterDays)),
      card('Nourriture', days(p.foodDays), `${fmt(p.food, 0)} portions`, daysLevel(p.foodDays)))
  }

  function systems(data, gmEdit) {
    const prod = energyProduced(data.generators)
    const used = energyUsed(data.systems)
    const row = ([id, s]) => {
      const running = s.state === RUNNING
      return h('div', { class: `sys ${STATE_CLASS[s.state]}` },
        h('span', { class: 'dot' }),
        h('div', { class: 'sys-main' },
          h('span', { class: 'sys-name' }, s.name),
          h('div', { class: 'sys-sub' },
            h('span', { class: `sys-power${running ? '' : ' dim'}`, title: 'Énergie allouée (cliquer pour régler)' },
              pips(s.max, Number(s.alloc) || 0, (n) => patch('systems', id, { alloc: n }), (n) => `${n} / ${s.max} pts d'énergie`)),
            s.integrity < 1 && !gmEdit && h('span', { class: `sys-integrity ${level(s.integrity)}`, title: 'Intégrité' }, bar(s.integrity, level(s.integrity)), `${pct(s.integrity)} %`)),
          gmEdit && h('div', { class: 'inline-edit' },
            h('label', {}, 'Intégrité %', numInput(s.integrity, (v) => patch('systems', id, { integrity: v }), { percent: true })),
            s.opti != null && h('label', {}, 'Opti. %', numInput(s.opti, (v) => patch('systems', id, { opti: v }), { percent: true })),
            s.tech != null && h('label', {}, 'Niv. tech', numInput(s.tech, (v) => patch('systems', id, { tech: v }), { min: 0, step: 1 })))),
        stateSelect(s.state, (v) => patch('systems', id, { state: v })))
    }
    return section('Systèmes', h('span', { class: prod - used < 0 ? 'bad' : '' }, `${used} / ${prod} pts alloués`),
      h('div', { class: 'sys-cols' }, SYSTEM_GROUPS.map((g, gi) => h('div', {},
        h('h4', {}, g), sorted(data.systems).filter(([, s]) => s.group === gi).map(row)))))
  }

  function stats(data, gmEdit) {
    const tile = (def) => {
      const s = shipStat(data, def)
      const why = def.hull
        ? `Coque à ${pct(data.hull)} %`
        : `Défaillance ${pct(failureRate(data.systems, def.sources))} % : ${def.sources.map((k) => data.systems[k]?.name).join(', ')}`
      if (gmEdit) {
        return h('div', { class: 'stat-tile editing' },
          h('span', { class: 'tile-label' }, def.label),
          h('div', { class: 'tile-inputs' },
            h('label', {}, 'Base', numInput(s.base, (v) => patch('stats', def.key, { base: v }))),
            h('label', {}, 'Bonus', numInput(s.bonus, (v) => patch('stats', def.key, { bonus: v })))))
      }
      return h('button', { class: 'stat-tile', title: `${why}\nLancer 1d20 ≤ ${s.value}`, onclick: () => ctx.onRoll(`Gaïa · ${def.label}`, s.value, 20) },
        h('span', { class: 'tile-label' }, def.label),
        h('span', { class: 'tile-value' }, s.value),
        s.malus > 0 && h('span', { class: 'tile-mod down' }, `−${s.malus}`),
        s.bonus !== 0 && h('span', { class: 'tile-mod up' }, `+${s.bonus}`))
    }
    return section('Statistiques', data.situation === 'Agitée' ? h('span', { class: 'warn' }, 'Situation agitée : −1 en navigation') : '/20 · cliquer pour lancer 1d20',
      gmEdit && h('label', { class: 'check' }, 'Situation',
        h('select', { onchange: (e) => ship.set('situation', e.target.value) },
          SITUATIONS.map((s) => h('option', { value: s, selected: s === data.situation }, s)))),
      h('div', { class: 'stat-tiles six' }, SHIP_STATS.map(tile)))
  }

  function generators(data, gmEdit) {
    return section('Générateurs', `${energyProduced(data.generators)} pts produits`,
      h('div', { class: 'rows' }, sorted(data.generators).map(([id, g]) => h('div', { class: `sys ${g.connected === false ? 'off' : STATE_CLASS[g.state]}${g.local ? ' local' : ''}` },
        h('span', { class: 'dot' }),
        h('div', { class: 'sys-main' },
          h('span', { class: 'sys-name' }, g.name),
          g.local && h('span', { class: 'muted' }, 'hors réseau principal'),
          g.connected !== undefined && h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: g.connected, onchange: (e) => patch('generators', id, { connected: e.target.checked }) }),
            'connecté au réseau')),
        gmEdit
          ? h('label', { class: 'inline-edit' }, 'pts', numInput(g.output, (v) => patch('generators', id, { output: v }), { min: 0 }))
          : h('span', { class: 'gen-output' }, `${g.output} pts`),
        stateSelect(g.state, (v) => patch('generators', id, { state: v }))))))
  }

  function resources(data, gmEdit, ed) {
    const p = provisions(data)
    const set = (key) => (v) => ship.set(key, v)
    const row = (label, value, input) => h('div', { class: 'res' }, h('span', { class: 'res-label' }, label), ed && input ? input : h('span', { class: 'res-value' }, value))
    return section('Ressources & équipage', null, h('div', { class: 'rows' },
      row('Intégrité de la coque', h('span', { class: 'res-bar' }, bar(data.hull, level(data.hull)), `${pct(data.hull)} %`),
        gmEdit && numInput(data.hull, set('hull'), { percent: true })),
      row('Poudre d\'Aphirium', h('span', { class: 'res-bar' }, bar(data.aphirium, level(data.aphirium)), `${pct(data.aphirium)} %`),
        numInput(data.aphirium, set('aphirium'), { percent: true })),
      row('Lythrium', `${fmt(data.lythrium, 0)} · −${p.lythriumPerDay} / jour`, numInput(data.lythrium, set('lythrium'), { min: 0 })),
      row('Équipage à bord', `${p.crew} (${data.crewLarge} grandes · ${data.crewSmall} petites portions)`,
        h('span', { class: 'pair' }, numInput(data.crewLarge, set('crewLarge'), { min: 0, step: 1 }), numInput(data.crewSmall, set('crewSmall'), { min: 0, step: 1 }))),
      row('Consommation d\'eau', `${fmt(p.waterPerDay)} portions / jour`,
        gmEdit && h('span', { class: 'pair' }, numInput(data.waterRatio, set('waterRatio')), numInput(data.waterEfficiency, set('waterEfficiency'), { percent: true }))),
      row('Consommation de nourriture', `${fmt(p.foodPerDay)} portions / jour`),
      row('Recyclage de l\'eau', data.systems?.water?.state === RUNNING ? `actif (efficacité ${pct(data.waterEfficiency)} %)` : 'arrêté'),
    ))
  }

  function inventory(data, ed) {
    const cat = SUPPLY_CATEGORIES.find((c) => c.key === tab) ?? SUPPLY_CATEGORIES[0]
    const list = sorted(data.supplies).filter(([, i]) => i.cat === cat.key)
    const COLS = { portions: 'Portions', notes: 'Notes', magazine: 'Chargeur', ammo: 'Munitions' }
    const extras = cat.fields.filter((f) => f !== 'qty')
    const add = () => {
      const id = `${cat.key}-${crypto.randomUUID().slice(0, 8)}`
      const order = Math.max(-1, ...list.map(([, i]) => i.order ?? 0)) + 1
      editing = true // avant l'écriture : elle redessine aussitôt le panneau
      sub('supplies').set(id, { cat: cat.key, order, name: '', qty: 0, ...Object.fromEntries(extras.map((f) => [f, ''])) })
    }
    const stepper = (id, qty) => h('span', { class: 'stepper' },
      h('button', { class: 'icon', title: 'Retirer 1', onclick: () => patch('supplies', id, { qty: Math.max(0, (Number(qty) || 0) - 1) }) }, '−'),
      ed ? numInput(qty, (v) => patch('supplies', id, { qty: v }), { min: 0 }) : h('b', {}, fmt(Number(qty) || 0)),
      h('button', { class: 'icon', title: 'Ajouter 1', onclick: () => patch('supplies', id, { qty: (Number(qty) || 0) + 1 }) }, '+'))
    return section('Inventaire', h('button', { class: 'small', onclick: add }, '+ Ajouter'),
      h('div', { class: 'tabs' }, SUPPLY_CATEGORIES.map((c) => h('button', {
        class: c.key === cat.key ? 'on' : '',
        onclick: () => { tab = c.key; render() },
      }, c.label.replace(/ \(.*\)/, '')))),
      list.length
        ? h('table', { class: 'inv' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Nom'), h('th', {}, 'Quantité'), extras.map((f) => h('th', {}, COLS[f])), ed && h('th', {}))),
          h('tbody', {}, list.map(([id, item]) => h('tr', {},
            h('td', {}, ed ? h('input', { value: item.name, placeholder: 'Nom', onchange: (e) => patch('supplies', id, { name: e.target.value }) }) : item.name || '—'),
            h('td', {}, stepper(id, item.qty)),
            extras.map((f) => h('td', {}, ed
              ? h('input', { value: item[f] ?? '', class: f === 'notes' ? '' : 'num', onchange: (e) => patch('supplies', id, { [f]: f === 'notes' ? e.target.value : Number(e.target.value) || e.target.value }) })
              : (item[f] === '' || item[f] == null ? '—' : f === 'portions' ? `${fmt((Number(item.qty) || 0) * Number(item[f]))} (${fmt(Number(item[f]))} / u.)` : item[f]))),
            ed && h('td', {}, h('button', { class: 'icon', title: 'Supprimer', onclick: () => sub('supplies').delete(id) }, '×'))))))
        : h('p', { class: 'muted' }, 'Rien dans cette catégorie.'),
      cat.key === 'medical' && h('p', { class: 'hint' }, '1 unité = 1 utilisation.'))
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

  function build() {
    const isGM = ctx.me().isGM
    const ed = editing
    const gmEdit = ed && isGM
    const head = h('header', { class: 'dossier-head ship-head', style: '--badge: var(--accent)' },
      h('div', { class: 'dossier-id' },
        h('h2', { class: 'dossier-name' }, 'Gaïa'),
        h('div', { class: 'dossier-meta' }, 'Vaisseau scientifique de classe Gaïa  ·  Confédération d\'Althémion')),
      h('div', { class: 'dossier-actions' },
        gmEdit && h('button', {
          class: 'small danger',
          onclick: () => { if (confirm('Remettre le vaisseau à son état de départ (systèmes, ressources, inventaire) ?')) writeShip(ctx.doc, defaultShip()) },
        }, 'Réinitialiser'),
        ship.has('systems') && h('button', { class: ed ? 'small primary' : 'small', onclick: () => { editing = !editing; render() } }, ed ? 'Terminer' : 'Modifier'),
        h('button', { class: 'icon', title: 'Fermer', onclick: close }, '×')))

    if (!ship.has('systems')) {
      panel.append(head, h('div', { class: 'empty-state' },
        h('p', {}, 'Le vaisseau n\'est pas encore configuré dans cette salle.'),
        h('button', { onclick: () => writeShip(ctx.doc, defaultShip()) }, 'Initialiser le Gaïa')))
      return
    }
    const data = ship.toJSON()
    panel.append(...[head,
      ed && h('p', { class: 'readonly-note' }, isGM ? 'Mode modification : tous les champs sont ouverts.' : 'Mode modification : inventaire et ressources. Dégâts et valeurs de base sont réservés au MJ.'),
      overview(data),
      systems(data, gmEdit),
      stats(data, gmEdit),
      h('div', { class: 'two-cols' }, generators(data, gmEdit), resources(data, gmEdit, ed)),
      inventory(data, ed)].filter(Boolean))
  }

  const render = () => { renderSummary(); if (isOpen) draw() }
  const draw = liveRender(panel, build)

  function open() {
    ctx.onOpen?.()
    isOpen = true
    panel.hidden = false
    document.getElementById('ship-item').classList.add('active')
    draw()
  }
  function close() {
    isOpen = false
    editing = false
    panel.hidden = true
    panel.innerHTML = ''
    document.getElementById('ship-item').classList.remove('active')
  }

  ship.observeDeep(render)
  document.getElementById('ship-item').addEventListener('click', open)
  renderSummary()

  return { close() { if (isOpen) close() }, rerender: render }
}
