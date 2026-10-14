// Check the fixed-capacity GPU particle pools (docs/GRAPHICS_PLAN.md G3/G4) without a WebGL context.
import * as THREE from 'three';
import { ParticleSystem } from '../src/render/Particles.js';

let failed = 0;
const check = (ok, label) => {
  if (!ok) { failed++; console.log(`FAILED: ${label}`); }
};
const scene = new THREE.Scene();
const pool = new ParticleSystem(scene, { capacity: 64 });
const p = new THREE.Vector3(1, 2, 3);
const v = new THREE.Vector3(0, 1, 0);

pool.setBudget(24);
for (let i = 0; i < 100; i++) pool.emit(p, v, { life: 0.5 });
check(pool.activeCount === 24, `emission is capped at its quality budget (${pool.activeCount}/24)`);
pool.update(0.6);
check(pool.activeCount === 0, `expired particles leave the active budget (${pool.activeCount}/0)`);

pool.setBudget(12);
for (let i = 0; i < 8; i++) pool.emit(p, v, { life: 2 });
pool.update(0.25);
check(pool.activeCount === 8, `live particles remain counted (${pool.activeCount}/8)`);
pool.setBudget(6);
check(pool.activeCount === 6, `lowering a quality budget trims active slots (${pool.activeCount}/6)`);
pool.clear();
check(pool.activeCount === 0, `clear releases all active slots (${pool.activeCount}/0)`);

pool.setBudget(0);
pool.emit(p, v, { life: 1 });
check(pool.activeCount === 0, 'zero budget rejects emission');
scene.remove(pool.mesh);
pool.mesh.geometry.dispose();
pool.material.dispose();

console.log(failed ? `effectcheck: ${failed} problem(s)` : 'effectcheck: ok');
process.exit(failed ? 1 : 0);
