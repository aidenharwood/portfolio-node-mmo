// Each player's character, kept by the server — the authority: progression and belongings in a
// CharacterCore (src/rpg/CharacterCore.js), loaded from the database and saved back. Players ask
// for changes as operations; the core checks and applies them (with the server rolling any dice),
// and the answer goes back with a fingerprint so the player's copy can tell if it has drifted.
// What the server takes on trust from the player is only their own screen's business: the fog of
// war they've uncovered, their map marker, and where they stand (checked for speed).
import { CharacterCore, stockFor, fineStockFor, PREDICTED, ROLLED } from '../src/rpg/CharacterCore.js';
import { Stats } from '../src/rpg/Stats.js';
import { QuestLog } from '../src/rpg/Quests.js';
import { Inventory, BACKPACK_SIZE } from '../src/items/Inventory.js';
import { generateWeapon } from '../src/items/WeaponGenerator.js';
import { starterArmor } from '../src/items/ArmorGenerator.js';
import { HUB } from '../src/world/Gen.js';
import { abilityPower } from '../src/combat/abilities.js';
import { inPocket } from '../src/world/dungeons.js';

export { PREDICTED, ROLLED };

// The character a session plays, from its saved data (or a brand-new one).
export function loadCharacter(session, data, simhost) {
  const position = session.proxy.position;
  const stats = new Stats();
  const inventory = new Inventory(3);
  // Quest offers are made up here, from the world as the server knows it.
  const questHost = {
    hud: null,
    world: simhost.world,
    get encounters() { return { isCleared: (id) => simhost.cleared.has(id) }; },
    stats,
    player: { position },
  };
  const quests = new QuestLog(questHost);
  const core = new CharacterCore({
    stats, inventory, quests, attuned: new Set(['w-hub']), chests: new Set(), shop: { stock: [] }, settings: { lootFilter: 1 },
    position, world: simhost.world, strict: true,
  });
  core.inCombat = () => simhost.inCombat(session);
  core.dungeons = simhost.dungeonPort(session);
  const extras = { discovery: data?.discovery ?? null, marker: data?.marker ?? null, tracked: data?.tracked ?? null, pos: data?.pos ?? null };
  // Left in a dungeon (its copy may be gone): back where they went in.
  if (extras.pos && inPocket(extras.pos[0])) extras.pos = Array.isArray(data?.run?.back) ? data.run.back : null;
  const w = simhost.world;
  if (data?.stats) {
    stats.load(data.stats);
    quests.load(data.quests ?? {});
    inventory.load(data.inventory ?? {});
    for (const id of data.attuned ?? []) core.attuned.add(id);
    for (const id of data.chests ?? []) core.chests.add(id);
    Object.assign(core.settings, data.settings ?? {});
    // Anything a repair couldn't fit back in waits at the character's feet.
    const spill = inventory.backpack.splice(BACKPACK_SIZE).filter(Boolean);
    const at = extras.pos ?? [HUB.x, 0, HUB.z + 4];
    for (const it of spill) core.spawn(core.gid(), it, at, [], false);
  } else {
    // A new character starts with a plain sword.
    inventory.add(generateWeapon({ seed: 7, level: 1, type: 'sword', rarity: 'common' }));
    extras.pos = [HUB.x, w.groundHeight(HUB.x, HUB.z + 4), HUB.z + 4];
  }
  // A new character starts in the Pathfinder trail set; an older one without it gets the cape.
  if (!core.settings.capeGranted) {
    const kit = starterArmor();
    for (const slot of data?.stats ? ['back'] : Object.keys(kit)) inventory.armor[slot] ??= kit[slot];
    core.settings.capeGranted = true;
  }
  core.loadProgress(data);
  core.apply({ op: 'stock', roll: { stock: data?.shop?.length ? data.shop : stockFor(stats.level), fine: data?.fine?.length ? data.fine : fineStockFor(stats.level) } });
  position.fromArray(extras.pos ?? [HUB.x, 0, HUB.z + 4]);
  return { core, extras };
}

export const characterData = (core, extras) => ({ ...core.toJSON(), ...extras });

export const groundList = (core) => [...core.ground.values()].map((g) => ({ gid: g.gid, recipe: g.item.recipe, at: g.at }));

// The hardest single hit this character could land: each weapon they carry, critting, with their
// class bonus and every stacking multiplier (heavy attacks, perks) on top — or their hardest
// ability (combat/abilities.js).
export function maxHit(core) {
  let best = 40;
  for (const w of core.inventory.slots) {
    if (!w) continue;
    const s = w.stats;
    best = Math.max(best, s.damage * ((s.critMult ?? 2) + core.stats.critDamage) * core.stats.damageMult(w.cls) * 6);
  }
  for (const id of ['slam', 'frag', 'drone']) best = Math.max(best, abilityPower(core.stats, id) * 4);
  return best;
}

// An operation from a player, checked and applied: { ok, roll } for the answer.
export function runOp(core, msg) {
  const op = msg?.op;
  if (!op || typeof op !== 'object' || typeof op.op !== 'string') return { ok: false };
  if (!PREDICTED.has(op.op) && !ROLLED.has(op.op)) return { ok: false };
  if (JSON.stringify(op).length > 600) return { ok: false };
  delete op.roll; // the server rolls its own dice
  const rolled = ROLLED.has(op.op);
  if (rolled) op.roll = core.roll(op);
  const r = core.apply(op);
  return { ok: r.ok, roll: r.ok && rolled ? op.roll : undefined, fx: r.fx };
}
