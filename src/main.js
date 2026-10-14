// Game bootstrap + main loop. Owns the world, entities, menus, and cross-cutting events
// (hits, kills, loot, quests, saving). Systems live in their own modules; this wires them up.
import * as THREE from 'three';
import { Input, typing } from './core/Input.js';
import { setHatchScale, setOutlinesVisible, INK_SCALE } from './render/Toon.js';
import { readSave, writeSave, clearSave } from './core/Save.js';
import { readPrefs, writePrefs } from './core/Prefs.js';
import { TOUCH_DEVICE } from './core/Device.js';
import { CameraRig } from './render/CameraRig.js';
import { PostFX } from './render/PostFX.js';
import { Shadows } from './render/Shadows.js';
import { Grass } from './render/Grass.js';
import { WIND } from './render/Wind.js';
import { qualityOf } from './render/Quality.js';
import { ViewModel } from './render/ViewModel.js';
import { DevTools } from './dev/DevTools.js';
import { Sfx } from './audio/Sfx.js';
import { World } from './world/World.js';
import { NPCS } from './world/mapData.js';
import { settlementFolk, placeTitle } from './world/settlements.js';
import { HUB } from './world/Gen.js';
import { Discovery } from './world/Discovery.js';
import { MapUI } from './ui/MapUI.js';
import { Player } from './entities/Player.js';
import { EnemyLayer } from './entities/EnemyLayer.js';
import { NPC, INTERACT_RANGE, QUEST_ROLES } from './entities/NPC.js';
import { wrapAngle } from './entities/Character.js';
import { Effects } from './fx/Effects.js';
import { Pickups } from './entities/Pickups.js';
import { HUD } from './ui/HUD.js';
import { WorldLabels } from './ui/WorldLabels.js';
import { Minimap } from './ui/Minimap.js';
import { InventoryUI } from './ui/InventoryUI.js';
import { DialogueUI } from './ui/DialogueUI.js';
import { GameMenu } from './ui/GameMenu.js';
import { TitleMenu } from './ui/TitleMenu.js';
import { Thumbnails } from './ui/Thumbnails.js';
import { Stats } from './rpg/Stats.js';
import { QuestLog, RACE, compass } from './rpg/Quests.js';
import { respecCost } from './rpg/talents.js';
import { BARKS } from './rpg/storyline.js';
import { reachedPlaces, defenceAt, heldObjectives, questDrops } from './rpg/questWatch.js';
import { Moments } from './ui/Moments.js';
import { Projectiles } from './combat/Projectiles.js';
import { Aim, rayCylinder } from './combat/Aim.js';
import { dealDamage } from './combat/Damage.js';
import { generateWeapon } from './items/WeaponGenerator.js';
import { starterArmor } from './items/ArmorGenerator.js';
import { itemFromRecipe } from './items/items.js';
import { LootDrop } from './items/LootDrop.js';
import { BACKPACK_SIZE } from './items/Inventory.js';
import { ELEMENTS } from './items/elements.js';
import { lookFromChoice } from './models/heroLooks.js';
import { Net } from './net/Net.js';
import { Remotes } from './net/Remotes.js';
import { ChatUI } from './ui/ChatUI.js';
import { PartyUI } from './ui/PartyUI.js';
import { RaidUI } from './ui/RaidUI.js';
import { Telegraphs } from './fx/Telegraphs.js';
import { TradeUI } from './ui/TradeUI.js';
import { SocialUI } from './ui/SocialUI.js';
import { TouchControls } from './ui/TouchControls.js';
import { CharacterCore, rewardRoll, bonusRoll, visitRoll, stockFor, fineStockFor } from './rpg/CharacterCore.js';
import { ACHIEVEMENT } from './rpg/achievements.js';
import { strongholdXp } from './sim/WorldSim.js';
import { CharacterLink } from './net/CharacterLink.js';
import { DungeonView } from './world/DungeonView.js';
import { DUNGEONS, inPocket, lockDay, lockKey } from './world/dungeons.js';
import { dungeonChoices } from './sim/Dungeons.js';
import { TIERS } from './rpg/balance.js';

const PICKUP_RANGE = 5;
const LOOT_PICK_R = 0.75;  // radius of the column round a drop that the reticle can catch
const HOLD_SWAP = 0.45;    // seconds F is held to swap an item for the one in use
// The game menu's hotkeys and the tab each opens.
const MENU_KEYS = { KeyI: 'inventory', Tab: 'inventory', KeyM: 'map', KeyL: 'journal', KeyP: 'character', KeyN: 'talents', KeyO: 'social', KeyU: 'guild' };
// What the character "hears" while a menu is up: nothing (it stands, but the world goes on).
const IDLE_INPUT = { down: () => false, wasPressed: () => false, mouseDX: 0, mouseDY: 0, wheel: 0 };
const MOVING = 4010; // close code: the realm is moving us to another layer (reconnect at once)
// Places that bring folk with them (world/places.js), and the services that stand where folk
// would — things to interact with rather than people.
const PEOPLED = new Set(['hub', 'settlement', 'hamlet', 'town', 'city', 'district']);
const PROPS = {
  board: { name: 'Quest Board', prompt: 'Read the quest board', height: 2.6 },
  gate: { name: 'Sealed Gate', prompt: 'Inspect the sealed gate', height: 9.6 },
  waygate: { prompt: 'Use the Wardens\' waygate' },
  warroom: { name: 'War Table', prompt: 'Study the war table', height: 1.8 },
};
// What each kind of quest object is called, using it, and what's said of it when there's nothing
// to do there (or it's done).
const OBJECTS = {
  console: { name: 'Bridge Console', prompt: 'Wake the console', idle: 'The console is dark.', done: 'The console glows quietly, waiting.' },
  beacon: { name: 'Signal Beacon', prompt: 'Light the beacon', idle: 'A cold beacon. Nobody has asked for it lit.', done: 'The beacon burns.' },
  strongbox: { name: 'Strongbox', prompt: 'Open the strongbox', idle: 'A scav strongbox, locked tight.', done: 'Empty now.' },
  vaultdoor: { name: 'Vault Door', prompt: 'Fit the key to the door', idle: 'A ring of Maker stone, sealed. Something in it hums.', done: 'The seal is broken.' },
  rubble: { name: 'Collapsed Shaft', prompt: 'Clear the rubble', idle: 'Rubble chokes the shaft.', done: 'Cleared.' },
  cut: { name: 'The Deep Cut', prompt: 'Set the charges', idle: 'The deep cut. Cold air breathes up out of it.', done: 'Sealed.' },
  relay: { name: 'Relay Mast', prompt: 'Repair the relay', idle: 'The relay\'s light is dead.', done: 'The relay blinks steadily.' },
  lantern: { name: 'Marsh-Lantern', prompt: 'Light the lantern', idle: 'A marsh-lantern, out.', done: 'The lantern burns.' },
  // Ways down into dungeons (world/dungeons.js).
  foundrygate: { name: 'Furnace Hall Gate', idle: 'The way down into the foundry.' },
  broodmouth: { name: 'The Brood Pits', idle: 'A tunnel mouth in the resin, breathing warm air.' },
};
const FOLK_NEAR = 85;  // townsfolk are built when you come this close…
const FOLK_FAR = 110;  // …and let go past this
const rewardText = (q) => `${q.rewards.xp} XP · ${q.rewards.gold}g${q.rewards.weapon ? ' · a weapon' : q.rewards.armor ? ' · armour' : ''}`;
const QUEST_KIND_LABEL = { story: 'Story quest', side: 'Side quest', errand: 'Errand', contract: 'Warden contract', hunt: 'Hunt', job: 'Board posting' };
const questKindLabel = (q) => QUEST_KIND_LABEL[q?.kind] ?? 'Quest';

// The screen's size in CSS pixels: the layout viewport, which pinch zoom and on-screen keyboards
// don't change (window.innerWidth does, on iOS — and a game view sized to a zoomed-in viewport
// stays shrunk in a corner).
function viewSize() {
  const el = document.documentElement;
  return { w: Math.max(1, el.clientWidth || window.innerWidth), h: Math.max(1, el.clientHeight || window.innerHeight) };
}
const _eye = new THREE.Vector3();
const _v = new THREE.Vector3();

// Adaptive resolution (prefs.dynamicRes): frames are timed over a window; slower than SLOW ms on
// average lowers the resolution a step, faster than FAST raises it back.
const RES_WINDOW = 2;
const RES_SLOW = 1000 / 40;
const RES_FAST = 1000 / 57;
const RES_MIN = 0.7; // never softer than this

