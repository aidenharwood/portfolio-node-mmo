// Each player's character, kept by the server — the authority: progression and belongings in a
// CharacterCore (src/rpg/CharacterCore.js), loaded from the database and saved back. Players ask
// for changes as operations; the core checks and applies them (with the server rolling any dice),
// and the answer goes back with a fingerprint so the player's copy can tell if it has drifted.
// What the server takes on trust from the player is only their own screen's business: the fog of
// war they've uncovered, their map marker, and where they stand (checked for speed).
import { CharacterCore, stockFor, PREDICTED, ROLLED } from '../src/rpg/CharacterCore.js';
import { Stats } from '../src/rpg/Stats.js';
import { QuestLog } from '../src/rpg/Quests.js';
import { Inventory, BACKPACK_SIZE } from '../src/items/Inventory.js';
import { generateWeapon } from '../src/items/WeaponGenerator.js';
import { generateArmor } from '../src/items/ArmorGenerator.js';
import { HUB } from '../src/world/Gen.js';

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
  const extras = { discovery: data?.discovery ?? null, marker: data?.marker ?? null, pos: data?.pos ?? null };
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
    // A new character: a plain sword, and three weapons waiting by the camp to choose from.
    inventory.add(generateWeapon({ seed: 7, level: 1, type: 'sword', rarity: 'common' }));
    for (const [cls, x] of [['ranged', -2.5], ['magic', 0], ['melee', 2.5]]) {
      const gx = HUB.x + x;
      const gz = HUB.z - 7.5;
      core.spawn(core.gid(), generateWeapon({ level: 1, cls, rarity: 'uncommon' }), [gx, w.groundHeight(gx, gz), gz], [], false);
    }
    extras.pos = [HUB.x, w.groundHeight(HUB.x, HUB.z + 4), HUB.z + 4];
  }
  // Everyone gets the outpost cape once.
  if (!core.settings.capeGranted) {
    if (!inventory.armor.back) inventory.armor.back = generateArmor({ seed: 7711, level: 1, slot: 'back', rarity: 'common' });
    core.settings.capeGranted = true;
  }
  core.apply({ op: 'stock', roll: { stock: data?.shop?.length ? data.shop : stockFor(stats.level) } });
  position.fromArray(extras.pos ?? [HUB.x, 0, HUB.z + 4]);
  return { core, extras };
}

export const characterData = (core, extras) => ({ ...core.toJSON(), ...extras });

export const groundList = (core) => [...core.ground.values()].map((g) => ({ gid: g.gid, recipe: g.item.recipe, at: g.at }));

// The hardest single hit this character could land with what they carry: each weapon's damage,
// critting, with their attribute bonus and every stacking multiplier (heavy attacks, perks) on top.
export function maxHit(core) {
  let best = 40;
  for (const w of core.inventory.slots) {
    if (!w) continue;
    const s = w.stats;
    best = Math.max(best, s.damage * (s.critMult ?? 2) * core.stats.damageMult(w.cls) * 6);
  }
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
