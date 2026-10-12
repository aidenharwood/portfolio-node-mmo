// Rotating minimap (camera-forward is up): explored terrain tiles under fog, roads, camps,
// waystones, chests, enemies, notable loot, NPCs, quest target and custom marker.
import { RARITY } from '../items/rarity.js';
import { CHUNK } from '../world/Chunks.js';
import { FOG_CELL, FOG_PER_CHUNK } from '../world/Discovery.js';
import { PARTY_COLOR } from './PartyUI.js';

const SIZE = 180;
const RANGE = 60; // world units from centre to edge
const RACE_FILL = { goblin: 'rgba(200,80,50,0.65)', hollow: 'rgba(150,90,230,0.6)', construct: 'rgba(40,180,230,0.6)', beast: 'rgba(230,150,40,0.6)' };

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = SIZE * 2;
    canvas.height = SIZE * 2;
    this.ctx = canvas.getContext('2d');
    this.timer = 0;
  }

  dot(x, z, r, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, z, r, 0, Math.PI * 2);
    ctx.fill();
  }

  rimArrow(target, p, yaw, color) {
    const ctx = this.ctx;
    const S = SIZE * 2;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    if (Math.hypot(dx, dz) < RANGE * 0.9) return;
    const ang = Math.atan2(dz, dx) + yaw;
    const r = S / 2 - 14;
    ctx.save();
    ctx.translate(S / 2 + Math.cos(ang) * r, S / 2 + Math.sin(ang) * r);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0a0c13';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-7, 8); ctx.lineTo(-7, -8); ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  update(dt, game) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1 / 15;
    const ctx = this.ctx;
    const S = SIZE * 2;
    const k = S / 2 / RANGE;
    const p = game.player.position;
    const yaw = game.rig.yaw;
    const d = game.discovery;
    const world = game.world;

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect(0, 0, S, S);

    // World space here: canvas x = world x, canvas y = world z, rotated so camera-forward is up.
    ctx.translate(S / 2, S / 2);
    ctx.rotate(yaw);
    ctx.scale(k, k);
    ctx.translate(-p.x, -p.z);

    // Tiles are north-up images, so they're drawn flipped into this z-down space.
    const R = RANGE * 1.5;
    const cx0 = Math.floor((p.x - R) / CHUNK);
    const cx1 = Math.floor((p.x + R) / CHUNK);
    const cz0 = Math.floor((p.z - R) / CHUNK);
    const cz1 = Math.floor((p.z + R) / CHUNK);
    ctx.save();
    ctx.scale(1, -1);
    ctx.imageSmoothingEnabled = true;
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        if (!d.mask(cx, cz)) continue;
        const tile = world.tiles.get((cx + 32768) * 65536 + (cz + 32768));
        if (tile) ctx.drawImage(tile, cx * CHUNK, -(cz + 1) * CHUNK, CHUNK + 0.3, CHUNK + 0.3);
      }
    }
    ctx.restore();

    // Fog over unexplored cells (soft-edged).
    ctx.filter = 'blur(5px)';
    ctx.fillStyle = 'rgba(18,14,26,0.92)';
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const m = d.mask(cx, cz);
        if (!m) { ctx.fillRect(cx * CHUNK, cz * CHUNK, CHUNK, CHUNK); continue; }
        for (let b = 0; b < 64; b++) {
          if ((m[b >> 5] >>> (b & 31)) & 1) continue;
          ctx.fillRect(cx * CHUNK + (b % FOG_PER_CHUNK) * FOG_CELL, cz * CHUNK + Math.floor(b / FOG_PER_CHUNK) * FOG_CELL, FOG_CELL, FOG_CELL);
        }
      }
    }
    ctx.filter = 'none';

    const regions = world.gen.regionsNear(p.x, p.z, this._rn ??= []);
    ctx.strokeStyle = 'rgba(214,180,120,0.95)';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    for (const r of regions) {
      for (const path of r.roads) {
        ctx.beginPath();
        path.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
        ctx.stroke();
      }
    }
    for (const r of regions) {
      for (const poi of r.pois) {
        if (Math.abs(poi.x - p.x) > R || Math.abs(poi.z - p.z) > R || !d.isKnown(poi.x, poi.z)) continue;
        if (poi.type === 'camp') {
          ctx.fillStyle = game.encounters.isCleared(poi.id) ? 'rgba(120,120,120,0.7)' : poi.stronghold ? 'rgba(200,40,40,0.75)' : RACE_FILL[poi.race];
          ctx.beginPath();
          ctx.arc(poi.x, poi.z, (poi.stronghold ? 17 : poi.radius) + 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (poi.type === 'waystone') {
          ctx.save();
          ctx.translate(poi.x, poi.z);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = game.attuned.has(poi.id) ? '#58cfff' : '#9a9aaa';
          ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
          ctx.restore();
        } else if (poi.type === 'chest' && !game.openedChests.has(poi.id)) this.dot(poi.x, poi.z, 1.4, '#f0c75e');
      }
    }
    for (const dr of game.drops) if (dr.tier >= 2) this.dot(dr.position.x, dr.position.z, 1.2, RARITY[dr.weapon.rarity].css);
    for (const e of game.enemies) {
      if (!e.alive) continue;
      this.dot(e.position.x, e.position.z, e.type.boss || e.elite ? 2.2 : 1.1, e.engaged ? '#ff3030' : '#b03030');
    }
    for (const n of game.npcs) this.dot(n.position.x, n.position.z, 1.3, n.marker ? '#ffd23f' : '#ffffff');
    for (const r of game.remotes?.list ?? []) if (!game.partyUI?.isMate(r.netId)) this.dot(r.position.x, r.position.z, 1.6, '#5ee6ff');
    const mates = (game.partyUI?.mates ?? []).filter((m) => m.online && m.known);
    for (const m of mates) this.dot(m.x, m.z, 2.1, PARTY_COLOR);

    const wp = game.questWaypoint();
    if (wp) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(wp.x, wp.z, wp.radius ?? 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (game.customMarker) this.dot(game.customMarker.x, game.customMarker.z, 2, '#4ad2ff');
    ctx.restore();

    if (wp) this.rimArrow(wp, p, yaw, '#ffd23f');
    if (game.customMarker) this.rimArrow(game.customMarker, p, yaw, '#4ad2ff');
    for (const m of mates) this.rimArrow(m, p, yaw, PARTY_COLOR);

    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-(game.player.facing - (yaw + Math.PI)));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0a0c13';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(10, 10); ctx.lineTo(0, 5); ctx.lineTo(-10, 10); ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#0a0c13';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}
