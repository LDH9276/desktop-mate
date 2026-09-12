import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Quaternion } from 'three';
import { MMDParser } from 'three/addons/libs/mmdparser.module.js';
import { createMotionClip, clipFiles, composeMotion, reactionSources } from '../src/expressive-motion.mjs';
import { emotionChoices } from '../src/emotions.mjs';
import { mmdRotation } from '../src/motion-rig.mjs';
import reference from '../src/gene-rest.json' with { type: 'json' };

const clips = new Map(), original = new Map();
for (const file of clipFiles) {
  const b = readFileSync(new URL(`../public/motions/gene/${file}`, import.meta.url));
  const vmd = new MMDParser.Parser().parseVmd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), true);
  original.set(file, vmd); clips.set(file, createMotionClip(file, vmd));
}
const snapshot = (state, elapsed, duration = 4.6) => ({ state, elapsed, remaining: Math.max(0, duration - elapsed), dragging: false, sway: 0, reactionId: 1 });

test('six added VMDs retain authored arm, wrist and finger tracks', () => {
  for (const file of clipFiles.slice(2)) {
    const clip = clips.get(file);
    assert.ok(clip.tracks.has('leftUpperArm') || clip.tracks.has('rightUpperArm'), file);
    assert.ok([...clip.tracks.keys()].some(x => /Hand/.test(x)), `${file}: wrists`);
    assert.ok([...clip.tracks.keys()].some(x => /Index|Middle|Ring/.test(x)), `${file}: fingers`);
  }
});

test('source elbow and wrist rotations round-trip through T-pose calibration', () => {
  for (const name of ['leftUpperArm', 'leftLowerArm', 'rightLowerArm', 'rightHand']) {
    const frame = reference.frames[name];
    const key = original.get('38_Ashamed.vmd').motions.find(x => x.boneName === frame.name && x.frameNum === 15);
    assert.ok(key, name);
    const q = clips.get('38_Ashamed.vmd').sample(name, 0.5);
    const entry = Object.fromEntries(['pre', 'post', 'base'].map(k => [k, new Quaternion().fromArray(frame[k])]));
    assert.ok(mmdRotation(entry, q).angleTo(new Quaternion().fromArray(key.rotation).normalize()) < 0.0001, name);
  }
});

test('each emotion plays a real VMD, has changing poses, and returns to neutral', () => {
  const rest = composeMotion(snapshot('idle', 0), 0, { x: 0, y: 0 }, false, clips);
  for (const { state } of emotionChoices) {
    const poses = [0.16, 0.65, 1.7, 2.5].map(a => composeMotion(snapshot(state, a), 0, { x: 0, y: 0 }, false, clips));
    assert.equal(poses[1].source, reactionSources[state].file);
    assert.equal(poses[0].phase, 'anticipation'); assert.equal(poses[1].phase, 'hold');
    assert.ok(poses[0].targets.spine.angleTo(poses[1].targets.spine) > 0.025, `${state} changes silhouette`);
    const end = composeMotion(snapshot(state, 4.6), 0, { x: 0, y: 0 }, false, clips);
    for (const name of Object.keys(rest.targets)) assert.ok(end.targets[name].angleTo(rest.targets[name]) < 1e-6, `${state} returns ${name}`);
    for (const pose of poses) {
      for (const q of Object.values(pose.targets)) assert.ok(q.toArray().every(Number.isFinite) && Math.abs(q.length() - 1) < 1e-6);
      assert.ok(Math.abs(pose.root.y) < 0.12 && Math.abs(pose.root.ry) < 0.5);
    }
  }
});

test('missing clips and reduced motion keep a usable pose; grabbing overrides clips', () => {
  for (const { state } of emotionChoices) {
    assert.equal(composeMotion(snapshot(state, 1), 1, { x: 0, y: 0 }, false).source, null);
    const reduced = composeMotion(snapshot(state, 1), 1, { x: 0, y: 0 }, true, clips);
    assert.equal(reduced.source, null); assert.equal(reduced.root.y, 0);
    assert.equal(composeMotion({ ...snapshot(state, 1), dragging: true }, 1, { x: 0, y: 0 }, false, clips).source, null);
  }
});

test('thinking loops continuously for long waits, with a procedural fallback and clean release', () => {
  let previous;
  for (let a = 0.6; a < 32; a += 1 / 30) {
    const motion = composeMotion(snapshot('thinking', a, a + 1.6), a, { x: 0, y: 0 }, false, clips);
    assert.equal(motion.source, '16_thinking.vmd'); assert.equal(motion.phase, 'ponder');
    for (const [name, q] of Object.entries(motion.targets)) {
      assert.ok(q.toArray().every(Number.isFinite));
      if (previous) assert.ok(q.angleTo(previous.targets[name]) < 0.2, `${name}: no loop seam`);
    }
    previous = motion;
  }
  for (const reduced of [false, true]) {
    const fallback = composeMotion(snapshot('thinking', 2), 2, { x: 0, y: 0 }, reduced);
    assert.equal(fallback.source, null);
    const rest = composeMotion(snapshot('idle', 0), 9.2, { x: 0, y: 0 }, reduced, clips);
    const end = composeMotion(snapshot('thinking', 30, 30), 9.2, { x: 0, y: 0 }, reduced, clips);
    for (const name of Object.keys(rest.targets)) assert.ok(end.targets[name].angleTo(rest.targets[name]) < 1e-6, name);
  }
});
