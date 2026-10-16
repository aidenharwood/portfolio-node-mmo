// Dev helper: tours the generated world and captures contact sheets through the dev server's
// /__shot endpoint (serve.py). In the console: const t = await import('/tools/worldshots.js');
//   await t.tour('landmark')     one tile per landmark kind
//   await t.tour('settlement')   one per settlement kind
//   await t.tour('biome')        one per biome, from above a region's centre
//   await t.tour('camp')         one per camp style and tier, and a stronghold per race
// Sheets land in .shots/ (tour_<what>.png).
import * as THREE from 'three';
import { LANDMARKS, SETTLEMENTS, BIOMES, WATER_LEVEL } from '../src/world/Gen.js';

const g = window.game;

// Every POI or region matching `test`, nearest the hub first, one per key.
function find(keys, keyOf) {
  const out = new Map();
  for (let ring = 1; ring < 20 && out.size < keys.length; ring++) {
    for (let rx = -ring; rx <= ring; rx++) {
      for (let rz = -ring; rz <= ring; rz++) {
        if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
        const r = g.world.gen.region(rx, rz);
        for (const item of [r, ...r.pois]) {
          const k = keyOf(item);
          if (k && keys.includes(k) && !out.has(k)) out.set(k, item);
        }
      }
    }
  }
  return out;
}

const cam = new THREE.PerspectiveCamera(50, 4 / 3, 0.5, 900);

// Moves the player near (x, z), streams everything in, and renders from the camera.
function view(x, z, from, look) {
  const p = g.player;
  p.position.set(x, g.world.groundHeight(x, z) + 0.5, z);
  p.velocity?.set(0, 0, 0);
  g.world.prime(p.position);
  g.world.update(0.016, g.time ?? 0, p.position);
  g.world.skyTimer = 0;
  for (let i = 0; i < 60; i++) g.world.updateSky(0.1, p.position);
  try { g.grass?.update(p.position); } catch { /* not on this quality */ }
  cam.position.copy(from);
  cam.lookAt(look);
  cam.updateMatrixWorld();
  const c = g.camera;
  const pos = c.position.clone();
  const q = c.quaternion.clone();
  const fov = c.fov;
  const far = c.far;
  c.position.copy(cam.position);
  c.quaternion.copy(cam.quaternion);
  c.fov = 50;
  c.far = 900;
  c.updateProjectionMatrix();
  c.updateMatrixWorld();
  g.post.render(0, g);
  const src = g.renderer.domElement;
  c.position.copy(pos);
  c.quaternion.copy(q);
  c.fov = fov;
  c.far = far;
  c.updateProjectionMatrix();
  return src;
}

