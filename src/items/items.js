// Item-kind dispatch: weapons and armour share recipes, value, models and loot rolls.
import { generateWeapon, weaponValue } from './WeaponGenerator.js';
import { generateArmor } from './ArmorGenerator.js';
import { buildWeaponModel } from './WeaponModel.js';
import { buildArmorModel } from '../models/ArmorForms.js';
import { RARITY } from './rarity.js';

export const isArmor = (item) => item?.kind === 'armor';

export function itemFromRecipe(recipe) {
  return recipe.kind === 'armor' ? generateArmor(recipe) : generateWeapon(recipe);
}

const TIER_VALUE = [1, 2.2, 5, 11, 30];
export function itemValue(item) {
  if (!isArmor(item)) return weaponValue(item);
  return Math.round(4 * (1 + item.level * 0.7) * TIER_VALUE[RARITY[item.rarity].tier]);
}

export function buildItemModel(item) {
  return isArmor(item) ? buildArmorModel(item) : buildWeaponModel(item);
}

// Random loot roll: mostly weapons, sometimes armour.
export function rollLoot(opts, armorChance = 0.35) {
  return Math.random() < armorChance ? generateArmor(opts) : generateWeapon(opts);
}
