// Rotating minimap (camera-forward is up): explored terrain tiles under fog, roads, camps,
// waystones, chests, enemies, notable loot, NPCs, public events, quest target and custom marker.
import { RARITY } from '../items/rarity.js';
import { CHUNK } from '../world/Chunks.js';
import { PARTY_COLOR } from './PartyUI.js';
import { FogLayer } from './MapFog.js';

// Settlements of every size on the minimap: their ground, a little brighter the smaller they are.
const PLACE_FILL = {
  hamlet: 'rgba(255,210,122,0.45)', settlement: 'rgba(255,210,122,0.55)', town: 'rgba(255,200,110,0.35)', city: 'rgba(255,200,110,0.22)', district: 'rgba(255,215,140,0.3)',
};

const SIZE = 180;
const RANGE = 60; // world units from centre to edge
const RACE_FILL = { scav: 'rgba(200,80,50,0.65)', hive: 'rgba(150,90,230,0.6)', synth: 'rgba(40,180,230,0.6)', fauna: 'rgba(230,150,40,0.6)' };

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = SIZE * 2;
    canvas.height = SIZE * 2;
    this.ctx = canvas.getContext('2d');
    this.timer = 0;
    this.fog = new FogLayer([18, 14, 26, 235]);
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

  questMarker(x, z, kind = 'default', r = 6) {
    const ctx = this.ctx;
    const styles = {
      talk: { fill: '#ffd76a', stroke: '#ff9a1f', mark: 'diamond' },
      use: { fill: '#74d9ff', stroke: '#2aa4ff', mark: 'square' },
      goto: { fill: '#a3f5b0', stroke: '#31c36c', mark: 'ring' },
      defend: { fill: '#ff9d7d', stroke: '#f05d5d', mark: 'shield' },
      clear: { fill: '#d8b5ff', stroke: '#9b67e8', mark: 'star' },
      killRace: { fill: '#ff8d8d', stroke: '#df4747', mark: 'cross' },
      attune: { fill: '#71f0ff', stroke: '#2bb9d6', mark: 'hex' },
      chest: { fill: '#f3d774', stroke: '#c68d1f', mark: 'gem' },
      default: { fill: '#ffd23f', stroke: '#f9af28', mark: 'diamond' },
    };
    const s = styles[kind] ?? styles.default;
    ctx.save();
    ctx.translate(x, z);
    const matrix = ctx.getTransform();
    const scale = Math.hypot(matrix.a, matrix.b) || 1;
    ctx.beginPath();
    ctx.arc(0, 0, r + 3 / scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,12,20,.88)';
    ctx.fill();
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = 1.25 / scale;
    ctx.stroke();
    ctx.strokeStyle = '#0a0c13';
    ctx.lineWidth = 1.5 / scale;
    ctx.fillStyle = s.fill;
    ctx.beginPath();
    if (s.mark === 'diamond') {
      ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 1.1, 0); ctx.lineTo(0, r * 1.2); ctx.lineTo(-r * 1.1, 0); ctx.closePath();
    } else if (s.mark === 'square') {
      ctx.rect(-r * 1.05, -r * 1.05, r * 2.1, r * 2.1);
    } else if (s.mark === 'ring') {
      ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    } else if (s.mark === 'shield') {
      ctx.moveTo(0, -r * 1.35); ctx.lineTo(r * 1.15, -r * 0.35); ctx.lineTo(r * 0.8, r * 1.2); ctx.lineTo(0, r * 1.45); ctx.lineTo(-r * 0.8, r * 1.2); ctx.lineTo(-r * 1.15, -r * 0.35); ctx.closePath();
    } else if (s.mark === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2; const rr = i % 2 === 0 ? r * 1.3 : r * 0.5; const px = Math.cos(a) * rr; const py = Math.sin(a) * rr; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (s.mark === 'cross') {
      ctx.moveTo(-r * 0.55, -r * 1.2); ctx.lineTo(-r * 0.2, -r * 1.2); ctx.lineTo(-r * 0.2, -r * 0.2); ctx.lineTo(r * 1.2, -r * 0.2); ctx.lineTo(r * 1.2, r * 0.2); ctx.lineTo(-r * 0.2, r * 0.2); ctx.lineTo(-r * 0.2, r * 1.2); ctx.lineTo(-r * 0.55, r * 1.2); ctx.lineTo(-r * 0.55, r * 0.2); ctx.lineTo(-r * 1.2, r * 0.2); ctx.lineTo(-r * 1.2, -r * 0.2); ctx.lineTo(-r * 0.55, -r * 0.2); ctx.closePath();
    } else if (s.mark === 'hex') {
      for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 6; const px = Math.cos(a) * r * 1.12; const py = Math.sin(a) * r * 1.12; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath();
    } else if (s.mark === 'gem') {
      ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 1.1, 0); ctx.lineTo(0, r * 1.2); ctx.lineTo(-r * 1.1, 0); ctx.closePath();
      ctx.moveTo(-r * 0.7, 0); ctx.lineTo(0, r * 0.7); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, -r * 0.7); ctx.closePath();
    } else {
      ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  questSearchArea(x, z, kind, radius) {
    if (!['goto', 'defend', 'clear'].includes(kind) || radius <= 8) return;
    const ctx = this.ctx;
    const color = kind === 'goto' ? '#a3f5b0' : kind === 'defend' ? '#ff9d7d' : '#d8b5ff';
    const matrix = ctx.getTransform();
    const scale = Math.hypot(matrix.a, matrix.b) || 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, z, radius, 0, Math.PI * 2);
    ctx.fillStyle = `${color}06`;
    ctx.fill();
    ctx.setLineDash([4 / scale, 5 / scale]);
    ctx.lineWidth = 1.25 / scale;
    ctx.strokeStyle = `${color}70`;
    ctx.stroke();
    ctx.setLineDash([]);
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

    // Down in a dungeon: its rooms seen so far (world/DungeonView.js) instead of the land.
    const indoors = game.dungeonView?.active;
    if (indoors) game.dungeonView.drawRooms(ctx, 1 / k);
    else {
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

    // Fog over unexplored cells: one cached picture, soft-edged by being scaled up (ui/MapFog.js).
    if (this.fog.cover(d, cx0, cz0, cx1, cz1)) {
      const f = this.fog.bounds;
      ctx.save();
      ctx.scale(1, -1);
      ctx.drawImage(this.fog.canvas, f.x, -f.zTop, f.w, f.h);
      ctx.restore();
    }

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
        else if (PLACE_FILL[poi.type]) {
          ctx.fillStyle = PLACE_FILL[poi.type];
          ctx.beginPath();
          ctx.arc(poi.x, poi.z, poi.type === 'city' ? poi.wall : poi.r, 0, Math.PI * 2);
          ctx.fill();
          if (poi.type !== 'district') this.dot(poi.x, poi.z, poi.type === 'city' ? 4 : poi.type === 'town' ? 3.2 : poi.type === 'hamlet' ? 2 : 2.6, '#ffd27a');
        } else if (poi.type === 'landmark' || poi.type === 'story') this.dot(poi.x, poi.z, 2.6, poi.story ? '#ffcf7a' : '#c8b4ff');
      }
    }
    }
    for (const dr of game.drops) if (dr.tier >= 2) this.dot(dr.position.x, dr.position.z, 1.2, RARITY[dr.weapon.rarity].css);
    for (const e of game.enemies) {
      if (!e.alive) continue;
      this.dot(e.position.x, e.position.z, e.type.boss || e.champion ? 2.8 : e.elite ? 2.2 : 1.1, e.engaged ? '#ff3030' : '#b03030');
    }
    // A warband on the move: a pulsing ring round it (and an arrow at the rim when it's off the map).
    let hx = 0;
    let hz = 0;
    let hn = 0;
    for (const e of game.enemies) if (e.alive && e.horde) { hx += e.position.x; hz += e.position.z; hn++; }
    const horde = hn >= 3 ? { x: hx / hn, z: hz / hn } : null;
    if (horde) {
      ctx.strokeStyle = 'rgba(255, 70, 50, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(horde.x, horde.z, 10 + Math.sin(performance.now() / 260) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Public events (ui/EventUI.js): their area, pulsing — gilt while gathering, red under way.
    const events = game.eventUI?.markers() ?? [];
    for (const m of events) {
      ctx.strokeStyle = m.stage === 'gather' ? 'rgba(255, 210, 90, 0.95)' : 'rgba(255, 106, 74, 0.95)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(m.x, m.z, m.r + 2 + Math.sin(performance.now() / 300) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const n of game.npcs) this.dot(n.position.x, n.position.z, 1.3, n.marker ? '#ffd23f' : '#ffffff');
    for (const s of game.props?.values() ?? []) this.dot(s.position.x, s.position.z, 1.5, s.marker ? '#ffd23f' : '#e8d4a0');
    for (const r of game.remotes?.list ?? []) if (!game.partyUI?.isMate(r.netId)) this.dot(r.position.x, r.position.z, 1.6, '#5ee6ff');
    const mates = (game.partyUI?.mates ?? []).filter((m) => m.online && m.known);
    for (const m of mates) this.dot(m.x, m.z, 2.1, PARTY_COLOR);

    const wp = game.questWaypoint();
    if (wp) {
      this.questSearchArea(wp.x, wp.z, wp.kind, wp.radius ?? 0);
      this.questMarker(wp.x, wp.z, wp.kind ?? 'default', 6 / k);
    }
    if (game.customMarker) this.dot(game.customMarker.x, game.customMarker.z, 2, '#4ad2ff');
    ctx.restore();

    if (wp) this.rimArrow(wp, p, yaw, '#ffd23f');
    if (game.customMarker) this.rimArrow(game.customMarker, p, yaw, '#4ad2ff');
    if (horde) this.rimArrow(horde, p, yaw, '#ff4632');
    const ev = game.eventUI?.compassTarget();
    if (ev) this.rimArrow(ev, p, yaw, '#ff6a4a');
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