export async function tour(what, { cols = 4, w = 480, h = 360 } = {}) {
  g.state = 'playing';
  g.hud?.hideOverlay?.();
  document.getElementById('loading')?.remove();
  let items;
  if (what === 'landmark') items = find(Object.keys(LANDMARKS), (p) => (p.type === 'landmark' ? p.kind : null));
  else if (what === 'settlement') items = find(Object.keys(SETTLEMENTS), (p) => (p.type === 'settlement' ? p.kind : null));
  else if (what === 'camp') {
    const keys = [...['scav', 'salvage', 'nest', 'relay', 'den'].flatMap((s) => ['outpost', 'camp', 'base'].map((t) => `${s}:${t}`)), 'fort:scav', 'fort:hive', 'fort:synth', 'fort:fauna'];
    items = find(keys, (p) => (p.type === 'camp' && !p.story ? (p.stronghold ? `fort:${p.race}` : `${p.style}:${p.tier}`) : null));
  } else items = find(BIOMES, (r) => (r.key && r.biome && !r.hub ? r.biome : null));
  const list = [...items.entries()];
  const rows = Math.ceil(list.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * w;
  sheet.height = rows * h;
  const ctx = sheet.getContext('2d');
  list.forEach(([k, it], i) => {
    let src;
    if (what === 'biome') {
      const y = g.world.groundHeight(it.x, it.z);
      src = view(it.x, it.z, new THREE.Vector3(it.x - 60, y + 38, it.z - 60), new THREE.Vector3(it.x + 20, y, it.z + 20));
    } else {
      const r = it.r ?? it.radius ?? 18;
      const a = (it.rot ?? 0) + 0.6;
      const y = g.world.groundHeight(it.x, it.z);
      const d = r * 2.6 + 12;
      src = view(it.x + Math.sin(a) * d * 0.7, it.z + Math.cos(a) * d * 0.7,
        new THREE.Vector3(it.x + Math.sin(a) * d, y + r * 0.9 + 6, it.z + Math.cos(a) * d), new THREE.Vector3(it.x, y + r * 0.35, it.z));
    }
    const sw = src.width;
    const sh = src.height;
    const cw = Math.min(sw, (sh * w) / h);
    const chh = (cw * h) / w;
    ctx.drawImage(src, (sw - cw) / 2, (sh - chh) / 2, cw, chh, (i % cols) * w, Math.floor(i / cols) * h, w, h);
    ctx.fillStyle = '#000a';
    ctx.fillRect((i % cols) * w, Math.floor(i / cols) * h, w, 24);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`${k} — ${it.name ?? ''}`, (i % cols) * w + 6, Math.floor(i / cols) * h + 17);
  });
  await fetch(`/__shot/tour_${what}`, { method: 'POST', body: sheet.toDataURL('image/png') });
  return list.map(([k, it]) => `${k}@${Math.round(it.x)},${Math.round(it.z)}`).join(' ');
}

// One big frame of a single place: tour1('landmark', 'wreck'), tour1('frontier', 'frontier').
export async function tour1(type, kind, { dist = 2.6, height = 0.9, yaw = 0.6 } = {}) {
  g.state = 'playing';
  document.getElementById('loading')?.remove();
  const items = type === 'biome' ? find([kind], (r) => (r.key && r.biome && !r.hub ? r.biome : null)) : find([kind], (p) => (p.type === type ? p.kind ?? p.type : null));
  const it = items.get(kind);
  if (!it) return 'not found';
  const r = it.r ?? 18;
  const a = (it.rot ?? 0) + yaw;
  const y = g.world.groundHeight(it.x, it.z);
  const d = r * dist + 12;
  const src = view(it.x + Math.sin(a) * d * 0.7, it.z + Math.cos(a) * d * 0.7,
    new THREE.Vector3(it.x + Math.sin(a) * d, y + r * height + 6, it.z + Math.cos(a) * d), new THREE.Vector3(it.x, y + r * 0.35, it.z));
  await fetch(`/__shot/one_${type}_${kind}`, { method: 'POST', body: src.toDataURL('image/png') });
  return `${it.name} @ ${Math.round(it.x)},${Math.round(it.z)}`;
}

