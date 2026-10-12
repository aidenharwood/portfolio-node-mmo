// Assembles a weapon model from its rolled component forms (weapon.look → items/forms.js),
// with stat parts layering dimensions and features (blade length, scopes, twin barrels, drums...).
// Origin = grip; the weapon points down +Z. userData.muzzle marks where shots/spells leave.
import * as THREE from 'three';
import { piece, bakeTree, G } from '../render/ModelKit.js';
import { MANUFACTURERS } from './manufacturers.js';
import { RARITY } from './rarity.js';
import { ELEMENTS } from './elements.js';
import { PART_INDEX } from './parts.js';
import { FORMS, DARK, WOOD, LEATHER } from './forms.js';
import { WEAPON_TYPES } from './weaponTypes.js';
import { rivets, panelLine, vents, cable, brandStripe, emblem } from '../render/Greeble.js';

// Half-width of each receiver form, so side detail sits on the surface.
const RECEIVER_HALF = { block: 0.056, rounded: 0.06, angular: 0.056, skeletal: 0.046, boxy: 0.066 };

function context(weapon) {
  const mfr = MANUFACTURERS[weapon.manufacturer];
  const rar = RARITY[weapon.rarity];
  const part = (slot) => PART_INDEX[weapon.parts[slot]]?.visual ?? {};
  // Signature energy: the element's colour if elemental, otherwise the manufacturer's.
  const accent = weapon.element !== 'none' ? ELEMENTS[weapon.element].color : mfr.palette.energy;
  const focus = part('focus');
  return {
    weapon, mfr: weapon.manufacturer, pal: mfr.palette, rar, tier: rar.tier, accent, part,
    showAccent: true,
    gemColor: focus.tint && weapon.element === 'none' ? focus.tint : accent,
    gemShape: focus.gem ?? 'octa',
    shaftColor: part('shaft').color ?? WOOD,
    bindingColor: part('binding').color ?? 0x2e3240,
  };
}

const form = (weapon, kind, fallback) => FORMS[kind][weapon.look?.[kind]] ?? FORMS[kind][fallback];

// ---------------------------------------------------------------- melee
function bladed(g, c, w, { dagger = false } = {}) {
  const blade = c.part('blade');
  const big = WEAPON_TYPES[w.type].scale ?? 1;
  const len = (blade.length ?? 1.1) * (dagger ? 0.52 : big);
  const width = (blade.width ?? 0.12) * (dagger ? 1.15 : big > 1 ? 1.3 : 1);
  const gripLen = dagger ? 0.18 : big > 1 ? 0.44 : 0.26;
  const z0 = gripLen / 2 + 0.05;

  form(w, 'grip', 'wrapped').build(g, c, { len: gripLen });
  piece(g, G.torus(0.04, 0.008, Math.PI * 2, 4, 12), c.accent, { pos: [0, 0, gripLen / 2], glow: true, outline: 0 });
  form(w, 'guard', 'bar').build(g, c, { z: gripLen / 2 + 0.02, w: c.part('hilt').guard ?? 0.34 });
  piece(g, G.box(width * 0.85, 0.045, 0.05), c.pal.primary, { pos: [0, 0, z0 + 0.01], outline: 0.012 });
  form(w, 'blade', 'straight').build(g, c, { z0, len, w: width, th: 0.026 });

  if (blade.style === 'serrated') {
    for (let i = 0; i < 6; i++) {
      piece(g, G.cone(0.018, 0.05, 4), c.pal.metal, { pos: [width / 2 + 0.02, 0, z0 + len * (0.12 + i * 0.1)], rot: [0, 0, -Math.PI / 2], outline: 0.006 });
    }
  }
  if (blade.glow) {
    for (let i = 0; i < 4; i++) {
      piece(g, G.box(width * 0.3, 0.042, 0.03), c.accent, { pos: [0, 0, z0 + len * (0.15 + i * 0.15)], rot: [0, i % 2 ? 0.6 : -0.6, 0], glow: true, outline: 0 });
    }
  }
  const pom = c.part('pommel').style === 'gem' ? FORMS.pommel.gem : form(w, 'pommel', 'ball');
  pom.build(g, c, { z: -gripLen / 2 - 0.05 });

  // Detail: emblem on both faces of the collar, seams on the alloy core, a power lead down the grip.
  for (const s of [-1, 1]) emblem(g, c, [0, 0.033 * s, z0 + 0.02], { pitch: -Math.PI / 2 * s, size: Math.min(0.05, width * 0.4) });
  for (const s of [-1, 1]) panelLine(g, [width * 0.17 * s, 0, z0 + len * 0.3], [0.004, 0.03, len * 0.42]);
  rivets(g, c.pal.metal, [[-width * 0.28, 0.026, z0 + 0.02], [width * 0.28, 0.026, z0 + 0.02]], { axis: 'y', r: 0.008 });
  cable(g, [[0.035, 0.0, -gripLen / 2 - 0.02], [0.048, 0.005, -gripLen / 4], [0.048, 0.005, gripLen / 4], [0.03, 0.0, gripLen / 2 + 0.04]], c.pal.secondary, 0.007);
}

function axe(g, c, w) {
  const haft = c.part('haft');
  const head = c.part('head');
  const len = haft.length ?? 1.1;
  const z0 = -0.22;
  form(w, 'haft', 'straight').build(g, c, { len, z0 });
  for (let i = 0; i < 3; i++) piece(g, G.torus(0.048, 0.01, Math.PI * 2, 4, 10), LEATHER, { pos: [0, 0, -0.1 + i * 0.06], outline: 0 });
  form(w, 'axeHead', 'bearded').build(g, c, { tip: z0 + len - 0.12, s: head.size ?? 1 });
  if (head.spike && w.look?.axeHead !== 'halberd') {
    piece(g, G.coneZ(0.035, 0.16, 6), c.pal.metal, { pos: [0, 0, z0 + len + 0.04], outline: 0.012 });
  }
  form(w, 'pommel', 'ball').build(g, c, { z: z0 - 0.02 });
  const tip = z0 + len - 0.12;
  emblem(g, c, [0.056, 0, tip], { yaw: Math.PI / 2, size: 0.05 });
  rivets(g, c.pal.metal, [[0, 0.052, tip - 0.09], [0, 0.052, tip + 0.09]], { axis: 'y' });
  cable(g, [[0.04, 0, tip - 0.14], [0.05, 0.01, tip - 0.4], [0.045, 0, tip - 0.6]], c.pal.secondary, 0.008);
}

