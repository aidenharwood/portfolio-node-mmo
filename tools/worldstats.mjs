// Dev tool: statistics of the generated world — biome shares, terrain relief and the points of
// interest per region — to tune world/Gen.js. Run: node tools/worldstats.mjs [seed] [radius]
import { WorldGen, REGION, WATER_LEVEL } from '../src/world/Gen.js';

const seed = Number(process.argv[2] ?? 12345);
const R = Number(process.argv[3] ?? 2400);
const gen = new WorldGen(seed);
const step = 24;
const biomes = {};
const heights = [];
let steep = 0;
let water = 0;
let n = 0;
for (let x = -R; x <= R; x += step) {
  for (let z = -R; z <= R; z += step) {
    n++;
    const b = gen.biomeAt(x, z);
    biomes[b] = (biomes[b] ?? 0) + 1;
    const h = gen.height(x, z);
    heights.push(h);
    if (h < WATER_LEVEL - 0.15) water++;
    const e = 2;
    const s = Math.hypot(gen.height(x + e, z) - gen.height(x - e, z), gen.height(x, z + e) - gen.height(x, z - e)) / (2 * e);
    if (s > 0.6) steep++;
  }
}
heights.sort((a, b) => a - b);
const q = (p) => heights[Math.floor(p * (heights.length - 1))].toFixed(1);
console.log(`seed ${seed}, ±${R} m, ${n} samples`);
console.log('biomes:', Object.entries(biomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((v / n) * 100).toFixed(1)}%`).join(', '));
console.log(`height p5 ${q(0.05)} p25 ${q(0.25)} p50 ${q(0.5)} p75 ${q(0.75)} p95 ${q(0.95)} max ${q(1)}`);
console.log(`steep (>0.6) ${((steep / n) * 100).toFixed(1)}%, water ${((water / n) * 100).toFixed(1)}%`);
// Relief: mean absolute height change over 40 m.
let rel = 0;
let rn = 0;
for (let x = -R; x <= R; x += 60) for (let z = -R; z <= R; z += 60) { rel += Math.abs(gen.height(x + 40, z) - gen.height(x, z)); rn++; }
console.log(`relief (mean |Δh| over 40 m): ${(rel / rn).toFixed(2)} m`);
const types = {};
const span = Math.ceil(R / REGION);
for (let rx = -span; rx <= span; rx++) {
  for (let rz = -span; rz <= span; rz++) {
    for (const p of gen.region(rx, rz).pois) {
      const k = p.type + (p.kind ? `:${p.kind}` : '') + (p.style && p.type !== 'camp' ? `:${p.style}` : '');
      types[k] = (types[k] ?? 0) + 1;
    }
  }
}
console.log(`POIs over ${(2 * span + 1) ** 2} regions:`, Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
let t0 = performance.now();
let acc = 0;
for (let i = 0; i < 200000; i++) acc += gen.height((i % 997) * 3.1 - 1500, Math.floor(i / 997) * 3.7 - 400);
console.log(`height(): ${((performance.now() - t0) / 200).toFixed(2)} µs per call`);
void acc;
