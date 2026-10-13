// The Journal's other pages (game menu, L): Achievements — every one by category, with progress
// and points, the titles they grant — and the Codex: the enemies you've fought (lore, strengths,
// weaknesses, how many, the sub-types and elite affixes you've seen), the kinds of landmark you've
// found, the four cities you've reached, and the makers whose gear you've carried. Locked entries
// show as unknown.
import { esc } from './cards.js';
import { ACHIEVEMENTS, CATEGORIES, progressOf, pointsOf } from '../rpg/achievements.js';
import { BESTIARY, PLACES, MAKER_LORE } from '../rpg/codex.js';
import { ENEMY_TYPES } from '../combat/bestiary.js';
import { AFFIXES } from '../sim/affixes.js';
import { MANUFACTURERS, MAKER_IDS } from '../items/manufacturers.js';
import { GEAR_SETS } from '../items/sets.js';

const RACE_NAME = { scav: 'The Scav clans', hive: 'The Hive', synth: 'The Synths', fauna: 'The Wild' };

export function achievementsHTML(game) {
  const core = game.char;
  const done = core.achievements;
  const total = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);
  const cats = Object.entries(CATEGORIES).map(([cat, label]) => {
    const list = ACHIEVEMENTS.filter((a) => a.cat === cat).map((a) => {
      const got = done[a.id] !== undefined;
      const v = progressOf(a, core.records, core);
      return `<li class="ac ${got ? 'done' : ''}">
        <div class="ac-head"><b>${esc(a.name)}</b><span class="ac-pts">${a.points}</span></div>
        <small>${esc(a.desc)}${a.title ? ` <em>Title: ${esc(a.title)}</em>` : ''}</small>
        ${got ? '' : `<i class="ac-bar"><i style="width:${((v / a.goal) * 100).toFixed(1)}%"></i></i><small class="ac-count">${v} / ${a.goal}</small>`}
      </li>`;
    }).join('');
    const n = ACHIEVEMENTS.filter((a) => a.cat === cat && done[a.id] !== undefined).length;
    return `<section class="gm-card ac-cat"><h3>${label} <small>${n} / ${ACHIEVEMENTS.filter((a) => a.cat === cat).length}</small></h3><ul class="ac-list">${list}</ul></section>`;
  }).join('');
  return `
    <div class="ac-sum"><b>${pointsOf(done)}</b> of ${total} points · ${Object.keys(done).length} of ${ACHIEVEMENTS.length} achievements
      <small>Titles are worn from the Character tab. Dungeons, events and raids add achievements as they arrive.</small></div>
    <div class="gm-cols">${cats}</div>`;
}

export function codexHTML(game) {
  const R = game.char.records;
  const races = Object.keys(RACE_NAME).map((race) => {
    const entries = Object.entries(ENEMY_TYPES).filter(([, t]) => t.race === race).map(([id, t]) => {
      const kills = R.types[id] ?? 0;
      const B = BESTIARY[id];
      if (!kills || !B) return `<li class="cx locked"><b>Unknown</b><small>Defeat one to learn about it.</small></li>`;
      const variants = Object.entries(t.variants ?? {}).map(([vid, v]) => (R.variants[vid] ? esc(v.name) : '?')).join(', ');
      const affixes = Object.keys(R.typeAffixes[id] ?? {}).map((a) => `<span style="color:#${(AFFIXES[a]?.color ?? 0xffd23f).toString(16).padStart(6, '0')}">${esc(AFFIXES[a]?.name ?? a)}</span>`).join(' · ');
      return `<li class="cx">
        <div class="ac-head"><b>${esc(t.name)}</b><span class="ac-pts" title="Defeated">${kills}</span></div>
        <p>${esc(B.lore)}</p>
        <small><em>Strengths</em> ${esc(B.strengths)}</small>
        <small><em>Weaknesses</em> ${esc(B.weaknesses)}</small>
        ${t.variants ? `<small><em>Sub-types</em> ${variants}</small>` : ''}
        ${affixes ? `<small><em>Elites seen</em> ${affixes}</small>` : ''}
      </li>`;
    }).join('');
    return `<section class="gm-card"><h3>${RACE_NAME[race]}</h3><ul class="cx-list">${entries}</ul></section>`;
  }).join('');
  const places = Object.entries(PLACES).map(([kind, P]) => (R.landmarkKinds[kind]
    ? `<li class="cx"><b>${esc(P.name)}</b><p>${esc(P.lore)}</p></li>`
    : '<li class="cx locked"><b>Unknown</b><small>A kind of landmark you haven\'t found.</small></li>')).join('');
  const cities = game.world.gen.cities().map((c) => (R.settlements.includes(`y:${c.rx},${c.rz}`)
    ? `<li class="cx"><div class="ac-head"><b>${esc(c.name)}</b><span class="ac-pts">Act ${c.act}</span></div><p>${esc(c.blurb)}</p></li>`
    : `<li class="cx locked"><b>${esc(c.name)}</b><small>Act ${c.act} · ${Math.round(Math.hypot(c.x, c.z) / 10) * 10} metres from Brightwater. Reach it to learn more.</small></li>`)).join('');
  const makers = MAKER_IDS.map((id) => {
    const M = MANUFACTURERS[id];
    if (!R.makers[id]) return '<li class="cx locked"><b>Unknown</b><small>Carry its gear to learn of it.</small></li>';
    const set = GEAR_SETS[M.set];
    return `<li class="cx"><b>${esc(M.name)}</b><p>${esc(MAKER_LORE[id] ?? '')} <i>${esc(M.blurb)}</i></p><small><em>Set</em> ${esc(set?.name ?? '')} — ${esc(set?.blurb ?? '')}</small></li>`;
  }).join('');
  const known = Object.keys(R.types).length;
  return `
    <div class="ac-sum"><b>${known}</b> of ${Object.keys(ENEMY_TYPES).length} enemies · ${Object.keys(R.landmarkKinds).length} of ${Object.keys(PLACES).length} kinds of place · ${Object.keys(R.makers).length} of ${MAKER_IDS.length} makers</div>
    <div class="gm-cols">${races}
      <section class="gm-card"><h3>Places</h3><ul class="cx-list">${places}</ul></section>
      <section class="gm-card"><h3>Cities</h3><ul class="cx-list">${cities}</ul></section>
      <section class="gm-card"><h3>Makers</h3><ul class="cx-list">${makers}</ul></section>
    </div>`;
}
