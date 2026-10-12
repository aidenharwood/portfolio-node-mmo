import test from 'node:test';
import assert from 'node:assert/strict';

import { Discovery } from '../src/world/Discovery.js';
import { normalizeCharacterSaveData } from '../server/realm.js';

test('online save payload accepts string discovery data', () => {
  const d = new Discovery();
  d.reveal(0, 0, 16);
  d.reveal(32, -32, 24);

  const parsed = normalizeCharacterSaveData({
    discovery: d.toJSON(),
    marker: { x: 12.5, z: -9.25 },
  });

  assert.ok(parsed && parsed.discovery && typeof parsed.discovery === 'string');
  assert.deepEqual(parsed.marker, { x: 12.5, z: -9.25 });

  const loaded = new Discovery();
  loaded.load(parsed.discovery);
  assert.equal(loaded.isKnown(0, 0), true);
});
