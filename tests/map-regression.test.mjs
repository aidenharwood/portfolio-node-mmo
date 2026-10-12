import test from 'node:test';
import assert from 'node:assert/strict';

import { Discovery } from '../src/world/Discovery.js';
import { pickMapDrawStride } from '../src/ui/MapUI.js';

test('discovery saves compactly and round-trips', () => {
  const d = new Discovery();
  for (let x = -64; x <= 64; x += 8) {
    for (let z = -64; z <= 64; z += 8) {
      d.reveal(x, z, 8);
    }
  }

  const json = d.toJSON();
  const loaded = new Discovery();
  loaded.load(json);

  assert.ok(loaded.chunks.size > 0);
  assert.equal(loaded.isKnown(0, 0), true);
  assert.ok(json.length < 20000, `discovery save is too large: ${json.length} bytes`);
});

test('zoomed-out world maps use a coarse draw stride', () => {
  const stride = pickMapDrawStride({ width: 1200, height: 900, zoom: 0.15, chunkCount: 4000 });
  assert.ok(stride >= 2, `expected a coarse stride when the map is zoomed way out, got ${stride}`);
});