function spear(g, c, w) {
  const len = (c.part('haft').length ?? 1.1) * 1.65;
  const z0 = -0.55;
  const tip = c.part('tip');
  form(w, 'haft', 'straight').build(g, c, { len, z0 });
  for (let i = 0; i < 3; i++) piece(g, G.torus(0.048, 0.01, Math.PI * 2, 4, 10), LEATHER, { pos: [0, 0, -0.06 + i * 0.06], outline: 0 });
  const headZ = z0 + len + 0.04;
  form(w, 'spearHead', 'leaf').build(g, c, { tip: headZ, s: tip.size ?? 1 });
  if (tip.barbs) {
    for (const s of [-1, 1]) piece(g, G.cone(0.02, 0.1, 4), c.pal.metal, { pos: [0.06 * s, 0, headZ + 0.06], rot: [-0.9, 0, 0], outline: 0.006 });
  }
  piece(g, G.coneZ(0.04, 0.12, 6), c.pal.primary, { pos: [0, 0, z0 - 0.04], rot: [Math.PI, 0, 0], outline: 0.01 });
  emblem(g, c, [0, 0.058, headZ - 0.04], { pitch: -Math.PI / 2, size: 0.04 });
  for (const t of [0.25, 0.55]) rivets(g, c.pal.metal, [[0.045, 0, z0 + len * t], [-0.045, 0, z0 + len * t]], { axis: 'x', r: 0.01 });
}

function hammer(g, c, w) {
  const len = (c.part('haft').length ?? 1.1) * 1.05;
  const z0 = -0.22;
  const maul = c.part('maul');
  form(w, 'haft', 'straight').build(g, c, { len, z0 });
  for (let i = 0; i < 3; i++) piece(g, G.torus(0.048, 0.01, Math.PI * 2, 4, 10), LEATHER, { pos: [0, 0, -0.1 + i * 0.06], outline: 0 });
  const tip = z0 + len - 0.05;
  form(w, 'hammerHead', 'block').build(g, c, { tip, s: maul.size ?? 1 });
  const hs = maul.size ?? 1;
  emblem(g, c, [0, 0.12 * hs + 0.012, tip], { pitch: -Math.PI / 2, size: 0.07 * hs });
  cable(g, [[0.03, 0.03, tip - 0.12 * hs], [0.06, 0.04, tip - 0.35], [0.045, 0, tip - 0.55]], c.pal.secondary, 0.01);
  if (maul.glow || c.showAccent) {
    for (const s of [-1, 1]) piece(g, G.box(0.02, 0.1, 0.1), c.accent, { pos: [0.08 * s, 0.13 * (maul.size ?? 1), tip], glow: true, outline: 0 });
  }
  form(w, 'pommel', 'ball').build(g, c, { z: z0 - 0.02 });
}

// ---------------------------------------------------------------- guns
const GUN = {
  pistol: { body: 0.34, h: 0.15, barrel: 0.8 },
  rifle: { body: 0.6, h: 0.16, barrel: 1.3 },
  shotgun: { body: 0.55, h: 0.17, barrel: 1.2 },
  smg: { body: 0.42, h: 0.15, barrel: 0.9 },
  sniper: { body: 0.7, h: 0.16, barrel: 2.1 },
};

