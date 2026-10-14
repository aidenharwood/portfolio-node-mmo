// Full-screen world map (M) of the explored world: terrain tiles of every chunk you've seen under
// a soft fog, roads, region names, camps and strongholds, waystones, chests, the quest target and
// a custom marker. Drag to pan, wheel or pinch to zoom (far enough out to see everything
// explored), click or tap to place a marker (or travel from an attuned waystone), right-click or
// a long press to clear the marker.
//   The slow-changing part of the picture — terrain, roads and fog — is painted into an offscreen
// canvas a margin bigger than the view and copied each frame (offset while panning, scaled while
// zooming), and the map is only drawn again when something moves; so panning and pinching stay
// smooth on a phone.
import { HUB, REGION } from '../world/Gen.js';
import { CHUNK } from '../world/Chunks.js';
import { PARTY_COLOR } from './PartyUI.js';
import { FogLayer } from './MapFog.js';

export function levelColor(diff) {
  if (diff >= 3) return '#ff5a5a';
  if (diff >= 1) return '#ffb347';
  if (diff <= -3) return '#9a9a9a';
  if (diff <= -1) return '#7be07b';
  return '#ffffff';
}

const RACE_COLOR = { scav: '#e8603a', hive: '#b07aff', synth: '#3ad8ff', fauna: '#ffb030' };
const BG = '#0b0f18';       // the map's ground where nothing's been seen (the fog's own colour)
const MARGIN = 256;         // CSS px of cached picture kept beyond each side of the view
const REFRESH = 100;        // ms between redraws while nothing's being dragged (the player arrow, party)
const SETTLE = 150;         // ms after the last zoom step before the picture's repainted at the new zoom
const TILE_BUDGET = 4;      // ms a frame may spend painting tiles of chunks never loaded this session
const font = (size) => `700 ${size}px "Chakra Petch", "Trebuchet MS", sans-serif`;

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

// Whether the cached picture `base` (painted at base.zoom round base.cx, base.cz, base.w × base.h
// CSS px) covers all of the view `v` (its centre, zoom and size).
export function baseCovers(base, v) {
  const bw = base.w / 2 / base.zoom;
  const bh = base.h / 2 / base.zoom;
  const vw = v.w / 2 / v.zoom;
  const vh = v.h / 2 / v.zoom;
  return v.cx - vw >= base.cx - bw - 1e-6 && v.cx + vw <= base.cx + bw + 1e-6
    && v.cz - vh >= base.cz - bh - 1e-6 && v.cz + vh <= base.cz + bh + 1e-6;
}

