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

function samePlaceName(a, b) {
  const na = (a ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const nb = (b ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return na && na === nb;
}

function isRegionAnchorWaystone(region, poi) {
  return !!poi && poi.type === 'waystone' && samePlaceName(poi.name, region.name);
}

function sameRegionSettlement(settlement, region) {
  return !!settlement && !!region && samePlaceName(settlement.name, region.name) && !!settlement.way;
}

export function pickMapDrawStride({ width, height, zoom, chunkCount }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(zoom) || zoom <= 0) return 1;
  const visibleArea = (width * height) / (zoom * zoom);
  if (chunkCount <= 256 || visibleArea < 2_000_000) return 1;
  return Math.min(8, Math.max(2, Math.ceil(Math.sqrt(chunkCount / 250))));
}

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
  const drawStride = pickMapDrawStride({ width: ctx.canvas.width, height: ctx.canvas.height, zoom: px, chunkCount: d.chunks.size });
  let painted = 0;
  ctx.imageSmoothingEnabled = true;
  const wide = (cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 2500;
  const each = (fn) => {
    if (wide) {
      for (const key of d.chunks.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        if (cx >= cx0 && cx <= cx1 && cz >= cz0 && cz <= cz1) {
          if (drawStride > 1 && ((cx + cz) % drawStride) !== 0) continue;
          fn(cx, cz);
        }
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
    const hubInView = this.viewRect();
    const insideHub = HUB.x >= Math.min(hubInView[0], hubInView[2]) && HUB.x <= Math.max(hubInView[0], hubInView[2]) && HUB.z >= Math.min(hubInView[1], hubInView[3]) && HUB.z <= Math.max(hubInView[1], hubInView[3]);
    if (insideHub) out.push({ kind: 'settlement', x: HUB.x, z: HUB.z, name: HUB.name, id: 'w-hub', active: g.attuned.has('w-hub') });
    for (const r of this.regionsInView()) {
      // A town's or city's waystone stands at its heart: the place's own icon stands for it.
      const heart = r.pois.find((p) => p.type === 'town' || p.type === 'city');
      const way = heart && r.pois.find((p) => p.type === 'waystone');
      const areaWay = r.pois.find((p) => isRegionAnchorWaystone(r, p));
      if (r.hub || g.discovery.isKnown(r.x, r.z)) {
        out.push({ kind: 'location', x: r.x, z: r.z, name: r.name, level: r.level, id: areaWay?.id ?? null, active: !!areaWay && g.attuned.has(areaWay.id), hitWidth: Math.max(90, r.name.length * 9 + 28), hitHeight: 38, hitDx: 0, hitDy: -25, hoverDy: -50 });
      }
      for (const p of r.pois) {
        // The four story cities are known from the start: somewhere to head for.
        if (p.type === 'city') out.push({ kind: 'city', x: p.x, z: p.z, name: p.name, act: p.act, known: d.isKnown(p.x, p.z), id: way?.id, active: !!way && g.attuned.has(way.id) });
        if (!d.isKnown(p.x, p.z)) continue;
        if (p.type === 'waystone' && p === way) continue;
        if (p.type === 'waystone' && p.id === 'w-hub') continue;
        if (p.type === 'waystone' && p === areaWay) continue;
        if (p.type === 'waystone') out.push({ kind: 'waystone', x: p.x, z: p.z, name: p.name, active: g.attuned.has(p.id), id: p.id });
        else if (p.type === 'camp') out.push({ kind: 'camp', x: p.x, z: p.z, name: p.name, level: p.level, race: p.race, cleared: g.encounters.isCleared(p.id), boss: !!p.stronghold });
        else if (p.type === 'chest' && !g.openedChests.has(p.id)) out.push({ kind: 'chest', x: p.x, z: p.z, name: 'Treasure' });
        else if (p.type === 'settlement') {
          const wayId = `w:${p.key}`;
          const linked = sameRegionSettlement(p, r);
          out.push({ kind: 'settlement', x: p.x, z: p.z, name: p.name, id: linked ? wayId : null, active: linked && g.attuned.has(wayId) });
        }
        else if (p.type === 'hamlet') out.push({ kind: 'hamlet', x: p.x, z: p.z, name: p.name });
        else if (p.type === 'town') out.push({ kind: 'town', x: p.x, z: p.z, name: p.name, id: way?.id, active: !!way && g.attuned.has(way.id) });
        else if (p.type === 'landmark' || p.type === 'story') out.push({ kind: 'landmark', x: p.x, z: p.z, name: p.name, story: !!p.story });
      }
    }
    return out;
  }

  pick(sx, sy, radius = 14) {
    let best = null;
    let bd = Infinity;
    for (const p of this.pois()) {
      const [px, py] = this.toScreen(p.x, p.z);
      const hitDx = p.hitDx ?? 0;
      const hitDy = p.hitDy ?? 0;
      const hitRadius = p.hitRadius ?? radius;
      const dd = Math.hypot(px + hitDx - sx, py + hitDy - sy);
      const inside = p.hitWidth && p.hitHeight
        ? Math.abs(px + hitDx - sx) <= p.hitWidth / 2 && Math.abs(py + hitDy - sy) <= p.hitHeight / 2
        : dd < hitRadius;
      if (inside && dd < bd) { bd = dd; best = p; }
    }
    const wp = this.game.questWaypoint();
    if (wp) {
      const [px, py] = this.toScreen(wp.x, wp.z);
      const dd = Math.hypot(px - sx, py - sy);
      const r = Math.max(18, (wp.radius ?? 4) * this.zoom + 10);
      if (dd < r) {
        const qid = this.game.tracked;
        const q = qid && this.game.quests?.defs?.get(qid);
        const marker = { kind: 'quest', x: wp.x, z: wp.z, name: q?.title ?? 'Tracked quest', radius: wp.radius ?? 4 };
        if (!best || dd < bd) return marker;
      }
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
    if ((hit?.kind === 'location' || hit?.kind === 'waystone' || hit?.kind === 'town' || hit?.kind === 'city' || hit?.kind === 'settlement') && hit.active) {
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
    // Down in a dungeon, the map is its rooms seen so far.
    if (g.dungeonView?.active) {
      g.dungeonView.drawMap(ctx, W, H);
      this.label(W / 2, 46, g.dungeonView.def.name.toUpperCase(), '#ffe2a8', 18);
      return;
    }
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
      if (this.zoom < 0.45) continue;
      const name = r.name.toUpperCase();
      this.label(sx, sy - 26, name, RACE_COLOR[r.race], 14);
      const areaWay = r.pois.find((p) => isRegionAnchorWaystone(r, p));
      if (areaWay && g.attuned.has(areaWay.id)) this.icon(sx - ctx.measureText(name).width / 2 - 9, sy - 30, 'badge');
      if (this.zoom > 0.62) this.label(sx, sy - 12, `Lv ${r.level}`, levelColor(r.level - g.stats.level), 11);
    }

    for (const p of this.pois()) {
      const [sx, sy] = this.toScreen(p.x, p.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      const waystoneAnchor = p.kind === 'waystone' || p.kind === 'town' || p.kind === 'city' || (p.kind === 'settlement' && !!p.id);
      if (this.zoom < 0.65 && !waystoneAnchor) continue;
      if (p.kind === 'camp') {
        this.icon(sx, sy, p.boss ? 'boss' : 'camp', p.cleared, RACE_COLOR[p.race]);
        if (this.zoom > 0.5 || p.boss) this.label(sx, sy + 18, `${p.name} · Lv ${p.level}`, levelColor(p.level - g.stats.level));
      } else if (p.kind === 'waystone') {
        const region = this.game.world.gen.regionAt(p.x, p.z);
        const attachedToRegion = !!region && (p.anchor || isRegionAnchorWaystone(region, { type: 'waystone', name: p.name, x: p.x, z: p.z }));
        if (attachedToRegion) continue;
        this.icon(sx, sy, 'waystone', !p.active);
        if (this.zoom > 1.2 || this.hover === p) this.label(sx, sy + 16, p.name, p.active ? '#7fe8ff' : '#aaa');
      } else if (p.kind === 'settlement') {
        this.icon(sx, sy, 'settlement');
        if (p.id) this.icon(sx + 12, sy - 10, 'waystone', !p.active);
        this.label(sx, sy + 18, p.name, '#ffe2a8');
      } else if (p.kind === 'hamlet') {
        this.icon(sx, sy, 'hamlet');
        if (this.zoom > 0.6 || this.hover === p) this.label(sx, sy + 15, p.name, '#ffe2a8', 11);
      } else if (p.kind === 'town') {
        this.icon(sx, sy, 'town');
        if (p.active) this.icon(sx + 13, sy - 11, 'badge');
        this.label(sx, sy + 22, p.name, '#ffe2a8', 13);
      } else if (p.kind === 'city') {
        this.icon(sx, sy, 'city', !p.known);
        if (p.active) this.icon(sx + 15, sy - 14, 'badge');
        this.label(sx, sy + 26, p.name.toUpperCase(), p.known ? '#ffd27a' : '#c8b48a', 15);
        if (!p.known) this.label(sx, sy + 40, `Act ${p.act}`, '#a89878', 11);
      } else if (p.kind === 'landmark') {
        // The story's own places in gold.
        this.icon(sx, sy, 'landmark', false, p.story ? '#ffcf7a' : null);
        if (this.zoom > 0.35 || this.hover === p || p.story) this.label(sx, sy + 18, p.name, p.story ? '#ffe2a8' : '#d8c8ff');
      } else if (this.zoom > 0.4) {
        this.icon(sx, sy, 'chest');
      }
    }

    const wp = g.questWaypoint();
    if (wp) {
      const [sx, sy] = this.toScreen(wp.x, wp.z);
      this.questMarker(sx, sy, wp.kind ?? 'default', Math.max(8, (wp.radius ?? 4) * this.zoom * 0.9));
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
    const hoverLabel = (h) => {
      if (!h) return null;
      if (h.kind === 'quest') return `${h.name} — tracked objective`;
      if (h.kind === 'location' || h.kind === 'waystone' || h.kind === 'town' || h.kind === 'city' || (h.kind === 'settlement' && h.id)) {
        return h.active ? `Fast travel to ${h.name}` : `Cannot fast travel to ${h.name}`;
      }
      return null;
    };
    if (this.hover && hoverLabel(this.hover)) {
      const [sx, sy] = this.toScreen(this.hover.x, this.hover.z);
      const c = this.hover.kind === 'quest' ? '#ffd23f' : this.hover.kind === 'waystone' ? '#7fe8ff' : '#ffe2a8';
      this.label(sx, sy + (this.hover.hoverDy ?? -18), hoverLabel(this.hover), c, 12);
    }
    const here = g.world.regionAt(p.position.x, p.position.z);
    this.info.textContent = `${here.name} · Lv ${here.level} — Drag to pan · Wheel to zoom · Click to place a marker · Right-click clears it · Click an attuned waystone to fast travel`;
  }

  questMarkerStyle(kind = 'default') {
    const styles = {
      talk: { fill: '#ffd76a', stroke: '#ff9a1f', accent: '#fff0bf', mark: 'diamond' },
      use: { fill: '#74d9ff', stroke: '#2aa4ff', accent: '#dff7ff', mark: 'square' },
      goto: { fill: '#a3f5b0', stroke: '#31c36c', accent: '#e8ffe9', mark: 'ring' },
      defend: { fill: '#ff9d7d', stroke: '#f05d5d', accent: '#ffe2d6', mark: 'shield' },
      clear: { fill: '#d8b5ff', stroke: '#9b67e8', accent: '#f3eaff', mark: 'star' },
      killRace: { fill: '#ff8d8d', stroke: '#df4747', accent: '#ffe1e1', mark: 'cross' },
      attune: { fill: '#71f0ff', stroke: '#2bb9d6', accent: '#dffcff', mark: 'hex' },
      chest: { fill: '#f3d774', stroke: '#c68d1f', accent: '#fff6bf', mark: 'gem' },
      default: { fill: '#ffd23f', stroke: '#f9af28', accent: '#fff1b3', mark: 'diamond' },
    };
    return styles[kind] ?? styles.default;
  }

  questMarker(x, y, kind, radius = 9) {
    const ctx = this.ctx;
    const s = this.questMarkerStyle(kind);
    const r = radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0a0c13';
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
      ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
    } else if (s.mark === 'shield') {
      ctx.moveTo(0, -r * 1.35); ctx.lineTo(r * 1.15, -r * 0.35); ctx.lineTo(r * 0.75, r * 1.2); ctx.lineTo(0, r * 1.45); ctx.lineTo(-r * 0.75, r * 1.2); ctx.lineTo(-r * 1.15, -r * 0.35); ctx.closePath();
    } else if (s.mark === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const rr = i % 2 === 0 ? r * 1.3 : r * 0.5;
        const px = Math.cos(a) * rr; const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (s.mark === 'cross') {
      ctx.moveTo(-r * 0.6, -r * 1.2); ctx.lineTo(-r * 0.2, -r * 1.2); ctx.lineTo(-r * 0.2, -r * 0.2); ctx.lineTo(r * 1.2, -r * 0.2); ctx.lineTo(r * 1.2, r * 0.2); ctx.lineTo(-r * 0.2, r * 0.2); ctx.lineTo(-r * 0.2, r * 1.2); ctx.lineTo(-r * 0.6, r * 1.2); ctx.lineTo(-r * 0.6, r * 0.2); ctx.lineTo(-r * 1.2, r * 0.2); ctx.lineTo(-r * 1.2, -r * 0.2); ctx.lineTo(-r * 0.6, -r * 0.2); ctx.closePath();
    } else if (s.mark === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6; const px = Math.cos(a) * r * 1.12; const py = Math.sin(a) * r * 1.12; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (s.mark === 'gem') {
      ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * 1.05, 0); ctx.lineTo(0, r * 1.25); ctx.lineTo(-r * 1.05, 0); ctx.closePath();
      ctx.moveTo(-r * 0.8, 0); ctx.lineTo(0, r * 0.7); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, -r * 0.7); ctx.closePath();
    } else {
      ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    if (s.mark === 'ring' || s.mark === 'gem') { ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); }
    else if (s.mark === 'square') { ctx.rect(-r * 0.28, -r * 0.28, r * 0.56, r * 0.56); }
    else if (s.mark === 'hex') { ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); }
    else { ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); }
    ctx.fill();
    ctx.restore();
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
    } else if (kind === 'settlement' || kind === 'hamlet' || kind === 'town') {
      // A house (smaller for a hamlet); a town's inside a ring of walls.
      if (kind === 'hamlet') ctx.scale(0.7, 0.7);
      if (kind === 'town') {
        ctx.strokeStyle = '#ffd27a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#0a0c13';
        ctx.lineWidth = 3;
      }
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.moveTo(-8, 7); ctx.lineTo(-8, -1); ctx.lineTo(0, -9); ctx.lineTo(8, -1); ctx.lineTo(8, 7); ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(-2, 1, 4, 6);
    } else if (kind === 'city') {
      // Three towers behind a wall.
      ctx.fillStyle = dim ? '#a8976a' : '#ffd27a';
      ctx.beginPath();
      ctx.moveTo(-13, 10); ctx.lineTo(-13, -4); ctx.lineTo(-9, -8); ctx.lineTo(-5, -4); ctx.lineTo(-5, -2);
      ctx.lineTo(-3, -2); ctx.lineTo(-3, -11); ctx.lineTo(0, -15); ctx.lineTo(3, -11); ctx.lineTo(3, -2); ctx.lineTo(5, -2);
      ctx.lineTo(5, -4); ctx.lineTo(9, -8); ctx.lineTo(13, -4); ctx.lineTo(13, 10); ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(-2.5, 3, 5, 7);
    } else if (kind === 'landmark') {
      // A four-pointed star.
      ctx.fillStyle = tint ?? '#c8b4ff';
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
    } else if (kind === 'badge') {
      // A small waystone mark: attuned, so you can travel there.
      ctx.rotate(Math.PI / 4);
      ctx.lineWidth = 2;
      ctx.fillStyle = '#58cfff';
      ctx.strokeRect(-3.5, -3.5, 7, 7);
      ctx.fillRect(-3.5, -3.5, 7, 7);
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