function gun(g, c, w, kind) {
  const T = GUN[kind];
  const barrel = c.part('barrel');
  const body = c.part('body');
  const z0 = -0.08;

  const rec = form(w, 'receiver', 'block').build(g, c, { B: T.body, H: T.h, z0 });
  form(w, 'gunGrip', 'straight').build(g, c, {});
  const magForm = body.drum ? FORMS.magazine.drum : form(w, 'magazine', 'straight');
  magForm.build(g, c, { mid: rec.mid, z1: rec.z1, kind, m: body.mag ?? 1 });
  if (kind === 'shotgun') {
    piece(g, G.box(0.1, 0.07, 0.2), c.pal.secondary, { pos: [0, -0.005, rec.z1 + 0.14] });
    for (let i = 0; i < 4; i++) piece(g, G.box(0.105, 0.075, 0.012), DARK, { pos: [0, -0.005, rec.z1 + 0.06 + i * 0.05], outline: 0 });
  }

  const by = 0.1;
  const muzzleZ = form(w, 'barrel', 'plain').build(g, c, {
    z1: rec.z1, len: (barrel.length ?? 0.35) * T.barrel, by,
    thick: barrel.thick || kind === 'shotgun' ? 1.4 : 1, twin: !!barrel.twin,
  });
  g.userData.muzzle = new THREE.Vector3(0, by, muzzleZ);

  if (kind === 'smg') {
    piece(g, G.box(0.06, 0.16, 0.06), c.pal.secondary, { pos: [0, -0.04, rec.z1 + 0.06], rot: [0.15, 0, 0] });
    g.userData.grip2 = { local: new THREE.Vector3(0, -0.07, rec.z1 + 0.06), when: 'always' };
  } else if (kind !== 'pistol') {
    // Vertical foregrip just behind the receiver's front: the support hand's handle.
    const fz = rec.z1 - T.body * 0.22;
    piece(g, G.box(0.045, 0.13, 0.055), c.pal.secondary, { pos: [0, -0.06, fz], rot: [0.12, 0, 0] });
    piece(g, G.box(0.055, 0.02, 0.065), DARK, { pos: [0, -0.125, fz + 0.008], outline: 0.008 });
    piece(g, G.box(0.05, 0.012, 0.04), c.accent, { pos: [0, -0.005, fz], glow: true, outline: 0 });
    g.userData.grip2 = { local: new THREE.Vector3(0, -0.07, fz), when: 'always' };
  }
  if (kind === 'sniper') {
    for (const s of [-1, 1]) piece(g, G.tube([[0, 0.05, rec.z1 + 0.25], [0.06 * s, -0.08, rec.z1 + 0.3], [0.1 * s, -0.22, rec.z1 + 0.32]], 0.012, 6, 4), DARK, { outline: 0.006 });
  }
  if (kind !== 'pistol' && kind !== 'smg') form(w, 'stock', 'solid').build(g, c, { z0, len: c.part('stock').length ?? 0.35 });

  // Sights. Each kind records its sight line in userData.sight — the height it runs at and the
  // z where the eye end sits — so first-person aiming can put that line on the screen centre.
  const sight = c.part('sight');
  const top = rec.top;
  const mid = rec.mid;
  if (sight.scope) {
    scopeModel(g, c, w, top, mid);
  } else if (sight.holo) {
    holoSight(g, c, w, top, mid);
  } else {
    ironSight(g, c, w, top, z0, by, muzzleZ);
  }
  if (c.showAccent) {
    for (const s of [-1, 1]) piece(g, G.box(0.006, 0.02, T.body * 0.45), c.accent, { pos: [0.068 * s, 0.07 + T.h * 0.22, mid], glow: true, outline: 0 });
  }

  // Receiver detail: seams, vents, rivets, a charging handle and the maker's emblem on both sides.
  const hw = RECEIVER_HALF[w.look?.receiver] ?? 0.056;
  for (const s of [-1, 1]) {
    const x = (hw + 0.002) * s;
    for (const dz of [-0.28, 0.22]) panelLine(g, [x, 0.07, mid + T.body * dz], [0.004, T.h * 0.75, 0.005]);
    panelLine(g, [x, 0.07 - T.h * 0.3, mid], [0.004, 0.005, T.body * 0.8]);
    vents(g, [x, 0.095, rec.z1 - 0.13], [0, 0, 1], { count: 4, spacing: 0.026, size: [0.006, 0.032, 0.012] });
    rivets(g, c.pal.metal, [[x, 0.07 + T.h * 0.32, z0 + 0.03], [x, 0.07 + T.h * 0.32, rec.z1 - 0.03], [x, 0.07 - T.h * 0.38, z0 + 0.03], [x, 0.07 - T.h * 0.38, rec.z1 - 0.03]], { axis: 'x' });
    emblem(g, c, [x + 0.004 * s, 0.07, mid - T.body * 0.04], { yaw: (Math.PI / 2) * s, size: 0.045 });
  }
  piece(g, G.box(0.03, 0.018, 0.05), DARK, { pos: [-hw - 0.012, 0.11, z0 + 0.09], outline: 0.006 });
  piece(g, G.sphere(0.013, 6, 4), c.pal.metal, { pos: [-hw - 0.03, 0.11, z0 + 0.09], outline: 0.004 });
  brandStripe(g, c, [0, rec.top - 0.015, rec.z1 - 0.04], [hw * 1.6, 0.01, 0.03]);
  if (sight.scope && g.userData.sight.style === 'default') {
    piece(g, G.cyl(0.016, 0.016, 0.04, 8), c.pal.metal, { pos: [0, top + 0.115, mid], outline: 0.006 });
    piece(g, G.cyl(0.016, 0.016, 0.04, 8), c.pal.metal, { pos: [0.045, top + 0.07, mid], rot: [0, 0, Math.PI / 2], outline: 0.006 });
    piece(g, G.torus(0.04, 0.006, Math.PI * 2, 4, 14), c.accent, { pos: [0, top + 0.07, mid + 0.11], glow: true, outline: 0 });
  }
}

