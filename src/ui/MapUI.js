// Full-screen world map (M) of the explored world: terrain tiles of every chunk you've seen under
// a soft fog, roads, region names, camps and strongholds, waystones, chests, the quest target and
// a custom marker. Drag to pan, wheel to zoom (far enough out to see everything explored), click
// to place a marker (or travel from an attuned waystone), right-click to clear the marker.
import { HUB, REGION } from '../world/Gen.js';
import { CHUNK } from '../world/Chunks.js';
import { FOG_PER_CHUNK } from '../world/Discovery.js';
import { PARTY_COLOR } from './PartyUI.js';

export function levelColor(diff) {
  if (diff >= 3) return '#ff5a5a';
  if (diff >= 1) return '#ffb347';
  if (diff <= -3) return '#9a9a9a';
  if (diff <= -1) return '#7be07b';
  return '#ffffff';
}

const RACE_COLOR = { scav: '#e8603a', hive: '#b07aff', synth: '#3ad8ff', fauna: '#ffb030' };

// Draws explored chunk tiles plus a blurred fog over unexplored cells into `ctx`, for the world
// rectangle visible through `toScreen` (shared by the map and the minimap).
export function drawExplored(ctx, game, x0, z0, x1, z1, toScreen, px, budget = 6) {
  const d = game.discovery;
  const world = game.world;
  const cx0 = Math.floor(x0 / CHUNK);
  const cx1 = Math.floor(x1 / CHUNK);
  const cz0 = Math.floor(z0 / CHUNK);
  const cz1 = Math.floor(z1 / CHUNK);
  const size = CHUNK * px;
  let painted = 0;
  ctx.imageSmoothingEnabled = true;
  const wide = (cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 2500;
  const each = (fn) => {
    if (wide) {
      for (const key of d.chunks.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        if (cx >= cx0 && cx <= cx1 && cz >= cz0 && cz <= cz1) fn(cx, cz);
      }
    } else for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) if (d.mask(cx, cz)) fn(cx, cz);
  };
  each((cx, cz) => {
    let tile = world.tiles.get((cx + 32768) * 65536 + (cz + 32768));
    if (!tile && painted < budget) {
      tile = world.tileFor(cx, cz);
      painted++;
    }
    if (!tile) return;
    const [sx, sy] = toScreen(cx * CHUNK, (cz + 1) * CHUNK);
    ctx.drawImage(tile, sx, sy, size + 0.5, size + 0.5);
  });
  // Fog: one pixel per 8 m cell over the visible chunk range, scaled up and blurred.
  const W = (cx1 - cx0 + 1) * FOG_PER_CHUNK;
  const H = (cz1 - cz0 + 1) * FOG_PER_CHUNK;
  if (W * H > 600000) return;
  const fog = (drawExplored.fog ??= document.createElement('canvas'));
  if (fog.width !== W || fog.height !== H) { fog.width = W; fog.height = H; }
  const fctx = fog.getContext('2d');
  const img = fctx.createImageData(W, H);
  const a = img.data;
  for (let i = 0; i < W * H; i++) { a[i * 4] = 11; a[i * 4 + 1] = 15; a[i * 4 + 2] = 24; a[i * 4 + 3] = 235; }
  each((cx, cz) => {
    const m = d.mask(cx, cz);
    for (let b = 0; b < 64; b++) {
      if (!((m[b >> 5] >>> (b & 31)) & 1)) continue;
      const ix = (cx - cx0) * FOG_PER_CHUNK + (b % FOG_PER_CHUNK);
      const iz = (cz - cz0) * FOG_PER_CHUNK + Math.floor(b / FOG_PER_CHUNK);
      const row = H - 1 - iz;
      a[(row * W + ix) * 4 + 3] = 0;
    }
  });
  fctx.putImageData(img, 0, 0);
  const [fx, fy] = toScreen(cx0 * CHUNK, (cz1 + 1) * CHUNK);
  ctx.filter = `blur(${Math.max(2, Math.min(24, px * 10))}px)`;
  ctx.drawImage(fog, fx, fy, (cx1 - cx0 + 1) * size, (cz1 - cz0 + 1) * size);
  ctx.filter = 'none';
}