// The scenery up close (world/scenery/): one tile per biome from a few metres off the ground,
// looking across a region's wilds. Sheet: tour_scenery.png.
export async function scenery({ cols = 4, w = 480, h = 360, name = 'scenery', dist = 16, up = 5.5 } = {}) {
  g.state = 'playing';
  g.hud?.hideOverlay?.();
  document.getElementById('loading')?.remove();
  const list = [...find(BIOMES, (r) => (r.key && r.biome && !r.hub ? r.biome : null)).entries()];
  const sheet = document.createElement('canvas');
  sheet.width = cols * w;
  sheet.height = Math.ceil(list.length / cols) * h;
  const ctx = sheet.getContext('2d');
  list.forEach(([k, it], i) => {
    // Off the region's centre (where a POI may stand), at a spot the biome itself holds.
    // Dry, open (no place or road within 40 m) and gently sloped, where the scatter can grow.
    const ok = (x, z) => g.world.gen.biomeAt(x, z) === k && g.world.analyticHeight(x, z) > WATER_LEVEL + 2
      && g.world.slopeFast(x, z) < 0.5 && !g.world.gen.nearRoad(x, z)
      && !g.world.poisNear(x, z, 60).some((p) => Math.hypot(p.x - x, p.z - z) < (p.r ?? p.radius ?? 20) + 40);
    let x = it.x;
    let z = it.z;
    for (let t = 0; t < 400; t++) {
      const a = t * 2.4;
      const d = 40 + t * 1.5;
      if (ok(it.x + Math.sin(a) * d, it.z + Math.cos(a) * d)) { x = it.x + Math.sin(a) * d; z = it.z + Math.cos(a) * d; break; }
    }
    const y = g.world.groundHeight(x, z);
    const src = view(x, z, new THREE.Vector3(x - dist, y + up, z - dist), new THREE.Vector3(x + dist * 0.6, y + 1.5, z + dist * 0.6));
    const sw = src.width;
    const sh = src.height;
    const cw = Math.min(sw, (sh * w) / h);
    const chh = (cw * h) / w;
    ctx.drawImage(src, (sw - cw) / 2, (sh - chh) / 2, cw, chh, (i % cols) * w, Math.floor(i / cols) * h, w, h);
    ctx.fillStyle = '#000a';
    ctx.fillRect((i % cols) * w, Math.floor(i / cols) * h, w, 24);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(k, (i % cols) * w + 6, Math.floor(i / cols) * h + 17);
  });
  await fetch(`/__shot/tour_${name}`, { method: 'POST', body: sheet.toDataURL('image/png') });
  return list.map(([k]) => k).join(' ');
}

// Frame cost over the wilds: for each biome, the same spot `scenery` shoots, the triangles and draw
// calls of one frame and the median time of `frames` of them (each waited out on the GPU).
export async function measure({ biomes = ['forest', 'jungle', 'meadow', 'snow', 'desert', 'fungal'], frames = 30 } = {}) {
  g.state = 'playing';
  document.getElementById('loading')?.remove();
  const regions = find(biomes, (r) => (r.key && r.biome && !r.hub ? r.biome : null));
  const gl = g.renderer.getContext();
  const px = new Uint8Array(4);
  const out = {};
  for (const [k, it] of regions) {
    const ok = (x, z) => g.world.gen.biomeAt(x, z) === k && g.world.analyticHeight(x, z) > WATER_LEVEL + 2 && g.world.slopeFast(x, z) < 0.5;
    let x = it.x;
    let z = it.z;
    for (let t = 0; t < 400; t++) {
      const a = t * 2.4;
      const d = 40 + t * 1.5;
      if (ok(it.x + Math.sin(a) * d, it.z + Math.cos(a) * d)) { x = it.x + Math.sin(a) * d; z = it.z + Math.cos(a) * d; break; }
    }
    const y = g.world.groundHeight(x, z);
    // Everything streamed in and built first: only drawing is timed.
    for (let i = 0; i < 400 && (i < 2 || g.world.jobs?.length); i++) view(x, z, new THREE.Vector3(x - 8, y + 4, z - 8), new THREE.Vector3(x + 10, y + 1.5, z + 10));
    const c = g.camera;
    const keep = [c.position.clone(), c.quaternion.clone()];
    c.position.set(x - 8, y + 4, z - 8);
    c.lookAt(x + 10, y + 1.5, z + 10);
    c.updateMatrixWorld();
    g.renderer.info.autoReset = false;
    const times = [];
    let info = null;
    for (let f = 0; f < frames; f++) {
      g.renderer.info.reset();
      const t0 = performance.now();
      g.post.render(0, g);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t0);
      info = { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
    }
    g.renderer.info.autoReset = true;
    c.position.copy(keep[0]);
    c.quaternion.copy(keep[1]);
    times.sort((a, b) => a - b);
    out[k] = { ...info, ms: +times[frames >> 1].toFixed(2) };
  }
  return out;
}