// Scopes in each maker's style (the scope view in first person matches — ui/ScopeView.js):
//   kessler    long matte military tube, big objective bell, turrets, a rangefinder box
//   rattlecap  brass tube patched with tape and rivets, a dangling lens cap, a stray wire
//   voltaic    boxy white digital housing, coil rings round the objective, glowing screen
//   rime       faceted crystal tube with ice shards along its back
// All share one sight line (top + 0.07) and eyepiece position, so aiming lines up the same.
export const SCOPE_STYLES = ['kessler', 'rattlecap', 'voltaic', 'rime'];
function scopeModel(g, c, w, top, mid) {
  const y = top + 0.07;
  const lens = c.accent;
  const style = SCOPE_STYLES.includes(w.manufacturer) ? w.manufacturer : 'default';
  const rings = (color) => { for (const z of [mid - 0.06, mid + 0.06]) piece(g, G.box(0.03, 0.05, 0.03), color, { pos: [0, top + 0.02, z], outline: 0.01 }); };
  if (style === 'kessler') {
    rings(DARK);
    piece(g, G.cylZ(0.033, 0.033, 0.3, 12), 0x2a3038, { pos: [0, y, mid] });
    piece(g, G.cylZ(0.056, 0.036, 0.09, 12), 0x2a3038, { pos: [0, y, mid + 0.18], outline: 0.012 });
    piece(g, G.cylZ(0.038, 0.048, 0.05, 12), 0x2a3038, { pos: [0, y, mid - 0.14], outline: 0.012 });
    piece(g, G.cylZ(0.05, 0.05, 0.008, 12), lens, { pos: [0, y, mid + 0.226], glow: true, outline: 0 });
    piece(g, G.cyl(0.018, 0.018, 0.035, 8), c.pal.metal, { pos: [0, y + 0.045, mid], outline: 0.006 });
    piece(g, G.cyl(0.018, 0.018, 0.035, 8), c.pal.metal, { pos: [0.045, y, mid], rot: [0, 0, Math.PI / 2], outline: 0.006 });
    piece(g, G.box(0.05, 0.035, 0.08), DARK, { pos: [0, y + 0.05, mid + 0.1], outline: 0.008 });
    piece(g, G.cylZ(0.01, 0.01, 0.01, 8), lens, { pos: [0, y + 0.05, mid + 0.142], glow: true, outline: 0 });
  } else if (style === 'rattlecap') {
    const brass = 0xb08a3e;
    rings(0x5a4a3a);
    piece(g, G.cylZ(0.036, 0.034, 0.26, 10), brass, { pos: [0, y, mid], rot: [0, 0.03, 0] });
    piece(g, G.cylZ(0.05, 0.042, 0.06, 10), 0x8a6a2a, { pos: [0, y, mid + 0.14], outline: 0.012 });
    piece(g, G.cylZ(0.042, 0.05, 0.05, 10), 0x8a6a2a, { pos: [0, y, mid - 0.13], outline: 0.012 });
    for (const z of [mid - 0.05, mid + 0.06]) piece(g, G.cylZ(0.04, 0.04, 0.03, 10), 0x2a2a2a, { pos: [0, y, z], outline: 0.008 });
    for (let i = 0; i < 6; i++) piece(g, G.sphere(0.006, 4, 3), c.pal.metal, { pos: [Math.cos(i) * 0.037, y + Math.sin(i) * 0.037, mid + 0.02], outline: 0 });
    piece(g, G.cylZ(0.046, 0.046, 0.008, 10), 0xd8c070, { pos: [0, y, mid + 0.172], glow: true, outline: 0 });
    piece(g, G.cylZ(0.05, 0.05, 0.02, 10), 0x5a4a3a, { pos: [0.05, y - 0.06, mid + 0.17], rot: [0.6, 0, 0.3], outline: 0.008 });
    cable(g, [[0.035, y, mid - 0.08], [0.06, y - 0.03, mid - 0.02], [0.05, top - 0.02, mid + 0.04]], 0x2a2a2a, 0.006);
  } else if (style === 'voltaic') {
    rings(c.pal.secondary);
    piece(g, G.box(0.07, 0.075, 0.26), c.pal.primary, { pos: [0, y, mid], outline: 0.012 });
    piece(g, G.box(0.074, 0.012, 0.2), lens, { pos: [0, y + 0.026, mid], glow: true, outline: 0 });
    for (const z of [0.12, 0.15, 0.18]) piece(g, G.torus(0.046, 0.007, Math.PI * 2, 4, 14), c.pal.secondary, { pos: [0, y, mid + z], outline: 0.004 });
    piece(g, G.cylZ(0.044, 0.044, 0.008, 14), lens, { pos: [0, y, mid + 0.2], glow: true, outline: 0 });
    piece(g, G.box(0.06, 0.05, 0.008), lens, { pos: [0, y, mid - 0.134], glow: true, outline: 0 });
  } else if (style === 'rime') {
    rings(c.pal.secondary);
    piece(g, G.cylZ(0.038, 0.038, 0.28, 8), c.pal.primary, { pos: [0, y, mid], rot: [0, 0, Math.PI / 8] });
    piece(g, G.cylZ(0.054, 0.04, 0.06, 8), c.pal.secondary, { pos: [0, y, mid + 0.16], rot: [0, 0, Math.PI / 8], outline: 0.012 });
    piece(g, G.cylZ(0.042, 0.05, 0.05, 8), c.pal.secondary, { pos: [0, y, mid - 0.14], rot: [0, 0, Math.PI / 8], outline: 0.012 });
    for (let i = 0; i < 3; i++) piece(g, G.octa(0.022 + i * 0.006), c.pal.metal, { pos: [0, y + 0.045, mid - 0.06 + i * 0.06], scale: [0.7, 1.6, 0.7], rot: [0.3 * i, 0, 0], glow: true, outline: 0.006 });
    piece(g, G.cylZ(0.046, 0.046, 0.008, 8), lens, { pos: [0, y, mid + 0.192], rot: [0, 0, Math.PI / 8], glow: true, outline: 0 });
  } else {
    rings(DARK);
    piece(g, G.cylZ(0.035, 0.035, 0.26, 10), DARK, { pos: [0, y, mid] });
    piece(g, G.cylZ(0.05, 0.04, 0.06, 10), DARK, { pos: [0, y, mid + 0.14], outline: 0.012 });
    piece(g, G.cylZ(0.04, 0.05, 0.05, 10), DARK, { pos: [0, y, mid - 0.13], outline: 0.012 });
    piece(g, G.cylZ(0.042, 0.042, 0.01, 10), lens, { pos: [0, y, mid + 0.175], glow: true, outline: 0 });
  }
  g.userData.sight = { kind: 'scope', y, z: mid - 0.155, style };
}