// Whether the cached picture has to be painted again for the view `v` at time `now` (ms): never
// painted, the window or what's explored has changed, the view's panned out of it, the zoom has
// settled somewhere new, or tiles it was waiting for have come in. Mid-zoom, the old picture
// scaled stands in (beyond its edges is the fog's colour anyway) unless it's stretched too far.
export function baseStale(base, v, now) {
  if (!base) return true;
  if (base.vw !== v.w || base.vh !== v.h || base.dpr !== v.dpr || base.version !== v.version) return true;
  if (v.zoom !== base.zoom) {
    if (now - v.zoomedAt > SETTLE && !v.pinching) return true;
    const s = v.zoom / base.zoom;
    return (s < 0.5 || s > 2) && now - base.at > 200;
  }
  if (!baseCovers(base, v)) return true;
  return !base.complete && (v.tilesReady || now - base.at > 250);
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
    this.w = this.canvas.width;  // CSS px (the canvas itself is dpr times that)
    this.h = this.canvas.height;
    this.dpr = 1;
    this.drag = null;
    this.hover = null;
    this.base = null;            // the cached picture (see paintBase)
    this.missing = [];           // chunks whose tiles the cached picture is waiting for
    this.fog = new FogLayer([11, 15, 24, 235], 2);
    this.labels = [];
    this.widths = new Map();     // label text widths, by size and text
    this.dirty = true;
    this.drawnAt = 0;
    this.zoomedAt = 0;
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { this.sizeDirty = true; }).observe(this.canvas);

    // Mouse, pen or fingers: drag to pan, click or tap to travel or mark, right-click or a long
    // press to clear the marker, wheel or pinch to zoom.
    this.touches = new Map();   // pointerId → { x, y } (canvas pixels)
    this.canvas.addEventListener('pointerdown', (e) => {
      const pt = this.local(e);
      this.touches.set(e.pointerId, pt);
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
      this.mouse = pt;
      this.dirty = true;
      if (this.touches.size === 2) { this.drag = null; this.pinch = this.pinchState(); return; }
      if (e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false, at: performance.now() };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isOpen) return;
      const pt = this.local(e);
      this.mouse = pt;
      this.dirty = true;
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
      this.dirty = true;
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
      this.dirty = true;
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.toWorld(this.mouse?.x ?? this.w / 2, this.mouse?.y ?? this.h / 2);
      this.zoom = Math.min(6, Math.max(0.08, this.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
      const after = this.toWorld(this.mouse?.x ?? this.w / 2, this.mouse?.y ?? this.h / 2);
      this.cx += before.x - after.x;
      this.cz += before.z - after.z;
      this.zoomedAt = performance.now();
      this.dirty = true;
    }, { passive: false });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  open() {
    const p = this.game.player.position;
    this.cx = p.x;
    this.cz = p.z;
    this.el.classList.remove('hidden');
    this.resize();
    this.zoom = Math.max(0.6, Math.min(this.w, this.h) / 360);
    this.mouse = null;
    this.dirty = true;
  }

  close() { this.el.classList.add('hidden'); }

  // The canvas at the screen's resolution (up to 2× on phones, so text and icons stay sharp).
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.sizeDirty = false;
    this.dirty = true;
  }

  toScreen(x, z) {
    return [this.w / 2 + (x - this.cx) * this.zoom, this.h / 2 - (z - this.cz) * this.zoom];
  }

  toWorld(sx, sy) {
    return { x: this.cx + (sx - this.w / 2) / this.zoom, z: this.cz - (sy - this.h / 2) / this.zoom };
  }

  viewRect() {
    const a = this.toWorld(0, this.h);
    const b = this.toWorld(this.w, 0);
    return [a.x, a.z, b.x, b.z];
  }

  // Regions overlapping a world rectangle (none when zoomed so far out there'd be too many).
  regionsIn(x0, z0, x1, z1) {
    const gen = this.game.world.gen;
    const out = [];
    const r0 = gen.cellOf(x0 - REGION, z0 - REGION);
    const r1 = gen.cellOf(x1 + REGION, z1 + REGION);
    if ((r1[0] - r0[0] + 1) * (r1[1] - r0[1] + 1) > 900) return out;
    for (let rx = r0[0]; rx <= r1[0]; rx++) for (let rz = r0[1]; rz <= r1[1]; rz++) out.push(gen.region(rx, rz));
    return out;
  }

  regionsInView() { return this.regionsIn(...this.viewRect()); }

  // Things you can point at on the map (only discovered ones). Kept for a moment for the same
  // view: a frame's drawing and the hover test share it.
  pois() {
    const now = performance.now();
    const key = `${this.cx},${this.cz},${this.zoom},${this.w},${this.h}`;
    if (this.poiCache?.key === key && now - this.poiCache.at < 500) return this.poiCache.list;
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
    this.poiCache = { key, at: now, list: out };
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
    this.zoomedAt = performance.now();
  }

  click() {
    // (A dungeon's map is only its rooms: nothing to travel to or mark.)
    if (!this.mouse || this.game.dungeonView?.active) return;
    const hit = this.pick(this.mouse.x, this.mouse.y);
    if ((hit?.kind === 'location' || hit?.kind === 'waystone' || hit?.kind === 'town' || hit?.kind === 'city' || hit?.kind === 'settlement') && hit.active) {
      this.game.travelTo(hit.id);
      return;
    }
    const w = this.toWorld(this.mouse.x, this.mouse.y);
    this.game.customMarker = { x: w.x, z: w.z };
  }

  // The cached picture: explored terrain, the roads seen and the fog, over the view and a margin
  // round it, at the current zoom.
  paintBase(now) {
    const g = this.game;
    const d = g.discovery;
    // (At the screen's own resolution rather than the canvas's: the tiles are coarser than either,
    // and a quarter of the pixels to fill on a phone.)
    const dpr = 1;
    const z = this.zoom;
    const w = this.w + MARGIN * 2;
    const h = this.h + MARGIN * 2;
    const b = (this.base ??= { canvas: document.createElement('canvas') });
    const c = b.canvas;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    Object.assign(b, { cx: this.cx, cz: this.cz, zoom: z, w, h, vw: this.w, vh: this.h, dpr: this.dpr, version: d.version, at: now });
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const toScreen = (x, zz) => [w / 2 + (x - b.cx) * z, h / 2 - (zz - b.cz) * z];
    const x0 = b.cx - w / 2 / z;
    const x1 = b.cx + w / 2 / z;
    const z0 = b.cz - h / 2 / z;
    const z1 = b.cz + h / 2 / z;
    const cx0 = Math.floor(x0 / CHUNK);
    const cx1 = Math.floor(x1 / CHUNK);
    const cz0 = Math.floor(z0 / CHUNK);
    const cz1 = Math.floor(z1 / CHUNK);

    // Explored terrain, a tile per chunk. Chunks never loaded this session have no tile yet: they're
    // painted a few a frame (nearest the middle first) and the picture's repainted as they come.
    const size = CHUNK * z;
    const missing = [];
    ctx.imageSmoothingEnabled = true;
    const tile = (cx, cz) => {
      const t = g.world.tiles.get((cx + 32768) * 65536 + (cz + 32768));
      if (!t) { missing.push([cx, cz]); return; }
      const [sx, sy] = toScreen(cx * CHUNK, (cz + 1) * CHUNK);
      ctx.drawImage(t, sx, sy, size + 0.5, size + 0.5);
    };
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > d.chunks.size) {
      for (const key of d.chunks.keys()) {
        const i = key.indexOf(',');
        const cx = +key.slice(0, i);
        const cz = +key.slice(i + 1);
        if (cx >= cx0 && cx <= cx1 && cz >= cz0 && cz <= cz1) tile(cx, cz);
      }
    } else for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) if (d.mask(cx, cz)) tile(cx, cz);
    const mx = Math.floor(this.cx / CHUNK);
    const mz = Math.floor(this.cz / CHUNK);
    this.missing = missing.sort((p, q) => Math.hypot(q[0] - mx, q[1] - mz) - Math.hypot(p[0] - mx, p[1] - mz));
    b.complete = !missing.length;

    // Roads, as far as they've been seen.
    if (z > 0.2) {
      ctx.strokeStyle = 'rgba(214,180,120,0.9)';
      ctx.lineWidth = Math.max(1.2, 2.6 * z * 0.6);
      for (const r of this.regionsIn(x0, z0, x1, z1)) {
        for (const path of r.roads) {
          ctx.beginPath();
          let pen = false;
          for (const [x, zz] of path) {
            const known = d.isKnown(x, zz);
            const [sx, sy] = toScreen(x, zz);
            if (known && pen) ctx.lineTo(sx, sy); else if (known) ctx.moveTo(sx, sy);
            pen = known;
          }
          ctx.stroke();
        }
      }
    }

    // The fog over the cells not yet seen (ui/MapFog.js).
    if (this.fog.cover(d, cx0, cz0, cx1, cz1)) {
      const f = this.fog.bounds;
      const [sx, sy] = toScreen(f.x, f.zTop);
      ctx.drawImage(this.fog.canvas, sx, sy, f.w * z, f.h * z);
    }
  }

  // Paints some of the tiles the cached picture is waiting for.
  paintMissing() {
    if (!this.missing.length) return;
    const t0 = performance.now();
    while (this.missing.length && performance.now() - t0 < TILE_BUDGET) {
      const [cx, cz] = this.missing.pop();
      this.game.world.tileFor(cx, cz);
    }
  }

  draw() {
    if (!this.isOpen) return;
    const g = this.game;
    const now = performance.now();
    if (this.sizeDirty) this.resize();
    const indoors = g.dungeonView?.active;
    if (!indoors) this.paintMissing();
    const view = {
      cx: this.cx, cz: this.cz, zoom: this.zoom, w: this.w, h: this.h, dpr: this.dpr, version: g.discovery.version,
      zoomedAt: this.zoomedAt, pinching: !!this.pinch, tilesReady: !this.missing.length,
    };
    const stale = !indoors && baseStale(this.base, view, now);
    // Nothing moved: the player's arrow, party members and the like are brought up to date a few
    // times a second.
    if (!stale && !this.dirty && now - this.drawnAt < REFRESH) return;
    this.dirty = false;
    this.drawnAt = now;
    if (stale) this.paintBase(now);

    const ctx = this.ctx;
    const W = this.w;
    const H = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    // Down in a dungeon, the map is its rooms seen so far.
    if (indoors) {
      g.dungeonView.drawMap(ctx, W, H);
      this.label(W / 2, 46, g.dungeonView.def.name.toUpperCase(), '#ffe2a8', 18);
      this.setInfo(`${g.dungeonView.def.name} · Lv ${g.dungeonView.run.lv} — the rooms you've seen so far`);
      return;
    }
    const b = this.base;
    const s = this.zoom / b.zoom;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(b.canvas, W / 2 + (b.cx - b.w / 2 / b.zoom - this.cx) * this.zoom, H / 2 - (b.cz + b.h / 2 / b.zoom - this.cz) * this.zoom, b.w * s, b.h * s);

    for (const r of this.regionsInView()) {
      if (r.hub || !g.discovery.isKnown(r.x, r.z) || this.zoom < 0.45) continue;
      const [sx, sy] = this.toScreen(r.x, r.z);
      const areaWay = r.pois.find((p) => isRegionAnchorWaystone(r, p));
      this.queueLabel(sx, sy - 26, r.name.toUpperCase(), RACE_COLOR[r.race], 14, 60, !!areaWay && g.attuned.has(areaWay.id));
      if (this.zoom > 0.62) this.queueLabel(sx, sy - 12, `Lv ${r.level}`, levelColor(r.level - g.stats.level), 11, 58);
    }

    for (const p of this.pois()) {
      const [sx, sy] = this.toScreen(p.x, p.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      const waystoneAnchor = p.kind === 'waystone' || p.kind === 'town' || p.kind === 'city' || (p.kind === 'settlement' && !!p.id);
      if (this.zoom < 0.65 && !waystoneAnchor) continue;
      if (p.kind === 'camp') {
        this.icon(sx, sy, p.boss ? 'boss' : 'camp', p.cleared, RACE_COLOR[p.race]);
        if (this.zoom > 0.5 || p.boss) this.queueLabel(sx, sy + 18, `${p.name} · Lv ${p.level}`, levelColor(p.level - g.stats.level), 12, p.boss ? 45 : 40);
      } else if (p.kind === 'waystone') {
        const region = this.game.world.gen.regionAt(p.x, p.z);
        const attachedToRegion = !!region && (p.anchor || isRegionAnchorWaystone(region, { type: 'waystone', name: p.name, x: p.x, z: p.z }));
        if (attachedToRegion) continue;
        this.icon(sx, sy, 'waystone', !p.active);
        if (this.zoom > 1.2 || this.hover === p) this.queueLabel(sx, sy + 16, p.name, p.active ? '#7fe8ff' : '#aaa', 12, 25);
      } else if (p.kind === 'settlement') {
        this.icon(sx, sy, 'settlement');
        if (p.id) this.icon(sx + 12, sy - 10, 'waystone', !p.active);
        this.queueLabel(sx, sy + 18, p.name, '#ffe2a8', 12, 50);
      } else if (p.kind === 'hamlet') {
        this.icon(sx, sy, 'hamlet');
        if (this.zoom > 0.6 || this.hover === p) this.queueLabel(sx, sy + 15, p.name, '#ffe2a8', 11, 30);
      } else if (p.kind === 'town') {
        this.icon(sx, sy, 'town');
        if (p.active) this.icon(sx + 13, sy - 11, 'badge');
        this.queueLabel(sx, sy + 22, p.name, '#ffe2a8', 13, 70);
      } else if (p.kind === 'city') {
        this.icon(sx, sy, 'city', !p.known);
        if (p.active) this.icon(sx + 15, sy - 14, 'badge');
        this.queueLabel(sx, sy + 26, p.name.toUpperCase(), p.known ? '#ffd27a' : '#c8b48a', 15, 80);
        if (!p.known) this.queueLabel(sx, sy + 40, `Act ${p.act}`, '#a89878', 11, 79);
      } else if (p.kind === 'landmark') {
        // The story's own places in gold.
        this.icon(sx, sy, 'landmark', false, p.story ? '#ffcf7a' : null);
        if (this.zoom > 0.35 || this.hover === p || p.story) this.queueLabel(sx, sy + 18, p.name, p.story ? '#ffe2a8' : '#d8c8ff', 12, p.story ? 44 : 35);
      } else if (this.zoom > 0.4) {
        this.icon(sx, sy, 'chest');
      }
    }

    const wp = g.questWaypoint();
    if (wp) {
      const [sx, sy] = this.toScreen(wp.x, wp.z);
      if (['goto', 'defend', 'clear'].includes(wp.kind) && wp.radius > 8) this.searchArea(sx, sy, wp.kind, wp.radius * this.zoom);
      this.questMarker(sx, sy, wp.kind ?? 'default', 8);
      const q = g.tracked && g.quests?.defs?.get(g.tracked);
      if (q && sx > 24 && sx < W - 24 && sy > 42 && sy < H - 28) {
        this.queueLabel(sx, sy - 18, `★ ${q.title}`, '#ffe08a', 12, 100);
      }
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
      this.queueLabel(sx, sy - 12, m.name, PARTY_COLOR, 12, 90);
    }
    this.flushLabels();
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
    this.setInfo(g.touchActive
      ? `${here.name} · Lv ${here.level} — Drag to pan · Pinch to zoom · Tap to place a marker · Hold to clear it · Tap an attuned waystone to fast travel`
      : `${here.name} · Lv ${here.level} — Drag to pan · Wheel to zoom · Click to place a marker · Right-click clears it · Click an attuned waystone to fast travel`);
  }

  setInfo(text) {
    if (this.infoText !== text) this.info.textContent = this.infoText = text;
  }

  // Labels go down most important first; one that would overlap a label already down is left out,
  // which keeps a zoomed-out map (or a phone's) readable. A `badge` is the attuned-waystone mark
  // before a region's name.
  queueLabel(x, y, text, color, size = 12, prio = 0, badge = false) {
    this.labels.push({ x, y, text, color, size, prio, badge });
  }

  flushLabels() {
    const placed = [];
    const list = this.labels.sort((a, b) => b.prio - a.prio);
    this.labels = [];
    for (const l of list) {
      const half = this.textWidth(l.text, l.size) / 2 + 2;
      const r = { x0: l.x - half, x1: l.x + half, y0: l.y - l.size, y1: l.y + l.size * 0.3 };
      if (placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
      placed.push(r);
      this.label(l.x, l.y, l.text, l.color, l.size);
      if (l.badge) this.icon(r.x0 - 7, l.y - 4, 'badge');
    }
  }

  textWidth(text, size) {
    const key = `${size}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      this.ctx.font = font(size);
      w = this.ctx.measureText(text).width;
      if (this.widths.size > 2000) this.widths.clear();
      this.widths.set(key, w);
    }
    return w;
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

  searchArea(x, y, kind, radius) {
    const ctx = this.ctx;
    const s = this.questMarkerStyle(kind);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `${s.fill}08`;
    ctx.fill();
    ctx.setLineDash([5, 7]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `${s.fill}70`;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  questMarker(x, y, kind, radius = 9) {
    const ctx = this.ctx;
    const s = this.questMarkerStyle(kind);
    const r = radius;
    ctx.save();
    ctx.translate(x, y);
    // A marker radius is visual size only; the objective's search radius is drawn separately.
    ctx.shadowColor = 'rgba(0,0,0,.65)';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,12,20,.82)';
    ctx.fill();
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#101723';
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
    ctx.font = font(size);
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
