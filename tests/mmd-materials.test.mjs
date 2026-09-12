import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveMmdAlphaLayers } from '../src/mmd-materials.mjs';

test('PMX texture alpha disables depth writes after MMDLoader detects it', () => {
  const material = { transparent: false, depthWrite: true, needsUpdate: false, map: { readyCallbacks: [] } };
  preserveMmdAlphaLayers([material]);
  assert.equal(material.depthWrite, true);

  material.transparent = true;
  material.map.readyCallbacks.forEach(callback => callback());

  assert.equal(material.depthWrite, false);
  assert.equal(material.needsUpdate, true);
});

test('already-transparent PMX materials do not block the clothing behind them', () => {
  const material = { transparent: true, depthWrite: true, needsUpdate: false };
  preserveMmdAlphaLayers([material]);
  assert.equal(material.depthWrite, false);
  assert.equal(material.needsUpdate, true);
});
