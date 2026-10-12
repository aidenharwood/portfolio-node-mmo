// Human-readable weapon info for the loot card / tooltips.
import { WEAPON_TYPES } from './weaponTypes.js';
import { RARITY } from './rarity.js';
import { MANUFACTURERS } from './manufacturers.js';
import { ELEMENTS } from './elements.js';
import { PERKS } from './perks.js';
import { FORMS, KIND_LABEL } from './forms.js';
import { weaponValue } from './WeaponGenerator.js';

const pct = (v) => `${Math.round(v * 100)}%`;

// How each spell casts (tap / hold-to-charge), shown on magic item cards.
export const SPELL_HOW = {
  bolt: 'Fires a bolt at the reticle. Charge for a bigger, exploding bolt.',
  orb: 'Lobs an exploding orb. Charge for a larger blast.',
  nova: 'Burns a rune where you aim that detonates a moment later. Charge to cascade five runes down the aim line.',
  seeker: 'Releases homing seekers that lock onto your target. Charge to double them.',
  chain: 'Lightning arcs from the reticle target to nearby foes. Charge for more power.',
};

// Each line: { key, label, text, value, higher } — `higher` says whether a larger value is better.
export function weaponStatLines(w) {
  const s = w.stats;
  const lines = [];
  const pellets = s.pellets ?? 1;
  lines.push({ key: 'damage', label: 'Damage', text: pellets > 1 ? `${Math.round(s.damage)} × ${pellets}` : `${Math.round(s.damage)}`, value: s.damage * pellets, higher: true });
  if (w.cls === 'melee') {
    lines.push({ key: 'attackSpeed', label: 'Attack Speed', text: `${s.attackSpeed.toFixed(2)}×`, value: s.attackSpeed, higher: true });
    lines.push({ key: 'range', label: 'Reach', text: `${s.range.toFixed(2)}×`, value: s.range, higher: true });
  } else if (w.cls === 'ranged') {
    lines.push({ key: 'fireRate', label: 'Fire Rate', text: `${s.fireRate.toFixed(1)}/s`, value: s.fireRate, higher: true });
    lines.push({ key: 'magSize', label: 'Magazine', text: `${s.magSize}`, value: s.magSize, higher: true });
    lines.push({ key: 'reloadTime', label: 'Reload', text: `${s.reloadTime.toFixed(1)}s`, value: s.reloadTime, higher: false });
    if (s.pierce) lines.push({ key: 'pierce', label: 'Pierce', text: `${s.pierce}`, value: s.pierce, higher: true });
    if (s.aoe) lines.push({ key: 'aoe', label: 'Blast Radius', text: `${s.aoe.toFixed(1)}m`, value: s.aoe, higher: true });
    lines.push({ key: 'accuracy', label: 'Accuracy', text: pct(Math.max(0, 1 - s.spread / 0.3)), value: -s.spread, higher: true });
  } else {
    lines.push({ key: 'castRate', label: 'Cast Rate', text: `${s.castRate.toFixed(1)}/s`, value: s.castRate, higher: true });
    lines.push({ key: 'manaCost', label: 'Mana Cost', text: `${Math.round(s.manaCost)}`, value: s.manaCost, higher: false });
    if (s.missiles) lines.push({ key: 'missiles', label: 'Seekers', text: `${s.missiles}`, value: s.missiles, higher: true });
    if (s.chains) lines.push({ key: 'chains', label: 'Chain Jumps', text: `${s.chains}`, value: s.chains, higher: true });
    if (s.radius > 0) lines.push({ key: 'radius', label: 'Radius', text: `${s.radius.toFixed(1)}m`, value: s.radius, higher: true });
  }
  lines.push({ key: 'crit', label: 'Crit Chance', text: pct(s.critChance), value: s.critChance, higher: true });
  if (w.element !== 'none') {
    lines.push({ key: 'element', label: `${ELEMENTS[w.element].label} Chance`, text: pct(s.elementChance), value: s.elementChance, higher: true });
  }
  return lines;
}

export function weaponInfo(w) {
  const rar = RARITY[w.rarity];
  const mfr = MANUFACTURERS[w.manufacturer];
  return {
    name: w.name,
    color: rar.css,
    subtitle: `Lv ${w.level} · ${rar.name} ${WEAPON_TYPES[w.type].label}`,
    how: w.cls === 'magic' ? SPELL_HOW[WEAPON_TYPES[w.type].spell] ?? '' : '',
    manufacturer: mfr.name,
    blurb: mfr.blurb,
    element: w.element !== 'none' ? ELEMENTS[w.element] : null,
    perks: w.perks.map((id) => PERKS[id]),
    components: Object.entries(w.look ?? {}).map(([kind, id]) => FORMS[kind][id]?.name ?? `${id} ${KIND_LABEL[kind]}`),
    value: weaponValue(w),
  };
}

// ---------------------------------------------------------------- armour
import { ARMOR_SLOTS, ARMOR_PERKS, STAT_LABEL, PCT_STATS } from './armorTypes.js';
import { PART_INDEX } from './parts.js';

const ARMOR_ORDER = ['armor', 'hp', 'might', 'finesse', 'arcana', 'vitality', 'moveSpeed', 'critBonus', 'manaRegen', 'staminaRegen', 'resistFire', 'resistShock', 'resistFrost', 'resistCorrosive'];

export function armorStatLines(a) {
  return ARMOR_ORDER.filter((k) => a.stats[k]).map((k) => {
    const v = a.stats[k];
    const text = PCT_STATS.has(k) ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` : `${k === 'armor' ? '' : '+'}${Math.round(v)}`;
    return { key: k, label: k === 'hp' ? 'Max Health' : STAT_LABEL[k], text, value: v, higher: true };
  });
}

export function armorInfo(a, value) {
  const rar = RARITY[a.rarity];
  const mfr = MANUFACTURERS[a.manufacturer];
  const material = PART_INDEX[a.parts.material]?.name ?? '';
  return {
    name: a.name,
    color: rar.css,
    subtitle: `Lv ${a.level} · ${rar.name} ${ARMOR_SLOTS[a.slot].label}`,
    manufacturer: mfr.name,
    blurb: mfr.blurb,
    element: null,
    perks: a.perks.map((id) => ARMOR_PERKS[id]),
    components: [material, PART_INDEX[a.parts.lining]?.name, PART_INDEX[a.parts.trim]?.name].filter(Boolean),
    value,
  };
}
