// Hand-placed content around the hub (everything else in the world is generated: world/Gen.js).
export { HUB, WATER_LEVEL } from './Gen.js';

export const NPCS = [
  {
    id: 'warden', name: 'Warden Maren', title: 'Camp Warden', role: 'quest', x: -4, z: -3, facing: 0.4,
    look: { skin: 0xe0b48a, hair: 0x8a8a8a, hairStyle: 'bun', top: 0x3a6a4a, topDark: 0x2a4a34, trim: 0xd0d0d0, pants: 0x3a3a3a, boots: 0x3a2a1a, leather: 0x5a3a26, metal: 0xc9d1dc, pauldrons: true, cape: 0x2a4a34, hat: 'helmet', glow: 0x7aff9a },
  },
  {
    id: 'trader', name: 'Tobbin', title: 'Travelling Trader', role: 'trader', x: 5, z: -3.5, facing: -0.5,
    look: { skin: 0xf0c9a0, hair: 0x4a3020, hairStyle: 'short', top: 0xb06a2a, topDark: 0x7a4a1e, trim: 0xf0c75e, pants: 0x4a3a2a, boots: 0x3a2a1a, leather: 0x6a4a2a, apron: 0x5a5f6a, beard: 0x4a3020, belly: true, hat: 'cap', hatColor: 0x7a2a2a, goggles: true, glow: 0xffb347 },
  },
  {
    id: 'sage', name: 'Old Ysolde', title: 'Hedge Witch', role: 'quest', x: -9, z: 6, facing: 2.6,
    lines: [
      'The scavs aren\'t the worst of it, dear. Something bigger feeds them courage.',
      'Fire for the bugs, shock for the machines, frost for the quick ones. Mind you remember.',
      'High ground is good ground. Climb, and the valley shows you its secrets.',
    ],
    look: { skin: 0xd8b090, hair: 0xdddddd, hairStyle: 'long', top: 0x4a3a6a, topDark: 0x2e2448, trim: 0xb0e0ff, pants: 0x2e2448, boots: 0x2a2030, leather: 0x3a2a3a, hat: 'hood', hatColor: 0x2e2448, glow: 0xd6a8ff },
  },
];