// Camp props (world/scenery/props.js): one close tile per kind, for each faction's kit, each on
// a flat pad, baked as a place is, the wild scenery hidden, at midday. Sheets: tour_props_<kit>.png.
export async function props({ w = 400, h = 300, cols = 6, seed = 1, kits = ['scav', 'salvage', 'nest', 'relay', 'den'] } = {}) {
  const { prop, PROP_KINDS, PROP_SIZES } = await import('../src/world/scenery/props.js');
  const { bakeTree } = await import('../src/render/ModelKit.js');
  const { mulberry32 } = await import('../src/core/rng.js');
  g.state = 'playing';
  document.getElementById('loading')?.remove();
  const x0 = g.player.position.x + 40;
  const z0 = g.player.position.z + 40;
  const y0 = g.world.groundHeight(x0, z0) + 3;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 4, 32), new THREE.MeshLambertMaterial({ color: 0x8a9a6a }));
  pad.position.set(x0, y0 - 2, z0);
  g.scene.add(pad);
  // (The wild scenery kept hidden while view() streams the world in round the camera.)
  const pack = g.world.packScenery;
  g.world.packScenery = function () { this.sceneryDirty = false; };
  const hidden = [];
  for (const set of Object.values(g.world.sets)) for (const m of [set.body, set.hull, set.mesh]) if (m?.visible) { m.visible = false; hidden.push(m); }
  for (const kit of kits) {
    const sheet = document.createElement('canvas');
    sheet.width = cols * w;
    sheet.height = Math.ceil(PROP_KINDS.length / cols) * h;
    const ctx = sheet.getContext('2d');
    PROP_KINDS.forEach((kind, i) => {
      const root = new THREE.Group();
      root.position.set(x0, y0, z0);
      root.add(prop(kind, mulberry32(seed * 1000 + i * 31), { kit }));
      bakeTree(root, { surfaces: true });
      g.scene.add(root);
      const [r, ht] = PROP_SIZES[kind];
      const d = Math.max(3.5, r * 2.6, ht * 1.3);
      const from = new THREE.Vector3(x0 + d * 0.55, y0 + d * 0.55 + ht * 0.3, z0 + d);
      const at = new THREE.Vector3(x0, y0 + Math.max(0.4, ht * 0.4), z0);
      g.world.dayTime = 0.25;
      view(x0 + 12, z0 + 12, from, at);
      g.world.dayTime = 0.25;
      const src = view(x0 + 12, z0 + 12, from, at);
      const sw = src.width;
      const sh = src.height;
      const cw = Math.min(sw, (sh * w) / h);
      const chh = (cw * h) / w;
      ctx.drawImage(src, (sw - cw) / 2, (sh - chh) / 2, cw, chh, (i % cols) * w, Math.floor(i / cols) * h, w, h);
      ctx.fillStyle = '#000a';
      ctx.fillRect((i % cols) * w, Math.floor(i / cols) * h, w, 22);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${kit} ${kind}`, (i % cols) * w + 6, Math.floor(i / cols) * h + 16);
      g.scene.remove(root);
    });
    await fetch(`/__shot/tour_props_${kit}`, { method: 'POST', body: sheet.toDataURL('image/png') });
  }
  g.scene.remove(pad);
  for (const m of hidden) m.visible = true;
  g.world.packScenery = pack;
  g.world.sceneryDirty = true;
  return 'ok';
}

// Place props (world/scenery/placeProps.js): lamps, stalls, boards, the war table, greenery,
// crops, rocks and the world events' props, one close tile each. Sheet: tour_placeprops.png.
export async function placeProps({ w = 400, h = 300, cols = 6, name = 'placeprops' } = {}) {
  const P = await import('../src/world/scenery/placeProps.js');
  const { bakeTree, piece } = await import('../src/render/ModelKit.js');
  const { C } = await import('../src/world/palette.js');
  const items = [
    ['lamp', 3.2, (g) => P.lampPost(g, [0, 0, 0], { tall: 3 })],
    ['lamp (hung)', 3.2, (g) => P.lampPost(g, [0, 0, 0], { tall: 3, hang: true })],
    ['stall: weapons', 2.7, (g) => P.stall(g, 0xc0583a, 'weapons')],
    ['stall: armour', 2.7, (g) => P.stall(g, 0x3a7ab0, 'armor')],
    ['stall: goods', 2.7, (g) => P.stall(g, 0xd9a227, 'all')],
    ['notice board', 3, (g) => P.noticeBoard(g)],
    ['war table', 2, (g) => P.warTable(g)],
    ['town tree', 4.2, (g) => P.townTree(g, [0, 0, 0])],
    ['planter', 1.5, (g) => { piece(g, new THREE.BoxGeometry(1.4, 0.6, 1.4), C.stoneDark, { pos: [0, 0.3, 0], pattern: 'blocks' }); P.shrub(g, [0, 0.7, 0]); }],
    ['crops', 1.2, (g) => { for (let i = 0; i < 9; i++) P.crop(g, [(i % 3) - 1, 0, Math.floor(i / 3) - 1], i < 3 ? 0xd8b84a : 0x5aa84e, { grain: i < 3 }); }],
    ['ore heap', 1.5, (g) => { for (let k = 0; k < 5; k++) piece(g, P.rockShape(0.5 + (k % 3) * 0.25, k), k % 2 ? C.stoneDark : 0x7ab0d8, { pos: [(k - 2) * 0.6, 0.25, (k % 2) * 0.5], scale: [1, 0.7, 1], glow: k % 2 === 0, pattern: k % 2 ? 'rock' : undefined }); }],
    ['event: pylon', 3.8, (g) => g.add(P.eventPylon().g)],
    ['event: flare', 3, (g) => g.add(P.eventFlare().g)],
    ['event: beacon', 4.6, (g) => g.add(P.eventBeacon().g)],
    ['event: rift', 4.5, (g) => g.add(P.eventRift().g)],
  ];
  g.state = 'playing';
  document.getElementById('loading')?.remove();
  const x0 = g.player.position.x + 40;
  const z0 = g.player.position.z + 40;
  const y0 = g.world.groundHeight(x0, z0) + 3;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 4, 32), new THREE.MeshLambertMaterial({ color: 0x8a9a6a }));
  pad.position.set(x0, y0 - 2, z0);
  g.scene.add(pad);
  const pack = g.world.packScenery;
  g.world.packScenery = function () { this.sceneryDirty = false; };
  const hidden = [];
  for (const set of Object.values(g.world.sets)) for (const m of [set.body, set.hull, set.mesh]) if (m?.visible) { m.visible = false; hidden.push(m); }
  const sheet = document.createElement('canvas');
  sheet.width = cols * w;
  sheet.height = Math.ceil(items.length / cols) * h;
  const ctx = sheet.getContext('2d');
  items.forEach(([label, ht, build], i) => {
    const root = new THREE.Group();
    root.position.set(x0, y0, z0);
    build(root);
    bakeTree(root, { surfaces: true });
    g.scene.add(root);
    const d = Math.max(3.5, ht * 1.5);
    const from = new THREE.Vector3(x0 + d * 0.55, y0 + d * 0.45 + ht * 0.3, z0 + d);
    const at = new THREE.Vector3(x0, y0 + ht * 0.45, z0);
    g.world.dayTime = 0.25;
    view(x0 + 12, z0 + 12, from, at);
    g.world.dayTime = 0.25;
    const src = view(x0 + 12, z0 + 12, from, at);
    const sw = src.width;
    const sh = src.height;
    const cw = Math.min(sw, (sh * w) / h);
    const chh = (cw * h) / w;
    ctx.drawImage(src, (sw - cw) / 2, (sh - chh) / 2, cw, chh, (i % cols) * w, Math.floor(i / cols) * h, w, h);
    ctx.fillStyle = '#000a';
    ctx.fillRect((i % cols) * w, Math.floor(i / cols) * h, w, 22);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(label, (i % cols) * w + 6, Math.floor(i / cols) * h + 16);
    g.scene.remove(root);
  });
  g.scene.remove(pad);
  for (const m of hidden) m.visible = true;
  g.world.packScenery = pack;
  g.world.sceneryDirty = true;
  await fetch(`/__shot/tour_${name}`, { method: 'POST', body: sheet.toDataURL('image/png') });
  return 'ok';
}

// Places on their plots (world/plots.js), seen from above at an angle: one tile per kind — a
// campsite, a hamlet, a village, a town, and camps of every tier. Sheet: tour_plots.png.
export async function plots({ w = 480, h = 360, cols = 4, name = 'plots', skip = 0, only = null, scale = 1 } = {}) {
  g.state = 'playing';
  g.hud?.hideOverlay?.();
  document.getElementById('loading')?.remove();
  const want = only ?? ['campsite', 'hamlet', 'settlement', 'town', 'camp:picket', 'camp:outpost', 'camp:camp', 'camp:base', 'camp:fort'];
  const key = (p) => (p.type === 'camp' ? `camp:${p.stronghold ? 'fort' : p.tier}` : p.type === 'hub' ? 'hub' : p.type);
  const found = new Map();
  const seen = new Map();
  for (let ring = 1; ring < 14 && found.size < want.length; ring++) {
    for (let rx = -ring; rx <= ring; rx++) for (let rz = -ring; rz <= ring; rz++) {
      if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
      for (const p of g.world.gen.region(rx, rz).pois) {
        const k = key(p);
        if (!want.includes(k) || found.has(k)) continue;
        const n = (seen.get(k) ?? 0) + 1;
        seen.set(k, n);
        if (n > skip) found.set(k, p);
      }
    }
  }
  const list = want.filter((k) => found.has(k)).map((k) => [k, found.get(k)]);
  const sheet = document.createElement('canvas');
  sheet.width = cols * w;
  sheet.height = Math.ceil(list.length / cols) * h;
  const ctx = sheet.getContext('2d');
  list.forEach(([k, p], i) => {
    const R = (p.type === 'town' ? p.r + 12 : p.type === 'citywall' ? p.wall + 8 : p.radius ?? p.r ?? 12) * scale;
    const y = g.world.groundHeight(p.x, p.z);
    g.world.dayTime = 0.25;
    const from = new THREE.Vector3(p.x + R * 0.5, y + R * 1.9 + 6, p.z + R * 1.3 + 4);
    const at = new THREE.Vector3(p.x, y, p.z);
    // (Until everything round it has streamed in and been built.)
    for (let k = 0; k < 200 && (k < 2 || g.world.jobs?.length); k++) view(p.x, p.z, from, at);
    const src = view(p.x, p.z, from, at);
    const sw = src.width;
    const sh = src.height;
    const cw = Math.min(sw, (sh * w) / h);
    const chh = (cw * h) / w;
    ctx.drawImage(src, (sw - cw) / 2, (sh - chh) / 2, cw, chh, (i % cols) * w, Math.floor(i / cols) * h, w, h);
    ctx.fillStyle = '#000a';
    ctx.fillRect((i % cols) * w, Math.floor(i / cols) * h, w, 22);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`${k} — ${p.name ?? ''}`, (i % cols) * w + 6, Math.floor(i / cols) * h + 16);
  });
  await fetch(`/__shot/tour_${name}`, { method: 'POST', body: sheet.toDataURL('image/png') });
  return list.map(([k, p]) => `${k}@${Math.round(p.x)},${Math.round(p.z)}`).join(' ');
}
