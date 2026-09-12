import test from 'node:test';
import assert from 'node:assert/strict';
import geometry from '../electron/window-geometry.cjs';
const { fitBounds, scaledBounds, reachableBounds, resizeBounds, contentScale, validBounds } = geometry;
const area = { x: 0, y: 0, width: 1920, height: 1040 };
test('screen-height windows can move down while leaving the move bar reachable', () => {
  assert.equal(reachableBounds({ x: 1200, y: 380, width: 550, height: 1024 }, area).y, 380);
  const result = reachableBounds({ x: 9999, y: 9999, width: 550, height: 1024 }, area);
  assert.ok(result.x <= area.width - 128); assert.ok(result.y <= area.height - 80);
});
test('restoring after monitor removal returns the full window to the screen', () => {
  assert.deepEqual(fitBounds({ x: -2400, y: -900, width: 2560, height: 1440 }, area), area);
  assert.equal(validBounds({ x: NaN, y: 0, width: 390, height: 720 }), false);
  assert.equal(validBounds({ x: 0, y: 0, width: -2, height: 720 }), false);
});
test('presets fit small and negative-coordinate displays', () => {
  assert.deepEqual(scaledBounds(1, area, { x: 50, y: 90 }), { x: 50, y: 90, width: 390, height: 720 });
  const bounds = scaledBounds(3, { x: -1920, y: -200, width: 1920, height: 1040 });
  assert.ok(bounds.x >= -1920 && bounds.x + bounds.width <= 0);
  assert.ok(bounds.y >= -200 && bounds.y + bounds.height <= 840);
  assert.ok(Math.abs(bounds.width / bounds.height - 390 / 720) < 0.002);
  assert.ok(contentScale(bounds) < 3);
});
test('resize edges preserve opposite edges and independent dimensions', () => {
  const bounds = { x: 300, y: 200, width: 390, height: 720 };
  assert.deepEqual(resizeBounds(bounds, 120, 90, 'se', area), { x: 300, y: 200, width: 510, height: 810 });
  assert.deepEqual(resizeBounds(bounds, -80, -60, 'nw', area), { x: 220, y: 140, width: 470, height: 780 });
  assert.deepEqual(resizeBounds(bounds, 120, 90, 'e', area), { ...bounds, width: 510 });
  assert.deepEqual(resizeBounds(bounds, 120, 90, 's', area), { ...bounds, height: 810 });
  const minimum = resizeBounds(bounds, 2000, 2000, 'nw', area);
  assert.equal(minimum.width, 292); assert.equal(minimum.height, 540);
  assert.equal(minimum.x + minimum.width, bounds.x + bounds.width);
  assert.equal(minimum.y + minimum.height, bounds.y + bounds.height);
});
