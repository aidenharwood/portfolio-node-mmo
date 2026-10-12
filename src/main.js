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
import { settlementFolk, KIND_TITLE } from './world/settlements.js';
import { HUB } from './world/Gen.js';
import { Discovery } from './world/Discovery.js';
import { MapUI } from './ui/MapUI.js';
import { Player } from './entities/Player.js';
import { EnemyLayer } from './entities/EnemyLayer.js';
import { NPC, INTERACT_RANGE } from './entities/NPC.js';
import { wrapAngle } from './entities/Character.js';
import { Effects } from './fx/Effects.js';
import { HUD } from './ui/HUD.js';
import { WorldLabels } from './ui/WorldLabels.js';
import { Minimap } from './ui/Minimap.js';
import { InventoryUI } from './ui/InventoryUI.js';
import { DialogueUI } from './ui/DialogueUI.js';
import { GameMenu } from './ui/GameMenu.js';
import { TitleMenu } from './ui/TitleMenu.js';
import { Thumbnails } from './ui/Thumbnails.js';
import { Stats } from './rpg/Stats.js';
import { QuestLog, RACE } from './rpg/Quests.js';
import { Projectiles } from './combat/Projectiles.js';
import { Aim, rayCylinder } from './combat/Aim.js';
import { dealDamage } from './combat/Damage.js';
import { generateWeapon } from './items/WeaponGenerator.js';
import { generateArmor } from './items/ArmorGenerator.js';
import { itemFromRecipe } from './items/items.js';
import { LootDrop } from './items/LootDrop.js';
import { BACKPACK_SIZE } from './items/Inventory.js';
import { ELEMENTS } from './items/elements.js';
import { lookFromChoice } from './models/heroLooks.js';
import { Net } from './net/Net.js';
import { Remotes } from './net/Remotes.js';
import { ChatUI } from './ui/ChatUI.js';
import { PartyUI } from './ui/PartyUI.js';
import { TradeUI } from './ui/TradeUI.js';
import { SocialUI } from './ui/SocialUI.js';
import { TouchControls } from './ui/TouchControls.js';
import { CharacterCore, rewardRoll, stockFor } from './rpg/CharacterCore.js';
import { CharacterLink } from './net/CharacterLink.js';

