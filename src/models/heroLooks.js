// Character appearance choices (picked at character creation). A character stores only the indices
// ({ skin, hair, style, outfit, eye, beard }); lookFromChoice turns them into colours for
// buildHumanoid. Plain data with no imports, so the server can validate choices with it too.
export const LOOK_OPTIONS = {
  skin: [0xf3cba5, 0xf7dcc4, 0xe0ac84, 0xc68a5e, 0x9c6644, 0x6e4630],
  hair: [0x5a3a26, 0x1f1a17, 0xd8b25a, 0xa8432a, 0xd9d9d9, 0x3a6ad9, 0xc94f8f],
  style: ['spiky', 'long', 'bun', 'bald'],
  // [top, top shade, scarf]
  outfit: [
    [0x3d6fe0, 0x2b4fa8, 0xd94040],
    [0xc23b3b, 0x8a2424, 0xf0c75e],
    [0x3f8f55, 0x2a6a3c, 0xe0a040],
    [0x7a4fd0, 0x56349c, 0x5ee6ff],
    [0x4a4f5a, 0x30343d, 0xff7a3a],
    [0xc9a46a, 0x9c7a46, 0x3d6fe0],
  ],
  eye: [0x3f8fe0, 0x5a3a26, 0x3f9a5a, 0x8a8a8a, 0xb07a2a],
  beard: [false, true],
};

export const LOOK_KEYS = Object.keys(LOOK_OPTIONS);
export const DEFAULT_CHOICE = { skin: 0, hair: 0, style: 0, outfit: 0, eye: 0, beard: 0 };

export function validChoice(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const keys = Object.keys(c);
  if (keys.length !== LOOK_KEYS.length) return false;
  return LOOK_KEYS.every((k) => Number.isInteger(c[k]) && c[k] >= 0 && c[k] < LOOK_OPTIONS[k].length);
}

export function randomChoice(rand = Math.random) {
  return Object.fromEntries(LOOK_KEYS.map((k) => [k, Math.floor(rand() * LOOK_OPTIONS[k].length)]));
}

// Colours for buildHumanoid (merged over HERO_LOOK there).
export function lookFromChoice(c) {
  if (!validChoice(c)) c = DEFAULT_CHOICE;
  const O = LOOK_OPTIONS;
  const [top, topDark, scarf] = O.outfit[c.outfit];
  const hair = O.hair[c.hair];
  return {
    skin: O.skin[c.skin], hair, hairStyle: O.style[c.style], eye: O.eye[c.eye], top, topDark, scarf,
    beard: O.beard[c.beard] ? hair : undefined,
  };
}