class Game {
  constructor() {
    this.prefs = readPrefs(readSave()?.settings);
    this.dynScale = 1;       // adaptive resolution's share of the pixel ratio
    this.frameStats = { t: 0, n: 0, sum: 0, last: 0 };
    // Multisampling is handled by PostFX render targets, so it can be changed from Settings.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio());
    setHatchScale(this.renderer.getPixelRatio());
    const view = viewSize();
    this.renderer.setSize(view.w, view.h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.body.prepend(this.renderer.domElement);
    // If the GPU context is ever lost, tell the player instead of leaving a blank screen.
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.save();
      this.state = 'paused';
      this.hud?.showOverlay('GRAPHICS RESET', 'The graphics context was lost. Your progress is saved.', [
        { label: 'Reload', onClick: () => location.reload() },
      ]);
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, view.w / view.h, 0.1, 420);
    this.input = new Input(this.renderer.domElement);
    this.rig = new CameraRig(this.camera);
    this.world = new World(this.scene);
    this.world.isAttuned = (id) => this.attuned?.has(id);
    this.world.isOpened = (id) => this.openedChests?.has(id);
    this.effects = new Effects(this.scene, this.camera, document.getElementById('fx-layer'));
    this.pickups = new Pickups(this);
    this.wards = [];           // Arc Barrier domes stopping enemy shots (entities/AbilityKit.js)
    this.audio = new Sfx(this);
    this.effects.onCasing = (pos) => this.audio.casing(pos);
    // The camera joins the scene so the first-person weapon (its child) is drawn.
    this.scene.add(this.camera);
    this.viewModel = new ViewModel(this.camera);
    // What the picture goes through after the scene (ink, AO, bloom, speed lines), sun shadows and
    // the grass round the player — all by the graphics quality setting (render/Quality.js).
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.shadows = new Shadows(this);
    this.grass = new Grass(this);
    this.projectiles = new Projectiles(this);
    // The enemies on screen and the world sim behind them (local offline; the server's online).
    this.enemyLayer = new EnemyLayer(this);
    this.aim = new Aim();
    this.thumbs = new Thumbnails();
    this.hud = new HUD(this.thumbs);
    this.dev = new DevTools(this);
    this.labels = new WorldLabels(document.getElementById('labels'), this.camera);
    this.minimap = new Minimap(document.getElementById('minimap'));
    this.inventoryUI = new InventoryUI(this, document.getElementById('inventory'));
    this.dialogue = new DialogueUI(this, document.getElementById('dialogue'));
    this.mapUI = new MapUI(this, document.getElementById('worldmap'));
    this.menu = new GameMenu(this, document.getElementById('menu'));
    this.titleMenu = new TitleMenu(this, document.getElementById('title'));
    // Online play (net/): the realm connection, the other players around us, and chat.
    this.net = new Net(this);
    this.remotes = new Remotes(this);
    this.chat = new ChatUI(this);
    this.partyUI = new PartyUI(this);
    // Raids (gameplay phase 7): the raid group, the gate, the encounter on the HUD — and the
    // marks a raid boss puts on the floor.
    this.raidUI = new RaidUI(this);
    this.telegraphs = new Telegraphs(this);
    this.tradeUI = new TradeUI(this);
    this.socialUI = new SocialUI(this);
    // Every change to the character goes through the shared rules (rpg/CharacterCore.js).
    this.charLink = new CharacterLink(this);
    this.onlineMode = false; // true while using the online realm (menus or in the world)
    this.touch = new TouchControls(this);
    document.body.classList.toggle('touch-device', TOUCH_DEVICE);
    this.touchSeen = false;  // a finger has touched the screen (turns touch controls on in 'auto')
    // A click on the game view only captures the mouse during play (never under a menu).
    this.input.canLock = () => this.state === 'playing';
    this.clock = new THREE.Clock();

    this.time = 0;
    this.saveTimer = 30;
    this.hitstopTimer = 0;
    this.hitstopSet = new Set(); // who is held by the current hitstop
    this.enemies = [];
    this.drops = [];
    this.timers = [];
    this.focusedDrop = null;
    this.lootNear = false;
    this.fHold = null;
    this.firstPerson = false;
    this.settings = { lootFilter: 1 };
    this.shop = { stock: [], fine: [] };
    this.trading = null; // the trader whose wares the shop shows: { name, stock }
    this.moments = new Moments(this);
    this.dungeonView = new DungeonView(this); // the dungeon we're down in, if we are
    this.tracked = null;   // the quest the HUD, the compass and the map follow first
    this.barked = new Set(); // who has called out to us this session
    this.said = [];        // lines said in the last talk (rpg/Quests.js events)
    // title | playing | menu (a menu or dialogue is up; the world keeps running) | paused (frozen:
    // single-player in the background, or a blocking overlay) | dead | dev
    this.state = 'title';
    this.backgroundPause = false;
    this.menuOpenedAt = 0;
    this.fullscreenDeclined = false; // the player left fullscreen: don't force it back this session
    this.zone = null;

    this.npcs = NPCS.map((def) => new NPC(this, def));
    for (const n of this.npcs) this.scene.add(n.root);
    // Settlements bring their folk and services with them as they stream in, and take them when
    // they go. Folk are built as you come near them, nearest first, rather than all at once.
    this.folk = new Map();  // id → { place, n, npc }
    this.props = new Map(); // id → a quest board, a sealed gate or a war table
    this.seenLandmarks = new Set();
    this.world.onPoiLoad = (p) => {
      if (PEOPLED.has(p.type) || p.npcs?.length) this.addSettlementFolk(p);
      this.refreshObjects(p);
    };
    this.world.onPoiUnload = (p) => { if (PEOPLED.has(p.type) || p.npcs?.length) this.removeSettlementFolk(p); };
    this.campfire = { kind: 'campfire', name: 'Hearth Reactor', title: 'Rest', position: new THREE.Vector3(HUB.x, 0, HUB.z), height: 1.2 };

    // A save that can't be restored must never stop the game from starting: report it and fall
    // back to a fresh game (the broken save is kept aside, not deleted).
    try {
      this.newGame(readSave());
    } catch (err) {
      this.reportError(err);
      try { localStorage.setItem('celblade.save.broken', localStorage.getItem('celblade.save.v3') ?? ''); } catch { /* storage unavailable */ }
      clearSave();
      this.newGame(null);
    }
    // Compile the shaders a loot drop uses up front, so the session's first drop doesn't hitch.
    try {
      const probe = new LootDrop(this, generateWeapon({ seed: 1, level: 1, type: 'sword', rarity: 'rare' }), this.player.position.clone(), { pop: false });
      this.renderer.compile(probe.root, this.camera, this.scene);
      probe.dispose();
    } catch { /* best effort */ }
    this.applyPrefs();
    this.bindEvents();
    this.showTitle();
    // Served by the game server? Then the title switches to the online realm.
    // The loading screen stays up through this too, so the realm's world doesn't swap in on view.
    this.net.probe().then((mode) => {
      if (mode === 'online') this.useOnline();
      else if (this.state === 'title' && this.titleMenu.page === 'main') this.titleMenu.render();
    }).finally(() => this.bootDone());
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- lifecycle
  // `opts` (online): seed — the realm's world; look — the character's appearance choice;
  // preview — a stand-in hero for the title screen (no starter loot on the ground).
  newGame(save = null, opts = {}) {
    if (this.dungeonView?.active) this.dungeonView.teardown();
    this.enemyLayer.clear();
    this.grass?.reset();
    for (const d of this.drops) { this.scene.remove(d.root); d.dispose(); }
    if (this.player) this.scene.remove(this.player.root);
    this.drops = [];
    this.projectiles.clear();
    this.effects.clear();
    this.pickups.clear();
    this.player?.abilities.clear();
    this.time = 0;

    // Each game has its own world; saves from the old fixed valley get a fresh one (character and
    // gear carry over, places don't).
    const seed = opts.seed ?? save?.world?.seed ?? ((Math.random() * 0xffffffff) >>> 0);
    const legacy = save && !save.world && opts.seed === undefined;
    this.world.setSeed(seed);
    this.stats = new Stats();
    this.quests = new QuestLog(this);
    // Online, quest offers come from the server.
    this.quests.generate = !opts.online;
    this.discovery = new Discovery();
    this.attuned = new Set(['w-hub']);
    this.openedChests = new Set();
    this.customMarker = null;
    this.player = new Player(this);
    this.enemyLayer.startLocal();
    this.player.look = opts.look ? lookFromChoice(opts.look) : null;
    this.scene.add(this.player.root);

    if (save) {
      this.stats.load(save.stats);
      this.quests.load(save.quests);
      this.player.inventory.load(save.inventory);
      this.settings = { ...this.settings, ...save.settings };
      if (opts.online) {
        this.shop.stock = (save.shop ?? []).map((r) => { try { return itemFromRecipe(r); } catch { return null; } }).filter(Boolean);
        this.shop.fine = (save.fine ?? []).map((r) => { try { return itemFromRecipe(r); } catch { return null; } }).filter(Boolean);
      }
      if (!legacy) {
        this.encounters.load(save.camps);
        this.discovery.load(save.discovery);
        this.attuned = new Set(save.attuned ?? ['w-hub']);
        this.openedChests = new Set(save.chests ?? []);
        this.customMarker = save.marker ?? null;
        this.tracked = save.tracked ?? null;
      }
      // Saved down in a dungeon (its copy long gone): back where they went in.
      const pos = !legacy && save.pos ? (inPocket(save.pos[0]) ? save.run?.back ?? null : save.pos) : null;
      const [x, y, z] = pos ?? [HUB.x, 0, HUB.z + 4];
      this.player.position.set(x, y, z);
      this.world.prime(this.player.position);
      this.player.position.y = this.world.supportHeight(x, z, y + 0.6);
    } else {
      this.player.inventory.add(generateWeapon({ seed: 7, level: 1, type: 'sword', rarity: 'common' }));
      this.player.position.set(HUB.x, 0, HUB.z + 4);
      this.world.prime(this.player.position);
    }
    // A new character starts in the Pathfinder trail set; an older one without it gets the cape.
    if (!opts.online && (!save || !this.settings.capeGranted)) {
      const inv = this.player.inventory;
      const kit = starterArmor();
      for (const slot of save ? ['back'] : Object.keys(kit)) inv.armor[slot] ??= kit[slot];
      this.settings.capeGranted = true;
    }
    this.char = new CharacterCore({
      stats: this.stats, inventory: this.player.inventory, quests: this.quests, attuned: this.attuned,
      chests: this.openedChests, shop: this.shop, settings: this.settings, position: this.player.position, world: this.world,
    });
    this.char.inCombat = () => this.inCombat();
    if (!opts.online) this.char.dungeons = this.localDungeons();
    this.char.loadProgress(save);
    this.charLink.attach(this.char);
    for (const id of this.world.waystones.keys()) this.world.setWaystoneActive(id, this.attuned.has(id));
    for (const id of this.world.chests.keys()) this.world.setChestOpen(id, this.openedChests.has(id));
    this.discovery.reveal(this.player.position.x, this.player.position.z);
    this.regionKey = null;
    this.zone = null;
    this.player.facing = Math.PI;
    this.player.hp = this.player.maxHp = this.stats.maxHp;
    this.player.mana = this.player.maxMana = this.stats.maxMana;
    this.player.refreshAppearance();
    this.player.hp = this.player.maxHp = this.stats.maxHp;
    // Items a save repair couldn't fit back into a full backpack land at your feet.
    if (!opts.online) {
      const fx = [];
      for (const it of this.player.inventory.backpack.splice(BACKPACK_SIZE)) if (it) this.char.spawn(this.char.gid(), it, this.player.position.toArray(), fx, false);
      this.onCharFx(fx);
      this.refreshShop();
    }
    this.rig.yaw = 0;
    this.fHold = null;
    this.hud.reset();
  }

  // Online, the character is saved to the server (it keeps the world seed itself); offline, to
  // this device. A disconnected online character is never written over the offline save.
  save() {
    if (this.state === 'title') return;
    const data = {
      stats: this.stats.toJSON(),
      quests: this.quests.toJSON(),
      inventory: this.player.inventory.toJSON(),
      camps: this.encounters.toJSON(this.time),
      settings: this.settings,
      discovery: this.discovery.toJSON(),
      attuned: [...this.attuned],
      chests: [...this.openedChests],
      marker: this.customMarker,
      tracked: this.tracked,
      pos: [this.player.position.x, this.player.position.y, this.player.position.z],
      records: this.char.records,
      achievements: this.char.achievements,
      // Down in a dungeon: where we went in (a save there comes back outside).
      run: this.char.dungeon ? { d: this.char.dungeon.d, back: this.char.dungeon.back } : null,
    };
    // Online the server keeps the character itself; it only takes what's this screen's own.
    if (this.net.inWorld) this.net.send({ t: 'save', data: { discovery: data.discovery, marker: data.marker, tracked: data.tracked, pos: data.pos } });
    else if (!this.onlineMode) writeSave({ world: { seed: this.world.seed }, ...data });
  }

  // Preferences (core/Prefs.js) take effect at once and belong to the device, not the save.
  // Device pixels per CSS pixel: the screen's (up to 2), the resolution setting, and the adaptive
  // resolution's current share.
  pixelRatio() {
    return Math.min((window.devicePixelRatio || 1) * (this.prefs.renderScale ?? 1), 2) * (this.prefs.dynamicRes ? this.dynScale : 1);
  }

  setPixelRatio() {
    const r = this.pixelRatio();
    if (Math.abs(r - this.renderer.getPixelRatio()) < 0.01) return;
    this.renderer.setPixelRatio(r);
    const view = viewSize();
    this.renderer.setSize(view.w, view.h);
    this.post.setSize(view.w, view.h);
    setHatchScale(this.prefs.hatching ? r : 1e6);
  }

  // Times frames in play and steps the resolution down while they're slow (and back up after).
  adaptResolution() {
    const now = performance.now();
    const f = this.frameStats;
    const ms = now - f.last;
    f.last = now;
    if (!this.prefs.dynamicRes || this.state !== 'playing' || document.hidden || ms > 250) return;
    f.t += ms / 1000;
    f.n++;
    f.sum += ms;
    if (f.t < RES_WINDOW) return;
    const avg = f.sum / f.n;
    f.t = f.n = f.sum = 0;
    const was = this.dynScale;
    if (avg > RES_SLOW) this.dynScale = Math.max(RES_MIN, this.dynScale - 0.1);
    else if (avg < RES_FAST) this.dynScale = Math.min(1, this.dynScale + 0.05);
    if (this.dynScale !== was) this.setPixelRatio();
  }

  // Touch controls: on for phones and tablets ('auto', or once a finger touches the screen), or
  // as the setting says.
  get touchActive() {
    const mode = this.prefs.touchControls;
    return mode === 'on' || (mode === 'auto' && (TOUCH_DEVICE || this.touchSeen));
  }

  applyPrefs() {
    const pr = this.prefs;
    this.setPixelRatio();
    const touch = this.touchActive;
    this.input.setTouch(touch);
    this.touch.setEnabled(touch);
    document.body.classList.toggle('touch', touch);
    this.audio.setVolume(pr.volume, pr.muted);
    this.rig.sensScale = pr.sensitivity;
    this.rig.invertY = pr.invertY;
    this.rig.fov = pr.fov;
    this.rig.shakeScale = pr.shake;
    // Graphics quality: the post chain, which ink (screen-space for the world, hulls for the held
    // weapon — or hulls for both on Low), shadows and grass.
    const q = qualityOf(pr.graphics);
    const outlines = pr.outlines && this.outlinesOverride !== false;
    this.post.configure(q, { outlines, antialias: pr.antialias });
    this.effects.setQuality(pr.graphics);
    setOutlinesVisible(outlines, { world: outlines && !q.ink, view: outlines });
    this.grass.configure(q.grass, q.grassRadius);
    setHatchScale(pr.hatching ? this.renderer.getPixelRatio() : 1e6);
    this.input.fullscreen = pr.fullscreen && !this.fullscreenDeclined;
    if (!pr.fullscreen && document.fullscreenElement) {
      this.leavingFullscreen = true;
      this.input.exitFullscreen();
    }
    if (this.renderer.shadowMap.enabled !== pr.shadows) {
      this.renderer.shadowMap.enabled = pr.shadows;
      this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
    this.shadows.setQuality(pr.shadowQuality);
    this.shadows.setMode(pr.shadows ? (q.csm ? 'cascaded' : 'single') : 'off');
  }

  setPref(key, value) {
    this.prefs[key] = value;
    writePrefs(this.prefs);
    if (key === 'fullscreen' && value) this.fullscreenDeclined = false;
    this.applyPrefs();
    // Switched on from the settings (a click): go fullscreen now rather than at the next resume.
    if (key === 'fullscreen' && value && this.state !== 'title') this.input.enterFullscreen();
  }

  // Lifts the loading screen (index.html #loading) once the title has been drawn.
  bootDone() {
    const el = document.getElementById('loading');
    if (!el || el.classList.contains('done')) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('done');
      setTimeout(() => el.remove(), 600);
    }));
  }

  showTitle() {
    this.state = 'title';
    this.hud.hideOverlay();
    if (this.onlineMode) this.titleMenu.openOnline();
    else this.titleMenu.open('main');
  }

  // ---------------------------------------------------------------- online realm
  // The online menus, over a flight through the realm's own world.
  useOnline() {
    // (Already playing single-player — the realm's answer came late: stay offline, saves and all.)
    if (this.state !== 'title') return;
    this.onlineMode = true;
    if (this.world.seed !== this.net.status.seed) this.newGame(null, { seed: this.net.status.seed, preview: true });
    this.titleMenu.openOnline();
  }

  // Back to single-player: the local save (or a fresh game) and the offline menu.
  useOffline() {
    this.onlineMode = false;
    try {
      this.newGame(readSave());
    } catch (err) {
      this.reportError(err);
      this.newGame(null);
    }
    this.titleMenu.open('main');
  }

  // Shows an appearance choice on the title-screen hero (character list and creator).
  previewLook(choice) {
    this.player.look = lookFromChoice(choice);
    this.player.rebuildModel();
  }

  // `retry`: a reconnect (see rejoin), which reports failure rather than going to the list.
  async enterRealm(character, { retry = false } = {}) {
    this.titleMenu.open('joining');
    try {
      const welcome = await this.net.connect(character.id);
      const c = welcome.character;
      this.newGame(c.data, { seed: welcome.seed, look: c.look, online: true });
      // The realm's enemies come from the server, and so does what lies on the ground for us.
      this.enemyLayer.startRemote(welcome.camps);
      this.loadGround(welcome.ground);
      this.chat.clear();
      this.chat.add({ ch: 'system', text: `Welcome, ${c.name}. Enter to chat: /s nearby, /w Name to whisper, /who for who's online.` });
      // A realm in layers (copies of the world, run side by side) says which one this is.
      if (Number.isInteger(welcome.layer)) this.chat.add({ ch: 'system', text: `You're on layer ${welcome.layer + 1}.` });
      this.start();
      if (!c.data) this.save();
      return true;
    } catch (err) {
      this.net.disconnect();
      if (!retry) this.titleMenu.open('chars', { error: err.message });
      return false;
    }
  }

  // The connection went. Moving to another layer, a restart or a dropped connection: straight
  // back in (after a pause for a restart), and the Disconnected dialog only if that keeps failing.
  // Anything else (kicked, banned, signed in elsewhere) goes to the dialog.
  onDisconnected(reason, code) {
    this.chat.hide();
    this.remotes.clear();
    if (this.state === 'title') return;
    const character = this.net.character;
    if (character && [MOVING, 1001, 1006, 1012].includes(code)) { this.rejoin(character, reason, code); return; }
    this.disconnected(reason, character);
  }

  disconnected(reason, character) {
    this.closeMenus(false);
    this.state = 'paused';
    this.releaseMouse();
    this.hud.showOverlay('DISCONNECTED', `${reason} Progress up to the last save is kept.`, [
      { label: 'Reconnect', onClick: () => { this.hud.hideOverlay(); this.state = 'title'; this.enterRealm(character); } },
      { label: 'Characters', onClick: () => this.showTitle() },
    ]);
  }

  async rejoin(character, reason, code) {
    if (this.rejoining) return;
    this.rejoining = true;
    this.closeMenus(false);
    this.releaseMouse();
    this.state = 'title'; // the joining screen until the world is back
    const waits = code === MOVING ? [0, 800, 2500] : [1000, 2000, 3000, 5000, 8000, 12000, 15000];
    try {
      for (const ms of waits) {
        if (ms) await new Promise((r) => setTimeout(r, ms));
        if (await this.enterRealm(character, { retry: true })) return;
      }
    } finally {
      this.rejoining = false;
    }
    this.titleMenu.open('chars', { error: `${reason} Couldn't get back in — try again.` });
  }

  startNewGame() {
    clearSave();
    this.newGame(null);
    this.start();
  }

  start() {
    this.fullscreenDeclined = false;
    this.input.fullscreen = this.prefs.fullscreen;
    this.titleMenu.close();
    this.menu.close();
    this.resume();
    this.refreshAllObjects();
    this.handInFinished();
    if (!this.quests.completed.size && !Object.keys(this.quests.active).length) {
      this.hud.banner(HUB.name, 'Speak with Warden Maren [E]');
      if (this.stats.level <= 1 && !this.stats.xp) this.after(0.6, () => this.moments.play('wake'));
    } else if (this.stats.points > 0) {
      // (Characters from before talents replaced attributes come back with every point to spend.)
      this.hud.banner('Talent points', `${this.stats.points} to spend — press N`);
    }
  }

  bindEvents() {
    const resize = () => {
      const view = viewSize();
      this.camera.aspect = view.w / view.h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(view.w, view.h);
      this.post.setSize(view.w, view.h);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 250));
    // Phones: no pinch or double-tap zoom (Safari ignores the viewport's say-so and touch-action
    // for these), and the page put back where it was when the on-screen keyboard goes.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !e.target.closest?.('#worldmap canvas')) e.preventDefault(); }, { passive: false });
    document.addEventListener('focusout', () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); });
    // Losing the mouse during play (Esc, alt-tab, a system dialog) opens the game menu.
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing' && !this.input.releasing) this.openGameMenu();
      this.input.releasing = false;
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && !this.leavingFullscreen) this.fullscreenDeclined = true;
      this.leavingFullscreen = false;
      this.input.fullscreen = this.prefs.fullscreen && !this.fullscreenDeclined;
    });
    // A finger on the screen (a touchscreen laptop, say): touch controls switch on in 'auto'.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.touchSeen) return;
      this.touchSeen = true;
      if (this.prefs.touchControls === 'auto') this.applyPrefs();
    }, true);
    window.addEventListener('blur', () => this.onBackground());
    window.addEventListener('focus', () => this.onForeground());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.onBackground(); else this.onForeground(); });
    // A hidden window (minimized, behind another, a background tab) draws no frames, and the frame
    // loop is what reports where we stand: online, keep telling the realm we're here meanwhile, so
    // other players still see us (and we them, when we're back).
    setInterval(() => { if (document.hidden && this.net.inWorld) this.net.update(1); }, 1000);
    // Leaving the page mid-session: a last save (best effort; autosaves cover the rest).
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      // Held keys repeat: a menu toggles once per press (holding Esc in fullscreen leaves it).
      if (e.repeat && (e.code === 'Escape' || MENU_KEYS[e.code])) { e.preventDefault(); return; }
      const inGame = this.state === 'playing' || this.state === 'menu' || (this.state === 'paused' && this.backgroundPause);
      // A story moment playing: Esc, Space or Enter skips it.
      if (this.moments.active && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.moments.skip();
        return;
      }
      if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Slash') && this.state === 'playing' && this.net.inWorld) {
        e.preventDefault();
        this.chat.open(e.code === 'Slash' ? '/' : '');
        return;
      }
      // A party invitation waiting: Y joins, N declines.
      if (this.partyUI.invite && (e.code === 'KeyY' || e.code === 'KeyN') && inGame) {
        e.preventDefault();
        this.partyUI.respond(e.code === 'KeyY');
        return;
      }
      // …a raid group's.
      if (this.raidUI.invite && (e.code === 'KeyY' || e.code === 'KeyN') && inGame) {
        e.preventDefault();
        this.raidUI.respond(e.code === 'KeyY');
        return;
      }
      // …then a trade request.
      if (this.tradeUI.request && (e.code === 'KeyY' || e.code === 'KeyN') && inGame) {
        e.preventDefault();
        this.tradeUI.respond(e.code === 'KeyY');
        return;
      }
      const tab = MENU_KEYS[e.code];
      if (tab && inGame && ((tab !== 'social' && tab !== 'guild') || this.net.inWorld) && !this.tradeUI.isOpen) {
        e.preventDefault();
        if (this.menu.isOpen && this.menu.page === tab) this.closeMenus();
        else this.openGameMenu(tab);
      } else if ((e.code === 'KeyQ' || e.code === 'KeyE') && this.menu.isOpen) {
        e.preventDefault();
        this.menu.step(e.code === 'KeyE' ? 1 : -1);
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.onEscape();
      } else if (e.code === 'KeyV' && this.state === 'playing') {
        this.setPref('firstPerson', !this.prefs.firstPerson);
        this.hud.toast(this.prefs.firstPerson ? 'First person' : 'Third person');
      } else if (e.code === 'KeyR' && this.state === 'dead') {
        this.respawn();
      }
    });
  }

  // Esc backs out of whatever is on top: in play it opens the game menu; in a menu or dialogue it
  // goes back to play; over the title it closes settings or steps back a page. (The dev panel and
  // the chat line take their own Esc first.)
  onEscape() {
    // Esc in a trade cancels it (the window closes when the server says so).
    if (this.tradeUI.isOpen) { this.tradeUI.send('cancel'); return; }
    if (this.state === 'title') {
      if (this.menu.isOpen) this.menu.back();
      else this.titleMenu.back();
    } else if (this.state === 'playing') this.openGameMenu();
    else if (this.state === 'menu' || (this.state === 'paused' && this.backgroundPause)) this.closeMenus();
  }

  // ---------------------------------------------------------------- menus
  // The game menu (ui/GameMenu.js) on a tab. The world keeps running: the character stands idle.
  openGameMenu(tab, opts = {}) {
    if (this.moments.active) return;
    if (this.state !== 'playing' && this.state !== 'menu' && !(this.state === 'paused' && this.backgroundPause)) return;
    this.dialogue.close();
    this.chat.close();
    if (this.state === 'playing') this.state = 'menu';
    this.menu.open(tab, opts);
    this.menuOpenedAt = performance.now();
    this.releaseMouse();
  }

  // The game letting go of the mouse itself (so it may take it back later without a click).
  releaseMouse() {
    if (!document.pointerLockElement) return;
    this.input.releasing = true;
    document.exitPointerLock();
  }

  // The window went to the background: play opens the menu, and single-player freezes until the
  // window is back (online, the world carries on regardless).
  onBackground() {
    if (this.state === 'playing') this.openGameMenu();
    if (this.state === 'menu' && !this.net.inWorld) {
      this.state = 'paused';
      this.backgroundPause = true;
    }
    if (this.state !== 'title') this.save();
  }

  onForeground() {
    if (this.state !== 'paused' || !this.backgroundPause || document.hidden || !document.hasFocus()) return;
    this.backgroundPause = false;
    this.state = 'menu';
    this.clock.getDelta();
  }

  // Straight back into play, taking the mouse back. The browser hands it over whenever the game
  // let go of it (menus opened by key, or Esc in fullscreen) or there's a fresh click; if it won't
  // (Esc released it outside fullscreen), play carries on and the next key or click takes it.
  resume() {
    this.hud.hideOverlay();
    this.dialogue.close();
    this.backgroundPause = false;
    this.enterPlay();
    if (!this.input.locked) this.input.capture();
  }

  enterPlay() {
    this.state = 'playing';
    this.menu.close();
    this.clock.getDelta();
  }

  quitToTitle() {
    this.save();
    this.menu.close();
    this.dialogue.close();
    this.state = 'title';
    this.releaseMouse();
    if (this.net.inWorld) {
      this.net.disconnect();
      this.chat.hide();
    }
    this.showTitle();
  }

  // A dialogue (or other in-world panel) over play.
  openMenu(show) {
    this.state = 'menu';
    this.menu.close();
    show();
    this.releaseMouse();
  }

  // Closes any dialogue and the game menu, then back to play unless `resume` is false (switching
  // straight to another menu).
  closeMenus(resume = true) {
    this.dialogue.close();
    this.menu.close();
    if (resume && (this.state === 'menu' || (this.state === 'paused' && this.backgroundPause))) this.resume();
  }

  // ---------------------------------------------------------------- main loop
  // One bad frame must never stop the loop: errors are reported (dev console) and play continues.
  frame() {
    requestAnimationFrame(this.frame);
    try {
      this.dev.beginFrame();
      this.step();
      this.dev.update();
    } catch (err) {
      this.reportError(err);
    } finally {
      this.input.endFrame();
    }
  }

  reportError(err) {
    const msg = String(err?.stack ?? err);
    this.errors ??= [];
    const known = this.errors.find((e) => e.msg === msg);
    if (known) { known.count++; return; }
    this.errors.push({ msg, count: 1, time: this.time });
    console.error(err);
    this.dev?.onError?.(msg);
  }

  step() {
    const realDt = Math.min(this.clock.getDelta(), 1 / 20) * (this.timeScale ?? 1);
    // The dev panel ('dev') keeps the world running (unless paused) but takes no player input.
    // Menus don't stop the world: under one the character just gets no input.
    const running = (this.state === 'playing' || this.state === 'menu' || this.state === 'dead' || this.state === 'dev') && !this.dev.paused;

    if (running) {
      this.player.readInput(this.state === 'playing' && !this.moments.active ? this.input : IDLE_INPUT, this.rig);
      const dt = realDt;
      if (this.hitstopTimer > 0 && (this.hitstopTimer -= realDt) <= 0) this.hitstopSet.clear();
      this.simulate(dt);
      this.effects.update(dt, realDt, this.player.position, this.world.biomeAt(this.player.position.x, this.player.position.z), this.time, this.world.flames);
      this.effects.updatePools(dt, this.groundAt ??= (x, z) => this.world.supportHeight(x, z, this.player.position.y + 2));
      for (const d of this.drops) d.update(realDt, this.time);
      if (this.state === 'playing') {
        this.updateLootFocus(realDt);
        this.updateInteraction();
        this.updateZone();
        this.updateRecords(realDt);
      }
      this.saveTimer -= realDt;
      if (this.saveTimer <= 0) { this.saveTimer = 30; this.save(); }
    }
    this.updateFolk();
    for (const n of this.npcs) n.update(realDt);

    this.rig.frameShift = this.state === 'title' ? -3.2 : 0;
    // The HUD and name labels stay hidden for as long as the title screen (or its settings and
    // controls pages) is up.
    document.body.classList.toggle('at-title', this.state === 'title');
    if (this.state === 'title') {
      this.rig.yaw += realDt * 0.045;
      this.rig.pitch += (0.14 - this.rig.pitch) * Math.min(1, realDt * 1.5);
      this.rig.zoom += (1.45 - this.rig.zoom) * Math.min(1, realDt * 1.5);
    }
    this.firstPerson = !!this.prefs.firstPerson && this.player.alive && this.state !== 'title';
    this.player.setFirstPerson(this.firstPerson);
    if (this.moments.active) this.moments.update(realDt, this.camera);
    else {
      this.rig.update(realDt, this.state === 'playing' ? this.input : { mouseDX: 0, mouseDY: 0, wheel: 0, down: () => false },
        this.player.position, this.player.cameraMode, this.world, this.player.adsFov, this.player.fovKick,
        this.firstPerson ? this.player.eyePosition(_eye) : null);
    }
    this.viewModel.update(realDt, this.player, this.rig, this.firstPerson);
    // Ink weight: a touch lighter than the old comic line everywhere, and held at the same on-screen
    // width when aiming narrows the view (outlines are sized in world units, so zoom fattens them).
    const zoom = Math.tan((this.camera.fov * Math.PI) / 360) / Math.tan(((this.prefs.fov ?? 55) * Math.PI) / 360);
    INK_SCALE.world.value = 0.7 * Math.min(1, zoom);
    if (this.net.inWorld) {
      this.net.update(realDt);
      this.remotes.update(realDt);
    }
    this.chat.update();
    this.touch.update();
    this.adaptResolution();
    this.partyUI.update(realDt);
    this.raidUI.update(realDt);
    this.tradeUI.update(realDt);
    this.menu.update(realDt);
    document.body.classList.toggle('mouse-free', this.state === 'playing' && this.input.lockSupported && !this.input.locked);
    this.world.update(realDt, this.time, this.player.position);
    this.aim.update(this);
    this.hud.update(realDt, this);
    this.labels.update(this);
    this.minimap.update(realDt, this);
    this.mapUI.draw();
    this.audio.update(realDt);
    WIND.time.value += realDt;
    this.grass.update(this.player.position);
    this.shadows.update();
    this.post.render(realDt, this);
  }

  // Run `fn` after `delay` seconds of game time (pauses with the game, slows with hitstop).
  after(delay, fn) {
    this.timers.push({ t: delay, fn });
  }

  simulate(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.t -= dt) <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    // Hitstop holds only the fighters in the exchange (near-frozen for a beat); the rest of the
    // world — effects, other enemies, shots in flight — carries on.
    const held = (c) => (this.hitstopTimer > 0 && this.hitstopSet.has(c) ? dt * 0.04 : dt);
    this.player.update(held(this.player));
    if (!this.net.inWorld) this.char.expire(this.time);
    this.enemyLayer.update(dt, held);
    this.dungeonView.update(dt);
    this.telegraphs.update(dt);
    this.projectiles.update(dt);
    this.pickups.update(dt);
    this.resolveSeparation();
    for (let i = this.drops.length - 1; i >= 0; i--) {
      if (this.drops[i].expired) this.removeDrop(this.drops[i]);
    }
    if (!this.dungeonView.active) this.discovery.reveal(this.player.position.x, this.player.position.z);
  }

  // The player is shoved out of enemies (heavier ones give way less); the world sim moves the
  // enemies out of the player's way on its side.
  resolveSeparation() {
    const me = this.player;
    if (!me.alive) return;
    const a = me.position;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const b = e.position;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const min = me.radius + e.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 === 0) continue;
      // Flyers overhead don't shove anyone.
      if (a.y > b.y + e.height || b.y > a.y + me.height) continue;
      const d = Math.sqrt(d2);
      const ma = me.mass ?? 1;
      const mb = e.mass ?? 1;
      const pa = ((min - d) * mb) / (ma + mb);
      a.x -= (dx / d) * pa;
      a.z -= (dz / d) * pa;
    }
  }

  // ---------------------------------------------------------------- world awareness
  // Region banners as you cross into new land, camp banners as you walk into a camp.
  updateZone() {
    const p = this.player.position;
    // (Down in a dungeon there's no land, region or place to name.)
    if (inPocket(p.x)) return;
    const region = this.world.regionAt(p.x, p.z);
    if (region.key !== this.regionKey) {
      const first = this.regionKey === null;
      this.regionKey = region.key;
      this.hud.setZone(region.name);
      if (!first && !region.hub) this.hud.banner(region.name, `Level ${region.level} · ${RACE[region.race].name.replace(/^the /, 'The ')}`);
    }
    const z = this.world.zoneAt(p.x, p.z);
    if (z !== this.zone) {
      this.zone = z;
      if (z?.type === 'camp') this.hud.banner(z.name, `Level ${z.level}${z.stronghold ? ' · Stronghold' : ''}`);
      else if (z === HUB) this.hud.banner(HUB.name, 'Town · Safe haven');
      else if (z) this.hud.banner(z.name, `${placeTitle(z)} · Safe haven`);
    }
    // In a city: its districts as you walk through them.
    const district = z?.type === 'city' ? this.world.districtAt(p.x, p.z) : null;
    if (district !== this.district) {
      this.district = district;
      if (district) this.hud.toast(`${z.name} · ${placeTitle(district)}`);
    }
    if ((this.barkTimer = (this.barkTimer ?? 0) - 1) <= 0) {
      this.barkTimer = 20;
      this.updateBarks();
    }
    // The first time this session you reach a landmark.
    const lm = this.world.landmarkAt(p.x, p.z);
    if (lm && !this.seenLandmarks.has(lm.id)) {
      this.seenLandmarks.add(lm.id);
      this.hud.banner(lm.name, 'Landmark discovered');
    }
  }

  // A place's folk and services as it streams in: its people are built as you come near them
  // (updateFolk); a board, a gate or a war table is there to use straight away. (Called while the
  // place is being built, so the colliders put where folk stand go with the place.)
  addSettlementFolk(place) {
    for (const n of place.npcs ?? []) {
      if (PROPS[n.role] || n.role === 'object') {
        this.props.set(n.id, this.propFor(place, n));
        continue;
      }
      if (this.folk.has(n.id)) continue;
      this.folk.set(n.id, { place, n, npc: null });
      this.world.addCollider(n.x, n.z, 0.5, 2);
    }
  }

  removeSettlementFolk(place) {
    for (const [id, f] of this.folk) {
      if (f.place !== place) continue;
      if (f.npc) this.dropFolk(f);
      this.folk.delete(id);
    }
    for (const [id, pr] of this.props) if (pr.place === place) this.props.delete(id);
  }

  // Folk come into being as you near them — the nearest first, one a frame — and are let go once
  // far behind.
  updateFolk() {
    const p = this.player.position;
    let best = null;
    let bd = FOLK_NEAR;
    for (const f of this.folk.values()) {
      const d = Math.hypot(f.n.x - p.x, f.n.z - p.z);
      // Story folk who only appear at their moment (Krell, kneeling once Ironjaw has fallen).
      const here = !f.n.when || this.quests.whenHolds(f.n.when);
      if (f.npc) {
        if (d > FOLK_FAR || !here) this.dropFolk(f);
      } else if (here && d < bd) {
        bd = d;
        best = f;
      }
    }
    if (!best) return;
    const npc = new NPC(this, settlementFolk(best.place, best.n), { collider: false });
    npc.place = best.place.id;
    best.npc = npc;
    this.npcs.push(npc);
    this.scene.add(npc.root);
  }

  dropFolk(f) {
    this.scene.remove(f.npc.root);
    f.npc.dispose();
    this.npcs = this.npcs.filter((n) => n !== f.npc);
    f.npc = null;
  }

  // A board, a gate, a war table or a quest object: something to interact with, labelled like the
  // folk.
  propFor(place, n) {
    if (n.role === 'object') {
      const O = OBJECTS[n.model] ?? { name: 'Object' };
      const prop = {
        kind: 'object', id: n.id, place, n, title: this.placeName(place), name: O.name,
        position: new THREE.Vector3(n.x, this.world.groundHeight(n.x, n.z), n.z), height: n.model === 'vaultdoor' ? 7 : 1.6,
      };
      Object.defineProperty(prop, 'marker', { get: () => (this.quests.wants(n.id) ? '!' : null) });
      return prop;
    }
    const P = PROPS[n.role];
    const prop = {
      kind: n.role, id: n.id, place, n, title: this.placeName(place),
      name: n.role === 'gate' ? (n.gate === 'raid' ? 'Raid Gate' : 'Wardens\' Waygate') : P.name,
      position: new THREE.Vector3(n.x, this.world.groundHeight(n.x, n.z), n.z), height: n.role === 'gate' && place.type !== 'district' ? 5.4 : P.height,
    };
    Object.defineProperty(prop, 'marker', { get: () => (n.role === 'board' ? this.boardMarker(n.id) : null) });
    return prop;
  }

  // '?' when a posting of the board's is done, '!' when one is waiting.
  boardMarker(id) {
    const log = this.quests;
    let open = false;
    for (let k = 0; k < 3; k++) {
      const slot = `${id}#${k}`;
      if (log.readyToTurnIn(slot).length) return '?';
      if (!open && log.available(slot).length) open = true;
    }
    return open ? '!' : null;
  }

  placeName(p) { return p?.cityName ?? p?.name ?? HUB.name; }

  // A quest object's look on this screen: used (by this character) or not.
  refreshObject(id) {
    const parts = this.world.objectParts?.get(id);
    if (!parts) return;
    const used = !!this.quests.flags[`used:${id}`];
    parts.on.visible = used;
    parts.off.visible = !used;
  }
  refreshObjects(place) { for (const n of place.npcs ?? []) if (n.role === 'object') this.refreshObject(n.id); }
  refreshAllObjects() { for (const id of this.world.objectParts?.keys() ?? []) this.refreshObject(id); }

  // Using a quest object: only when a quest wants it (else what it is, or that it's done).
  useObject(prop) {
    const O = OBJECTS[prop.n.model] ?? {};
    // A dungeon's way in (the Sunken Vault's door, once it's open).
    const down = this.dungeonAt(prop);
    if (down) { this.openMenu(() => this.dungeonDialog(down, 'entrance')); return; }
    if (this.quests.flags[`used:${prop.id}`]) this.hud.toast(O.done ?? 'Done.');
    else if (!this.quests.wants(prop.id) || !this.charLink.do({ op: 'use', id: prop.id })) this.hud.toast(O.idle ?? 'Nothing to do here.');
  }

  // ---------------------------------------------------------------- dungeons (gameplay phase 5)
  // The dungeon whose way in an object is, if it's open to us now (not while a quest wants it).
  dungeonAt(prop) {
    const d = Object.values(DUNGEONS).find((x) => x.entrance === prop.n?.object);
    if (!d || this.quests.wants(prop.id)) return null;
    return !d.needs || this.quests.flags[d.needs.flag] ? d : null;
  }

  // Going down: the open-world copy (at its own way in), or a private run for the party at a tier
  // (there, or through a town's or city's waygate) — its reward chest once a day per tier.
  dungeonDialog(def, via, gate = null) {
    const day = lockDay();
    const options = [];
    if (def.open && via === 'entrance') options.push({ label: 'Go down (open world)', cls: 'quest', onClick: () => this.enterDungeon(def, 'open', null, via) });
    TIERS.forEach((T, i) => {
      const done = this.settings.lockouts?.[lockKey(def.id, i)] === day;
      options.push({ label: `Private run · ${T.name}${done ? ' · chest opened today' : ''}`, cls: done ? '' : 'quest', onClick: () => this.enterDungeon(def, 'run', i, via) });
    });
    if (gate) options.push({ label: 'Back', onClick: () => this.gateDialog(gate) });
    const how = !def.open ? 'It can only be run as a private copy: take'
      : via === 'entrance' ? 'Its halls are open to anyone who walks in, and what lives there comes back — or take'
        : 'Its halls are open to anyone who walks in at its own way in. From here, take';
    this.dialogue.open({
      name: def.name, title: `Dungeon · Level ${def.level}+`,
      text: `${def.blurb} ${how} your party down a private copy at a tier of your choosing: nothing comes back once it's beaten, and past the last of them stands a reward chest, once a day for each tier.`,
      options,
    });
  }

  async enterDungeon(def, mode, tier, via) {
    this.closeMenus();
    const ok = await this.charLink.do({ op: 'enter', d: def.id, mode, tier, via });
    if (!ok && !this.net.inWorld) this.hud.toast(this.enemyLayer.dungeons?.error ?? `Couldn't go into ${def.name}.`);
  }

  // Offline, the character's operations ask the local instance manager (entities/EnemyLayer.js).
  localDungeons() {
    const d = () => this.enemyLayer.dungeons;
    const who = () => ({ id: 0, position: this.player.position, party: 'solo', level: this.stats.level, flags: this.quests.flags, dev: !!this.dev?.dungeons });
    return {
      enter: (ask) => d()?.enter(who(), ask) ?? null,
      leave: () => d()?.leave(who()) ?? null,
      current: () => { const r = d()?.runOf(0); return r && { dungeon: r.def.id, tier: r.tier, shared: r.shared, raid: !!r.raid }; },
      claim: (id, kind) => d()?.claim(0, 'me', id, this.player.position, kind) ?? null,
    };
  }

  // A dungeon (or one of a raid's encounters) beaten offline: into the records, as the server
  // would send it.
  onDungeonCleared(run, enc = null) {
    if (enc) this.charLink.do({ op: 'rclear', roll: { raid: run.def.id, enc: enc.def.id, name: enc.def.name, tier: run.tier ?? 0, final: enc === run.raid.last, flawless: !enc.fell } });
    else this.charLink.do({ op: 'dclear', roll: { d: run.def.id, tier: run.tier, name: run.def.name } });
  }

  // Quests that finish where they're done, waiting to be handed in (after a load).
  handInFinished() {
    for (const id of this.quests.pendingAuto()) this.after(1, () => this.quests.isComplete(id) && this.charLink.do({ op: 'turnin', id }));
  }

  // What people call out as you arrive (rpg/storyline.js BARKS): once a visit, over their heads.
  updateBarks() {
    const p = this.player.position;
    for (const b of BARKS) {
      const id = this.quests.npcOf(b.npc);
      const key = `${b.npc}|${b.line}`;
      if (!id || this.barked.has(key) || !this.quests.whenHolds(b.when)) continue;
      const npc = this.npcs.find((n) => n.id === id);
      if (!npc || Math.hypot(npc.position.x - p.x, npc.position.z - p.z) > 9) continue;
      this.barked.add(key);
      npc.bark = { text: b.line, until: this.time + 5 };
      this.audio.chime?.();
    }
  }

  // The quests the HUD lists, in order: the tracked one, then the story's, then the rest.
  trackedOrder(max = 3) {
    const log = this.quests;
    const ids = Object.keys(log.active);
    const order = [this.tracked, ...ids.filter((id) => log.defs.get(id)?.kind === 'story'), ...ids.sort((a, b) => (a === 'bounty') - (b === 'bounty'))];
    return order.filter((id, i, a) => id && log.active[id] && a.indexOf(id) === i).slice(0, max);
  }

  setTracked(id) {
    this.tracked = this.tracked === id ? null : id;
    this._wpTime = undefined;
    this.save();
  }

  // One of the folk in a role within talking range (a smith, to reset talents).
  nearRole(role) {
    const p = this.player.position;
    return this.world.folkNear(p.x, p.z, 9, role).length > 0;
  }

  // Where you wake after a fall: by the innkeeper whose bed you last rested in, else Brightwater.
  homePoint() {
    if (this.dungeonView.active) return this.dungeonView.homePoint();
    const n = this.settings.home ? this.world.npcById(this.settings.home) : null;
    if (!n) return { x: HUB.x, z: HUB.z + 4, facing: Math.PI, name: HUB.name };
    return { x: n.x + Math.sin(n.facing) * 2.2, z: n.z + Math.cos(n.facing) * 2.2, facing: n.facing + Math.PI, name: this.placeName(this.world.placeOf(n)) };
  }

  // Where the tracked quest points (cached briefly: it's drawn by the compass, map and minimap).
  questWaypoint() {
    if (this._wpTime !== undefined && this.time - this._wpTime < 0.5 && this._wpFor === this.quests) return this._wp;
    this._wpTime = this.time;
    this._wpFor = this.quests;
    this._wp = this.computeWaypoint();
    return this._wp;
  }

  computeWaypoint() {
    // Down in a dungeon: the next thing it asks of you (world/DungeonView.js).
    if (this.dungeonView.active) return this.dungeonView.waypoint();
    const ids = this.trackedOrder(Infinity);
    const p = this.player.position;
    const nearest = (types, pred) => {
      let best = null;
      let bd = Infinity;
      for (const poi of this.world.poisNear(p.x, p.z, 900, types)) {
        if (!pred(poi)) continue;
        const d = Math.hypot(poi.x - p.x, poi.z - p.z);
        if (d < bd) { bd = d; best = poi; }
      }
      return best && { x: best.x, z: best.z, radius: best.radius ?? 3 };
    };
    for (const id of ids) {
      const q = this.quests.defs.get(id);
      if (!q) continue;
      if (this.quests.isComplete(id)) {
        const to = this.quests.returnId(q);
        const npc = to && this.world.npcById(to);
        if (npc) return { x: npc.x, z: npc.z, radius: 2 };
        continue;
      }
      const prog = this.quests.active[id];
      const o = this.quests.objectivesOf(id).find((ob, i) => prog[i] < (ob.count ?? 1));
      if (!o) continue;
      const open = (c) => !this.encounters.isCleared(c.id);
      // Where the story names it: someone to talk to, an object, a place to reach or hold.
      const at = (ref) => {
        const t = this.quests.ref(ref, q);
        return t && { x: t.x, z: t.z, radius: o.type === 'goto' || o.type === 'defend' ? (o.r ?? t.r ?? 4) : 2 };
      };
      if (o.type === 'talk' || o.type === 'choose') { const t = at(o.npc); if (t) return { ...t, kind: 'talk' }; continue; }
      if (o.type === 'use') { const t = at(o.object); if (t) return { ...t, kind: 'use' }; continue; }
      if (o.type === 'goto' || o.type === 'defend') { const t = at(o.at); if (t) return { ...t, kind: o.type }; continue; }
      if (o.type === 'clear') {
        const c = this.world.poiById(o.camp) ?? this.world.poiById(this.quests.ref(o.camp, q)?.poi ?? '');
        if (c) return { x: c.x, z: c.z, radius: c.radius ?? 12, kind: 'clear' };
        const t = this.quests.ref(o.camp, q);
        return t && { x: t.x, z: t.z, radius: t.r ?? 12, kind: 'clear' };
      }
      if (o.tag === 'ironjaw') { const t = at('foundry:gate'); if (t) return { ...t, kind: 'goto' }; }
      const near = o.near ?? o.from?.near;
      if (near) { const t = at(near); if (t) return { ...t, radius: o.r ?? 40, kind: 'goto' }; }
      if (o.type === 'killRace') {
        const t = nearest(['camp'], (c) => c.race === o.race && open(c));
        if (t) return { ...t, kind: 'killRace' };
      }
      if (o.type === 'attune') {
        const t = nearest(['waystone'], (w) => !this.attuned.has(w.id));
        if (t) return { ...t, kind: 'attune' };
      }
      if (o.type === 'chest') {
        const t = nearest(['chest'], (c) => !this.openedChests.has(c.id));
        if (t) return { ...t, kind: 'chest' };
      }
      const t = nearest(['camp'], open);
      if (t) return { ...t, kind: 'goto' };
    }
    const giver = this.npcs.find((n) => n.marker === '!');
    if (giver && !Object.keys(this.quests.active).length) return { x: giver.position.x, z: giver.position.z, radius: 2 };
    return null;
  }

  nearest(list, radius) {
    const p = this.player.position;
    let best = null;
    let bd = Infinity;
    for (const it of list) {
      const d = Math.hypot(it.position.x - p.x, it.position.z - p.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best && { x: best.position.x, z: best.position.z, radius };
  }

  // ---------------------------------------------------------------- interaction
  interactables() {
    const list = [...this.npcs, ...this.props.values(), this.campfire, ...this.dungeonView.interactables()];
    for (const w of this.world.waystones.values()) list.push({ kind: 'waystone', name: w.name, id: w.id, position: w.position });
    for (const c of this.world.chests.values()) if (!c.open) list.push({ kind: 'chest', name: 'Treasure Chest', id: c.id, position: c.position, level: c.level });
    return list;
  }

  interactPrompt(it) {
    if (it.kind === 'dthing') return this.dungeonView.prompt(it);
    if (it.kind === 'gate' && it.n.gate === 'dungeon') return PROPS.waygate.prompt;
    if (it.kind === 'gate' && it.n.gate === 'raid') return 'Use the raid gate';
    if (it.kind === 'object' && this.dungeonAt(it)) return `Go down into ${this.dungeonAt(it).name}`;
    if (it.kind === 'campfire') return 'Rest at the hearth reactor';
    if (it.kind === 'waystone') return this.attuned.has(it.id) ? `${it.name} — open map to travel` : `Attune ${it.name} waystone`;
    if (it.kind === 'chest') return 'Open chest';
    if (it.kind === 'object') return this.quests.wants(it.id) ? OBJECTS[it.n.model]?.prompt ?? 'Use' : `Look at the ${it.name.toLowerCase()}`;
    if (PROPS[it.kind]) return PROPS[it.kind].prompt;
    return `Talk to ${it.name}`;
  }

  interact(it) {
    if (it.kind === 'campfire') this.openMenu(() => this.restDialog());
    else if (it.kind === 'waystone') {
      if (!this.attuned.has(it.id)) this.charLink.do({ op: 'attune', id: it.id });
      else this.openGameMenu('map');
    } else if (it.kind === 'chest') this.openChest(it);
    else if (it.kind === 'board') this.openMenu(() => this.openBoard(it));
    else if (it.kind === 'gate') this.openMenu(() => this.gateDialog(it));
    else if (it.kind === 'warroom') this.openMenu(() => this.warTable(it));
    else if (it.kind === 'object') this.useObject(it);
    else if (it.kind === 'dthing') this.dungeonView.use(it);
    else this.openMenu(() => this.talk(it));
  }

  openChest(it) {
    this.charLink.do({ op: 'chest', id: it.id });
  }

  travelTo(id) {
    if (!this.attuned.has(id)) return;
    this.charLink.do({ op: 'travel', id });
  }

  // Fast travel, once allowed (the 'teleport' result of a travel operation).
  arrive(id, at) {
    const w = this.world.poiById(id);
    // Travelling out of a dungeon: it's left behind.
    if (this.dungeonView.active) this.dungeonView.teardown();
    this.closeMenus();
    const p = this.player;
    const x = at[0];
    const z = at[2];
    p.position.set(x, 0, z);
    this.world.prime(p.position);
    p.position.y = this.world.supportHeight(x, z, 200);
    p.velocity.set(0, 0, 0);
    p.vy = 0;
    this.encounters.disengageAll();
    this.rig.target.copy(p.position);
    this.effects.spawnRing(p.position.clone(), 3.5, 0x58cfff);
    this.hud.banner(w?.name ?? 'Waystone', 'Fast travel');
    this.save();
  }

  updateInteraction() {
    const p = this.player.position;
    let best = null;
    let bd = INTERACT_RANGE;
    for (const it of this.interactables()) {
      const d = Math.hypot(it.position.x - p.x, it.position.z - p.z);
      if (d < bd && Math.abs((it.position.y ?? p.y) - p.y) < 2.5) { bd = d; best = it; }
    }
    if (best && this.focusedDrop) best = null;
    this.hud.setPrompt(best ? `<kbd>E</kbd> ${this.interactPrompt(best)}` : null);
    if (best && this.input.wasPressed('KeyE')) this.interact(best);
  }

  // Talking to someone. Anyone a quest involves (a giver, the story's people, whoever a stage
  // sends you to) hears from the server first — their line for the stage, a fresh offer — then
  // the conversation: what they say, a question to answer, quests to hand in or take on, and what
  // they're there for (wares, a bed, a talent reset).
  // `line`: what they say if the talk itself brings nothing (their thanks for a quest handed in).
  async talk(npc, line = null) {
    const log = this.quests;
    const involved = QUEST_ROLES.has(npc.role) || npc.role === 'story' || log.wants(npc.id);
    this.said = [];
    if (involved) await this.charLink.do({ op: 'talk', npc: npc.id });
    if (!this.dialogue.isOpen && this.state !== 'menu') return;
    this.showTalk(npc, this.said.at(-1)?.text ?? line);
  }

  showTalk(npc, said = null) {
    const log = this.quests;
    const ready = log.readyToTurnIn(npc.id);
    // The story's quests first: what they say is what they say first.
    const avail = (QUEST_ROLES.has(npc.role) || npc.role === 'story' ? log.available(npc.id) : []).sort((a, b) => (b.kind === 'story') - (a.kind === 'story'));
    const going = log.inProgress(npc.id);
    const choice = Object.keys(log.active).map((id) => [id, log.choiceAt(id, npc.id)]).find(([, c]) => c);
    const options = [];
    let contextQuest = choice ? log.defs.get(choice[0]) : null;
    contextQuest ??= this.said.at(-1)?.quest ? log.defs.get(this.said.at(-1).quest) : null;
    let text = said;
    if (choice) {
      const [qid, c] = choice;
      c.options.forEach((opt, i) => options.push({
        label: opt.label, action: `${questKindLabel(contextQuest)} · Choose`, cls: `quest ${contextQuest?.kind ?? ''}`,
        onClick: () => {
          this.said = [];
          if (this.charLink.do({ op: 'choose', quest: qid, i, npc: npc.id }) && !this.moments.active) this.showTalk(npc, this.said.at(-1)?.text ?? null);
        },
      }));
      text ??= log.fill(log.stageOf(qid)?.say?.[Object.keys(log.stageOf(qid).say ?? {})[0]] ?? '', log.defs.get(qid)) || null;
    }
    for (const q of ready) {
      contextQuest ??= q;
      options.push({ label: q.title, action: `${questKindLabel(q)} · Turn in`, cls: `quest ${q.kind ?? ''}`, onClick: () => this.completeQuest(q.id, npc) });
    }
    if (!text && ready.length) text = log.pick(ready[0].turnIn);
    // Taken: they tell you where to start (unless a story moment takes over).
    for (const q of avail) {
      contextQuest ??= q;
      options.push({
        label: q.title, action: `${questKindLabel(q)} · Accept`, cls: `quest ${q.kind ?? ''}`,
        onClick: () => {
          if (!this.charLink.do({ op: 'accept', id: q.id }) || this.moments.active) return;
          const first = log.stageOf(q.id)?.text ?? q.progress;
          this.showTalk(npc, first ? log.fill(first, q) : null);
        },
      });
    }
    if (!text && avail.length) text = log.fill(avail[0].offer, avail[0]);
    if (!text && going.length) text = log.fill(log.stageOf(going[0].id)?.text ?? going[0].progress ?? '', going[0]);
    contextQuest ??= going[0] ?? log.wantedQuest(npc.id);
    // What they're there for.
    if (npc.role === 'trader') options.push({ label: 'Browse wares', onClick: () => this.openShop(npc) });
    if (npc.role === 'innkeeper') options.push({ label: 'Rest', onClick: () => this.restDialog(npc) });
    if (npc.role === 'smith') options.push({ label: 'Reset talents', onClick: () => this.smithDialog(npc) });
    if (!text) {
      text = npc.def.greeting ?? (npc.def.lines ? npc.def.lines[npc.lineIndex++ % npc.def.lines.length] : null)
        ?? (npc.role === 'trader' ? 'Steel, powder and sorcery — fair prices, mostly. Got anything to sell?' : 'Keep your blade sharp out there.');
    }
    this.dialogue.open({ name: npc.name, title: npc.title, text, options, questKind: contextQuest?.kind ?? null });
  }

  async completeQuest(id, npc) {
    const q = this.quests.defs.get(id);
    const ok = await this.charLink.do({ op: 'turnin', id });
    if (this.moments.active) return;
    this.talk(npc, ok && q?.turnIn ? this.quests.fill(q.turnIn, q) : null);
  }

  // A trader's wares: the shop shows what their stock covers (rpg/CharacterCore.js 'buy').
  openShop(npc) {
    this.trading = { name: npc.name, title: npc.title, stock: npc.def?.stock ?? 'all' };
    this.openGameMenu('inventory', { shop: true });
  }

  // A quest board's three postings (online, the server writes them): each to take on, follow up
  // or hand in.
  async openBoard(board) {
    await this.charLink.do({ op: 'talk', npc: board.id });
    if (!this.dialogue.isOpen && this.state !== 'menu') return;
    const log = this.quests;
    const notes = [];
    const options = [];
    for (let k = 0; k < 3; k++) {
      const slot = `${board.id}#${k}`;
      const ready = log.readyToTurnIn(slot)[0];
      const going = log.inProgress(slot)[0];
      const offer = ready || going ? null : log.offer(slot);
      if (ready) {
        const note = { title: ready.title, tag: 'Ready to turn in', text: ready.turnIn, state: 'ready' };
        note.optionIndex = options.length;
        options.push({ label: ready.title, action: 'Turn in quest', cls: 'quest', onClick: async () => { await this.charLink.do({ op: 'turnin', id: ready.id }); this.openBoard(board); } });
        notes.push(note);
      } else if (going) notes.push({ title: going.title, tag: 'In progress', text: going.progress, state: 'active' });
      else if (offer) {
        const note = { title: offer.title, tag: `Available · Reward ${rewardText(offer)}`, text: offer.offer, state: 'available' };
        note.optionIndex = options.length;
        options.push({ label: offer.title, action: 'Accept quest', cls: 'quest', onClick: () => { this.charLink.do({ op: 'accept', id: offer.id }); this.openBoard(board); } });
        notes.push(note);
      }
    }
    this.dialogue.open({
      name: board.name, title: board.title, notes, options,
      text: notes.length ? 'Review each posting below. Active work and new contracts are listed separately.' : 'Nothing posted just now. The Wardens pin up more every day.',
    });
  }

  gateDialog(gate) {
    // A dungeon gate is the Wardens' waygate: down into any dungeon they know the way into, as a
    // private run (sim/Dungeons.js).
    if (gate.n.gate === 'dungeon') {
      this.dialogue.open({
        name: 'Wardens\' Waygate', title: gate.title,
        text: 'The seal on this arch was the Wardens\' doing. Step through and you stand at the bottom of any dungeon they know the way into — a copy of your own, for you and your party.',
        options: dungeonChoices(this.quests.flags, { dev: !!this.dev?.dungeons }).map(({ def, locked }) => ({
          label: `${def.name} · Level ${def.level}+${locked ? ' · sealed' : ''}`, cls: locked ? '' : 'quest',
          onClick: () => (locked ? this.hud.toast(`${def.name} is sealed. The story hasn't got that far yet.`) : this.dungeonDialog(def, 'gate', gate)),
        })),
      });
      return;
    }
    // A raid gate: into the raids (ui/RaidUI.js).
    if (gate.n.gate === 'raid') { this.raidUI.gateDialog(gate); return; }
    this.dialogue.open({
      name: gate.name, title: gate.title, options: [],
      text: 'The seal hums under your hand, violet and cold. Somewhere below lies the way down — the Wardens will open it once they know what waits there.',
    });
  }

  // A city's war table: the strongholds the scouts have marked round the city — and the raid
  // board: the raids through the gate yard's raid gate, and your raid group (ui/RaidUI.js).
  warTable(t) {
    const p = t.position;
    const forts = this.world.poisNear(p.x, p.z, 720, ['camp']).filter((c) => c.stronghold)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 4);
    const notes = forts.map((c) => ({
      title: c.name, tag: `Lv ${c.level}${this.encounters.isCleared(c.id) ? ' · broken' : ''}`,
      text: `${RACE[c.race].name.replace(/^the /, 'The ')}: about ${Math.round(Math.hypot(c.x - p.x, c.z - p.z) / 10) * 10} metres ${compass(c.x - p.x, c.z - p.z)}.`,
    }));
    const raid = this.raidUI;
    const group = !this.net.inWorld ? ' Offline, you go into a raid alone.' : raid.raid ? ` Your raid group: ${raid.size} strong.` : ' Form a raid group here to take other parties with you.';
    this.dialogue.open({
      name: t.name, title: t.title, notes: [...notes, ...raid.warNotes()], options: raid.warOptions(),
      text: `${notes.length ? 'Every stronghold the scouts have found, marked on the holo-map.' : 'The holo-map is quiet: no strongholds marked near the city yet.'} Beside it, the raid board: the forces the Wardens send through the raid gate in the gate yard.${group}`,
    });
  }

  // A smith at a workshop: talents reset (free below level 10, then for gold).
  smithDialog(npc) {
    const s = this.stats;
    const cost = respecCost(s.level);
    const spent = Object.keys(s.talents).length > 0;
    this.dialogue.open({
      name: npc.name, title: npc.title,
      text: `${npc.def.greeting} ${spent ? (cost ? `For you, ${cost} gold.` : 'For you, nothing — you\'re still green.') : 'Though you\'ve nothing to unlearn yet.'}`,
      options: [
        ...(spent ? [{
          label: cost ? `Reset talents · ${cost}g` : 'Reset talents · free',
          onClick: () => {
            if (this.charLink.do({ op: 'respec' })) this.closeMenus();
            else this.hud.toast(`Not enough gold (${cost}g)`);
          },
        }] : []),
        { label: 'Talents', onClick: () => this.openGameMenu('talents') },
      ],
    });
  }

  // Rest at Brightwater's reactor, or with an innkeeper (`npc`): you wake there after a fall.
  restDialog(npc = null) {
    const where = npc ? this.placeName(this.world.placeOf(this.world.npcById(npc.id))) : HUB.name;
    const home = this.homePoint().name;
    this.dialogue.open({
      name: npc ? npc.name : 'Hearth Reactor', title: npc ? npc.title : HUB.name,
      // The realm's camps are shared and keep their own time; resting only touches your own world.
      text: `${npc ? npc.def.greeting : 'The reactor hums.'} ${this.net.inWorld
        ? 'Resting restores you fully, your treasure chests refill, and the traders restock.'
        : 'Resting restores you fully — but the monsters return to their camps, treasure chests refill, and the traders restock.'} ${home === where ? 'You\'ll wake here if you fall.' : `Rest, and you'll wake here if you fall (now: ${home}).`}`,
      options: [{
        label: 'Rest', onClick: async () => {
          if (!(await this.charLink.do({ op: 'rest', ...(npc ? { at: npc.id } : {}) }))) return;
          const p = this.player;
          p.hp = p.maxHp;
          p.mana = p.maxMana;
          p.stamina = p.maxStamina;
          p.statuses = {};
          p.phoenixUsed = false;
          this.encounters.respawnAll();
          for (const id of this.world.chests.keys()) this.world.setChestOpen(id, false);
          this.save();
          this.closeMenus();
          this.hud.banner('Rested', `You'll wake in ${where} · ${this.net.inWorld ? 'fresh stock and full health' : 'the land stirs again'}`);
        },
      }],
    });
  }

  // Offline: the trader restocks for the character's level (online the server stocks the trader).
  refreshShop() {
    this.char.apply({ op: 'stock', roll: { stock: stockFor(this.stats.level), fine: fineStockFor(this.stats.level) } });
  }

  // ---------------------------------------------------------------- loot
  // Shows an item lying on the ground (the character's rules decide what's there: `gid` is its id).
  dropWeapon(weapon, position, pop = true, gid = null) {
    const drop = new LootDrop(this, weapon, position.clone(), { pop });
    drop.gid = gid;
    this.drops.push(drop);
    this.scene.add(drop.root);
    return drop;
  }

  // Online: what the server says lies on the ground for this character.
  loadGround(list = []) {
    for (const d of [...this.drops]) this.removeDrop(d);
    this.char.ground.clear();
    for (const g of list) {
      let item;
      try { item = itemFromRecipe(g.recipe); } catch { continue; }
      this.char.ground.set(g.gid, { gid: g.gid, item, at: g.at, born: 0 });
      this.dropWeapon(item, new THREE.Vector3().fromArray(g.at), false, g.gid);
    }
  }

  // Online: the server's copy of the character replaces ours (after a refused change, or drift).
  loadCharacter(data, ground) {
    this.stats.load(data.stats);
    this.quests.load(data.quests);
    this.player.inventory.load(data.inventory);
    this.attuned.clear();
    for (const id of data.attuned ?? []) this.attuned.add(id);
    this.openedChests.clear();
    for (const id of data.chests ?? []) this.openedChests.add(id);
    Object.assign(this.settings, data.settings);
    this.shop.stock = (data.shop ?? []).map((r) => { try { return itemFromRecipe(r); } catch { return null; } }).filter(Boolean);
    this.shop.fine = (data.fine ?? []).map((r) => { try { return itemFromRecipe(r); } catch { return null; } }).filter(Boolean);
    for (const id of this.world.waystones.keys()) this.world.setWaystoneActive(id, this.attuned.has(id));
    for (const id of this.world.chests.keys()) this.world.setChestOpen(id, this.openedChests.has(id));
    if (ground) this.loadGround(ground);
    this.char.loadProgress(data);
    this.player.refreshAppearance();
    this.refreshAllObjects();
    this.handInFinished();
    this.refreshMenus();
  }

  // What came of a change to the character (rpg/CharacterCore.js), shown.
  onCharFx(list = [], op = null) {
    let gear = false;
    let n = 0;
    for (const f of list) {
      switch (f.k) {
        case 'gear': gear = true; break;
        case 'toast': this.hud.toast(f.text); break;
        case 'banner': this.hud.banner(f.title, f.sub); break;
        case 'number': this.effects.damageNumber(_v.fromArray(f.at), f.text, 'xp'); break;
        case 'achievement': {
          const a = ACHIEVEMENT[f.id];
          if (!a) break;
          this.hud.banner('Achievement', `${a.name} · +${a.points}${a.title ? ` · title "${a.title}"` : ''}`);
          this.audio.cell?.(this.player.position);
          this.chat?.add?.({ ch: 'system', text: `Achievement: ${a.name} — ${a.desc}` });
          break;
        }
        case 'codex': this.hud.toast(`${f.text} — Journal (L)`); break;
        case 'title': if (this.net.inWorld) this.net.sendProfile(); break;
        case 'levelup': {
          const p = this.player;
          p.hp = this.stats.maxHp;
          p.mana = this.stats.maxMana;
          this.hud.banner('LEVEL UP', `Level ${f.level} · ${f.points} talent point${f.points > 1 ? 's' : ''} — press N`);
          if (!this.net.inWorld) this.save();
          break;
        }
        case 'ground': {
          // Loot from a kill appears a few frames later (one item per frame), so building its
          // model never lands on the frame of the killing blow.
          const at = new THREE.Vector3().fromArray(f.at);
          if (op?.op === 'reward') this.after(0.05 + 0.03 * n++, () => this.char.ground.has(f.gid) && this.dropWeapon(f.item, at, f.pop, f.gid));
          else this.dropWeapon(f.item, at, f.pop, f.gid);
          break;
        }
        case 'unground': {
          const d = this.drops.find((x) => x.gid === f.gid);
          if (d) this.removeDrop(d);
          break;
        }
        case 'attuned': {
          this.world.setWaystoneActive(f.id, true);
          const w = this.world.waystones.get(f.id);
          if (w) this.effects.spawnRing(w.position.clone().setY(w.position.y + 0.2), 3, 0x58cfff);
          this.hud.banner('Waystone Attuned', `${f.name} — fast travel from the map [M]`);
          break;
        }
        case 'chest': {
          this.world.setChestOpen(f.id, true);
          const c = this.world.chests.get(f.id);
          if (c) {
            const pos = c.position.clone().setY(c.position.y + 0.8);
            this.effects.damageNumber(pos.clone().setY(pos.y + 1), `+${f.gold}g`, 'xp');
            this.effects.spawnRing(pos, 2, 0xffd23f);
          }
          break;
        }
        case 'teleport': this.arrive(f.id, f.at); break;
        // Dungeons: in, out, and a chest opened.
        case 'dungeon': this.dungeonView.enter(f.run, f.at, f.facing); break;
        case 'outside': this.dungeonView.leave(f.at); break;
        case 'dchest': this.dungeonView.opened(f.id); this.hud.toast(`+${f.gold}g`); break;
        // The quest log's: a line said, a moment, a quest to hand in where it finished, an object.
        case 'say': this.said.push(f); break;
        case 'moment': this.moments.play(f.id); break;
        case 'autoturnin': this.after(0.8, () => this.quests.isComplete(f.id) && this.charLink.do({ op: 'turnin', id: f.id })); break;
        case 'used': {
          this.refreshObject(f.id);
          const n = this.world.npcById(f.id);
          if (n) this.effects.spawnRing(new THREE.Vector3(n.x, this.world.groundHeight(n.x, n.z) + 0.3, n.z), 2.5, 0xffd23f);
          break;
        }
      }
    }
    if (gear) this.player.refreshAppearance();
    if (op?.op === 'reward') this.onKillFeat();
    if (list.length) this.refreshMenus();
  }

  // Menus showing the character redraw after it changes.
  refreshMenus() {
    if (this.inventoryUI.isOpen && !this.inventoryUI.drag) this.inventoryUI.render();
    if (this.menu.isOpen && ['character', 'talents', 'journal'].includes(this.menu.page)) this.menu.renderTab();
  }

  removeDrop(drop) {
    const i = this.drops.indexOf(drop);
    if (i !== -1) this.drops.splice(i, 1);
    this.scene.remove(drop.root);
    drop.dispose();
    if (this.focusedDrop === drop) this.focusedDrop = null;
  }

  // Loot is chosen with the reticle: the drop within reach whose column the screen-centre ray
  // passes through (or whose base it lands beside), nearest first, and not behind anything the
  // aim ray hit first. Tap F picks it up; hold F swaps it for what you're using.
  updateLootFocus(dt) {
    const p = this.player;
    const cam = this.camera.position;
    const aim = this.aim;
    let best = null;
    let bestT = Infinity;
    this.lootNear = false;
    for (const d of this.drops) {
      if (d.airborne) continue;
      const pos = d.position;
      if (Math.hypot(pos.x - p.position.x, pos.z - p.position.z) > PICKUP_RANGE || Math.abs(pos.y - p.position.y) > 3) continue;
      this.lootNear = true;
      let t = rayCylinder(cam, aim.dir, pos.x, pos.z, LOOT_PICK_R, pos.y - 0.1, pos.y + 1.3);
      if (t > aim.distance + 0.3) t = Infinity;
      if (t === Infinity && Math.hypot(aim.point.x - pos.x, aim.point.z - pos.z) < 0.9 && Math.abs(aim.point.y - pos.y) < 1) t = aim.distance;
      if (t < bestT) { bestT = t; best = d; }
    }
    this.focusedDrop = best;
    const inv = p.inventory;
    const canPickUp = best ? inv.canAdd(best.weapon) : true;
    this.hud.setLoot(best?.weapon ?? null, p.weapon, canPickUp, inv.armor, this.stats.gearSets);

    // F: a tap (released before HOLD_SWAP) picks up; holding swaps. Looking away cancels.
    if (best && this.input.wasPressed('KeyF')) this.fHold = { drop: best, t: 0, done: false };
    const h = this.fHold;
    if (h) {
      if (!this.input.down('KeyF')) {
        if (!h.done && h.drop === best && inv.canAdd(best.weapon)) this.pickUp(best);
        this.fHold = null;
      } else if (!h.done) {
        if (h.drop !== best) this.fHold = null;
        else if ((h.t += dt) >= HOLD_SWAP) {
          h.done = true;
          this.swapPickUp(best);
        }
      }
    }
    this.hud.setLootHold(this.fHold && !this.fHold.done ? this.fHold.t / HOLD_SWAP : 0);
  }

  // Hold F: the item takes the place of what you're using — the wielded weapon, or the armour in
  // its slot — and that is left on the ground where the new one lay.
  swapPickUp(drop) {
    if (drop.gid !== null) this.charLink.do({ op: 'pick', gid: drop.gid, swap: true, at: drop.position.toArray() });
  }

  // Dev tools (offline): an item straight into the inventory, or at your feet if it's full.
  giveWeapon(weapon) {
    const fx = [];
    this.char.give(weapon, this.char.gid(), fx);
    this.onCharFx(fx);
  }

  pickUp(drop) {
    if (drop.gid !== null) this.charLink.do({ op: 'pick', gid: drop.gid, at: drop.position.toArray() });
  }

  // ---------------------------------------------------------------- combat services
  findSoftTarget(origin, facing, range, maxAngle) {
    let best = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'spawn') continue;
      const dx = e.position.x - origin.x;
      const dz = e.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - facing));
      if (ang > maxAngle) continue;
      const score = d + ang * 3;
      if (score < bestScore) { best = e; bestScore = score; }
    }
    return best;
  }

  explode(pos, radius, damage, attacker, weapon, { color = 0xffb347, knockback = 8, scaled = false, element, inflict } = {}) {
    const center = pos.clone();
    this.post.shockwave(center, radius);
    this.effects.spawnBurst(center, radius, color, element ?? weapon?.element ?? 'none');
    const kind = (attacker !== this.player && !attacker.remote) || weapon?.cls === 'melee' || !weapon ? 'quake' : weapon.cls === 'magic' ? 'arcane' : 'blast';
    this.audio.explosion(center, radius, kind, element ?? weapon?.element ?? 'none');
    // Another player's blast is only a show here (the server will resolve its damage).
    const near = attacker.remote ? Math.max(0, 1 - center.distanceTo(this.player.position) / 30) : 1;
    this.rig.addShake(0.25 * near);
    const targets = attacker.remote ? [] : attacker.faction === 'player' ? this.enemies : [this.player];
    for (const t of targets) {
      if (!t.alive) continue;
      _v.subVectors(t.position, center).setY(0);
      const d = _v.length();
      if (d > radius + t.radius) continue;
      if (t.position.y - center.y > radius * 0.8 || center.y - (t.position.y + t.height) > radius * 0.8) continue;
      const dir = d > 0.01 ? _v.clone().divideScalar(d) : new THREE.Vector3(1, 0, 0);
      dealDamage(this, {
        attacker, target: t, base: damage * (1 - 0.5 * Math.min(d / radius, 1)), weapon,
        direction: dir, knockback, source: 'explosion', scaled, element, inflict,
      });
    }
  }

  // A rune that arms on the ground and detonates after `delay` (Codex spells).
  runeStrike(pos, radius, damage, weapon, color, delay, knockback = 8) {
    this.net?.runeFx(pos, radius, color, delay);
    this.effects.spawnRune(pos, radius, color, delay);
    this.audio.rune(pos, delay);
    this.after(delay, () => {
      this.explode(pos, radius, damage, this.player, weapon, { color, knockback });
      this.effects.spawnPillar(pos, radius, color);
    });
  }

  // The world's encounters (camps and roaming packs): the local sim's offline.
  get encounters() { return this.enemyLayer.encounters; }

  spawnEnemy(type, position, opts) {
    return this.enemyLayer.spawn(type, position, opts);
  }

  // ---------------------------------------------------------------- events
  onHit(attacker, target, hit) {
    _v.copy(target.position);
    _v.y += target.height * 0.7;
    const elColor = hit.element !== 'none' ? ELEMENTS[hit.element].css : null;

    if (this.prefs.gore && target !== this.player && target.type?.race && target.type.race !== 'synth' && hit.source !== 'status') {
      const normal = hit.normal?.clone?.() ?? hit.direction?.clone?.() ?? new THREE.Vector3(0, 0.5, 0);
      this.effects.blood(_v, normal, hit.crit ? 1.5 : 1);
    }

    if (hit.source === 'status') {
      this.effects.damageNumber(_v, hit.damage, '', elColor);
      return;
    }
    if (hit.crit) this.post.hitFlash(0.32);
    else if (hit.source === 'explosion' || (hit.attack?.hitstop ?? 0) >= 0.08) this.post.hitFlash(0.18);
    if (hit.element !== 'none') this.effects.elementHit(_v, hit.element, hit.crit ? 8 : 5);
    const fromPlayer = attacker === this.player;
    if (target === this.player) this.audio.playerHurt(hit.damage / Math.max(1, this.player.maxHp));
    else if (fromPlayer) {
      const w = this.player.weapon;
      if (hit.source === 'melee') this.audio.meleeHit(w, _v, hit.crit);
      else if (hit.source === 'projectile') {
        if (w?.cls === 'magic') this.audio.magicHit(_v, hit.element, hit.crit);
        else this.audio.bulletHit(_v, hit.crit);
      } else this.audio.tick(hit.crit);
    }
    if (hit.source === 'melee') this.hitstop(hit.attack?.hitstop ?? 0.05, attacker, target);
    else if (hit.source === 'explosion') this.hitstop(0.04, target);
    this.rig.addShake(fromPlayer ? (hit.attack?.shake ?? 0.04) : (hit.attack?.shake ?? 0.35));
    if (fromPlayer) this.hud.hitMarker(hit.crit, false);
    if (fromPlayer && hit.source === 'melee' && this.firstPerson) this.viewModel.onImpact(hit.crit);
    if (fromPlayer && (hit.source === 'melee' || (hit.source === 'explosion' && this.player.weaponClass === 'melee'))) this.player.addCombo();

    if (hit.source === 'melee') {
      const sparkColor = hit.element !== 'none' ? ELEMENTS[hit.element].color : hit.crit ? 0xffd23f : 0xfff6d0;
      this.effects.spawnSparks(_v, fromPlayer ? sparkColor : 0xff6a5a, hit.crit ? 14 : 8);
    }
    const weakPoint = fromPlayer && hit.component === 'head';
    const kind = !fromPlayer ? 'hurt' : hit.crit ? 'crit' : '';
    this.effects.damageNumber(_v, hit.damage, kind, fromPlayer && !hit.crit ? elColor : null, weakPoint ? 'weakpoint' : null);
  }

  // A beat of impact freeze for the characters involved in a hit.
  hitstop(duration, ...chars) {
    if (this.hitstopTimer <= 0) this.hitstopSet.clear();
    this.hitstopTimer = Math.max(this.hitstopTimer, duration);
    for (const c of chars) if (c) this.hitstopSet.add(c);
  }

  grantXp(amount) {
    const levels = this.stats.addXp(amount);
    if (levels > 0) {
      const p = this.player;
      p.hp = this.stats.maxHp;
      p.mana = this.stats.maxMana;
      this.hud.banner('LEVEL UP', `Level ${this.stats.level} · ${this.stats.points} talent point${this.stats.points > 1 ? 's' : ''} — press N`);
      this.save();
    }
  }

  // Offline: a kill's rewards, rolled and applied here (online the server credits kills).
  onEnemyKilled(enemy) {
    this.audio.kill(enemy.position, !!(enemy.type.boss || enemy.elite));
    this.pickups.onKill(enemy);
    if (this.net.inWorld) return;
    const roll = rewardRoll(enemy, this.stats.level, () => this.char.gid(), this.char.tier);
    const quest = questDrops(this.quests, { ...roll.kill, at: roll.at });
    if (quest.length) roll.quest = quest;
    this.charLink.do({ op: 'reward', roll });
  }

  // Offline: a place held against its waves (online the server says so).
  onDefended(d) {
    if (this.net.inWorld) return;
    for (const [id, i] of heldObjectives(this.quests, d.key)) this.charLink.do({ op: 'defended', roll: { id, i } });
  }

  // A camp emptied near us: offline the quest tally (and a stormed stronghold's bonus) moves here;
  // online the server sends them.
  onCampCleared(camp) {
    if (!this.net.inWorld) {
      this.charLink.do({ op: 'camp', id: camp.def.id, roll: {} });
      const d = camp.def;
      if (d.stronghold) {
        const at = [d.x, this.world.groundHeight(d.x, d.z), d.z];
        this.charLink.do({ op: 'bonus', roll: bonusRoll({ title: `${d.name} stormed`, kind: 'stronghold', xp: strongholdXp(camp), level: d.level, race: d.race, items: 2, at }, this.stats.level, () => this.char.gid(), this.settings.threat) });
      }
    }
    this.hud.toast(`${camp.def.name} cleared`);
  }

  // Offline: a warband wiped out (online the server rolls the bonus).
  onHordeBroken(pack, last) {
    if (this.net.inWorld) return;
    const at = [last.position.x, last.position.y, last.position.z];
    this.charLink.do({ op: 'bonus', roll: bonusRoll({ title: 'Warband broken', kind: 'warband', xp: pack.xp * 0.5, level: pack.level, race: pack.race, items: 1, at }, this.stats.level, () => this.char.gid(), this.settings.threat) });
  }

  // What only this screen sees goes into the character's records: offline, the places visited
  // (online the server watches where we go); always, the feats — a long melee combo.
  updateRecords(dt) {
    const R = this.char.records;
    const below = inPocket(this.player.position.x);
    if (!this.net.inWorld && !below && (this.visitTimer = (this.visitTimer ?? 0) - dt) <= 0) {
      this.visitTimer = 2;
      const p = this.player.position;
      const roll = visitRoll(this.world, p.x, p.z, R);
      if (roll) this.charLink.do({ op: 'visit', roll });
    }
    // Offline, what the server watches for quests (rpg/questWatch.js): places reached, places to hold.
    if (!this.net.inWorld && !below && this.player.alive && (this.questTimer = (this.questTimer ?? 0) - dt) <= 0) {
      this.questTimer = 1;
      const p = this.player.position;
      for (const [id, i] of reachedPlaces(this.quests, p.x, p.z)) this.charLink.do({ op: 'reach', roll: { id, i } });
      const d = defenceAt(this.quests, this.world, p.x, p.z);
      if (d) this.enemyLayer.sim?.encounters.defend(d);
    }
    const combo = this.player.combo;
    if (combo >= 25 && combo > R.bestCombo && (combo % 25 === 0 || combo === 50)) this.charLink.do({ op: 'feat', f: 'combo', v: combo });
  }

  // A kill credited to us: kills close together, and from the air, are feats.
  onKillFeat() {
    const now = performance.now();
    this.killTimes = (this.killTimes ?? []).filter((t) => now - t < 2000);
    this.killTimes.push(now);
    const n = this.killTimes.length;
    if (n >= 3 && n > this.char.records.bestMulti) this.charLink.do({ op: 'feat', f: 'multi', v: n });
    if (!this.player.grounded && this.player.alive && this.char.records.airKills < 10) this.charLink.do({ op: 'feat', f: 'air' });
  }

  // In a fight: something is after us, or we were hurt a moment ago.
  inCombat() {
    if (this.player.alive && (this.player.calm ?? 99) < 4) return true;
    return this.enemies.some((e) => e.alive && e.engaged && e.foe === this.player);
  }

  onPlayerDeath() {
    this.closeMenus(false);
    this.chat.close();
    this.state = 'dead';
    this.encounters.disengageAll();
    setTimeout(() => {
      if (this.state !== 'dead') return;
      this.releaseMouse();
      this.hud.showOverlay('YOU FELL', `You'll wake in ${this.homePoint().name}. Press R or click below.`, [
        { label: 'Rise again', onClick: () => this.respawn() },
      ]);
    }, 1400);
  }

  respawn() {
    this.charLink.do({ op: 'respawn' });
    this.player.revive();
    const home = this.homePoint();
    this.player.position.set(home.x, 0, home.z);
    this.world.prime(this.player.position);
    this.player.position.y = this.world.supportHeight(home.x, home.z, 200);
    this.player.facing = home.facing;
    this.resume();
    this.save();
  }
}

// Building the world is one long, busy step: say so (and let that paint) before starting it.
const loadingStep = document.getElementById('loading-step');
if (loadingStep) loadingStep.textContent = 'Building the world…';
await new Promise((r) => setTimeout(r, 50));
window.game = new Game();