const PICKUP_RANGE = 5;
const LOOT_PICK_R = 0.75;  // radius of the column round a drop that the reticle can catch
const HOLD_SWAP = 0.45;    // seconds F is held to swap an item for the one in use
// The game menu's hotkeys and the tab each opens.
const MENU_KEYS = { KeyI: 'inventory', Tab: 'inventory', KeyM: 'map', KeyL: 'journal', KeyP: 'character', KeyO: 'social', KeyG: 'guild' };
// What the character "hears" while a menu is up: nothing (it stands, but the world goes on).
const IDLE_INPUT = { down: () => false, wasPressed: () => false, mouseDX: 0, mouseDY: 0, wheel: 0 };
const MOVING = 4010; // close code: the realm is moving us to another layer (reconnect at once)

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
    // Phones and tablets go without multisampling: it costs too much at their pixel densities.
    this.renderer = new THREE.WebGLRenderer({ antialias: !TOUCH_DEVICE });
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
    this.shop = { stock: [] };
    // title | playing | menu (a menu or dialogue is up; the world keeps running) | paused (frozen:
    // single-player in the background, or a blocking overlay) | dead | dev
    this.state = 'title';
    this.backgroundPause = false;
    this.menuOpenedAt = 0;
    this.fullscreenDeclined = false; // the player left fullscreen: don't force it back this session
    this.zone = null;

    this.npcs = NPCS.map((def) => new NPC(this, def));
    for (const n of this.npcs) this.scene.add(n.root);
    // Settlements bring their folk with them as they stream in, and take them when they go.
    this.seenLandmarks = new Set();
    this.world.onPoiLoad = (p) => { if (p.type === 'settlement') this.addSettlementFolk(p); };
    this.world.onPoiUnload = (p) => { if (p.type === 'settlement') this.removeSettlementFolk(p); };
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
    this.enemyLayer.clear();
    this.grass?.reset();
    for (const d of this.drops) { this.scene.remove(d.root); d.dispose(); }
    if (this.player) this.scene.remove(this.player.root);
    this.drops = [];
    this.projectiles.clear();
    this.effects.clear();
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
      if (opts.online) this.shop.stock = (save.shop ?? []).map((r) => { try { return itemFromRecipe(r); } catch { return null; } }).filter(Boolean);
      if (!legacy) {
        this.encounters.load(save.camps);
        this.discovery.load(save.discovery);
        this.attuned = new Set(save.attuned ?? ['w-hub']);
        this.openedChests = new Set(save.chests ?? []);
        this.customMarker = save.marker ?? null;
      }
      const [x, y, z] = !legacy && save.pos ? save.pos : [HUB.x, 0, HUB.z + 4];
      this.player.position.set(x, y, z);
      this.world.prime(this.player.position);
      this.player.position.y = this.world.supportHeight(x, z, y + 0.6);
    } else {
      this.player.inventory.add(generateWeapon({ seed: 7, level: 1, type: 'sword', rarity: 'common' }));
      this.player.position.set(HUB.x, 0, HUB.z + 4);
      this.world.prime(this.player.position);
    }
    if (!opts.online && (!save || !this.settings.capeGranted)) {
      const inv = this.player.inventory;
      if (!inv.armor.back) inv.armor.back = generateArmor({ seed: 7711, level: 1, slot: 'back', rarity: 'common' });
      this.settings.capeGranted = true;
    }
    this.char = new CharacterCore({
      stats: this.stats, inventory: this.player.inventory, quests: this.quests, attuned: this.attuned,
      chests: this.openedChests, shop: this.shop, settings: this.settings, position: this.player.position, world: this.world,
    });
    this.charLink.attach(this.char);
    // A new character (offline) finds three weapons waiting by the camp.
    if (!save && !opts.preview && !opts.online) {
      const near = new THREE.Vector3(HUB.x, 0, HUB.z - 7.5);
      const fx = [];
      for (const [cls, x] of [['ranged', -2.5], ['magic', 0], ['melee', 2.5]]) {
        this.char.spawn(this.char.gid(), generateWeapon({ level: 1, cls, rarity: 'uncommon' }), [near.x + x, near.y, near.z], fx, false);
      }
      this.onCharFx(fx);
    }
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
      pos: [this.player.position.x, this.player.position.y, this.player.position.z],
    };
    // Online the server keeps the character itself; it only takes what's this screen's own.
    if (this.net.inWorld) this.net.send({ t: 'save', data: { discovery: data.discovery, marker: data.marker, pos: data.pos } });
    else if (!this.onlineMode) writeSave({ world: { seed: this.world.seed }, ...data });
  }

  // Preferences (core/Prefs.js) take effect at once and belong to the device, not the save.
  // Device pixels per CSS pixel: the screen's (up to 2), the resolution setting, and the adaptive
  // resolution's current share.
  pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, 2) * (this.prefs.renderScale ?? 1) * (this.prefs.dynamicRes ? this.dynScale : 1);
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
    this.post.configure(q, { outlines });
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
    this.onlineMode = true;
    if (this.state !== 'title') return;
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
    if (!this.quests.completed.size && !Object.keys(this.quests.active).length) {
      this.hud.banner('Brightwater Camp', 'Speak with Warden Maren [E]');
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
    // Leaving the page mid-session: a last save (best effort; autosaves cover the rest).
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      // Held keys repeat: a menu toggles once per press (holding Esc in fullscreen leaves it).
      if (e.repeat && (e.code === 'Escape' || MENU_KEYS[e.code])) { e.preventDefault(); return; }
      const inGame = this.state === 'playing' || this.state === 'menu' || (this.state === 'paused' && this.backgroundPause);
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
    // The Esc that released the mouse can also arrive as a key press: don't let it close the menu
    // it just opened.
    if (performance.now() - this.menuOpenedAt < 250) return;
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
      this.player.readInput(this.state === 'playing' ? this.input : IDLE_INPUT, this.rig);
      const dt = realDt;
      if (this.hitstopTimer > 0 && (this.hitstopTimer -= realDt) <= 0) this.hitstopSet.clear();
      this.simulate(dt);
      this.effects.update(dt, realDt);
      this.effects.updatePools(dt, this.groundAt ??= (x, z) => this.world.supportHeight(x, z, this.player.position.y + 2));
      for (const d of this.drops) d.update(realDt, this.time);
      if (this.state === 'playing') {
        this.updateLootFocus(realDt);
        this.updateInteraction();
        this.updateZone();
      }
      this.saveTimer -= realDt;
      if (this.saveTimer <= 0) { this.saveTimer = 30; this.save(); }
    }
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
    this.rig.update(realDt, this.state === 'playing' ? this.input : { mouseDX: 0, mouseDY: 0, wheel: 0, down: () => false },
      this.player.position, this.player.cameraMode, this.world, this.player.adsFov, this.player.fovKick,
      this.firstPerson ? this.player.eyePosition(_eye) : null);
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
    this.projectiles.update(dt);
    this.resolveSeparation();
    for (let i = this.drops.length - 1; i >= 0; i--) {
      if (this.drops[i].expired) this.removeDrop(this.drops[i]);
    }
    this.discovery.reveal(this.player.position.x, this.player.position.z);
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
      if (z?.type === 'settlement') this.hud.banner(z.name, `${KIND_TITLE[z.kind] ?? 'Settlement'} · Safe haven`);
      else if (z && z.level) this.hud.banner(z.name, `Level ${z.level}${z.stronghold ? ' · Stronghold' : ''}`);
      else if (z === HUB) this.hud.banner(HUB.name, 'Safe haven');
    }
    // The first time this session you reach a landmark.
    const lm = this.world.landmarkAt(p.x, p.z);
    if (lm && !this.seenLandmarks.has(lm.id)) {
      this.seenLandmarks.add(lm.id);
      this.hud.banner(lm.name, 'Landmark discovered');
    }
  }

  addSettlementFolk(place) {
    for (const n of place.npcs) {
      if (this.npcs.some((o) => o.id === n.id)) continue;
      const npc = new NPC(this, settlementFolk(place, n));
      npc.place = place.id;
      this.npcs.push(npc);
      this.scene.add(npc.root);
    }
  }

  removeSettlementFolk(place) {
    this.npcs = this.npcs.filter((n) => {
      if (n.place !== place.id) return true;
      this.scene.remove(n.root);
      n.dispose();
      return false;
    });
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
    const ids = Object.keys(this.quests.active).sort((a, b) => (a === 'bounty') - (b === 'bounty'));
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
        const npc = this.npcs.find((n) => n.id === q.giver);
        return { x: npc.position.x, z: npc.position.z, radius: 2 };
      }
      const prog = this.quests.active[id];
      const o = q.objectives.find((ob, i) => prog[i] < ob.count);
      const open = (c) => !this.encounters.isCleared(c.id);
      if (o.type === 'clear') {
        const c = this.world.poiById(o.camp);
        return c && { x: c.x, z: c.z, radius: c.radius };
      }
      if (o.type === 'killRace') return nearest(['camp'], (c) => c.race === o.race && open(c));
      if (o.type === 'attune') return nearest(['waystone'], (w) => !this.attuned.has(w.id));
      if (o.type === 'chest') return nearest(['chest'], (c) => !this.openedChests.has(c.id));
      return nearest(['camp'], open);
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
    const list = [...this.npcs, this.campfire];
    for (const w of this.world.waystones.values()) list.push({ kind: 'waystone', name: w.name, id: w.id, position: w.position });
    for (const c of this.world.chests.values()) if (!c.open) list.push({ kind: 'chest', name: 'Treasure Chest', id: c.id, position: c.position, level: c.level });
    return list;
  }

  interactPrompt(it) {
    if (it.kind === 'campfire') return 'Rest at the hearth reactor';
    if (it.kind === 'waystone') return this.attuned.has(it.id) ? `${it.name} — open map to travel` : `Attune ${it.name} waystone`;
    if (it.kind === 'chest') return 'Open chest';
    return `Talk to ${it.name}`;
  }

  interact(it) {
    if (it.kind === 'campfire') this.openMenu(() => this.restDialog());
    else if (it.kind === 'waystone') {
      if (!this.attuned.has(it.id)) this.charLink.do({ op: 'attune', id: it.id });
      else this.openGameMenu('map');
    } else if (it.kind === 'chest') this.openChest(it);
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

  async talk(npc) {
    if (npc.role === 'trader') {
      this.dialogue.open({
        name: npc.name, title: npc.title,
        text: npc.def.greeting ?? 'Steel, powder and sorcery — fair prices, mostly. Got anything to sell?',
        options: [{ label: 'Browse wares', onClick: () => this.openGameMenu('inventory', { shop: true }) }],
      });
      return;
    }
    if (npc.role === 'flavor') {
      const line = npc.def.lines[npc.lineIndex++ % npc.def.lines.length];
      this.dialogue.open({ name: npc.name, title: npc.title, text: line, options: [] });
      return;
    }
    const log = this.quests;
    // The giver's current offer (online, the server makes it up).
    if (npc.role === 'quest') await this.charLink.do({ op: 'talk', npc: npc.id });
    if (!this.dialogue.isOpen && this.state !== 'menu') return;
    const ready = log.readyToTurnIn(npc.id);
    const avail = log.available(npc.id);
    const going = log.inProgress(npc.id);
    const options = [];
    let text = npc.def.lines ? npc.def.lines[npc.lineIndex++ % npc.def.lines.length] : 'Keep your blade sharp out there.';
    if (ready.length) {
      text = ready[0].turnIn;
      for (const q of ready) options.push({ label: `Complete: ${q.title}`, cls: 'quest', onClick: () => this.completeQuest(q.id, npc) });
    } else if (avail.length) {
      text = avail[0].offer;
    } else if (going.length) {
      text = going[0].progress;
    }
    for (const q of avail) options.push({ label: `Accept: ${q.title}`, cls: 'quest', onClick: () => { this.charLink.do({ op: 'accept', id: q.id }); this.talk(npc); } });
    this.dialogue.open({ name: npc.name, title: npc.title, text, options });
  }

  async completeQuest(id, npc) {
    await this.charLink.do({ op: 'turnin', id });
    this.talk(npc);
  }

  restDialog() {
    this.dialogue.open({
      name: 'Hearth Reactor', title: 'Brightwater Outpost',
      // The realm's camps are shared and keep their own time; resting only touches your own world.
      text: this.net.inWorld
        ? 'The reactor hums. Resting restores you fully, your treasure chests refill, and Tobbin restocks.'
        : 'The reactor hums. Resting restores you fully — but the valley\'s monsters return to their camps, treasure chests refill, and Tobbin restocks.',
      options: [{
        label: 'Rest', onClick: async () => {
          if (!(await this.charLink.do({ op: 'rest' }))) return;
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
          this.hud.banner('Rested', this.net.inWorld ? 'Fresh stock and full health' : 'The valley stirs again');
        },
      }],
    });
  }

  // Offline: the trader restocks for the character's level (online the server stocks the trader).
  refreshShop() {
    this.char.apply({ op: 'stock', roll: { stock: stockFor(this.stats.level) } });
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
    for (const id of this.world.waystones.keys()) this.world.setWaystoneActive(id, this.attuned.has(id));
    for (const id of this.world.chests.keys()) this.world.setChestOpen(id, this.openedChests.has(id));
    if (ground) this.loadGround(ground);
    this.player.refreshAppearance();
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
        case 'levelup': {
          const p = this.player;
          p.hp = this.stats.maxHp;
          p.mana = this.stats.maxMana;
          this.hud.banner('LEVEL UP', `Level ${f.level} · ${f.points} attribute points — press P`);
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
      }
    }
    if (gear) this.player.refreshAppearance();
    if (list.length) this.refreshMenus();
  }

  // Menus showing the character redraw after it changes.
  refreshMenus() {
    if (this.inventoryUI.isOpen && !this.inventoryUI.drag) this.inventoryUI.render();
    if (this.menu.isOpen && (this.menu.page === 'character' || this.menu.page === 'journal')) this.menu.renderTab();
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
    const full = inv.slots.every(Boolean) && inv.backpackFree === 0;
    this.hud.setLoot(best?.weapon ?? null, p.weapon, full, inv.armor);

    // F: a tap (released before HOLD_SWAP) picks up; holding swaps. Looking away cancels.
    if (best && this.input.wasPressed('KeyF')) this.fHold = { drop: best, t: 0, done: false };
    const h = this.fHold;
    if (h) {
      if (!this.input.down('KeyF')) {
        if (!h.done && h.drop === best) this.pickUp(best);
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
    if (drop.gid !== null) this.charLink.do({ op: 'pick', gid: drop.gid, swap: true });
  }

  // Dev tools (offline): an item straight into the inventory, or at your feet if it's full.
  giveWeapon(weapon) {
    const fx = [];
    this.char.give(weapon, this.char.gid(), fx);
    this.onCharFx(fx);
  }

  pickUp(drop) {
    if (drop.gid !== null) this.charLink.do({ op: 'pick', gid: drop.gid });
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
    this.effects.spawnBurst(center, radius, color);
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

    if (hit.source === 'status') {
      this.effects.damageNumber(_v, hit.damage, '', elColor);
      return;
    }
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
    if (fromPlayer) this.hud.hitMarker(hit.crit, !target.alive);
    if (fromPlayer && hit.source === 'melee' && this.firstPerson) this.viewModel.onImpact(hit.crit);
    if (fromPlayer && (hit.source === 'melee' || (hit.source === 'explosion' && this.player.weaponClass === 'melee'))) this.player.addCombo();

    if (hit.source === 'melee') {
      const sparkColor = hit.element !== 'none' ? ELEMENTS[hit.element].color : hit.crit ? 0xffd23f : 0xfff6d0;
      this.effects.spawnSparks(_v, fromPlayer ? sparkColor : 0xff6a5a, hit.crit ? 14 : 8);
    }
    const kind = !fromPlayer ? 'hurt' : hit.crit ? 'crit' : '';
    this.effects.damageNumber(_v, hit.crit ? `${hit.damage}!` : hit.damage, kind, fromPlayer && !hit.crit ? elColor : null);
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
      this.hud.banner('LEVEL UP', `Level ${this.stats.level} · ${this.stats.points} attribute points — press P`);
      this.save();
    }
  }

  // Offline: a kill's rewards, rolled and applied here (online the server credits kills).
  onEnemyKilled(enemy) {
    this.audio.kill(enemy.position, !!(enemy.type.boss || enemy.elite));
    if (this.net.inWorld) return;
    this.charLink.do({ op: 'reward', roll: rewardRoll(enemy, this.stats.level, () => this.char.gid()) });
  }

  // A camp emptied near us: offline the quest tally moves here (online the server sends it).
  onCampCleared(camp) {
    if (!this.net.inWorld) this.charLink.do({ op: 'camp', id: camp.def.id, roll: {} });
    this.hud.toast(`${camp.def.name} cleared`);
  }

  onPlayerDeath() {
    this.closeMenus(false);
    this.chat.close();
    this.state = 'dead';
    this.encounters.disengageAll();
    setTimeout(() => {
      if (this.state !== 'dead') return;
      this.releaseMouse();
      const lost = Math.floor(this.stats.gold * 0.1);
      this.hud.showOverlay('YOU FELL', `You'll wake at Brightwater Camp${lost ? ` (−${lost}g)` : ''}. Press R or click below.`, [
        { label: 'Rise again', onClick: () => this.respawn() },
      ]);
    }, 1400);
  }

  respawn() {
    this.charLink.do({ op: 'respawn' });
    this.player.revive();
    this.player.position.set(HUB.x, 0, HUB.z + 4);
    this.world.prime(this.player.position);
    this.player.facing = Math.PI;
    this.resume();
    this.save();
  }
}

// Building the world is one long, busy step: say so (and let that paint) before starting it.
const loadingStep = document.getElementById('loading-step');
if (loadingStep) loadingStep.textContent = 'Building the world…';
await new Promise((r) => setTimeout(r, 50));
window.game = new Game();
