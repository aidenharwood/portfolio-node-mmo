// Tiny modelling kit: place primitive "pieces" freely, then bake() merges pieces that share a
// colour into one mesh (+ one outline). Detailed models stay cheap in draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMesh, flatMesh, addOutline, toonMaterial, outlineMaterial, hullGeometry } from './Toon.js';

/**
 * Add a bakeable piece to `parent`.
 * opts: pos [x,y,z], rot [x,y,z] (Euler XYZ), scale number | [x,y,z], outline (0 = none), glow (unlit)
 */
export function piece(parent, geometry, color, opts = {}) {
  const mesh = new THREE.Mesh(geometry);
  if (opts.pos) mesh.position.fromArray(opts.pos);
  if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  if (opts.scale !== undefined) {
    if (typeof opts.scale === 'number') mesh.scale.setScalar(opts.scale);
    else mesh.scale.fromArray(opts.scale);
  }
  mesh.userData.piece = { color, outline: opts.outline ?? 0.025, glow: !!opts.glow };
  parent.add(mesh);
  return mesh;
}

// A piece that carries its own skin weights (skinIndex into `bones`), for bakeSkinned: lofted
// skin and clothing that bend across joints, cloth.
export function skinPiece(parent, geometry, color, bones, opts = {}) {
  const mesh = piece(parent, geometry, color, opts);
  mesh.userData.piece.bones = bones;
  return mesh;
}

// Merges every piece directly under `group` by (colour, outline, glow). Sub-groups are untouched.
export function bake(group) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    const p = child.userData.piece;
    if (!p || !child.isMesh) continue;
    child.updateMatrix();
    const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(child.matrix);
    const key = `${p.color}|${p.outline}|${p.glow}`;
    if (!buckets.has(key)) buckets.set(key, { ...p, geos: [] });
    buckets.get(key).geos.push(g);
    group.remove(child);
  }
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos);
    let mesh;
    if (b.glow) {
      mesh = flatMesh(merged, b.color);
      if (b.outline > 0) addOutline(mesh, b.outline);
    } else {
      mesh = toonMesh(merged, b.color, { outline: b.outline });
    }
    group.add(mesh);
  }
  return group;
}

// Lifts every piece in `group`'s sub-groups up into `group` itself, where it already stands, so
// one bake merges them all by colour: a whole town or city district in a handful of draw calls.
// (Sub-groups must not be scaled, or a piece's place couldn't be kept exactly.)
export function flatten(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const lift = [];
  group.traverse((o) => { if (o.isMesh && o.userData.piece && o.parent !== group) lift.push(o); });
  for (const m of lift) {
    m.matrix.multiplyMatrices(inv, m.matrixWorld);
    m.matrix.decompose(m.position, m.quaternion, m.scale);
    m.parent.remove(m);
    group.add(m);
  }
  for (const c of [...group.children]) if (!c.isMesh && !c.children.length) group.remove(c);
  return group;
}

// Bakes `root` and every descendant group (bones keep their own transforms).
export function bakeTree(root) {
  const groups = [];
  root.traverse((o) => { if (!o.isMesh) groups.push(o); });
  for (const g of groups) bake(g);
  return root;
}

