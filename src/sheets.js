import * as Y from 'yjs'
import { h, liveRender, pips } from './dom.js'
import {
  STATS, STAT_POINTS, STAT_MAX, LEVELS, SKILLS, SKILL_GROUPS, BADGES,
  BASE_SKILL_LEVELS, FREE_SKILL_LEVELS, statValue, skillValue, skillStatsLabel, ownerOf,
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

/** Type de donnée du glisser-déposer d'un personnage vers la carte (lu par board.js). */
export const CHARACTER_MIME = 'application/x-starboard-character'

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

/**
 * Liste de l'équipage (barre latérale) + dossier du personnage.
 * Le dossier s'affiche en consultation ; « Modifier » fait apparaître les champs.
 * ctx : { doc, me() -> { name, isGM }, onRoll(label, target, sides), onOpen() }
 */
export function setupSheets(ctx) {
  const characters = ctx.doc.getMap('characters')
  const listEl = document.getElementById('crew-list')
  const sheetEl = document.getElementById('sheet')
  let openId = null
  let editing = false

  const canSee = (c) => ctx.me().isGM || !c.get('hidden')
  const canEdit = (c) => {
    const { name, isGM } = ctx.me()
    const owner = ownerOf(c.get('name'), c.get('player'))
    return isGM || !owner || owner.toLowerCase() === name.toLowerCase()
  }

  function renderList() {
    listEl.innerHTML = ''
    const entries = [...characters.entries()]
      .filter(([, c]) => canSee(c))
      .sort(([, a], [, b]) => {
        // Personnages joueurs d'abord, puis ordre alphabétique
        const pa = ownerOf(a.get('name'), a.get('player')) ? 0 : 1
        const pb = ownerOf(b.get('name'), b.get('player')) ? 0 : 1
        return pa - pb || a.get('name').localeCompare(b.get('name'))
      })
    const isGM = ctx.me().isGM
    for (const [id, c] of entries) {
      const badge = BADGES.find((b) => b.name === c.get('badge'))
      listEl.append(h('li', {
        class: `crew-item${id === openId ? ' active' : ''}${c.get('hidden') ? ' is-hidden' : ''}${isGM ? ' with-vis' : ''}`,
        onclick: () => open(id),
        // MJ : glisser le personnage sur la carte crée (ou déplace) son jeton
        draggable: isGM,
        ondragstart: isGM && ((e) => { e.dataTransfer.setData(CHARACTER_MIME, id); e.dataTransfer.effectAllowed = 'copy' }),
        title: isGM ? 'Glisser sur la carte pour placer son jeton' : null,
      },
      isGM && h('input', {
        type: 'checkbox', class: 'vis-toggle', checked: !c.get('hidden'), title: 'Visible par les joueurs',
        onclick: (e) => e.stopPropagation(),
        onchange: (e) => c.set('hidden', !e.target.checked),
      }),
      h('span', { class: 'badge-dot', style: `--badge:${badge?.color ?? '#555'}`, title: `Badge ${c.get('badge')}` }),
      h('span', { class: 'crew-name' }, c.get('name')),
      h('span', { class: 'crew-post' }, ownerOf(c.get('name'), c.get('player')) ? `PJ · ${ownerOf(c.get('name'), c.get('player'))}` : c.get('post')),
      ))
    }
    if (!entries.length) listEl.append(h('li', { class: 'muted' }, 'Aucune fiche visible'))
  }

  function close() {
    openId = null
    editing = false
    sheetEl.hidden = true
    sheetEl.innerHTML = ''
    renderList()
  }

  function open(id) {
    if (id === openId) return close() // reclic sur la fiche ouverte : on la ferme
    ctx.onOpen?.()
    if (id !== openId) editing = false
    openId = id
    sheetEl.hidden = false
    render()
    renderList()
  }

  const render = liveRender(sheetEl, build)

  function build() {
    const c = characters.get(openId)
    if (!c || !canSee(c)) return close()
    const data = c.toJSON()
    data.player = ownerOf(data.name, data.player)
    const stats = c.get('stats')
    const skills = c.get('skills')
    const mayEdit = canEdit(c)
    const ed = editing && mayEdit
    const isGM = ctx.me().isGM
    const badge = BADGES.find((b) => b.name === data.badge) ?? BADGES.at(-1)
    const roll = (label, target, sides) => ctx.onRoll(`${data.name} · ${label}`, target, sides)
    const set = (key) => (e) => c.set(key, e.target.value)
    const field = (key, label, multiline = false) => h('label', { class: 'field' }, h('span', {}, label),
      multiline
        ? h('textarea', { rows: 4, value: data[key] ?? '', onchange: set(key) })
        : h('input', { value: data[key] ?? '', onchange: set(key) }))
    const section = (title, extra, ...content) => h('section', { class: 'sec' },
      h('h3', { class: 'sec-title' }, h('span', {}, title), extra && h('span', { class: 'sec-extra' }, extra)), ...content)

    // ---- En-tête ----
    const age = String(data.age ?? '').trim()
    const meta = [data.post, age && (/^\d+$/.test(age) ? `${age} ans` : age), data.country].filter(Boolean).join('  ·  ')
    const head = h('header', { class: 'dossier-head', style: `--badge:${badge.color}` },
      h('div', { class: 'dossier-id' },
        ed
          ? h('input', { class: 'dossier-name-input', value: data.name, onchange: set('name') })
          : h('h2', { class: 'dossier-name' }, data.name),
        !ed && h('div', { class: 'dossier-meta' }, meta || 'Dossier incomplet')),
      h('div', { class: 'dossier-actions' },
        ed
          ? h('select', { onchange: set('badge') }, BADGES.map((b) => h('option', { value: b.name, selected: b.name === data.badge }, `Badge ${b.name}`)))
          : h('span', { class: 'badge-chip' }, h('i'), `Badge ${data.badge}`),
        !ed && data.player && h('span', { class: 'tag' }, `PJ · ${data.player}`),
        !ed && isGM && data.hidden && h('span', { class: 'tag' }, 'Cachée'),
        mayEdit && h('button', { class: ed ? 'small primary' : 'small', onclick: () => { editing = !editing; render() } }, ed ? 'Terminer' : 'Modifier'),
        h('button', { class: 'icon', title: 'Fermer', onclick: close }, '×')))

    // ---- Identité (édition) ----
    const identity = ed && h('div', { class: 'edit-grid' },
      field('post', 'Poste'), field('age', 'Âge'), field('country', "Pays d'origine"), field('player', 'Joueur (vide = PNJ)'),
      isGM && h('div', { class: 'edit-gm' },
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: data.hidden, onchange: (e) => c.set('hidden', e.target.checked) }), 'Cachée aux joueurs'),
        h('button', {
          class: 'small danger',
          onclick: () => { if (confirm(`Supprimer la fiche de ${data.name} ?`)) { characters.delete(openId); close() } },
        }, 'Supprimer la fiche')))

    // ---- Caractéristiques ----
    const statsTotal = STATS.reduce((s, { key }) => s + (Number(data.stats[key]?.base) || 0), 0)
    const setStat = (key, part) => (e) => {
      const value = Math.max(part === 'base' ? 0 : -20, Math.min(STAT_MAX, Number(e.target.value) || 0))
      stats.set(key, { ...stats.get(key), [part]: value })
    }
    const statTile = ({ key, label }) => {
      const { base = 0, mod = 0 } = data.stats[key] ?? {}
      const value = statValue(data.stats, key)
      if (ed) {
        return h('div', { class: 'stat-tile editing' },
          h('span', { class: 'tile-label' }, label),
          h('div', { class: 'tile-inputs' },
            h('label', {}, 'Base', h('input', { type: 'number', min: 0, max: STAT_MAX, value: base, onchange: setStat(key, 'base') })),
            h('label', {}, 'Bonus', h('input', { type: 'number', min: -20, max: 20, value: mod, onchange: setStat(key, 'mod') }))))
      }
      return h('button', { class: 'stat-tile', title: `Lancer 1d20 ≤ ${value}`, onclick: () => roll(label, value, 20) },
        h('span', { class: 'tile-label' }, label),
        h('span', { class: 'tile-value' }, value),
        Number(mod) !== 0 && h('span', { class: `tile-mod ${mod > 0 ? 'up' : 'down'}`, title: 'Bonus / malus des états passifs' }, signed(Number(mod))))
    }

    // ---- Compétences ----
    const levelsTotal = SKILLS.reduce((s, { name }) => s + (Number(data.skills[name]) || 0), 0)
    const skillRow = (skill) => {
      const level = Number(data.skills[skill.name]) || 0
      const score = skillValue(skill, data.stats, level)
      return h('div', { class: `skill${level ? '' : ' untrained'}`, title: `${LEVELS[level]} · ${skillStatsLabel(skill)}` },
        h('span', { class: 'skill-name' }, skill.name),
        pips(5, level, ed ? (n) => skills.set(skill.name, n) : null, (n) => `${n} · ${LEVELS[n]}`),
        h('button', { class: 'score', title: `Lancer 1d100 ≤ ${score}`, onclick: () => roll(skill.name, score, 100) }, score))
    }

    // ---- Talents, états passifs ----
    const listBlock = (key, title) => {
      const arr = c.get(key)
      const items = data[key] ?? []
      const update = (i, part) => (e) => {
        const item = { ...arr.get(i), [part]: e.target.value }
        ctx.doc.transact(() => { arr.delete(i, 1); arr.insert(i, [item]) })
      }
      return section(title, ed && h('button', { class: 'small', onclick: () => arr.push([{ name: '', desc: '' }]) }, '+ Ajouter'),
        items.length
          ? h('div', { class: 'traits' }, items.map((item, i) => (ed
            ? h('div', { class: 'trait editing' },
              h('input', { value: item.name, placeholder: 'Nom', onchange: update(i, 'name') }),
              h('button', { class: 'icon', title: 'Supprimer', onclick: () => arr.delete(i, 1) }, '×'),
              h('textarea', { rows: 2, value: item.desc, placeholder: 'Description', onchange: update(i, 'desc') }))
            : h('div', { class: 'trait' }, h('b', {}, item.name || 'Sans nom'), item.desc && h('p', {}, item.desc)))))
          : h('p', { class: 'muted' }, 'Aucun'))
    }

    // ---- Dossier (textes) ----
    const notes = TEXTS.filter(([k]) => ed || String(data[k] ?? '').trim())

    sheetEl.append(...[
      head,
      !mayEdit && h('p', { class: 'readonly-note' }, `Lecture seule : fiche de ${data.player}`),
      identity,
      section('Caractéristiques innées', `${statsTotal} / ${STAT_POINTS} points`,
        h('div', { class: 'stat-groups' }, ['Physique', 'Mentale'].map((g) => h('div', { class: 'stat-group' },
          h('h4', {}, g), h('div', { class: 'stat-tiles' }, STATS.filter((s) => s.group === g).map(statTile)))))),
      section('Compétences', `${levelsTotal} / ${BASE_SKILL_LEVELS + FREE_SKILL_LEVELS} niveaux`,
        h('div', { class: 'skill-cols' }, SKILL_GROUPS.map((g, gi) => h('div', {},
          h('h4', {}, g.replace('Aptitudes ', '')), SKILLS.filter((s) => s.group === gi).map(skillRow))))),
      h('div', { class: 'two-cols' }, LISTS.map(([k, t]) => listBlock(k, t))),
      section('Dossier', null,
        notes.length
          ? h('div', { class: 'notes' }, notes.map(([k, l]) => (ed
            ? field(k, l, true)
            : h('div', { class: 'note' }, h('span', { class: 'note-label' }, l), h('p', {}, data[k])))))
          : h('p', { class: 'muted' }, 'Aucune note.')),
    ].filter(Boolean))
  }

  characters.observeDeep(() => {
    renderList()
    if (openId) render()
  })

  document.getElementById('btn-new-sheet').addEventListener('click', () => {
    const id = crypto.randomUUID()
    ctx.doc.transact(() => writeCharacter(characters, id, { hidden: ctx.me().isGM }))
    open(id)
    editing = true
    render()
  })

  return {
    close() { if (openId) close() },
    /** À appeler quand le rôle ou le nom change */
    rerender() {
      renderList()
      if (openId) render()
    },
  }
}
