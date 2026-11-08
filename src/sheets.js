import * as Y from 'yjs'
import { h } from './dom.js'
import {
  STATS, STAT_POINTS, STAT_MAX, LEVELS, SKILLS, SKILL_GROUPS, BADGES,
  BASE_SKILL_LEVELS, FREE_SKILL_LEVELS, statValue, skillValue, skillStatsLabel,
} from './rules.js'

// Champs texte d'une fiche : [clé, libellé, type]
const IDENTITY = [
  ['post', 'Poste', 'text'],
  ['age', 'Âge', 'text'],
  ['country', "Pays d'origine", 'text'],
  ['player', 'Joueur (vide = PNJ)', 'text'],
]
const TEXTS = [
  ['medical', 'Bilan médical'],
  ['observations', 'Observations'],
  ['appearance', 'Apparence'],
  ['personality', 'Personnalité'],
  ['history', 'Histoire'],
]
const LISTS = [
  ['talents', 'Talents spéciaux'],
  ['passives', 'États passifs'],
]

// ---------- Données (Y.Doc) ----------

/** Fiche vide ou remplie depuis un objet JSON (import / export). */
export function writeCharacter(characters, id, data = {}) {
  const m = new Y.Map()
  characters.set(id, m)
  for (const [k] of [...IDENTITY, ...TEXTS]) m.set(k, data[k] ?? '')
  m.set('name', data.name ?? 'Nouveau personnage')
  m.set('badge', data.badge ?? 'Vert')
  m.set('hidden', !!data.hidden)
  const stats = new Y.Map()
  m.set('stats', stats)
  STATS.forEach(({ key }) => stats.set(key, { base: data.stats?.[key]?.base ?? 10, mod: data.stats?.[key]?.mod ?? 0 }))
  const skills = new Y.Map()
  m.set('skills', skills)
  SKILLS.forEach(({ name }) => skills.set(name, Number(data.skills?.[name]) || 0))
  for (const [k] of LISTS) {
    const arr = new Y.Array()
    m.set(k, arr)
    arr.push((data[k] ?? []).map((t) => ({ name: t.name ?? '', desc: t.desc ?? '' })))
  }
  return m
}

export function replaceCharacters(doc, json) {
  const characters = doc.getMap('characters')
  doc.transact(() => {
    characters.clear()
    Object.entries(json).forEach(([id, data]) => writeCharacter(characters, id, data))
  })
}

// ---------- Interface ----------

/**
 * Liste de l'équipage (barre latérale) + fiche détaillée.
 * ctx : { doc, me() -> { name, isGM }, onRoll(label, target, sides), onOpen() }
 */
