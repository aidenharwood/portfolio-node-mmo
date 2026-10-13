// Dev helper: the bestiary in action, captured through the dev server's /__shot endpoint
// (serve.py). In the console: const t = await import('/tools/enemyshots.js');
//   await t.arena('scav')   every type and variant of a faction spawned beside the (god-mode)
//                           player, each caught as an attack lands: sheet arena_<race>.png
//   await t.camps()         one tile per camp style and per faction's stronghold: camps.png
// Returns a line per tile (what was caught, or why not).
import * as THREE from 'three';
import { ENEMY_TYPES } from '../src/combat/bestiary.js';

const g = window.game;
const cam = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 900);

function setup() {
  g.state = 'playing';
  g.hud?.hideOverlay?.();
  document.getElementById('loading')?.remove();
  g.clock.getDelta = () => 1 / 60;
  g.dev.flags.god = true;
}

// Renders from `from` toward `look` through the game's post chain; returns the canvas.
function render(from, look) {
  const c = g.camera;
  const saved = [c.position.clone(), c.quaternion.clone(), c.fov, c.far];
  cam.position.copy(from);
  cam.lookAt(look);
  c.position.copy(cam.position);
  c.quaternion.copy(cam.quaternion);
  c.fov = 40;
  c.far = 900;
  c.updateProjectionMatrix();
  c.updateMatrixWorld();
  g.post.render(0, g);
  c.position.copy(saved[0]);
  c.quaternion.copy(saved[1]);
  c.fov = saved[2];
  c.far = saved[3];
  c.updateProjectionMatrix();
  return g.renderer.domElement;
}

function sheet(n, cols, w, h) {
  const c = document.createElement('canvas');
  c.width = cols * w;
  c.height = Math.ceil(n / cols) * h;
  return { c, ctx: c.getContext('2d'), cols, w, h };
}

function tile(S, i, src, label) {
  const { ctx, cols, w, h } = S;
  const sw = src.width;
  const sh = src.height;
  const cw = Math.min(sw, (sh * w) / h);
  const ch = (cw * h) / w;
  const x = (i % cols) * w;
  const y = Math.floor(i / cols) * h;
  ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
  ctx.fillStyle = '#000a';
  ctx.fillRect(x, y, w, 22);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(label, x + 6, y + 16);
}

// A flat, open spot well clear of the hub's safe zone.
function clearing() {
  for (let r = 140; r < 600; r += 20) {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (g.world.isWater?.(x, z) || g.world.zoneAt(x, z, 10)) continue;
      const h = g.world.groundHeight(x, z);
      let flat = true;
      for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) if (Math.abs(g.world.groundHeight(x + dx, z + dz) - h) > 0.8) flat = false;
      if (flat) return new THREE.Vector3(x, h, z);
    }
  }
  return new THREE.Vector3(150, g.world.groundHeight(150, 0), 0);
}

export async function arena(race, { level = 6, cols = 4, w = 480, h = 360 } = {}) {
  setup();
  const list = [];
  for (const [id, t] of Object.entries(ENEMY_TYPES)) {
    if (t.race !== race) continue;
    list.push([id, null]);
    for (const v of Object.keys(t.variants ?? {})) list.push([id, v]);
  }
  const at = clearing();
  const p = g.player;
  const S = sheet(list.length, cols, w, h);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const [type, variant] = list[i];
    for (const e of [...g.enemies]) if (e.alive) g.enemyLayer.kill(e);
    for (let k = 0; k < 90; k++) g.frame();
    p.position.copy(at).setY(at.y + 0.1);
    p.velocity?.set(0, 0, 0);
    g.world.prime(p.position);
    const spot = at.clone().add(new THREE.Vector3(0, 0, 7));
    spot.y = g.world.groundHeight(spot.x, spot.z);
    const e = g.spawnEnemy(type, spot, { level, variant });
    e.src.aggro?.(true, p);
    // Run the fight until an attack lands (or fifteen seconds pass), then a beat more so shots
    // fly. Shots and spells go straight from windup to recover, so a new attack in recover counts.
    let caught = null;
    const seq0 = e.attackSeq;
    for (let k = 0; k < 900 && !caught; k++) {
      p.position.x = at.x;
      p.position.z = at.z;
      g.frame();
      if (e.cur && (e.state === 'attack' || (e.state === 'recover' && e.attackSeq !== seq0))) caught = e.cur;
    }
    for (let k = 0; k < (caught && ['arrow', 'bolt', 'burst', 'fan', 'lob'].includes(caught.kind) ? 9 : 3); k++) g.frame();
    // Side-on, framing both.
    const mid = p.position.clone().lerp(e.position, 0.5);
    const span = Math.max(4, p.position.distanceTo(e.position) + e.height);
    const from = mid.clone().add(new THREE.Vector3(span * 1.25, Math.max(1.6, e.height * 0.9), span * 0.35));
    const src = render(from, mid.clone().setY(mid.y + Math.min(1.2, e.height * 0.5)));
    const name = variant ? ENEMY_TYPES[type].variants[variant].name : ENEMY_TYPES[type].name;
    const label = `${name} — ${caught ? `${caught.id} (${caught.kind})` : `no attack (${e.state})`}`;
    tile(S, i, src, label);
    out.push(label);
  }
  for (const e of [...g.enemies]) if (e.alive) g.enemyLayer.kill(e);
  await fetch(`/__shot/arena_${race}`, { method: 'POST', body: S.c.toDataURL('image/png') });
  return out.join('\n');
}

// Camps: the nearest of each style, and each race's stronghold, from an elevated three-quarter view.
export async function camps({ cols = 3, w = 560, h = 400 } = {}) {
  setup();
  const want = ['scav', 'salvage', 'nest', 'relay', 'den', 'fort:scav', 'fort:hive', 'fort:synth', 'fort:fauna'];
  const found = new Map();
  for (let ring = 0; ring < 24 && found.size < want.length; ring++) {
    for (let rx = -ring; rx <= ring; rx++) {
      for (let rz = -ring; rz <= ring; rz++) {
        if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
        for (const poi of g.world.gen.region(rx, rz).pois) {
          if (poi.type !== 'camp') continue;
          const k = poi.stronghold ? `fort:${poi.race}` : poi.style;
          if (want.includes(k) && !found.has(k)) found.set(k, poi);
        }
      }
    }
  }
  const list = want.filter((k) => found.has(k));
  const S = sheet(list.length, cols, w, h);
  const p = g.player;
  list.forEach((k, i) => {
    const c = found.get(k);
    const y = g.world.groundHeight(c.x, c.z);
    const r = c.radius + (c.stronghold ? 8 : 4);
    p.position.set(c.x + r + 6, g.world.groundHeight(c.x + r + 6, c.z) + 0.1, c.z);
    g.world.prime(p.position);
    for (let f = 0; f < 45; f++) g.frame();
    const src = render(new THREE.Vector3(c.x + r * 1.3, y + r * 0.95, c.z + r * 1.1), new THREE.Vector3(c.x, y + 1, c.z));
    tile(S, i, src, `${k} — ${c.name} (Lv ${c.level})`);
  });
  for (const e of [...g.enemies]) if (e.alive) g.enemyLayer.kill(e);
  await fetch('/__shot/camps', { method: 'POST', body: S.c.toDataURL('image/png') });
  return list.map((k) => `${k}: ${found.get(k).name} @ ${Math.round(found.get(k).x)},${Math.round(found.get(k).z)}`).join('\n');
}
