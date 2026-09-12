import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleIdleArms, sampleIdleFingers } from '../src/idle-motion.mjs';
import { sampleMotion, rotationQuaternion } from '../src/motion.mjs';

test('idle keeps both arms within a few degrees of rest with independent small movements', () => {
  const poses = Array.from({ length: 120 }, (_, i) => sampleIdleArms(i * 2)).filter(pose => !pose.poseWeight);
  const rest = sampleIdleArms(0);
  for (const name of Object.keys(rest.bones)) {
    const angles = poses.map(pose => rotationQuaternion(pose.bones[name]).angleTo(rotationQuaternion(rest.bones[name])));
    assert.ok(Math.max(...angles) < 0.09, `${name}: remains close to rest`);
    assert.ok(Math.max(...angles) > 0.005, `${name}: not frozen`);
  }
  assert.ok(poses.some(pose => Math.abs(pose.bones.leftLowerArm[1] + pose.bones.rightLowerArm[1] - 0.05) > 0.025));
  for (const pose of poses) assert.ok(pose.body.every(value => value === 0));
});

test('random idle stays slow and continuous across new target boundaries', () => {
  let before = sampleIdleArms(0);
  for (let t = 1 / 60; t < 160; t += 1 / 60) {
    const after = sampleIdleArms(t);
    for (const [name, angles] of Object.entries(after.bones)) {
      assert.ok(angles.every(Number.isFinite));
      assert.ok(rotationQuaternion(before.bones[name]).angleTo(rotationQuaternion(angles)) < 0.013, `${name} at ${t}`);
    }
    before = after;
  }
  assert.deepEqual(sampleIdleArms(5, true), sampleIdleArms(70, true));
});

test('occasional hands-behind-back pose looks down only during that pose', () => {
  const snapshot = { state: 'idle', elapsed: 50, remaining: 3, dragging: false, sway: 0 };
  const down = sampleMotion(snapshot, 34, { x: 1, y: 1 });
  const otherPointer = sampleMotion(snapshot, 34, { x: -1, y: -1 });
  assert.equal(down.idleGesture, 'hands-behind-back');
  assert.deepEqual(down.bones.head, otherPointer.bones.head);
  assert.ok(down.bones.head[0] < -0.2);
  assert.ok(down.bones.spine[0] < -0.1);
  for (const t of [10, 27, 41, 53]) {
    const a = sampleMotion(snapshot, t, { x: 1, y: 0 });
    const b = sampleMotion(snapshot, t, { x: -1, y: 0 });
    assert.equal(a.idleGesture, 'quiet-idle');
    assert.ok(a.bones.head[1] > b.bones.head[1], 'normal gaze still follows pointer');
  }
  assert.equal(sampleIdleArms(34, true).poseWeight, 0);
});

test('fingers move slightly and independently, with no jitter or reduced-motion fidget', () => {
  const samples = Array.from({ length: 3600 }, (_, frame) => sampleIdleFingers(frame / 60));
  for (const name of Object.keys(samples[0])) {
    const values = samples.map(sample => sample[name]);
    assert.ok(Math.max(...values) - Math.min(...values) > 0.02, `${name} is articulated`);
    assert.ok(values.every(value => Math.abs(value) <= 0.061));
    assert.ok(values.every((value, i) => !i || Math.abs(value - values[i - 1]) < 0.002));
  }
  assert.ok(samples.some(sample => Math.abs(sample.leftIndex - sample.leftMiddle) > 0.025));
  assert.deepEqual(sampleIdleFingers(5, true), sampleIdleFingers(70, true));
});

test('reactions release into the current idle phase and grabbing does not play idle arms', () => {
  for (const time of [3, 9.2, 22.5, 35.5, 42]) {
    const common = { elapsed: 5, remaining: 0, dragging: false, sway: 0 };
    const rest = sampleMotion({ ...common, state: 'idle' }, time);
    for (const state of ['thinking', 'talking', 'angry', 'laugh', 'wave']) {
      const end = sampleMotion({ ...common, state }, time);
      for (const name of Object.keys(sampleIdleArms(time).bones)) assert.deepEqual(end.bones[name], rest.bones[name]);
    }
    const held = sampleMotion({ ...common, state: 'held', dragging: true }, time);
    assert.equal(held.idleGesture, '');
  }
});