// Holo (reflex) sights in each maker's style. A tinted glass pane carries a glowing reticle; the
// reticle is one group ('sightReticle') so first-person aiming can collimate it — keep it on the
// glass where the eye's line to the gun's aim point crosses it.
//   kessler    closed military box hood, green glass, ring-and-ticks reticle with a centre dot
//   rattlecap  a round lens wired into a brass ring on a taped, crooked post; a crude painted cross
//   voltaic    sleek white loop frame with a glow strip, a glowing chevron
//   rime       hexagonal crystal frame with an ice shard, a small diamond
// All share one sight line (top + 0.042) and glass position.
const _box = new THREE.Box3();
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false });
const bar = (w, h, color, x = 0, y = 0, rot = 0) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow(color));
  m.position.set(x, y, 0);
  m.rotation.z = rot;
  return m;
};
function holoSight(g, c, w, top, mid) {
  const style = SCOPE_STYLES.includes(w.manufacturer) ? w.manufacturer : 'default';
  const zf = mid + 0.02;
  const y = top + 0.042;
  const col = c.accent;
  const reticle = new THREE.Group();
  reticle.name = 'sightReticle';
  reticle.position.set(0, y, zf + 0.002);
  let glass;
  let tint = 0x9fe8ff;
  if (style === 'kessler') {
    // Closed box hood: walls, roof, a thick base with a mount lever.
    for (const s of [-1, 1]) piece(g, G.box(0.01, 0.078, 0.07), 0x2a3038, { pos: [0.044 * s, top + 0.04, zf - 0.015], outline: 0.006 });
    piece(g, G.box(0.098, 0.012, 0.07), 0x2a3038, { pos: [0, top + 0.081, zf - 0.015], outline: 0.006 });
    piece(g, G.box(0.1, 0.016, 0.09), DARK, { pos: [0, top + 0.004, zf - 0.02], outline: 0.008 });
    piece(g, G.box(0.012, 0.02, 0.04), c.pal.metal, { pos: [0.056, top + 0.006, zf - 0.03], outline: 0.004 });
    piece(g, G.box(0.03, 0.008, 0.012), col, { pos: [-0.02, top + 0.088, zf - 0.04], glow: true, outline: 0 });
    glass = new THREE.PlaneGeometry(0.078, 0.066);
    tint = 0x9fffc0;
    reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.0145, 0.0165, 28), glow(col, 0.9)));
    for (const [x, yy, r] of [[0, 0.0105, 0], [0, -0.0105, 0], [0.0105, 0, Math.PI / 2], [-0.0105, 0, Math.PI / 2]]) reticle.add(bar(0.0016, 0.006, col, x, yy, r));
    reticle.add(new THREE.Mesh(new THREE.CircleGeometry(0.0022, 10), glow(col)));
  } else if (style === 'rattlecap') {
    // A lens jammed into a brass ring on a crooked, taped post.
    const brass = 0xb08a3e;
    piece(g, G.box(0.022, 0.012, 0.03), 0x5a4a3a, { pos: [0.004, top + 0.001, zf], rot: [0, 0, 0.08], outline: 0.006 });
    piece(g, G.box(0.026, 0.006, 0.034), 0x2a2a2a, { pos: [0.004, top + 0.002, zf], rot: [0, 0, 0.08], outline: 0.004 });
    piece(g, G.torus(0.037, 0.006, Math.PI * 2, 5, 18), brass, { pos: [0, y, zf], outline: 0.006 });
    for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.3; piece(g, G.sphere(0.004, 4, 3), c.pal.metal, { pos: [Math.cos(a) * 0.037, y + Math.sin(a) * 0.037, zf + 0.004], outline: 0 }); }
    cable(g, [[0.03, y - 0.03, zf], [0.05, y - 0.05, zf - 0.03], [0.04, top, zf - 0.06]], 0x2a2a2a, 0.004);
    glass = new THREE.CircleGeometry(0.034, 20);
    tint = 0xe8d890;
    reticle.add(bar(0.0024, 0.016, col, 0.0004, 0, 0.06), bar(0.016, 0.0024, col, 0, 0.0003, 0.04));
  } else if (style === 'voltaic') {
    // Sleek white loop with a glow strip along its top and an emitter in the base.
    piece(g, G.torus(0.04, 0.007, Math.PI * 2, 6, 24), c.pal.primary, { pos: [0, y, zf], scale: [1.05, 0.92, 1], outline: 0.006 });
    piece(g, G.torus(0.041, 0.003, Math.PI * 0.6, 4, 12), col, { pos: [0, y, zf + 0.004], rot: [0, 0, Math.PI * 0.2], glow: true, outline: 0 });
    piece(g, G.box(0.05, 0.02, 0.07), c.pal.primary, { pos: [0, top + 0.006, zf - 0.02], outline: 0.008 });
    piece(g, G.box(0.03, 0.006, 0.02), col, { pos: [0, top + 0.017, zf - 0.03], glow: true, outline: 0 });
    glass = new THREE.CircleGeometry(0.036, 24);
    reticle.add(bar(0.0022, 0.011, col, -0.0037, -0.0037, -Math.PI / 4), bar(0.0022, 0.011, col, 0.0037, -0.0037, Math.PI / 4));
    reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.019, 0.0202, 32, 1, 0, Math.PI * 0.4), glow(col, 0.6)));
    reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.019, 0.0202, 32, 1, Math.PI, Math.PI * 0.4), glow(col, 0.6)));
  } else if (style === 'rime') {
    // Hexagonal crystal frame with a shard standing on top.
    piece(g, G.torus(0.039, 0.006, Math.PI * 2, 4, 6), c.pal.metal, { pos: [0, y, zf], rot: [0, 0, Math.PI / 6], glow: true, outline: 0.006 });
    piece(g, G.box(0.03, 0.03, 0.03), c.pal.secondary, { pos: [0, top + 0.004, zf], outline: 0.006 });
    piece(g, G.octa(0.016), c.pal.metal, { pos: [0, y + 0.05, zf], scale: [0.7, 1.7, 0.7], glow: true, outline: 0.005 });
    glass = new THREE.CircleGeometry(0.034, 6);
    tint = 0xd0f4ff;
    reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.0045, 0.006, 4), glow(col)));
    reticle.add(new THREE.Mesh(new THREE.CircleGeometry(0.0012, 6), glow(col)));
  } else {
    for (const s of [-1, 1]) piece(g, G.box(0.008, 0.075, 0.024), DARK, { pos: [0.042 * s, top + 0.038, zf], outline: 0.006 });
    piece(g, G.box(0.092, 0.008, 0.024), DARK, { pos: [0, top + 0.078, zf], outline: 0.006 });
    piece(g, G.box(0.096, 0.012, 0.06), DARK, { pos: [0, top + 0.004, zf - 0.01], outline: 0.008 });
    glass = new THREE.PlaneGeometry(0.072, 0.064);
    reticle.add(new THREE.Mesh(new THREE.CircleGeometry(0.0035, 10), glow(0xff3a3a)));
    reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.014, 0.0165, 24), glow(0xff3a3a, 0.85)));
  }
  const pane = new THREE.Mesh(glass, new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  pane.position.set(0, y, zf);
  if (style === 'rime') pane.rotation.z = Math.PI / 6;
  g.add(pane, reticle);
  g.userData.sight = { kind: 'holo', y, z: zf, style };
}