export function setupSheets(ctx) {
  const characters = ctx.doc.getMap('characters')
  const listEl = document.getElementById('crew-list')
  const sheetEl = document.getElementById('sheet')
  let openId = null
  let refresh = null // met à jour la fiche ouverte sans perdre le focus

  const canSee = (c) => ctx.me().isGM || !c.get('hidden')
  const canEdit = (c) => {
    const { name, isGM } = ctx.me()
    const owner = (c.get('player') || '').trim()
    return isGM || !owner || owner.toLowerCase() === name.toLowerCase()
  }

  function renderList() {
    listEl.innerHTML = ''
    const entries = [...characters.entries()]
      .filter(([, c]) => canSee(c))
      .sort(([, a], [, b]) => {
        // Personnages joueurs d'abord, puis ordre alphabétique
        const pa = a.get('player') ? 0 : 1
        const pb = b.get('player') ? 0 : 1
        return pa - pb || a.get('name').localeCompare(b.get('name'))
      })
    for (const [id, c] of entries) {
      const badge = BADGES.find((b) => b.name === c.get('badge'))
      listEl.append(h('li', {
        class: `crew-item${id === openId ? ' active' : ''}${c.get('hidden') ? ' is-hidden' : ''}`,
        onclick: () => open(id),
      },
      h('span', { class: 'badge-dot', style: `--badge:${badge?.color ?? '#555'}`, title: `Badge ${c.get('badge')}` }),
      h('span', { class: 'crew-name' }, c.get('name')),
      h('span', { class: 'crew-post' }, c.get('player') ? `PJ · ${c.get('player')}` : c.get('post')),
      ))
    }
    if (!entries.length) listEl.append(h('li', { class: 'muted' }, 'Aucune fiche visible'))
  }

  function close() {
    openId = null
    refresh = null
    sheetEl.hidden = true
    sheetEl.innerHTML = ''
    renderList()
  }

  function open(id) {
    ctx.onOpen?.()
    openId = id
    sheetEl.hidden = false
    build()
    renderList()
  }

  function build() {
    const c = characters.get(openId)
    if (!c || !canSee(c)) return close()
    const stats = c.get('stats')
    const skills = c.get('skills')
    const binders = [] // [élément, fonction qui lit la valeur]
    const bind = (el, read) => { binders.push([el, read]); return el }
    const editable = () => canEdit(c)

    // Champ texte lié à une clé de la fiche (enregistré à la sortie du champ)
    const field = (key, label, type = 'text') => {
      const input = type === 'textarea'
        ? h('textarea', { rows: 3, onchange: (e) => c.set(key, e.target.value) })
        : h('input', { type, onchange: (e) => c.set(key, e.target.value) })
      bind(input, () => c.get(key) ?? '')
      return h('label', { class: 'field' }, h('span', {}, label), input)
    }

    const statsTotal = bind(h('span', { class: 'counter' }), () => {
      const total = STATS.reduce((s, { key }) => s + (Number(stats.get(key).base) || 0), 0)
      return `${total} / ${STAT_POINTS} points`
    })
    const levelsTotal = bind(h('span', { class: 'counter' }), () => {
      const total = SKILLS.reduce((s, { name }) => s + (Number(skills.get(name)) || 0), 0)
      return `${total} / ${BASE_SKILL_LEVELS + FREE_SKILL_LEVELS} niveaux`
    })

    const statRow = ({ key, label }) => {
      const setStat = (part) => (e) => {
        const value = Math.max(part === 'base' ? 0 : -20, Math.min(STAT_MAX, Number(e.target.value) || 0))
        stats.set(key, { ...stats.get(key), [part]: value })
      }
      return h('div', { class: 'stat-row' },
        h('span', { class: 'stat-label' }, label),
        bind(h('input', { type: 'number', min: 0, max: STAT_MAX, title: 'Valeur de base', onchange: setStat('base') }), () => stats.get(key).base),
        bind(h('input', { type: 'number', min: -20, max: 20, class: 'mod', title: 'Bonus / malus (états passifs)', onchange: setStat('mod') }), () => stats.get(key).mod),
        bind(h('button', {
          class: 'roll-btn', title: 'Jet de caractéristique (1d20)',
          onclick: () => ctx.onRoll(`${c.get('name')} · ${label}`, statValue(stats.toJSON(), key), 20),
        }), () => statValue(stats.toJSON(), key)),
      )
    }

    const skillRow = (skill) => h('div', { class: 'skill-row' },
      h('span', { class: 'skill-label', title: skillStatsLabel(skill) }, skill.name),
      bind(h('select', { onchange: (e) => skills.set(skill.name, Number(e.target.value)) },
        LEVELS.map((l, i) => h('option', { value: i }, `${i} · ${l}`))), () => String(skills.get(skill.name) ?? 0)),
      bind(h('button', {
        class: 'roll-btn', title: `Jet de compétence (1d100) · ${skillStatsLabel(skill)}`,
        onclick: () => ctx.onRoll(`${c.get('name')} · ${skill.name}`, skillValue(skill, stats.toJSON(), skills.get(skill.name)), 100),
      }), () => skillValue(skill, stats.toJSON(), skills.get(skill.name))),
    )

    // Listes (talents, états passifs) : reconstruites sauf si on est en train d'y écrire
    const listBlock = (key, title) => {
      const arr = c.get(key)
      const container = h('div', { class: 'list-items' })
      const update = (i, part) => (e) => {
        const item = { ...arr.get(i), [part]: e.target.value }
        ctx.doc.transact(() => { arr.delete(i, 1); arr.insert(i, [item]) })
      }
      const render = () => {
        if (container.contains(document.activeElement)) return
        container.innerHTML = ''
        arr.toArray().forEach((item, i) => container.append(h('div', { class: 'list-item' },
          h('input', { value: item.name, placeholder: 'Nom', disabled: !editable(), onchange: update(i, 'name') }),
          h('textarea', { value: item.desc, rows: 2, placeholder: 'Description', disabled: !editable(), onchange: update(i, 'desc') }),
          editable() && h('button', { class: 'icon', title: 'Supprimer', onclick: () => arr.delete(i, 1) }, '×'),
        )))
        if (!arr.length) container.append(h('p', { class: 'muted' }, 'Aucun'))
      }
      binders.push([null, render])
      return h('section', { class: 'block' },
        h('h3', {}, title, h('button', { class: 'small editable-only', onclick: () => arr.push([{ name: '', desc: '' }]) }, '+ Ajouter')),
        container)
    }

    const badgeSelect = bind(h('select', { class: 'badge-select', onchange: (e) => c.set('badge', e.target.value) },
      BADGES.map((b) => h('option', { value: b.name }, `Badge ${b.name}`))), () => c.get('badge'))

    const gmTools = ctx.me().isGM && h('div', { class: 'gm-tools' },
      h('label', { class: 'check' },
        bind(h('input', { type: 'checkbox', onchange: (e) => c.set('hidden', e.target.checked) }), () => c.get('hidden')),
        'Cachée aux joueurs'),
      h('button', {
        class: 'danger',
        onclick: () => { if (confirm(`Supprimer la fiche de ${c.get('name')} ?`)) { characters.delete(openId); close() } },
      }, 'Supprimer'),
    )

    const nameInput = bind(h('input', { class: 'sheet-name', onchange: (e) => c.set('name', e.target.value) }), () => c.get('name'))

    sheetEl.innerHTML = ''
    sheetEl.append(
      h('header', { class: 'sheet-head' },
        nameInput, badgeSelect, gmTools,
        h('button', { class: 'icon close', title: 'Fermer', onclick: close }, '×')),
      bind(h('p', { class: 'readonly-note' }), () => editable() ? '' : `Fiche en lecture seule (appartient à ${c.get('player')})`),
      h('div', { class: 'sheet-body' },
        h('section', { class: 'block ident' }, IDENTITY.map(([k, l, t]) => field(k, l, t))),
        h('section', { class: 'block' },
          h('h3', {}, 'Caractéristiques innées', statsTotal),
          h('p', { class: 'hint' }, 'Base · bonus/malus · valeur (cliquer pour lancer 1d20)'),
          h('div', { class: 'stats-grid' },
            ['Physique', 'Mentale'].map((g) => h('div', {},
              h('h4', {}, g), STATS.filter((s) => s.group === g).map(statRow))))),
        h('section', { class: 'block' },
          h('h3', {}, 'Compétences', levelsTotal),
          h('p', { class: 'hint' }, 'Cliquer sur un score pour lancer 1d100. Survoler un nom pour voir ses caractéristiques.'),
          h('div', { class: 'skills-grid' },
            SKILL_GROUPS.map((g, gi) => h('div', {},
              h('h4', {}, g), SKILLS.filter((s) => s.group === gi).map(skillRow))))),
        LISTS.map(([k, t]) => listBlock(k, t)),
        h('section', { class: 'block texts' }, TEXTS.map(([k, l]) => field(k, l, 'textarea'))),
      ),
    )

    refresh = () => {
      const ro = !editable()
      sheetEl.classList.toggle('readonly', ro)
      for (const [el, read] of binders) {
        if (!el) { read(); continue }
        if (el === document.activeElement) continue
        const v = read()
        if (el.tagName === 'INPUT' && el.type === 'checkbox') el.checked = !!v
        else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') el.value = v
        else el.textContent = v
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.closest('.gm-tools')) el.disabled = ro
      }
    }
    refresh()
  }

  characters.observeDeep((events) => {
    renderList()
    if (!openId) return
    const c = characters.get(openId)
    if (!c || !canSee(c)) return close()
    // La fiche ouverte a-t-elle changé ?
    if (events.some((e) => e.target !== characters || e.changes.keys.has(openId))) {
      if (events.some((e) => e.target === characters && e.changes.keys.get(openId)?.action === 'update')) build()
      else refresh?.()
    }
  })

  document.getElementById('btn-new-sheet').addEventListener('click', () => {
    const id = crypto.randomUUID()
    ctx.doc.transact(() => writeCharacter(characters, id, { hidden: ctx.me().isGM }))
    open(id)
  })

  return {
    close() { if (openId) close() },
    /** À appeler quand le rôle ou le nom change */
    rerender() {
      renderList()
      if (openId) build()
    },
  }
}
