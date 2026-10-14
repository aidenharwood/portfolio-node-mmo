import test from 'node:test';
import assert from 'node:assert/strict';

import { Discovery } from '../src/world/Discovery.js';
import { baseCovers, baseStale } from '../src/ui/MapUI.js';
import { fogPixels } from '../src/ui/MapFog.js';
import { FOG_PER_CHUNK } from '../src/world/Discovery.js';

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

test('the fog picture clears explored cells, north up', () => {
  const d = new Discovery();
  d.reveal(4, 4, 0);       // just the south-west cell of chunk (0, 0)
  const W = 2 * FOG_PER_CHUNK;
  const H = 2 * FOG_PER_CHUNK;
  const px = new Uint8ClampedArray(W * H * 4);
  fogPixels(d, 0, 0, 1, 1, px, [11, 15, 24, 235]);
  const alpha = (ix, iz) => px[((H - 1 - iz) * W + ix) * 4 + 3];
  assert.equal(alpha(0, 0), 0, 'the explored cell is clear');
  assert.equal(alpha(1, 0), 235, 'its neighbour is still fogged');
  assert.equal(alpha(W - 1, H - 1), 235, 'unexplored chunks are fogged');
  assert.equal(px[((H - 1) * W) * 4 + 3], 0, 'z grows up the picture (the bottom row is the south edge)');
});

test('the map reuses its cached picture while panning and repaints once a zoom settles', () => {
  const base = { cx: 0, cz: 0, zoom: 1, w: 800 + 512, h: 400 + 512, vw: 800, vh: 400, dpr: 2, version: 3, at: 0, complete: true };
  const view = (o = {}) => ({ cx: 0, cz: 0, zoom: 1, w: 800, h: 400, dpr: 2, version: 3, zoomedAt: -1e9, pinching: false, tilesReady: true, ...o });
  assert.equal(baseStale(base, view({ cx: 200, cz: -150 }), 1000), false, 'a pan inside the margin reuses it');
  assert.equal(baseCovers(base, view({ cx: 300 })), false);
  assert.equal(baseStale(base, view({ cx: 300 }), 1000), true, 'a pan past the margin repaints');
  assert.equal(baseStale(base, view({ zoom: 1.3, zoomedAt: 990 }), 1000), false, 'mid-zoom, the old picture is scaled');
  assert.equal(baseStale(base, view({ zoom: 1.3, zoomedAt: 800 }), 1000), true, 'once the zoom settles it repaints');
  assert.equal(baseStale(base, view({ version: 4 }), 1000), true, 'more explored: repaint');
  assert.equal(baseStale({ ...base, complete: false }, view({ tilesReady: false }), 100), false, 'tiles still coming: not every frame');
  assert.equal(baseStale({ ...base, complete: false }, view({ tilesReady: true }), 100), true, 'all its tiles are in: repaint');
});