// Iron sights in each maker's style; all on one line (top + 0.022) from the rear sight at the back
// of the receiver to the front post near the muzzle.
//   kessler    a military peep (aperture ring) and a winged front post
//   rattlecap  a bent-plate V-notch and a bolt for a front post with a painted tip
//   voltaic    three-dot sights: glowing dots either side of the notch and on the post
//   rime       a notch between two crystal shards and an ice-spike front post
function ironSight(g, c, w, recTop, z0, by, muzzleZ) {
  const style = SCOPE_STYLES.includes(w.manufacturer) ? w.manufacturer : 'default';
  const zr = z0 + 0.04;
  const zf = muzzleZ - 0.05;
  // Some receivers carry a frame or rail above their nominal top between the sights; the sights
  // stand on a riser that clears it, so the line from notch to post is never buried.
  let top = recTop;
  for (const ch of g.children) {
    if (!ch.isMesh) continue;
    _box.setFromObject(ch);
    if (_box.max.z < zr - 0.005 || _box.min.z > zf + 0.005 || Math.abs((_box.min.x + _box.max.x) / 2) > 0.06) continue;
    top = Math.max(top, _box.max.y);
  }
  if (top - recTop > 0.004) piece(g, G.box(0.034, top - recTop, 0.034), DARK, { pos: [0, (top + recTop) / 2, zr], outline: 0.006 });
  const y = top + 0.022;
  const base = by + 0.03;
  const col = c.accent;
  const tower = (color) => piece(g, G.box(0.03, y - base, 0.03), color, { pos: [0, (y + base) / 2 - 0.006, zf], outline: 0.008 });
  if (style === 'kessler') {
    piece(g, G.box(0.012, 0.03, 0.014), DARK, { pos: [0, top + 0.004, zr], outline: 0.006 });
    piece(g, G.torus(0.0085, 0.0035, Math.PI * 2, 6, 16), DARK, { pos: [0, y, zr], outline: 0.004 });
    for (const s of [-1, 1]) piece(g, G.box(0.006, 0.026, 0.014), DARK, { pos: [0.02 * s, top + 0.016, zr], outline: 0.004 });
    tower(0x2a3038);
    for (const s of [-1, 1]) piece(g, G.box(0.005, 0.03, 0.012), 0x2a3038, { pos: [0.014 * s, y - 0.008, zf], outline: 0.004 });
    piece(g, G.box(0.006, 0.024, 0.008), DARK, { pos: [0, y - 0.006, zf], outline: 0.004 });
    piece(g, G.sphere(0.0035, 6, 4), col, { pos: [0, y + 0.004, zf], glow: true, outline: 0 });
  } else if (style === 'rattlecap') {
    for (const s of [-1, 1]) piece(g, G.box(0.018, 0.028, 0.006), 0x8a8a8a, { pos: [0.012 * s, top + 0.016, zr], rot: [0, 0, 0.55 * s], outline: 0.005 });
    piece(g, G.box(0.05, 0.008, 0.01), 0x5a4a3a, { pos: [0, top + 0.004, zr], outline: 0.004 });
    tower(0x5a4a3a);
    piece(g, G.cyl(0.005, 0.005, 0.03, 6), 0x8a8a8a, { pos: [0.001, y - 0.01, zf], rot: [0, 0, 0.05], outline: 0.004 });
    piece(g, G.cyl(0.008, 0.008, 0.005, 6), 0x8a8a8a, { pos: [0.001, y - 0.024, zf], outline: 0.003 });
    piece(g, G.sphere(0.0055, 6, 4), 0xff5a2a, { pos: [0.002, y + 0.004, zf], glow: true, outline: 0 });
  } else if (style === 'voltaic') {
    // Dark posts so the glowing dots read against a pale receiver and sky.
    for (const s of [-1, 1]) {
      piece(g, G.box(0.012, 0.03, 0.012), c.pal.secondary, { pos: [0.016 * s, top + 0.015, zr], outline: 0.005 });
      piece(g, G.sphere(0.0034, 6, 4), col, { pos: [0.016 * s, y, zr - 0.007], glow: true, outline: 0 });
    }
    piece(g, G.box(0.044, 0.01, 0.012), c.pal.secondary, { pos: [0, top + 0.005, zr], outline: 0.005 });
    tower(c.pal.secondary);
    piece(g, G.box(0.008, 0.024, 0.01), c.pal.secondary, { pos: [0, y - 0.006, zf], outline: 0.005 });
    piece(g, G.sphere(0.0042, 6, 4), col, { pos: [0, y, zf - 0.006], glow: true, outline: 0 });
  } else if (style === 'rime') {
    for (const s of [-1, 1]) piece(g, G.octa(0.012), c.pal.metal, { pos: [0.017 * s, top + 0.016, zr], scale: [0.6, 1.5, 0.6], rot: [0, 0, -0.25 * s], glow: true, outline: 0.004 });
    piece(g, G.box(0.04, 0.008, 0.012), c.pal.secondary, { pos: [0, top + 0.004, zr], outline: 0.004 });
    tower(c.pal.secondary);
    piece(g, G.cone(0.007, 0.03, 4), c.pal.metal, { pos: [0, y - 0.009, zf], glow: true, outline: 0.004 });
    piece(g, G.sphere(0.003, 6, 4), col, { pos: [0, y + 0.004, zf], glow: true, outline: 0 });
  } else {
    for (const s of [-1, 1]) piece(g, G.box(0.01, 0.03, 0.012), DARK, { pos: [0.015 * s, top + 0.015, zr], outline: 0.006 });
    piece(g, G.box(0.04, 0.01, 0.012), DARK, { pos: [0, top + 0.005, zr], outline: 0.006 });
    tower(DARK);
    piece(g, G.box(0.008, 0.024, 0.01), DARK, { pos: [0, y - 0.006, zf], outline: 0.006 });
    piece(g, G.sphere(0.005, 6, 4), col, { pos: [0, y + 0.003, zf], glow: true, outline: 0 });
  }
  g.userData.sight = { kind: 'iron', y, z: zr, style };
}

