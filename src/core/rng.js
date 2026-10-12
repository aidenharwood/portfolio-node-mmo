// Seeded randomness so any generated item can be rebuilt from (seed, level, options).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export function weightedPick(rng, list, weightOf) {
  let total = 0;
  for (const item of list) total += weightOf(item);
  let r = rng() * total;
  for (const item of list) {
    r -= weightOf(item);
    if (r <= 0) return item;
  }
  return list[list.length - 1];
}

export const randRange = (rng, min, max) => min + (max - min) * rng();