// Bakes a jointed model (a THREE.Bone hierarchy carrying pieces) into skinned meshes: every
// piece is weighted fully to its nearest ancestor bone (or keeps its own blended weights — lofted
// skin, cloth), and however many colours, bones and pieces there are, it all merges into three
// SkinnedMeshes sharing one Skeleton: one lit (each piece's colour carried in its vertices), one
// unlit for the glowing parts, and one outline shell (each piece's ink thickness carried in its
// vertices). Three draw calls a character, so crowds stay cheap. Non-bone children (weapon
// mounts) are kept.
export function bakeSkinned(root) {
  root.updateMatrixWorld(true);
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o); });
  const index = new Map(bones.map((b, i) => [b, i]));
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const pieces = [];
  root.traverse((o) => { if (o.isMesh && o.userData.piece) pieces.push(o); });
  const lit = [];
  const glow = [];
  const hulls = [];
  const color = new THREE.Color();
  for (const child of pieces) {
    const p = child.userData.piece;
    let b = child.parent;
    while (b && !b.isBone) b = b.parent;
    const bi = b ? index.get(b) : 0;
    // Kept indexed: a smooth surface shares each vertex between ~6 triangles, so the skinning
    // shader transforms a fraction of the vertices it would after toNonIndexed().
    const g = child.geometry.clone();
    if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
    const own = p.bones && g.attributes.skinIndex;
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && !(own && (name === 'skinIndex' || name === 'skinWeight'))) g.deleteAttribute(name);
    }
    g.applyMatrix4(m.multiplyMatrices(toRoot, child.matrixWorld));
    const n = g.attributes.position.count;
    if (own) {
      // Cloth and other soft pieces: remap their local bone list onto the skeleton.
      const si = g.attributes.skinIndex;
      for (let i = 0; i < si.array.length; i++) si.array[i] = index.get(p.bones[si.array[i]]) ?? bi;
    } else {
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    if (p.outline > 0) {
      const h = g.clone();
      h.setAttribute('inkWidth', new THREE.BufferAttribute(new Float32Array(n).fill(p.outline), 1));
      hulls.push(h);
    }
    // Colours are linear in the vertices, as a material's colour is once set.
    color.set(p.color);
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { rgb[i * 3] = color.r; rgb[i * 3 + 1] = color.g; rgb[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    (p.glow ? glow : lit).push(g);
    child.removeFromParent();
  }
  const skeleton = new THREE.Skeleton(bones);
  const meshes = [];
  const slack = (sphere) => { sphere.radius = sphere.radius * 1.25 + 0.6; return sphere; };
  const add = (geo, mat, solid) => {
    geo.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = solid;
    mesh.receiveShadow = solid;
    root.add(mesh);
    mesh.bind(skeleton, root.matrixWorld);
    mesh.boundingSphere = slack(geo.boundingSphere.clone());
    return mesh;
  };
  if (lit.length) meshes.push(add(mergeGeometries(lit), toonMaterial(0xffffff, { vertexColors: true }), true));
  if (glow.length) meshes.push(add(mergeGeometries(glow), new THREE.MeshBasicMaterial({ vertexColors: true }), false));
  if (hulls.length) {
    const shell = mergeGeometries(hulls);
    shell.computeBoundingSphere();
    const hull = new THREE.SkinnedMesh(hullGeometry(shell), outlineMaterial(1, undefined, 'world', null, true));
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.raycast = () => {};
    root.add(hull);
    hull.bind(skeleton, root.matrixWorld);
    hull.boundingSphere = slack(shell.boundingSphere.clone());
  }
  return { skeleton, meshes };
}

export function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
}

// Geometry helpers. *Z variants run along +Z (the "forward/length" axis for limbs and weapons).
export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 18) => new THREE.CylinderGeometry(rt, rb, h, seg),
  cylZ: (rt, rb, len, seg = 18) => new THREE.CylinderGeometry(rt, rb, len, seg).rotateX(Math.PI / 2),
  sphere: (r, ws = 18, hs = 12) => new THREE.SphereGeometry(r, ws, hs),
  dome: (r, ws = 14, hs = 8, frac = 0.5) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI * frac),
  capsule: (r, len, seg = 14) => new THREE.CapsuleGeometry(r, len, 4, seg),
  capsuleZ: (r, len, seg = 14) => new THREE.CapsuleGeometry(r, len, 4, seg).rotateX(Math.PI / 2),
  cone: (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg),
  coneZ: (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg).rotateX(Math.PI / 2),
  torus: (r, t, arc = Math.PI * 2, rs = 6, ts = 16) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  // Sphere shell open toward +Z (hoods, cowls).
  hood: (r, gap = 0.95, frac = 0.78) =>
    new THREE.SphereGeometry(r, 16, 12, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, 0, Math.PI * frac),
  octa: (r) => new THREE.OctahedronGeometry(r),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  dodeca: (r) => new THREE.DodecahedronGeometry(r),
  tube: (points, radius, seg = 24, radial = 6) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, radius, radial),
  // Extrude a 2D shape (XY) to `depth`, centred on Z.
  extrude: (shape, depth, bevel = 0.008) => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 14,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  },
  shape: (points) => {
    const s = new THREE.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
    return s;
  },
};