// Fits the weapon's sight part (scope, holo or iron, in its maker's style) onto `mount` — the gun
// itself, or a group offset to one side — and records the sight line on the gun, including that
// sideways offset (userData.sight.x), so first-person aiming lines it up wherever it sits.
function mountSight(g, mount, c, w, { top, mid, z0, muzzleZ }) {
  const sight = c.part('sight');
  if (sight.scope) scopeModel(mount, c, w, top, mid);
  else if (sight.holo) holoSight(mount, c, w, top, mid);
  else ironSight(mount, c, w, top, z0, top - 0.03, muzzleZ);
  g.userData.sight = { ...mount.userData.sight, x: mount === g ? 0 : mount.position.x };
}

function launcher(g, c, w) {
  const len = 1.0 + (c.part('barrel').length ?? 0.35) * 0.6;
  const muzzleZ = form(w, 'launcherTube', 'tube').build(g, c, { len });
  form(w, 'gunGrip', 'straight').build(g, c, {});
  piece(g, G.box(0.06, 0.18, 0.06), c.pal.secondary, { pos: [0, -0.05, 0.4], rot: [0.15, 0, 0] });
  g.userData.grip2 = { local: new THREE.Vector3(0, -0.08, 0.4), when: 'always' };
  g.userData.shoulderMount = true;
  // The sight rides a bracket off the tube's left side (+x: the weapon looks down +z), as on a
  // real shoulder launcher, so its line runs beside the tube on your right shoulder; any maker
  // style of iron, holo or scope fits on the rail.
  const half = { tube: 0.12, quad: 0.135, drum: 0.17 }[w.look?.launcherTube] ?? 0.14;
  const mount = new THREE.Group();
  mount.position.x = half + 0.05;
  g.add(mount);
  const rail = 0.2;
  for (const z of [-0.15, 0.25]) piece(g, G.box(0.06, 0.03, 0.04), DARK, { pos: [half + 0.025, rail - 0.02, z], outline: 0.006 });
  piece(mount, G.box(0.034, 0.02, 0.56), DARK, { pos: [0, rail - 0.01, 0.06], outline: 0.006 });
  mountSight(g, mount, c, w, { top: rail, mid: 0.05, z0: -0.22, muzzleZ: 0.42 });
  g.userData.muzzle = new THREE.Vector3(0, 0.14, muzzleZ);
  for (const s of [-1, 1]) {
    emblem(g, c, [0.118 * s, 0.14, 0.2], { yaw: (Math.PI / 2) * s, size: 0.06 });
    vents(g, [0.105 * s, 0.2, -0.2], [0, 0, 1], { count: 5, spacing: 0.04, size: [0.008, 0.04, 0.018] });
    rivets(g, c.pal.metal, [[0.112 * s, 0.07, -0.25], [0.112 * s, 0.07, 0.45]], { axis: 'x' });
  }
  cable(g, [[0, -0.02, 0.0], [0.06, -0.06, 0.15], [0.09, 0.05, 0.3]], c.pal.secondary, 0.012);
}

function crossbow(g, c, w) {
  const limbs = c.part('limbs');
  piece(g, G.box(0.08, 0.1, 0.78), c.pal.primary, { pos: [0, 0.05, 0.22] });
  piece(g, G.box(0.03, 0.02, 0.7), DARK, { pos: [0, 0.11, 0.25], outline: 0.008 });
  form(w, 'limbs', 'recurve').build(g, c, { z: 0.56, span: limbs.span ?? 1, metal: !!limbs.metal });
  form(w, 'gunGrip', 'straight').build(g, c, {});
  form(w, 'stock', 'solid').build(g, c, { z0: -0.12, len: c.part('stock').length ?? 0.35 });
  piece(g, G.box(0.045, 0.12, 0.05), c.pal.secondary, { pos: [0, -0.06, 0.32], rot: [0.12, 0, 0] });
  g.userData.grip2 = { local: new THREE.Vector3(0, -0.07, 0.32), when: 'always' };
  if (limbs.repeater) piece(g, G.box(0.08, 0.14, 0.3), c.pal.secondary, { pos: [0, 0.2, 0.18] });
  piece(g, G.cylZ(0.012, 0.012, 0.55, 5), 0xd8c9a3, { pos: [0, 0.135, 0.3], outline: 0 });
  piece(g, G.coneZ(0.025, 0.07, 4), c.pal.metal, { pos: [0, 0.135, 0.6], outline: 0.006 });
  if (c.showAccent) piece(g, G.box(0.085, 0.02, 0.4), c.accent, { pos: [0, 0.02, 0.25], glow: true, outline: 0 });
  g.userData.muzzle = new THREE.Vector3(0, 0.135, 0.68);
  // Sights ride above the bolt (and over a repeater's magazine), behind the limbs.
  mountSight(g, g, c, w, { top: limbs.repeater ? 0.27 : 0.155, mid: 0.1, z0: -0.06, muzzleZ: 0.57 });
  for (const s of [-1, 1]) {
    emblem(g, c, [0.042 * s, 0.05, 0.12], { yaw: (Math.PI / 2) * s, size: 0.04 });
    panelLine(g, [0.042 * s, 0.05, 0.4], [0.004, 0.07, 0.005]);
    rivets(g, c.pal.metal, [[0.042 * s, 0.08, 0.5], [0.042 * s, 0.02, 0.5]], { axis: 'x', r: 0.008 });
  }
}

