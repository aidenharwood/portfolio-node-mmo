// The Talents tab (game menu, N): the three trees side by side, tier by tier — each node with its
// rank and what the next one gives, the abilities it unlocks and their upgrades — plus the three
// ability slots and the reset. Clicking a node learns a rank; an unlocked ability can be put in a
// slot from its node. The menu (ui/GameMenu.js) passes the clicks on as character operations.
import { esc } from './cards.js';
import { TREES, TREE_IDS, TALENTS, TIERS, canLearn, spentIn, respecCost, RESPEC_FREE_BELOW } from '../rpg/talents.js';
import { ABILITIES, abilityPower, cooldownOf } from '../combat/abilities.js';
import { ABILITY_KEY_LABELS } from '../entities/AbilityKit.js';

const BY_TREE = Object.fromEntries(TREE_IDS.map((t) => [t, TIERS.map((_, tier) => Object.values(TALENTS).filter((n) => n.tree === t && n.tier === tier))]));

function nodeHTML(game, n) {
  const s = game.stats;
  const rank = s.talents[n.id] ?? 0;
  const why = canLearn(s.talents, n.id, s.level);
  const learned = rank > 0;
  const maxed = rank >= n.ranks;
  let title;
  let body;
  if (n.ability) {
    const A = ABILITIES[n.ability];
    title = A.name;
    const slot = s.slots.indexOf(n.ability);
    const slots = learned
      ? `<span class="tl-slots">${ABILITY_KEY_LABELS.map((k, i) => `<button class="tl-slot ${slot === i ? 'on' : ''}" data-act="slot" data-i="${i}" data-a="${n.ability}" title="Put it on ${k}">${k}</button>`).join('')}</span>`
      : '';
    body = `<small>${esc(A.desc)}</small><small class="tl-meta">Ability · ${cooldownOf(n.ability, s.talent.upgrades)} s cooldown</small>${slots}`;
  } else if (n.upgrade) {
    title = n.name;
    body = `<small>${esc(n.desc(1))}</small><small class="tl-meta">Upgrades ${ABILITIES[n.upgrade[0]].name}</small>`;
  } else {
    title = n.name;
    const now = rank ? n.desc(rank) : '';
    const next = maxed ? '' : n.desc(rank + 1);
    body = `<small>${esc(rank ? `${now}${maxed ? '' : ` → ${next}`}` : next)}</small>`;
  }
  const cls = ['tl-node', n.ability ? 'ability' : n.upgrade ? 'upgrade' : n.capstone ? 'capstone' : '', learned ? 'learned' : '', maxed ? 'maxed' : '', why && !maxed ? 'locked' : ''].join(' ');
  const pips = n.ranks > 1 ? `<i class="tl-rank">${rank}/${n.ranks}</i>` : learned ? '<i class="tl-rank">✓</i>' : '';
  return `<div class="${cls}" ${!why ? `data-act="learn" data-id="${n.id}"` : ''} title="${esc(why && !maxed ? why : maxed ? 'Learned' : 'Click to learn')}"><b>${esc(title)}</b>${pips}${body}</div>`;
}

export function talentsHTML(game) {
  const s = game.stats;
  const spent = spentIn(s.talents);
  const cost = respecCost(s.level);
  const anySpent = Object.keys(s.talents).length > 0;
  const slots = s.slots.map((id, i) => {
    const A = id && ABILITIES[id];
    return `<div class="tl-bar-slot ${A ? 'on' : ''}"><kbd>${ABILITY_KEY_LABELS[i]}</kbd><span>${A ? esc(A.name) : 'Empty'}</span>${A ? `<button data-act="slot" data-i="${i}" data-a="" title="Clear this slot">×</button>` : ''}</div>`;
  }).join('');
  const trees = TREE_IDS.map((t) => {
    const T = TREES[t];
    const tiers = BY_TREE[t].map((nodes, tier) => {
      const open = spent[t] >= TIERS[tier];
      return `<div class="tl-tier ${open ? '' : 'closed'}"><span class="tl-req" title="Points in ${T.name} to open this tier">${TIERS[tier]}</span><div class="tl-nodes">${nodes.map((n) => nodeHTML(game, n)).join('')}</div></div>`;
    }).join('');
    return `<section class="tl-tree" style="--tree:${T.color}">
      <h3>${esc(T.name)} <small>${esc(T.role)} · ${spent[t]} point${spent[t] === 1 ? '' : 's'}</small></h3>
      <p class="tl-blurb">${esc(T.blurb)}</p>
      ${tiers}
    </section>`;
  }).join('');
  const power = Math.round(abilityPower(s, 'slam'));
  return `
    <div class="tl-head">
      <div class="tl-points"><b>${s.points}</b> talent point${s.points === 1 ? '' : 's'} to spend<small>One a level from level 2 · level ${s.level}</small></div>
      <div class="tl-bar">${slots}</div>
      <button class="gm-btn" data-act="respec" ${anySpent ? '' : 'disabled'} title="${cost ? `From a smith at a town's or city's workshop, for ${cost}g` : `Free below level ${RESPEC_FREE_BELOW}`}">Reset talents${cost ? ` · ${cost}g` : ' · free'}</button>
    </div>
    <p class="hint">Click a talent to learn a rank. Tiers open as points go into a tree; a full tree takes 24 points. Ability damage grows with your level and your class bonus (about ${power} a hit for Vanguard abilities now). Abilities go on X, G and T.</p>
    <div class="tl-trees">${trees}</div>`;
}
