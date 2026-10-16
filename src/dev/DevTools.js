// In-game developer tools (offline only: main.js loads this module when the game plays
// single-player, and drops it before going online; a production server doesn't serve it).
//   `  (Backquote) or F1 — dev panel: player cheats, teleports, spawners (bosses and raid fights
//                         too), loot forge, render toggles, time controls, save tools, a JS
//                         console and the error log.
//   F3               — performance overlay (fps, frame time, draw calls, triangles, memory, entities).
// While the panel is open the game keeps simulating (unless paused) but ignores player input.
import * as THREE from 'three';
import { ENEMY_TYPES } from '../combat/attacks.js';
import { WEAPON_TYPES } from '../items/weaponTypes.js';
import { ARMOR_SLOT_IDS } from '../items/armorTypes.js';
import { RARITIES } from '../items/rarity.js';
import { generateWeapon } from '../items/WeaponGenerator.js';
import { generateArmor } from '../items/ArmorGenerator.js';
import { GEAR_SETS } from '../items/sets.js';
import { AFFIXES, AFFIX_IDS } from '../sim/affixes.js';
import { MAX_LEVEL } from '../rpg/talents.js';
import { MANUFACTURERS } from '../items/manufacturers.js';
import { HUB, REGION } from '../world/Gen.js';
import { setHatchScale } from '../render/Toon.js';
import { clearSave } from '../core/Save.js';
import { typing } from '../core/Input.js';
import { DUNGEONS } from '../world/dungeons.js';
import { RAIDS, instanceDef } from '../world/raids.js';
import { BossScript } from '../sim/BossScript.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const _physicsWorldPosition = new THREE.Vector3();
const _physicsWorldQuaternion = new THREE.Quaternion();
const _physicsWorldScale = new THREE.Vector3();

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TABS = ['Player', 'World', 'Spawn', 'Loot', 'Render', 'Audio', 'Save', 'Console', 'Errors'];
// Sound board: every procedural sound, playable on its own (dev Audio tab).
const SOUNDS = {
  'Pistol': (a, g) => a.shot(fake(g, 'pistol')), 'Rifle': (a, g) => a.shot(fake(g, 'rifle')), 'SMG': (a, g) => a.shot(fake(g, 'smg')),
  'Shotgun': (a, g) => a.shot(fake(g, 'shotgun')), 'Sniper': (a, g) => a.shot(fake(g, 'sniper')), 'Launcher': (a, g) => a.shot(fake(g, 'launcher')),
  'Crossbow': (a, g) => a.shot(fake(g, 'crossbow')), 'Reload (rifle)': (a, g) => a.reload(fake(g, 'rifle'), 1.6), 'Reload (shotgun)': (a, g) => a.reload(fake(g, 'shotgun'), 2.2),
  'Sword swing': (a) => a.swing({ weight: 0.45, dur: 0.3 }), 'Greatsword swing': (a) => a.swing({ weight: 1, dur: 0.45 }), 'Whirlwind': (a) => a.swing({ weight: 1, dur: 0.6, spin: true }),
  'Blade hit': (a, g) => a.meleeHit(fake(g, 'sword'), g.player.position, false), 'Hammer hit (crit)': (a, g) => a.meleeHit(fake(g, 'hammer'), g.player.position, true),
  'Bullet hit': (a, g) => a.bulletHit(g.player.position, false), 'Ricochet': (a, g) => a.impact(g.player.position.clone().setY(g.player.position.y + 1), 'hard'),
  'Explosion': (a, g) => a.explosion(ahead(g, 8), 4, 'blast'), 'Slam': (a, g) => a.explosion(g.player.position, 4, 'quake'), 'Arcane blast': (a, g) => a.explosion(ahead(g, 6), 3, 'arcane'),
  'Bolt (shock)': (a, g) => a.cast(fake(g, 'wand', 'shock'), false), 'Orb (fire, charged)': (a, g) => a.cast(fake(g, 'staff', 'fire'), true), 'Chain': (a, g) => a.cast(fake(g, 'orb'), false),
  'Footsteps': (a, g) => ['grass', 'gravel', 'hard', 'snow', 'mud', 'water'].forEach((s, i) => setTimeout(() => a.footstep(s, 0.7), i * 280)),
  'Jump': (a) => a.jump(), 'Double jump': (a) => a.doubleJump(), 'Land (high)': (a) => a.land(9), 'Bullet jump': (a) => a.bulletJump(), 'Air dash': (a) => a.airDash(),
  'Dash': (a) => a.dash(), 'Mantle': (a) => a.mantle(), 'Scramble step': (a) => a.scrambleStep(), 'Slam dive': (a) => a.slamDive(), 'Hurt': (a) => a.playerHurt(0.2), 'Kill': (a, g) => a.kill(ahead(g, 5), false),
  'Arrow whizz': (a, g) => a.whiz(ahead(g, 1)), 'Heavy stomp step': (a, g) => a.stomp(ahead(g, 4), 1.2),
  'Razorhound howl': (a, g) => a.howl(ahead(g, 12)), 'Behemoth call': (a, g) => a.howl(ahead(g, 12), true), 'Thunderhorn roar': (a, g) => a.roar(ahead(g, 6), 2.4),
  'Crawler screech': (a, g) => a.screech(ahead(g, 5)), 'Psi cast': (a, g) => a.enemyCast(ahead(g, 6), 'psi', 0.8), 'Sentry charge': (a, g) => a.enemyCast(ahead(g, 6), 'energy', 0.5),
  'Sentry shot': (a, g) => a.enemyShot(ahead(g, 6), 'energy'), 'Acid spit': (a, g) => a.enemyShot(ahead(g, 6), 'acid'), 'Psion blink': (a, g) => a.blink(ahead(g, 5)),
  'Shield block': (a, g) => a.block(ahead(g, 2)), 'Grenade fuse': (a, g) => a.fuse(ahead(g, 4), 0.9), 'Tech shield': (a, g) => a.ward(ahead(g, 5)), 'Tech repair': (a, g) => a.ward(ahead(g, 5), true),
};
function fake(g, type, element = 'none') {
  const w = generateWeapon({ type, level: 1, rarity: 'common', seed: 5 });
  return { ...w, element };
}
function ahead(g, d) {
  const p = g.player;
  return p.position.clone().add(new THREE.Vector3(Math.sin(p.facing) * d, 1, Math.cos(p.facing) * d));
}