// ---------------------------------------------------------------- magic
function caster(g, c, w, staff, scepter = false) {
  const len = staff ? 1.55 : scepter ? 0.5 : 0.55;
  const z0 = staff ? -0.45 : -0.08;
  if (scepter) piece(g, G.sphere(0.05, 10, 8), c.pal.metal, { pos: [0, 0, z0 - 0.03], outline: 0.01 });
  form(w, 'shaft', 'straight').build(g, c, { z0, len, r: staff ? 0.034 : 0.028 });
  for (let i = 0; i < 3; i++) piece(g, G.torus(staff ? 0.042 : 0.035, 0.009, Math.PI * 2, 4, 10), LEATHER, { pos: [0, 0, -0.05 + i * 0.05], outline: 0 });
  if (staff) piece(g, G.coneZ(0.036, 0.1, 8), c.pal.metal, { pos: [0, 0, z0 - 0.04], rot: [Math.PI, 0, 0], outline: 0.012 });
  const muzzleZ = form(w, 'head', 'prongs').build(g, c, { tip: z0 + len, size: staff ? 1.25 : scepter ? 0.9 : 0.65 });
  g.userData.muzzle = new THREE.Vector3(0, 0, muzzleZ);
  const r = staff ? 0.034 : 0.028;
  piece(g, G.cylZ(r * 1.6, r * 1.4, 0.06, 12), c.pal.primary, { pos: [0, 0, z0 + len - 0.1], outline: 0.008 });
  emblem(g, c, [0, r * 1.6 + 0.004, z0 + len - 0.1], { pitch: -Math.PI / 2, size: staff ? 0.045 : 0.032 });
  rivets(g, c.pal.metal, [[r * 1.55, 0, z0 + len - 0.1], [-r * 1.55, 0, z0 + len - 0.1]], { axis: 'x', r: 0.007 });
  const coil = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    coil.push([Math.cos(t * Math.PI * 4) * r * 1.25, Math.sin(t * Math.PI * 4) * r * 1.25, z0 + len - 0.16 - t * (staff ? 0.5 : 0.2)]);
  }
  cable(g, coil, c.pal.secondary, 0.006);
  const ch = c.part('charm').charm;
  if (ch) {
    const z = z0 + len - 0.12;
    piece(g, G.cyl(0.004, 0.004, 0.12, 4), 0x222222, { pos: [0.05, -0.06, z], outline: 0 });
    piece(g, G.sphere(0.035, 8, 6), ch, { pos: [0.05, -0.13, z], glow: true, outline: 0.01 });
  }
}

function tome(g, c, w) {
  form(w, 'cover', 'plain').build(g, c, {});
  emblem(g, c, [0.12, 0.046, 0.08], { pitch: -Math.PI / 2, size: 0.045 });
  rivets(g, c.pal.metal, [[-0.16, 0.044, 0.05], [-0.16, 0.044, 0.45], [0.16, 0.044, 0.45]], { axis: 'y', r: 0.009 });
  cable(g, [[-0.2, 0.0, 0.02], [-0.22, -0.02, 0.25], [-0.2, 0.0, 0.48]], c.pal.secondary, 0.01);
  g.userData.muzzle = new THREE.Vector3(0, 0.32, 0.25);
}

function orb(g, c, w) {
  form(w, 'orbShell', 'gyro').build(g, c, {});
  emblem(g, c, [0, 0.038, 0.0], { pitch: -Math.PI / 2, size: 0.035 });
  cable(g, [[0.03, 0, -0.08], [0.05, 0.03, 0.05], [0.02, 0.06, 0.14]], c.pal.secondary, 0.006);
  g.userData.muzzle = new THREE.Vector3(0, 0.32, 0.2);
}

const ASSEMBLERS = {
  greatsword: (g, c, w) => bladed(g, c, w),
  spear,
  hammer,
  smg: (g, c, w) => gun(g, c, w, 'smg'),
  sniper: (g, c, w) => gun(g, c, w, 'sniper'),
  launcher,
  crossbow,
  scepter: (g, c, w) => caster(g, c, w, false, true),
  orb,
  sword: (g, c, w) => bladed(g, c, w),
  dagger: (g, c, w) => bladed(g, c, w, { dagger: true }),
  axe,
  pistol: (g, c, w) => gun(g, c, w, 'pistol'),
  rifle: (g, c, w) => gun(g, c, w, 'rifle'),
  shotgun: (g, c, w) => gun(g, c, w, 'shotgun'),
  wand: (g, c, w) => caster(g, c, w, false),
  staff: (g, c, w) => caster(g, c, w, true),
  tome,
};

// Where the off hand holds two-handed weapons (weapon-local), and when: always, or only aiming.
// Where the main hand closes on long-handled weapons (weapon-local z): low on the handle, so
// little of it trails behind the fist into the body during swings.
const HOLD = { greatsword: -0.13, hammer: -0.12, axe: -0.1, spear: -0.4, sword: -0.03, dagger: 0, staff: -0.25 };
// Off-hand grip for two-handed melee/staffs, relative to the main hand (toward the head/blade).
const GRIP2 = {
  greatsword: { at: [0, 0, 0.21], when: 'always' },
  hammer: { at: [0, 0, 0.24], when: 'always' },
  spear: { at: [0, 0, 0.36], when: 'always' },
  staff: { at: [0, 0, 0.34], when: 'aim' },
};

export function buildWeaponModel(weapon) {
  const g = new THREE.Group();
  ASSEMBLERS[weapon.type](g, context(weapon), weapon);
  bakeTree(g);
  const hold = HOLD[weapon.type];
  if (hold) {
    for (const ch of g.children) ch.position.z -= hold;
    g.userData.muzzle?.setZ(g.userData.muzzle.z - hold);
  }
  const grip = GRIP2[weapon.type];
  if (grip) g.userData.grip2 = { local: new THREE.Vector3(...grip.at), when: grip.when };
  // Blades, hafts and staves are gripped round the handle (it runs through the fist); guns, wands,
  // tomes and orbs sit in the hand along the forearm.
  g.userData.handle = hold !== undefined;
  // Stock butt (for shouldering): the rearmost point of the model.
  const box = new THREE.Box3().setFromObject(g);
  g.userData.buttZ = box.min.z;
  return g;
}

// Spins/bobs floating parts (gems, halos, pages). Call each frame with elapsed seconds.
export function animateWeapon(model, time) {
  model.traverse((o) => {
    const f = o.userData.float;
    if (!f) return;
    o.position.y = f.base + Math.sin(time * 2.5) * 0.02;
    o.rotation.z = time * f.spin;
  });
}
