import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MMDParser } from 'three/addons/libs/mmdparser.module.js';
import { jointBlend } from '../src/motion.mjs';
import { createMotionClip, clipFiles } from '../src/expressive-motion.mjs';

test('VMD reactions retain authored thumb and fingertip tracks', () => {
  for (const file of clipFiles.slice(2)) {
    const bytes = readFileSync(new URL(`../public/motions/gene/${file}`, import.meta.url));
    const vmd = new MMDParser.Parser().parseVmd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), true);
    const clip = createMotionClip(file, vmd);
    assert.ok([...clip.tracks.keys()].some(name => /Thumb/.test(name)), `${file}: thumb`);
    assert.ok([...clip.tracks.keys()].some(name => /(?:Index|Middle|Ring|Little)Distal$/.test(name)), `${file}: fingertip`);
  }
});

test('wrist follow-through is frame-rate independent and never overshoots', () => {
  const response = (joint, hz, seconds) => {
    let position = 0; for (let frame = 0; frame < hz * seconds; frame++) position += (1 - position) * jointBlend(joint, 1 / hz);
    return position;
  };
  for (const name of ['leftUpperArm', 'leftLowerArm', 'leftHand', 'leftThumbDistal']) {
    assert.ok(Math.abs(response(name, 30, 0.2) - response(name, 120, 0.2)) < 1e-10);
    assert.ok(response(name, 60, 1) <= 1 && response(name, 60, 1) > 0.999);
  }
  assert.ok(response('leftHand', 60, 0.1) < response('leftUpperArm', 60, 0.1));
  assert.equal(jointBlend('leftHand', 1 / 60, true), jointBlend('spine', 1 / 60, true));
});
