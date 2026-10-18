import assert from 'node:assert/strict';
import test from 'node:test';
import { findById, hasOrder, parseHierarchy, pointIn, visibleBounds } from './android-drag.mjs';

test('reads native IDs and selection, decodes accessibility text, and rejects invalid dumps', () => {
  const nodes = parseHierarchy(
    '<hierarchy><node resource-id="dev.vostride.playground:id/task-status-todo" selected="true" content-desc="To do &amp; review" bounds="[10,20][200,80]" /></hierarchy>',
  );
  const status = findById(nodes, 'task-status-todo');
  assert.equal(status.selected, 'true');
  assert.equal(status['content-desc'], 'To do & review');
  assert.throws(() => parseHierarchy('ERROR: could not get idle state'));
});

test('targets the visible part of a partially offscreen adjacent card', () => {
  const screen = { width: 1080, height: 2400 };
  const bounds = visibleBounds(
    { bounds: { left: 810, top: 500, right: 1530, bottom: 800 } },
    screen,
  );
  assert.deepEqual(bounds, { left: 810, top: 500, right: 1080, bottom: 800 });
  assert.deepEqual(pointIn(bounds, 0.25, 0.5), { x: 878, y: 650 });
  assert.equal(
    visibleBounds({ bounds: { left: 1200, top: 0, right: 1500, bottom: 100 } }, screen),
    null,
  );
});

test('order evidence requires visible cards in the same column', () => {
  const screen = { width: 400, height: 800 };
  const card = (id, left, top) => ({
    'resource-id': id,
    bounds: { left, top, right: left + 250, bottom: top + 120 },
  });
  assert.equal(hasOrder([card('a', 20, 300), card('b', 20, 450)], screen, 'a', 'b'), true);
  assert.equal(hasOrder([card('a', 20, 450), card('b', 20, 300)], screen, 'a', 'b'), false);
  assert.equal(hasOrder([card('a', 20, 300), card('b', 310, 450)], screen, 'a', 'b'), false);
  assert.equal(hasOrder([card('a', 20, 300), card('b', 20, 850)], screen, 'a', 'b'), false);
});