// Bosses to spawn (dev Spawn tab): each faction's boss, each dungeon's boss and mini-boss by name
// at the dungeon's level, and each raid encounter — its bosses together, their scripts running.
// `units`: [{ type, variant?, name?, script?, at? }] as world/raids.js writes an encounter's.
const BOSS_ARENA = 40;  // metres across: a raid fight's ground round the reticle (a raid arena's size)
function bossList() {
  const list = [];
  for (const [k, t] of Object.entries(ENEMY_TYPES)) {
    if (t.boss && !t.raid) list.push({ group: 'Faction bosses', label: t.name, units: [{ type: k }], level: null });
  }
  for (const d of Object.values(DUNGEONS)) {
    if (d.boss) list.push({ group: 'Dungeon bosses', label: `${d.boss.name ?? ENEMY_TYPES[d.boss.type].name} — ${d.name}`, units: [{ type: d.boss.type, name: d.boss.name }], level: d.level + 1 });
  }
  for (const d of Object.values(DUNGEONS)) {
    if (d.mini) list.push({ group: 'Dungeon mini-bosses', label: `${d.mini.name} — ${d.name}`, units: [{ type: d.mini.type, name: d.mini.name, mini: true }], level: d.level });
  }
  for (const r of Object.values(RAIDS)) {
    for (const enc of r.encounters ?? []) list.push({ group: `Raid — ${r.name}`, label: `${enc.name} (scripted)`, units: enc.units, level: r.level, raid: enc });
  }
  return list;
}

export class DevTools {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.paused = false;
    this.perfOn = false;
    this.flags = { god: false, noclip: false, infinite: false, freezeAI: false, oneHit: false };
    this.tab = 'Player';
    this.fps = 0;
    this.frameMs = 0;
    this.frames = 0;
    this.acc = 0;
    this.last = performance.now();
    this.helpers = {};
    this.history = [];
    this.renderer = game.renderer;
    this.renderer.info.autoReset = false;

    this.el = document.createElement('div');
    this.el.id = 'dev';
    this.el.className = 'hidden';
    document.body.appendChild(this.el);
    this.perf = document.createElement('div');
    this.perf.id = 'dev-perf';
    this.perf.className = 'hidden';
    document.body.appendChild(this.perf);
    this.badge = document.createElement('div');
    this.badge.id = 'dev-badge';
    this.badge.className = 'hidden';
    this.badge.onclick = () => { this.tab = 'Errors'; this.show(); };
    document.body.appendChild(this.badge);