export class MapUI {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.info = el.querySelector('.map-info');
    this.cx = 0;
    this.cz = 0;
    this.zoom = 1;
    this.drag = null;
    this.hover = null;

    // Mouse, pen or fingers: drag to pan, click or tap to travel or mark, right-click or a long
    // press to clear the marker, wheel or pinch to zoom.
    this.touches = new Map();   // pointerId → { x, y } (canvas pixels)
    this.canvas.addEventListener('pointerdown', (e) => {
      const pt = this.local(e);
      this.touches.set(e.pointerId, pt);
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
      this.mouse = pt;
      if (this.touches.size === 2) { this.drag = null; this.pinch = this.pinchState(); return; }
      if (e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false, at: performance.now() };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isOpen) return;
      const pt = this.local(e);
      this.mouse = pt;
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, pt);
      if (this.pinch && this.touches.size === 2) { this.pinchTo(); return; }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
      this.cx = this.drag.cx - dx / this.zoom;
      this.cz = this.drag.cz + dy / this.zoom;
    });
    const end = (e) => {
      this.touches.delete(e.pointerId);
      if (this.pinch) { if (this.touches.size < 2) this.pinch = null; this.drag = null; return; }
      if (!this.isOpen || !this.drag) return;
      const { moved, at } = this.drag;
      this.drag = null;
      if (moved || e.type !== 'pointerup' || e.button !== 0) return;
      if (e.pointerType !== 'mouse' && performance.now() - at > 550) this.game.customMarker = null;
      else this.click();
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.game.customMarker = null;
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.toWorld(this.mouse?.x ?? this.canvas.width / 2, this.mouse?.y ?? this.canvas.height / 2);
      this.zoom = Math.min(6, Math.max(0.08, this.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
      const after = this.toWorld(this.mouse?.x ?? this.canvas.width / 2, this.mouse?.y ?? this.canvas.height / 2);
      this.cx += before.x - after.x;
      this.cz += before.z - after.z;
    }, { passive: false });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  open() {
    const p = this.game.player.position;
    this.cx = p.x;
    this.cz = p.z;
    this.el.classList.remove('hidden');
    this.resize();
    this.zoom = Math.max(0.6, Math.min(this.canvas.width, this.canvas.height) / 360);
  }

  close() { this.el.classList.add('hidden'); }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = r.width;
    this.canvas.height = r.height;
  }

  toScreen(x, z) {
    return [this.canvas.width / 2 + (x - this.cx) * this.zoom, this.canvas.height / 2 - (z - this.cz) * this.zoom];
  }

  toWorld(sx, sy) {
    return { x: this.cx + (sx - this.canvas.width / 2) / this.zoom, z: this.cz - (sy - this.canvas.height / 2) / this.zoom };
  }

  viewRect() {
    const a = this.toWorld(0, this.canvas.height);
    const b = this.toWorld(this.canvas.width, 0);
    return [a.x, a.z, b.x, b.z];
  }

  // Regions overlapping the view (capped when zoomed far out).
  regionsInView() {
    const [x0, z0, x1, z1] = this.viewRect();
    const gen = this.game.world.gen;
    const out = [];
    const r0 = gen.cellOf(x0 - REGION, z0 - REGION);
    const r1 = gen.cellOf(x1 + REGION, z1 + REGION);
    if ((r1[0] - r0[0] + 1) * (r1[1] - r0[1] + 1) > 900) return out;
    for (let rx = r0[0]; rx <= r1[0]; rx++) for (let rz = r0[1]; rz <= r1[1]; rz++) out.push(gen.region(rx, rz));
    return out;
  }

  // Things you can point at on the map (only discovered ones).
  pois() {
    const g = this.game;
    const d = g.discovery;
    const out = [];
    for (const r of this.regionsInView()) {
      for (const p of r.pois) {
        if (!d.isKnown(p.x, p.z)) continue;
        if (p.type === 'waystone') out.push({ kind: 'waystone', x: p.x, z: p.z, name: p.name, active: g.attuned.has(p.id), id: p.id });
        else if (p.type === 'camp') out.push({ kind: 'camp', x: p.x, z: p.z, name: p.name, level: p.level, race: p.race, cleared: g.encounters.isCleared(p.id), boss: !!p.stronghold });
        else if (p.type === 'chest' && !g.openedChests.has(p.id)) out.push({ kind: 'chest', x: p.x, z: p.z, name: 'Treasure' });
        else if (p.type === 'settlement') out.push({ kind: 'settlement', x: p.x, z: p.z, name: p.name, trader: p.npcs.some((n) => n.role === 'trader') });
        else if (p.type === 'landmark') out.push({ kind: 'landmark', x: p.x, z: p.z, name: p.name });
      }
    }
    return out;
  }

  pick(sx, sy, radius = 14) {
    let best = null;
    let bd = radius;
    for (const p of this.pois()) {
      const [px, py] = this.toScreen(p.x, p.z);
      const dd = Math.hypot(px - sx, py - sy);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best;
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // Two fingers: the world point under their midpoint stays put while their spread sets the zoom.
  pinchState() {
    const [a, b] = [...this.touches.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.zoom, world: this.toWorld(mid.x, mid.y) };
  }

  pinchTo() {
    const [a, b] = [...this.touches.values()];
    const p = this.pinch;
    this.zoom = Math.min(6, Math.max(0.08, p.zoom * Math.hypot(a.x - b.x, a.y - b.y) / p.dist));
    const mid = this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
    this.cx += p.world.x - mid.x;
    this.cz += p.world.z - mid.z;
  }

  click() {
    if (!this.mouse) return;
    const hit = this.pick(this.mouse.x, this.mouse.y);
    if (hit?.kind === 'waystone' && hit.active) {
      this.game.travelTo(hit.id);
      return;
    }
    const w = this.toWorld(this.mouse.x, this.mouse.y);
    this.game.customMarker = { x: w.x, z: w.z };
  }

  draw() {
    if (!this.isOpen) return;
    const g = this.game;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect(0, 0, W, H);
    const [x0, z0, x1, z1] = this.viewRect();
    drawExplored(ctx, g, x0, z0, x1, z1, (x, z) => this.toScreen(x, z), this.zoom);

    const regions = this.regionsInView();
    if (this.zoom > 0.2) {
      ctx.strokeStyle = 'rgba(214,180,120,0.9)';
      ctx.lineWidth = Math.max(1.2, 2.6 * this.zoom * 0.6);
      for (const r of regions) {
        for (const path of r.roads) {
          ctx.beginPath();
          let pen = false;
          for (const [x, z] of path) {
            const known = g.discovery.isKnown(x, z);
            const [sx, sy] = this.toScreen(x, z);
            if (known && pen) ctx.lineTo(sx, sy); else if (known) ctx.moveTo(sx, sy);
            pen = known;
          }
          ctx.stroke();
        }
      }
    }
    for (const r of regions) {
      if (r.hub || !g.discovery.isKnown(r.x, r.z)) continue;
      const [sx, sy] = this.toScreen(r.x, r.z);
      this.label(sx, sy - 26, r.name.toUpperCase(), RACE_COLOR[r.race], 14);
      this.label(sx, sy - 12, `Lv ${r.level}`, levelColor(r.level - g.stats.level), 11);
    }

    const [hx, hy] = this.toScreen(HUB.x, HUB.z);
    this.icon(hx, hy, 'hub');
    this.label(hx, hy + 18, HUB.name, '#9fe3ff');

    for (const p of this.pois()) {
      const [sx, sy] = this.toScreen(p.x, p.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      if (p.kind === 'camp') {
        this.icon(sx, sy, p.boss ? 'boss' : 'camp', p.cleared, RACE_COLOR[p.race]);
        if (this.zoom > 0.5 || p.boss) this.label(sx, sy + 18, `${p.name} · Lv ${p.level}`, levelColor(p.level - g.stats.level));
      } else if (p.kind === 'waystone') {
        this.icon(sx, sy, 'waystone', !p.active);
        if (this.zoom > 1.2 || this.hover === p) this.label(sx, sy + 16, p.name, p.active ? '#7fe8ff' : '#aaa');
      } else if (p.kind === 'settlement') {
        this.icon(sx, sy, 'settlement');
        this.label(sx, sy + 18, p.trader ? `${p.name} · Trader` : p.name, '#ffe2a8');
      } else if (p.kind === 'landmark') {
        this.icon(sx, sy, 'landmark');
        if (this.zoom > 0.35 || this.hover === p) this.label(sx, sy + 18, p.name, '#d8c8ff');
      } else if (this.zoom > 0.4) {
        this.icon(sx, sy, 'chest');
      }
    }

    const wp = g.questWaypoint();
    if (wp) {
      const [sx, sy] = this.toScreen(wp.x, wp.z);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(10, (wp.radius ?? 4) * this.zoom), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (g.customMarker) {
      const [sx, sy] = this.toScreen(g.customMarker.x, g.customMarker.z);
      this.icon(sx, sy, 'marker');
    }
    // Party members, wherever they are.
    for (const m of g.partyUI?.mates ?? []) {
      if (!m.online || !m.known) continue;
      const [sx, sy] = this.toScreen(m.x, m.z);
      ctx.fillStyle = PARTY_COLOR;
      ctx.strokeStyle = '#0a0c13';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      this.label(sx, sy - 12, m.name, PARTY_COLOR);
    }
    const p = g.player;
    const [px, py] = this.toScreen(p.position.x, p.position.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.facing);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#0a0c13';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(9, 9); ctx.lineTo(0, 4); ctx.lineTo(-9, 9); ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    this.hover = this.mouse ? this.pick(this.mouse.x, this.mouse.y) : null;
    const here = g.world.regionAt(p.position.x, p.position.z);
    this.info.textContent = this.hover
      ? (this.hover.kind === 'waystone' ? (this.hover.active ? `${this.hover.name} — click to travel` : `${this.hover.name} — not yet attuned`) : this.hover.name)
      : `${here.name} · Lv ${here.level} — Drag to pan · Wheel to zoom · Click to place a marker · Right-click clears it · Click an attuned waystone to fast travel`;
  }

  label(x, y, text, color, size = 12) {
    const ctx = this.ctx;
    ctx.font = `700 ${size}px "Chakra Petch", "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#0a0c13';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  icon(x, y, kind, dim = false, tint = null) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0a0c13';
    if (kind === 'camp' || kind === 'boss') {
      ctx.fillStyle = dim ? '#7a7a7a' : tint ?? (kind === 'boss' ? '#d43a2a' : '#b5523a');
      ctx.beginPath();
      ctx.arc(0, 0, kind === 'boss' ? 11 : 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dim ? '✓' : kind === 'boss' ? '☠' : '⚔', 0, 1);
    } else if (kind === 'waystone') {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = dim ? '#8a8a9a' : '#58cfff';
      ctx.strokeRect(-6, -6, 12, 12);
      ctx.fillRect(-6, -6, 12, 12);
    } else if (kind === 'chest') {
      ctx.fillStyle = '#f0c75e';
      ctx.strokeRect(-6, -4, 12, 9);
      ctx.fillRect(-6, -4, 12, 9);
    } else if (kind === 'settlement') {
      // A house: walls and a roof.
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.moveTo(-8, 7); ctx.lineTo(-8, -1); ctx.lineTo(0, -9); ctx.lineTo(8, -1); ctx.lineTo(8, 7); ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(-2, 1, 4, 6);
    } else if (kind === 'landmark') {
      // A four-pointed star.
      ctx.fillStyle = '#c8b4ff';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 3.5 : 10;
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    } else if (kind === 'hub') {
      ctx.fillStyle = '#9fe3ff';
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(10, 7); ctx.lineTo(-10, 7); ctx.closePath();
      ctx.stroke();
      ctx.fill();
    } else if (kind === 'marker') {
      ctx.fillStyle = '#4ad2ff';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-7, -12); ctx.arc(0, -14, 7, Math.PI, 0); ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.fill();
    }
    ctx.restore();
  }
}
