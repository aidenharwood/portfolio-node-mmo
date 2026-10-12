// Dev helper: tours the generated world and captures contact sheets through the dev server's
// /__shot endpoint (serve.py). In the console: const t = await import('/tools/worldshots.js');
//   await t.tour('landmark')     one tile per landmark kind
//   await t.tour('settlement')   one per settlement kind
//   await t.tour('biome')        one per biome, from above a region's centre
// Sheets land in .shots/ (tour_<what>.png).
import * as THREE from 'three';
import { LANDMARKS, SETTLEMENTS, BIOMES } from '../src/world/Gen.js';

const g = window.game;

// Every POI or region matching `test`, nearest the hub first, one per key.
function find(keys, keyOf) {
  const out = new Map();
  for (let ring = 1; ring < 16 && out.size < keys.length; ring++) {
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
  else items = find(BIOMES, (r) => (r.key && r.biome && !r.hub ? r.biome : null));
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
      const r = it.r ?? 18;
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

// One big frame of a single place: tour1('landmark', 'wreck').
export async function tour1(type, kind, { dist = 2.6, height = 0.9, yaw = 0.6 } = {}) {
  g.state = 'playing';
  document.getElementById('loading')?.remove();
  const items = type === 'biome' ? find([kind], (r) => (r.key && r.biome && !r.hub ? r.biome : null)) : find([kind], (p) => (p.type === type ? p.kind : null));
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