    this.fights = [];
    this.onKey = (e) => {
      if (typing(e) && e.code === 'Backquote') return;
      if (e.code === 'Backquote' || e.code === 'F1') {
        e.preventDefault();
        this.toggle();
      } else if (e.code === 'F3') {
        e.preventDefault();
        this.perfOn = !this.perfOn;
        this.perf.classList.toggle('hidden', !this.perfOn);
      } else if (e.code === 'Escape' && this.isOpen) {
        // Handled here only: the game's own Esc (pause / close menus) must not also fire.
        e.stopImmediatePropagation();
        this.hide();
      }
    };
    this.onWindowError = (e) => game.reportError(e.error ?? e.message);
    this.onRejection = (e) => game.reportError(e.reason);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onRejection);
    // Keystrokes typed into the panel shouldn't drive the player.
    this.el.addEventListener('keydown', (e) => { if (e.code !== 'Backquote' && e.code !== 'F1') e.stopPropagation(); });
    if (game.errors?.length) this.onError();
  }

  // Gone (the game is going online): every cheat off, the panel, overlays and helpers removed.
  destroy() {
    const g = this.game;
    if (this.isOpen) this.hide();
    for (const k of Object.keys(this.flags)) this.flags[k] = false;
    g.player.god = false;
    g.player.noclip = false;
    this.paused = false;
    g.timeScale = 1;
    this.dungeons = false;
    for (const f of this.fights) this.endFight(f);
    this.fights = [];
    for (const name of Object.keys(this.helpers)) this.toggleHelper(name, false);
    if (this.renderFlags) {
      const pr = g.prefs;
      for (const [id, on] of [['outlines', pr.outlines], ['hatching', pr.hatching], ['fog', true], ['shadows', pr.shadows], ['speedfx', true]]) {
        if (this.renderFlags[id] !== on) this.setRender(id, on);
      }
      g.outlinesOverride = undefined;
      g.applyPrefs();
    }
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onRejection);
    this.el.remove();
    this.perf.remove();
    this.badge.remove();
    this.renderer.info.autoReset = true;
  }

  // ------------------------------------------------------------ open / close
  toggle() { if (this.isOpen) this.hide(); else this.show(); }

  show() {
    const g = this.game;
    if (g.state === 'title') return;
    g.closeMenus(false);
    this.prevState = g.state === 'dev' ? 'playing' : g.state;
    this.isOpen = true;
    g.state = 'dev';
    g.releaseMouse();
    g.hud.hideOverlay();
    this.el.classList.remove('hidden');
    this.render();
  }

  hide() {
    const g = this.game;
    this.isOpen = false;
    this.el.classList.add('hidden');
    if (g.state === 'dev') {
      if (this.prevState === 'dead') g.state = 'dead';
      else g.resume();
      g.clock.getDelta();
    }
  }

  // ------------------------------------------------------------ per frame
  // Called at the very start of each frame (resets the renderer counters) and after simulation.
  beginFrame() {
    this.renderer.info.reset();
  }

  update() {
    // (Never online: main.js drops the tools first, and this makes sure.)
    if (this.game.onlineMode || this.game.net.inWorld) { this.game.dropDev(); return; }
    const now = performance.now();
    const dtMs = now - this.last;
    this.last = now;
    this.frames++;
    this.acc += dtMs;
    if (this.acc >= 500) {
      this.fps = (this.frames * 1000) / this.acc;
      this.frameMs = this.acc / this.frames;
      this.frames = 0;
      this.acc = 0;
      if (this.perfOn) this.renderPerf();
      if (this.isOpen && this.tab === 'Errors') this.render();
    }
    const p = this.game.player;
    p.god = this.flags.god;
    p.noclip = this.flags.noclip;
    if (this.flags.infinite && p.alive) {
      p.stamina = p.maxStamina;
      p.mana = p.maxMana;
      if (p.weapon?.cls === 'ranged') p.weapon.ammo = p.weapon.stats.magSize;
    }
    if (this.helpers.colliders) this.refreshColliderHelpers();
    if (this.helpers.hitboxes) this.refreshHitboxHelpers();
    if (this.helpers.physicsBodies) this.refreshPhysicsBodyHelpers();
  }

  renderPerf() {
    const g = this.game;
    const info = this.renderer.info;
    const p = g.player;
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    const errs = g.errors?.length ?? 0;
    this.perf.innerHTML = `
      <b>${this.fps.toFixed(0)}</b> fps · ${this.frameMs.toFixed(1)} ms<br>
      calls ${info.render.calls} · tris ${(info.render.triangles / 1000).toFixed(0)}k<br>
      geo ${info.memory.geometries} · tex ${info.memory.textures} · prog ${info.programs?.length ?? 0}<br>
      enemies ${g.enemies.length} · drops ${g.drops.length} · shots ${g.projectiles.list.length}<br>
      particles ${g.effects.glowParticles.activeCount + g.effects.solidParticles.activeCount + g.effects.smokeParticles.activeCount}/${g.effects.glowParticles.budget + g.effects.solidParticles.budget + g.effects.smokeParticles.budget} · fx ${g.effects.items.length}<br>
      pos ${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(1)}<br>
      ${p.state}${p.grounded ? '' : ' (air)'} · ${speed.toFixed(1)} m/s · vy ${p.vy.toFixed(1)}
      ${errs ? `<br><span class="err">${errs} error${errs > 1 ? 's' : ''} — press \`</span>` : ''}`;
  }

  onError() {
    this.badge.classList.remove('hidden');
    this.badge.textContent = `⚠ ${this.game.errors.length} error${this.game.errors.length > 1 ? 's' : ''} — click or press \``;
    if (this.isOpen && this.tab === 'Errors') this.render();
  }

  // ------------------------------------------------------------ actions
  teleport(x, z, y = null) {
    const g = this.game;
    const p = g.player;
    p.position.set(x, 0, z);
    g.world.prime(p.position);
    p.position.y = y ?? g.world.supportHeight(x, z, 200);
    p.velocity.set(0, 0, 0);
    p.vy = 0;
    p.setState('move');
    g.rig.target.copy(p.position);
    g.discovery.reveal(x, z);
    g.hud.toast(`Teleported to ${x.toFixed(0)}, ${z.toFixed(0)}`);
  }

  // Teleport targets: the hub, then regions and their landmarks around the player (generated).
  locations() {
    const g = this.game;
    const p = g.player.position;
    const list = [{ label: `Hub — ${HUB.name}`, x: HUB.x, z: HUB.z + 4 }];
    for (const c of g.world.gen.cities()) list.push({ label: `City — ${c.name} (act ${c.act}, ${Math.round(Math.hypot(c.x, c.z))} m out)`, x: c.x + 2.5, z: c.z - 2.5 });
    const [cx, cz] = g.world.gen.cellOf(p.x, p.z);
    const regions = [];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) regions.push(g.world.gen.region(cx + dx, cz + dz));
    regions.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    for (const r of regions) {
      if (r.hub) continue;
      list.push({ label: `▸ ${r.name} (Lv ${r.level}, ${r.race}, ${r.biome})`, x: r.x, z: r.z });
      for (const poi of r.pois) {
        if (poi.type === 'camp') list.push({ label: `   ${poi.stronghold ? 'Stronghold' : 'Camp'} — ${poi.name} (Lv ${poi.level})`, x: poi.x, z: poi.z + poi.radius + 4 });
        else if (poi.type === 'waystone') list.push({ label: `   Waystone — ${poi.name}`, x: poi.x + 2.5, z: poi.z - 2.5 });
        else if (poi.type === 'tower' || poi.type === 'ruin') list.push({ label: `   ${poi.type === 'tower' ? 'Tower' : 'Ruins'}`, x: poi.x + 4, z: poi.z + (poi.r ?? 0) + 4 });
        else if (poi.type === 'landmark') list.push({ label: `   Landmark — ${poi.name} (${poi.kind})`, x: poi.x + Math.sin(poi.rot) * (poi.r + 8), z: poi.z + Math.cos(poi.rot) * (poi.r + 8) });
        else if (poi.type === 'settlement') list.push({ label: `   Village — ${poi.name} (${poi.kind})`, x: poi.x, z: poi.z });
        else if (poi.type === 'hamlet') list.push({ label: `   Hamlet — ${poi.name} (${poi.kind})`, x: poi.x + Math.sin(poi.rot) * 6, z: poi.z + Math.cos(poi.rot) * 6 });
        else if (poi.type === 'town' || poi.type === 'city') list.push({ label: `   ${poi.type === 'town' ? 'Town' : 'City'} — ${poi.name}`, x: poi.x + 2.5, z: poi.z - 2.5 });
      }
    }
    return list;
  }

  // `elite`: '' (none), 'elite' or 'champion'; `affix`: one to give it ('' for a random roll), or
  // 'horde' to raise a whole warband of the type's race there instead.
  spawn(key, level, count, elite, affix = '') {
    const g = this.game;
    if (affix === 'horde') return this.horde(key, level);
    const [type, variant = null] = key.split(':');
    const name = variant ? ENEMY_TYPES[type].variants[variant].name : ENEMY_TYPES[type].name;
    const at = g.aim.point.clone();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = count > 1 ? 1.5 + count * 0.25 : 0;
      const pos = at.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      pos.y = g.world.groundHeight(pos.x, pos.z);
      const e = g.spawnEnemy(type, pos, {
        level, variant, elite: elite ? true : null, champion: elite === 'champion', affixes: elite && affix ? [affix] : null,
      });
      if (this.flags.freezeAI) e.state = 'idle';
    }
    g.hud.toast(`Spawned ${count} × ${name} (Lv ${level})`);
  }

  // Boss `i` of bossList() at the reticle, at `level` (blank: its own level). A raid encounter
  // comes with its scripts (sim/BossScript.js) on a dev arena round the reticle: pulled when one
  // of its bosses is, health set for whoever's on that ground, reset if everyone leaves or dies.
  spawnBoss(i, level) {
    const g = this.game;
    const sim = g.enemyLayer.sim;
    const B = bossList()[i];
    if (!B || !sim) return;
    level = level || B.level || g.stats.level;
    const at = g.aim.point.clone();
    if (!B.raid) {
      const u = B.units[0];
      const e = g.spawnEnemy(u.type, at.setY(g.world.groundHeight(at.x, at.z)), {
        level, name: u.name ?? null, ...(u.mini ? { elite: true, champion: true } : {}),
      });
      if (this.flags.freezeAI && e) e.state = 'idle';
      g.hud.toast(`Spawned ${u.name ?? ENEMY_TYPES[u.type].name} (Lv ${level})`);
      return;
    }
    const S = BOSS_ARENA;
    const A = { x0: at.x - S / 2, z0: at.z - S / 2, x1: at.x + S / 2, z1: at.z + S / 2, cx: at.x, cz: at.z, bx: at.x, bz: at.z + S / 2 - 4, y: at.y };
    const fight = { def: B.raid, state: 'idle', scripts: [], empty: 0, arena: A };
    const inArena = (p) => p.position.x >= A.x0 && p.position.x <= A.x1 && p.position.z >= A.z0 && p.position.z <= A.z1;
    fight.ctx = {
      sim, arena: A,
      players: () => sim.players.filter((p) => p.alive && !p.decoy && inArena(p)),
      bosses: () => fight.scripts.map((s) => s.boss).filter((b) => b.alive),
      emit: (ev) => sim.emit(ev),
      say: (text, big = false) => (big ? g.hud.banner(text) : g.hud.toast(text)),
    };
    for (const u of B.units) {
      const [ax, az] = u.at ?? [0.5, 0.7];
      const e = sim.spawnEnemy(u.type, new THREE.Vector3(A.x0 + ax * S, 0, A.z0 + az * S), { level, variant: u.variant ?? null });
      const s = new BossScript(fight.ctx, e, u.script);
      s.scale(1);
      fight.scripts.push(s);
    }
    this.fights.push(fight);
    g.hud.toast(`Spawned ${B.raid.name} (Lv ${level}) — its fight covers ${S} m round the reticle`);
  }

  // The dev raid fights, each sim tick (entities/EnemyLayer.js), as sim/RaidRun.js runs a raid's.
  tickBosses(dt) {
    for (const f of [...this.fights]) {
      const scripts = f.scripts;
      if (scripts.every((s) => !s.boss.alive || s.boss.gone)) {
        this.endFight(f);
        this.fights.splice(this.fights.indexOf(f), 1);
        if (scripts.some((s) => !s.boss.gone)) this.game.hud.banner(`${f.def.name} has fallen`);
        continue;
      }
      const here = f.ctx.players();
      if (f.state === 'idle') {
        if (!scripts.some((s) => s.boss.alive && s.boss.engaged)) continue;
        f.state = 'fight';
        f.empty = 0;
        const foe = here[0] ?? null;
        for (const s of scripts) {
          // (One killed before the pull stays down: the rest fight on without it.)
          s.fallen = !s.boss.alive;
          if (s.fallen) continue;
          s.begin(Math.max(1, here.length));
          if (!s.boss.engaged && foe) s.boss.aggro(true, foe);
        }
        this.game.hud.banner(f.def.name, 'Dev fight');
        continue;
      }
      for (const s of scripts) s.update(dt);
      for (const s of scripts) {
        if (s.boss.alive || s.fallen) continue;
        s.fallen = true;
        s.end();
        const left = scripts.filter((x) => x.boss.alive);
        if (left.length && f.def.rally) {
          for (const x of left) x.rally(f.def.rally.by ?? 1.3);
          f.ctx.say(f.def.rally.say ?? `${s.boss.displayName} falls — the others fight harder!`, true);
        }
      }
      // Everyone down or off the ground a while: a wipe — the bosses go back to full and wait.
      f.empty = here.length ? 0 : f.empty + dt;
      if (f.empty > 3) {
        f.state = 'idle';
        for (const s of scripts) {
          s.end();
          const b = s.boss;
          if (!b.alive) continue;
          b.threat.clear();
          b.hp = b.maxHp;
          if (b.engaged) b.leash();
        }
        this.game.hud.toast(`${f.def.name} resets`);
      }
    }
  }

  endFight(f) {
    for (const s of f.scripts) s.end();
  }

  // A warband of `key`'s race at the reticle (offline: the local sim's roaming packs).
  horde(key, level) {
    const g = this.game;
    const enc = g.encounters;
    if (!enc.spawnRoamers) return g.hud.toast('Warbands spawn on the server online');
    const at = g.aim.point;
    enc.spawnRoamers(at.x, at.z, { horde: true, race: ENEMY_TYPES[key.split(':')[0]].race, level: Math.max(10, level) });
  }

  // `set`: an armour set id (its maker for weapons), or 'any'.
  // Every piece of a set, worn at once (what was in each slot goes to the backpack).
  wearSet(set, rarity, level) {
    const g = this.game;
    if (!GEAR_SETS[set]) { g.hud.toast('Pick a set first'); return; }
    const inv = g.player.inventory;
    for (const slot of ARMOR_SLOT_IDS) {
      const old = inv.armor[slot];
      if (old && !inv.stash(old)) g.dropWeapon(old, g.player.position);
      inv.armor[slot] = generateArmor({ level, slot, set, ...(rarity !== 'random' ? { rarity } : {}) });
    }
    g.player.refreshAppearance();
    g.hud.toast(`Wearing the ${GEAR_SETS[set].name} set`);
  }

  forge(kind, rarity, level, where, set = 'any') {
    const g = this.game;
    const S = GEAR_SETS[set];
    const opts = { level, ...(rarity !== 'random' ? { rarity } : {}), ...(S ? { set, maker: S.maker } : {}) };
    const line = S ? MANUFACTURERS[S.maker].types : null;
    let item;
    if (kind === 'weapon') item = generateWeapon(line ? { ...opts, type: line[Math.floor(Math.random() * line.length)] } : opts);
    else if (kind.startsWith('armor:')) item = generateArmor({ ...opts, slot: kind.slice(6) });
    else item = generateWeapon({ ...opts, type: kind });
    if (where === 'pack') {
      const placed = g.player.inventory.add(item);
      if (!placed) g.dropWeapon(item, g.player.position);
      else if (placed === 'equipped') g.player.refreshAppearance();
      g.hud.toast(placed ? `${item.name} → ${placed}` : 'Backpack full — dropped');
    } else {
      const p = g.player;
      const ahead = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing)).multiplyScalar(2).add(p.position);
      g.dropWeapon(item, ahead);
    }
  }

  killAll() {
    for (const e of [...this.game.enemies]) if (e.alive) this.game.enemyLayer.kill(e);
  }

  setLevel(n) {
    const s = this.game.stats;
    n = Math.max(1, Math.min(MAX_LEVEL, Math.round(n)));
    s.level = n;
    s.xp = 0;
    const p = this.game.player;
    p.hp = p.maxHp = s.maxHp;
    p.mana = p.maxMana = s.maxMana;
    this.game.hud.toast(`Level ${n}`);
  }

  toggleHelper(name, on) {
    const g = this.game;
    if (this.helpers[name]) {
      g.scene.remove(this.helpers[name]);
      if (name === 'physicsBodies') this.clearPhysicsBodyModels(this.physicsBodyModels);
      else if (name === 'hitboxes') this.clearPhysicsBodyModels(this.hitboxModels);
      else if (name === 'colliders') {
        this.helpers[name].traverse((o) => { if (!o.userData.sharedGeometry) o.geometry?.dispose(); });
        this.colliderMat?.dispose();
        this.colliderMat = null;
      } else this.helpers[name].traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      this.helpers[name] = null;
    }
    if (!on) return;
    if (name === 'skeleton') {
      const h = new THREE.SkeletonHelper(g.player.rig.model);
      h.material.depthTest = false;
      h.material.linewidth = 2;
      g.scene.add(h);
      this.helpers.skeleton = h;
    } else if (name === 'colliders') {
      this.helpers.colliders = new THREE.Group();
      g.scene.add(this.helpers.colliders);
      this.colliderAt = null;
      this.refreshColliderHelpers();
    } else if (name === 'hitboxes') {
      this.helpers.hitboxes = new THREE.Group();
      this.hitboxModels = new Map();
      g.scene.add(this.helpers.hitboxes);
      this.refreshHitboxHelpers();
    } else if (name === 'physicsBodies') {
      this.helpers.physicsBodies = new THREE.Group();
      this.physicsBodyModels = new Map();
      g.scene.add(this.helpers.physicsBodies);
      this.refreshPhysicsBodyHelpers();
    }
  }

  createPhysicsBodyModel(source, color, group) {
    const model = cloneSkinned(source);
    const material = new THREE.MeshBasicMaterial({
      color, wireframe: true, transparent: true, opacity: 0.9,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const sourceNodes = [];
    const modelNodes = [];
    source.traverse((object) => sourceNodes.push(object));
    model.traverse((object) => {
      modelNodes.push(object);
      if (!object.isMesh) return;
      object.material = material;
      object.frustumCulled = false;
      object.castShadow = false;
      object.receiveShadow = false;
      object.renderOrder = 998;
    });
    group.add(model);
    return { source, model, material, sourceNodes, modelNodes, group };
  }

  removePhysicsBodyModel(record) {
    record.group?.remove(record.model);
    const skeletons = new Set();
    for (const object of record.modelNodes) if (object.isSkinnedMesh && object.skeleton) skeletons.add(object.skeleton);
    for (const skeleton of skeletons) skeleton.dispose();
    record.material.dispose();
  }

  clearPhysicsBodyModels(models) {
    for (const record of models?.values() ?? []) this.removePhysicsBodyModel(record);
    models?.clear();
  }

  syncPhysicsBodyModel(record, source) {
    source.updateWorldMatrix(true, true);
    source.matrixWorld.decompose(_physicsWorldPosition, _physicsWorldQuaternion, _physicsWorldScale);
    record.model.position.copy(_physicsWorldPosition);
    record.model.quaternion.copy(_physicsWorldQuaternion);
    record.model.scale.copy(_physicsWorldScale);
    record.model.visible = source.visible;
    for (let i = 1; i < record.sourceNodes.length; i++) {
      const from = record.sourceNodes[i];
      const to = record.modelNodes[i];
      to.matrixAutoUpdate = from.matrixAutoUpdate;
      if (from.matrixAutoUpdate) {
        to.position.copy(from.position);
        to.quaternion.copy(from.quaternion);
        to.scale.copy(from.scale);
      } else to.matrix.copy(from.matrix);
      to.visible = from.visible;
      to.matrixWorldNeedsUpdate = true;
    }
    record.model.updateMatrix();
    record.model.updateMatrixWorld(true);
    for (const object of record.modelNodes) if (object.isSkinnedMesh) object.skeleton?.update();
  }

  refreshMeshOverlays(models, group, entities, colorFor) {
    const live = new Set();
    for (const [entityKey, entity] of entities) {
      const source = entity.rig?.model ?? entity.model;
      if (!source) continue;
      const key = entityKey;
      live.add(key);
      let record = models.get(key);
      if (!record || record.source !== source) {
        if (record) this.removePhysicsBodyModel(record);
        record = this.createPhysicsBodyModel(source, colorFor(entityKey, entity), group);
        models.set(key, record);
      }
      this.syncPhysicsBodyModel(record, source);
    }
    for (const [key, record] of models) if (!live.has(key)) {
      this.removePhysicsBodyModel(record);
      models.delete(key);
    }
  }

  refreshPhysicsBodyHelpers() {
    this.refreshMeshOverlays(
      this.physicsBodyModels, this.helpers.physicsBodies,
      [['player', this.game.player], ...this.game.enemies.map((e) => [`enemy:${e.id}`, e])],
      (key) => key === 'player' ? 0x48e7ff : 0xffb632,
    );
  }

  refreshHitboxHelpers() {
    this.refreshMeshOverlays(
      this.hitboxModels, this.helpers.hitboxes,
      this.game.enemies.filter((e) => e.alive).map((e) => [`enemy:${e.id}`, e]),
      () => 0xff354f,
    );
  }

  refreshColliderHelpers() {
    const g = this.game;
    const p = g.player.position;
    if (this.colliderAt && this.colliderAt.distanceTo(p) < 10) return;
    this.colliderAt = p.clone();
    const grp = this.helpers.colliders;
    for (const c of [...grp.children]) { grp.remove(c); if (!c.userData.sharedGeometry) c.geometry.dispose(); }
    const mat = this.colliderMat ??= new THREE.MeshBasicMaterial({ color: 0xff3df0, wireframe: true, transparent: true, opacity: 0.5, depthTest: false });
    for (const c of g.world.collidersNear(p.x, p.z, 45)) {
      const m = new THREE.Mesh(c.meshGeometry ?? (c.box ? new THREE.BoxGeometry(c.hx * 2, c.h, c.hz * 2) : new THREE.CylinderGeometry(c.r, c.r, c.h, 12, 1, true)), mat);
      if (c.meshGeometry) {
        m.userData.sharedGeometry = true;
        m.matrixAutoUpdate = false;
        m.matrix.copy(c.meshMatrix ?? new THREE.Matrix4());
        m.matrixWorld.copy(m.matrix);
      } else {
        m.position.set(c.x, c.y + c.h / 2, c.z);
        m.rotation.y = c.ry ?? 0;
      }
      grp.add(m);
    }
  }

  evaluate(code) {
    const g = this.game;
    let out;
    try {
      let fn;
      try { fn = new Function('game', 'g', 'THREE', 'p', `return (${code});`); } catch { fn = new Function('game', 'g', 'THREE', 'p', code); }
      const r = fn(g, g, THREE, g.player);
      out = r === undefined ? 'undefined' : typeof r === 'object' ? JSON.stringify(r, (k, v) => (v?.isObject3D ? `[${v.type}]` : v), 2)?.slice(0, 2000) ?? String(r) : String(r);
    } catch (err) {
      out = `✖ ${err.message}`;
    }
    this.history.push({ code, out });
    if (this.history.length > 40) this.history.shift();
  }

  // ------------------------------------------------------------ panel
  render() {
    const g = this.game;
    const p = g.player;
    const f = this.flags;
    const tabs = TABS.map((t) => `<button class="tab ${t === this.tab ? 'on' : ''}" data-tab="${t}">${t}${t === 'Errors' && g.errors?.length ? ` (${g.errors.length})` : ''}</button>`).join('');
    const chk = (id, label, on) => `<label class="chk"><input type="checkbox" data-flag="${id}" ${on ? 'checked' : ''}> ${label}</label>`;
    let body = '';
    if (this.tab === 'Player') {
      body = `
        <div class="grid2">
          ${chk('god', 'God mode', f.god)} ${chk('infinite', 'Infinite stamina / mana / ammo', f.infinite)}
          ${chk('noclip', 'Noclip (WASD, Space up, C down, Shift fast)', f.noclip)} ${chk('oneHit', 'One-hit kills', f.oneHit)}
        </div>
        <div class="row"><button data-act="heal">Heal</button><button data-act="kill-self">Kill self</button><button data-act="revive">Revive</button></div>
        <div class="row"><button data-act="lvl-up">Level +1</button><input type="number" id="dev-lvl" value="${g.stats.level}" min="1" max="99"><button data-act="lvl-set">Set level</button></div>
        <div class="row"><button data-act="gold">+1000 gold</button><button data-act="points">Reset talents (free)</button></div>
        <p class="note">Lv ${g.stats.level} · ${g.stats.gold}g · HP ${Math.ceil(p.hp)}/${p.maxHp} · ${p.state}</p>`;
    } else if (this.tab === 'World') {
      body = `
        <div class="row"><select id="dev-loc">${this.locations().map((l, i) => `<option value="${i}">${esc(l.label)}</option>`).join('')}</select><button data-act="tp">Teleport</button></div>
        <div class="row"><select id="dev-dun">${Object.values(DUNGEONS).map((d) => `<option value="${d.id}">${esc(d.name)} (${esc(d.theme)}, Lv ${d.level})</option>`).join('')}${Object.values(RAIDS).map((d) => `<option value="${d.id}">Raid: ${esc(d.name)} (Lv ${d.level})</option>`).join('')}</select><select id="dev-dun-mode"><option value="open">Open world</option><option value="run:0">Run · Normal</option><option value="run:1">Run · Veteran</option><option value="run:2">Run · Elite</option></select><button data-act="dungeon">Go down</button></div>
        <div class="row"><button data-act="tp-reticle">Teleport to reticle</button><button data-act="reveal">Reveal map</button><button data-act="attune">Attune all waystones</button></div>
        <div class="row"><button data-act="kill-all">Kill all enemies</button><button data-act="respawn">Respawn camps</button><button data-act="clear-loot">Clear ground loot</button></div>
        <div class="row"><select id="dev-event"><option value="surge">Hive Surge</option><option value="siege">Scav Siege</option><option value="anomaly">Maker Anomaly</option><option value="walker">Synth War-walker</option></select><button data-act="event">Start event nearby</button><button data-act="event-win">Win it</button><button data-act="event-lose">Lose it</button></div>
        <div class="grid2">${chk('freezeAI', 'Freeze enemy AI', f.freezeAI)}<label class="chk"><input type="checkbox" data-act="pause" ${this.paused ? 'checked' : ''}> Pause simulation</label></div>
        <div class="row"><span>Time scale</span><input type="range" id="dev-time" min="0.05" max="2" step="0.05" value="${g.timeScale ?? 1}"><b id="dev-time-v">${(g.timeScale ?? 1).toFixed(2)}×</b></div>`;
    } else if (this.tab === 'Spawn') {
      const groups = [];
      bossList().forEach((b, i) => {
        const last = groups[groups.length - 1];
        if (last?.[0] === b.group) last[1].push([b, i]);
        else groups.push([b.group, [[b, i]]]);
      });
      body = `
        <div class="row"><select id="dev-enemy">${Object.entries(ENEMY_TYPES).map(([k, v]) => `<optgroup label="${esc(v.name)}"><option value="${k}">${esc(v.name)}</option>${Object.entries(v.variants ?? {}).map(([vk, vv]) => `<option value="${k}:${vk}">${esc(vv.name)} (Lv ${vv.minLevel}+)</option>`).join('')}</optgroup>`).join('')}</select>
          Lv <input type="number" id="dev-elvl" value="${g.stats.level}" min="1" max="60"> × <input type="number" id="dev-count" value="1" min="1" max="20">
          <select id="dev-elite"><option value="">Normal</option><option value="elite">Elite</option><option value="champion">Champion</option></select>
          <select id="dev-affix"><option value="">Random affixes</option>${AFFIX_IDS.map((id) => `<option value="${id}">${AFFIXES[id].name}</option>`).join('')}<option value="horde">A whole warband</option></select></div>
        <div class="row"><button data-act="spawn">Spawn at reticle</button></div>
        <div class="row"><select id="dev-boss">${groups.map(([name, list]) => `<optgroup label="${esc(name)}">${list.map(([b, i]) => `<option value="${i}" ${i === this.bossPick ? 'selected' : ''}>${esc(b.label)}${b.level ? ` (Lv ${b.level})` : ''}</option>`).join('')}</optgroup>`).join('')}</select>
          Lv <input type="number" id="dev-blvl" placeholder="own" min="1" max="60" value="${this.bossLevel || ''}"><button data-act="spawn-boss">Spawn boss at reticle</button></div>
        <p class="note">Enemies spawn where the reticle points (${g.aim.distance.toFixed(0)} m). A boss's level left blank is its dungeon's or raid's (a faction boss's: yours). A raid encounter runs its script — phases, marks, adds, shields, enrage — on the ${BOSS_ARENA} m round where it was spawned${this.fights.length ? ` (${this.fights.length} running)` : ''}.</p>`;
    } else if (this.tab === 'Loot') {
      const kinds = [['weapon', 'Random weapon'], ...Object.entries(WEAPON_TYPES).map(([k, v]) => [k, `${v.label} (${v.cls})`]), ...ARMOR_SLOT_IDS.map((s) => [`armor:${s}`, `Armour: ${s}`])];
      body = `
        <div class="row"><select id="dev-kind">${kinds.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
          <select id="dev-rarity"><option value="random">Random rarity</option>${RARITIES.map((r) => `<option value="${r.id}">${esc(r.name ?? r.id)}</option>`).join('')}</select>
          Lv <input type="number" id="dev-ilvl" value="${g.stats.level}" min="1" max="60"></div>
        <div class="row"><select id="dev-set"><option value="any">Any set / maker</option>${Object.entries(GEAR_SETS).map(([id, s]) => `<option value="${id}">${esc(s.name)} set · ${esc(MANUFACTURERS[s.maker].name)}</option>`).join('')}</select>
          <button data-act="forge-set">Wear the whole set</button></div>
        <div class="row"><button data-act="forge-drop">Drop in front</button><button data-act="forge-pack">Add to backpack</button><button data-act="forge-10">Drop 10 random</button></div>`;
    } else if (this.tab === 'Render') {
      const pr = g.prefs;
      const r = this.renderFlags ??= { outlines: pr.outlines, hatching: pr.hatching, fog: true, shadows: pr.shadows, speedfx: true, skeleton: false, colliders: false, hitboxes: false, physicsBodies: false };
      const rchk = (id, label) => `<label class="chk"><input type="checkbox" data-render="${id}" ${r[id] ? 'checked' : ''}> ${label}</label>`;
      body = `
        <div class="grid2">${rchk('outlines', 'Ink outlines')}${rchk('hatching', 'Comic hatching')}${rchk('fog', 'Fog')}${rchk('shadows', 'Shadows')}${rchk('speedfx', 'Speed blur / lines')}${rchk('skeleton', 'Player skeleton')}${rchk('colliders', 'World colliders')}${rchk('hitboxes', 'Enemy hitboxes')}${rchk('physicsBodies', 'Model physics bodies')}</div>
        <div class="row"><button data-act="perf">${this.perfOn ? 'Hide' : 'Show'} perf overlay (F3)</button></div>`;
    } else if (this.tab === 'Audio') {
      const s = g.prefs;
      body = `
        <div class="row"><span>Volume</span><input type="range" id="dev-vol" min="0" max="100" value="${Math.round((s.volume ?? 0.7) * 100)}"><b id="dev-vol-v">${Math.round((s.volume ?? 0.7) * 100)}%</b>
          <label class="chk"><input type="checkbox" data-act="mute" ${s.muted ? 'checked' : ''}> Mute</label></div>
        <div class="row board">${Object.keys(SOUNDS).map((k) => `<button data-snd="${esc(k)}">${esc(k)}</button>`).join('')}</div>
        <p class="note">Every sound is synthesised live (audio/Sfx.js) — each press is a new variation. ${g.audio.E.active} voices playing.</p>`;
    } else if (this.tab === 'Save') {
      body = `
        <div class="row"><button data-act="save">Save now</button><button data-act="export">Copy save JSON</button><button data-act="wipe">Wipe save + reload</button></div>
        <p class="note">Saves are recipes (seeds), so the JSON is small and portable.</p>`;
    } else if (this.tab === 'Console') {
      body = `
        <div class="console">${this.history.map((h) => `<div class="in">› ${esc(h.code)}</div><pre class="out">${esc(h.out)}</pre>`).join('')}</div>
        <input id="dev-cmd" placeholder="JS — game/g, p (player), THREE in scope · Enter to run · ↑ history" autocomplete="off">`;
    } else if (this.tab === 'Errors') {
      const errs = g.errors ?? [];
      body = errs.length
        ? `<div class="row"><button data-act="copy-errors">Copy all</button><button data-act="clear-errors">Clear</button></div>${errs.map((e) => `<pre class="errlog">×${e.count}  ${esc(e.msg)}</pre>`).join('')}`
        : '<p class="note">No errors caught. The game loop reports any exception here instead of freezing.</p>';
    }
    this.el.innerHTML = `<div class="dev-head"><b>DEV</b><span>\` toggles · Esc closes · F3 perf</span><button data-act="close">✕</button></div><div class="tabs">${tabs}</div><div class="dev-body">${body}</div>`;
    this.bind();
    if (this.tab === 'Console') {
      const box = this.el.querySelector('.console');
      box.scrollTop = box.scrollHeight;
      this.el.querySelector('#dev-cmd').focus();
    }
  }

  bind() {
    const g = this.game;
    const $ = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { this.tab = b.dataset.tab; this.render(); }; });
    this.el.querySelectorAll('[data-flag]').forEach((c) => {
      c.onchange = () => {
        this.flags[c.dataset.flag] = c.checked;
        if (c.dataset.flag === 'noclip' && !c.checked) { g.player.vy = 0; g.player.setState('move'); }
      };
    });
    this.el.querySelectorAll('[data-render]').forEach((c) => { c.onchange = () => this.setRender(c.dataset.render, c.checked); });
    this.el.querySelectorAll('[data-snd]').forEach((b) => { b.onclick = () => { g.audio.E.unlock(); SOUNDS[b.dataset.snd](g.audio, g); }; });
    const vol = $('#dev-vol');
    if (vol) vol.oninput = () => { g.setPref('volume', +vol.value / 100); $('#dev-vol-v').textContent = `${vol.value}%`; };
    const time = $('#dev-time');
    if (time) time.oninput = () => { g.timeScale = +time.value; $('#dev-time-v').textContent = `${(+time.value).toFixed(2)}×`; };
    const cmd = $('#dev-cmd');
    if (cmd) {
      let hi = this.history.length;
      cmd.onkeydown = (e) => {
        if (e.key === 'Enter' && cmd.value.trim()) { this.evaluate(cmd.value); this.render(); }
        else if (e.key === 'ArrowUp' && this.history.length) { hi = Math.max(0, hi - 1); cmd.value = this.history[hi].code; e.preventDefault(); }
      };
    }
    this.el.querySelectorAll('[data-act]').forEach((b) => {
      const act = b.dataset.act;
      const run = () => this.act(act, b);
      if (b.type === 'checkbox') b.onchange = run;
      else b.onclick = run;
    });
  }

  act(act, el) {
    const g = this.game;
    const p = g.player;
    const $ = (s) => this.el.querySelector(s);
    switch (act) {
      case 'close': this.hide(); return;
      case 'heal': p.hp = p.maxHp; p.mana = p.maxMana; p.stamina = p.maxStamina; p.statuses = {}; break;
      case 'kill-self': if (p.alive) { p.hp = 0; p.alive = false; p.onDeath(); this.hide(); } return;
      case 'revive': if (!p.alive) { g.respawn(); this.hide(); } return;
      case 'lvl-up': g.grantXp(Math.max(1, g.stats.xpToNext() - g.stats.xp)); break;
      case 'lvl-set': this.setLevel(+$('#dev-lvl').value); break;
      case 'gold': g.stats.gold += 1000; break;
      case 'points': g.stats.respec(); g.refreshMenus(); break;
      case 'tp': { const l = this.locations()[+$('#dev-loc').value]; this.teleport(l.x, l.z); break; }
      // Straight down into any dungeon (offline: the way in needn't be near, nor the story there).
      case 'dungeon': {
        const def = instanceDef($('#dev-dun').value);
        const [mode, tier] = $('#dev-dun-mode').value.split(':');
        this.dungeons = true;
        this.hide();
        g.enterDungeon(def, def.open || mode !== 'open' ? mode : 'run', tier === undefined ? (def.open ? null : 0) : +tier, 'dev');
        return;
      }
      case 'tp-reticle': { const a = g.aim.point; this.teleport(a.x, a.z, g.world.supportHeight(a.x, a.z, a.y + 1)); break; }
      case 'reveal':
        for (let x = -260; x <= 260; x += 12) for (let z = -260; z <= 260; z += 12) g.discovery.reveal(x, z);
        g.hud.toast('Map revealed');
        break;
      case 'attune':
        for (const w of g.world.poisNear(g.player.position.x, g.player.position.z, 1500, ['waystone'])) { g.attuned.add(w.id); g.world.setWaystoneActive(w.id, true); }
        g.hud.toast('All waystones attuned');
        break;
      case 'kill-all': this.killAll(); break;
      // Public events (sim/WorldEvents.js), offline: one at the nearest place that suits it, and
      // the nearest one won or lost on the spot.
      case 'event': case 'event-win': case 'event-lose': {
        const d = g.enemyLayer.sim?.director;
        if (!d) { g.hud.toast('Offline only (online: /admin event)'); break; }
        const pp = p.position;
        const ev = act === 'event' ? d.startNear(pp.x, pp.z, $('#dev-event').value) : d.force(pp.x, pp.z, act === 'event-win');
        g.hud.toast(ev ? `${act === 'event' ? 'Started' : act === 'event-win' ? 'Won' : 'Lost'}: ${ev.name}` : 'No event near');
        break;
      }
      case 'respawn': g.encounters.respawnAll(); g.hud.toast('Camps respawned'); break;
      case 'clear-loot': for (const d of [...g.drops]) g.removeDrop(d); break;
      case 'pause': this.paused = el.checked; return;
      case 'mute': g.setPref('muted', el.checked); return;
      case 'spawn-boss':
        this.bossPick = +$('#dev-boss').value;
        this.bossLevel = +$('#dev-blvl').value;
        this.spawnBoss(this.bossPick, this.bossLevel);
        break;
      case 'spawn': this.spawn($('#dev-enemy').value, +$('#dev-elvl').value, +$('#dev-count').value, $('#dev-elite').value, $('#dev-affix').value); break;
      case 'forge-drop': this.forge($('#dev-kind').value, $('#dev-rarity').value, +$('#dev-ilvl').value, 'drop', $('#dev-set').value); break;
      case 'forge-pack': this.forge($('#dev-kind').value, $('#dev-rarity').value, +$('#dev-ilvl').value, 'pack', $('#dev-set').value); break;
      case 'forge-set': this.wearSet($('#dev-set').value, $('#dev-rarity').value, +$('#dev-ilvl').value); break;
      case 'forge-10': for (let i = 0; i < 10; i++) this.forge('weapon', 'random', +$('#dev-ilvl').value, 'drop'); break;
      case 'perf': this.perfOn = !this.perfOn; this.perf.classList.toggle('hidden', !this.perfOn); break;
      case 'save': g.save(); g.hud.toast('Saved'); break;
      case 'export': g.save(); navigator.clipboard?.writeText(localStorage.getItem('celblade.save.v3') ?? ''); g.hud.toast('Save JSON copied'); break;
      case 'wipe': if (confirm('Wipe the save and reload?')) { clearSave(); location.reload(); } return;
      case 'copy-errors': navigator.clipboard?.writeText((g.errors ?? []).map((e) => `×${e.count} ${e.msg}`).join('\n\n')); break;
      case 'clear-errors': g.errors = []; this.badge.classList.add('hidden'); break;
    }
    this.render();
  }

  setRender(id, on) {
    const g = this.game;
    this.renderFlags[id] = on;
    if (id === 'outlines') { g.outlinesOverride = on; g.applyPrefs(); }
    else if (id === 'hatching') setHatchScale(on ? g.renderer.getPixelRatio() : 1e6);
    else if (id === 'fog') {
      if (!on) { this.savedFog = g.scene.fog; g.scene.fog = null; } else if (this.savedFog) g.scene.fog = this.savedFog;
      g.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    } else if (id === 'shadows') {
      g.renderer.shadowMap.enabled = on;
      g.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    } else if (id === 'speedfx') g.post.speedEnabled = on;
    else this.toggleHelper(id, on);
  }
}
