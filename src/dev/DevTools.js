// In-game developer tools.
//   `  (Backquote) or F1 — dev panel: player cheats, teleports, spawners, loot forge, render
//                         toggles, time controls, save tools, a JS console and the error log.
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
  'Dash': (a) => a.dash(), 'Mantle': (a) => a.mantle(), 'Slam dive': (a) => a.slamDive(), 'Hurt': (a) => a.playerHurt(0.2), 'Kill': (a, g) => a.kill(ahead(g, 5), false),
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

    window.addEventListener('keydown', (e) => {
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
    });
    window.addEventListener('error', (e) => game.reportError(e.error ?? e.message));
    window.addEventListener('unhandledrejection', (e) => game.reportError(e.reason));
    // Keystrokes typed into the panel shouldn't drive the player.
    this.el.addEventListener('keydown', (e) => { if (e.code !== 'Backquote' && e.code !== 'F1') e.stopPropagation(); });
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
      enemies ${g.enemies.length} · drops ${g.drops.length} · shots ${g.projectiles.list.length} · fx ${g.effects.items.length}<br>
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
      this.helpers[name].traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
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
    }
  }

  refreshColliderHelpers() {
    const g = this.game;
    const p = g.player.position;
    if (this.colliderAt && this.colliderAt.distanceTo(p) < 10) return;
    this.colliderAt = p.clone();
    const grp = this.helpers.colliders;
    for (const c of [...grp.children]) { grp.remove(c); c.geometry.dispose(); }
    const mat = this.colliderMat ??= new THREE.MeshBasicMaterial({ color: 0xff3df0, wireframe: true, transparent: true, opacity: 0.5, depthTest: false });
    for (const c of g.world.collidersNear(p.x, p.z, 45)) {
      const m = new THREE.Mesh(c.box ? new THREE.BoxGeometry(c.hx * 2, c.h, c.hz * 2) : new THREE.CylinderGeometry(c.r, c.r, c.h, 12, 1, true), mat);
      m.position.set(c.x, c.y + c.h / 2, c.z);
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
        <div class="row"><select id="dev-dun">${Object.values(DUNGEONS).map((d) => `<option value="${d.id}">${esc(d.name)} (${esc(d.theme)}, Lv ${d.level})</option>`).join('')}</select><select id="dev-dun-mode"><option value="open">Open world</option><option value="run:0">Run · Normal</option><option value="run:1">Run · Veteran</option><option value="run:2">Run · Elite</option></select><button data-act="dungeon">Go down</button></div>
        <div class="row"><button data-act="tp-reticle">Teleport to reticle</button><button data-act="reveal">Reveal map</button><button data-act="attune">Attune all waystones</button></div>
        <div class="row"><button data-act="kill-all">Kill all enemies</button><button data-act="respawn">Respawn camps</button><button data-act="clear-loot">Clear ground loot</button></div>
        <div class="grid2">${chk('freezeAI', 'Freeze enemy AI', f.freezeAI)}<label class="chk"><input type="checkbox" data-act="pause" ${this.paused ? 'checked' : ''}> Pause simulation</label></div>
        <div class="row"><span>Time scale</span><input type="range" id="dev-time" min="0.05" max="2" step="0.05" value="${g.timeScale ?? 1}"><b id="dev-time-v">${(g.timeScale ?? 1).toFixed(2)}×</b></div>`;
    } else if (this.tab === 'Spawn') {
      body = `
        <div class="row"><select id="dev-enemy">${Object.entries(ENEMY_TYPES).map(([k, v]) => `<optgroup label="${esc(v.name)}"><option value="${k}">${esc(v.name)}</option>${Object.entries(v.variants ?? {}).map(([vk, vv]) => `<option value="${k}:${vk}">${esc(vv.name)} (Lv ${vv.minLevel}+)</option>`).join('')}</optgroup>`).join('')}</select>
          Lv <input type="number" id="dev-elvl" value="${g.stats.level}" min="1" max="60"> × <input type="number" id="dev-count" value="1" min="1" max="20">
          <select id="dev-elite"><option value="">Normal</option><option value="elite">Elite</option><option value="champion">Champion</option></select>
          <select id="dev-affix"><option value="">Random affixes</option>${AFFIX_IDS.map((id) => `<option value="${id}">${AFFIXES[id].name}</option>`).join('')}<option value="horde">A whole warband</option></select></div>
        <div class="row"><button data-act="spawn">Spawn at reticle</button></div>
        <p class="note">Enemies spawn where the reticle points (${g.aim.distance.toFixed(0)} m).</p>`;
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
      const r = this.renderFlags ??= { outlines: pr.outlines, hatching: pr.hatching, fog: true, shadows: pr.shadows, speedfx: true, skeleton: false, colliders: false };
      const rchk = (id, label) => `<label class="chk"><input type="checkbox" data-render="${id}" ${r[id] ? 'checked' : ''}> ${label}</label>`;
      body = `
        <div class="grid2">${rchk('outlines', 'Ink outlines')}${rchk('hatching', 'Comic hatching')}${rchk('fog', 'Fog')}${rchk('shadows', 'Shadows')}${rchk('speedfx', 'Speed blur / lines')}${rchk('skeleton', 'Player skeleton')}${rchk('colliders', 'World colliders')}</div>
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
        const def = DUNGEONS[$('#dev-dun').value];
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
      case 'respawn': g.encounters.respawnAll(); g.hud.toast('Camps respawned'); break;
      case 'clear-loot': for (const d of [...g.drops]) g.removeDrop(d); break;
      case 'pause': this.paused = el.checked; return;
      case 'mute': g.setPref('muted', el.checked); return;
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
