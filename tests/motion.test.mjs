import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MMDParser } from 'three/addons/libs/mmdparser.module.js';
import { CompanionBehavior } from '../src/behavior.mjs';
import { sampleMotion, rotationQuaternion, VmdBodyMotion, vmdBezier } from '../src/motion.mjs';

const snapshot = (state, elapsed = 1, remaining = 2) => ({ state, elapsed, remaining, dragging: state === 'held', sway: 0, reactionId: 1, angularVelocity: 0 });
test('all reactions are finite, and one-shot gestures release to the resting arm pose', () => {
  for (const state of ['idle', 'wave', 'happy', 'surprise', 'angry', 'smile', 'laugh', 'annoyed', 'embarrassed', 'sad', 'bow', 'sleep', 'talking', 'landing', 'held', 'dizzy']) {
    for (let t = 0; t <= 11; t += 0.025) {
      const pose = sampleMotion(snapshot(state, t, Math.max(0, 11 - t)), t);
      for (const values of Object.values(pose.bones)) assert.ok(values.every(Number.isFinite));
      assert.ok(Object.values(pose.root).every(Number.isFinite));
      assert.ok(Object.values(pose.face).every(x => x >= 0 && x <= 1));
    }
  }
  const rest = sampleMotion(snapshot('idle'), 0);
  for (const state of ['wave', 'happy', 'surprise', 'angry', 'smile', 'laugh', 'annoyed', 'embarrassed', 'sad', 'bow', 'sleep', 'talking']) {
    const end = sampleMotion(snapshot(state, 3, 0), 0);
    assert.deepEqual(end.bones.leftUpperArm, rest.bones.leftUpperArm);
    assert.deepEqual(end.bones.rightLowerArm, rest.bones.rightLowerArm);
  }
});

test('reactions restart on repeated clicks and speech updates preserve gesture time', () => {
  const b = new CompanionBehavior(); b.react('happy', 1000); b.react('happy', 2000);
  assert.equal(b.tick(0.02, 2100).elapsed, 0.1);
  b.react('talking', 3000); b.react('talking', 4000);
  assert.equal(b.tick(0.02, 4100).elapsed, 1.1);
  b.grab(0, 0, 4200); b.react('bow', 4300); assert.equal(b.state, 'held');
});

test('bundled VMD excerpts contain animated torso tracks and retain rotation interpolation', () => {
  for (const file of ['22_apology.vmd', '28_sleepy.vmd']) {
    const b = readFileSync(new URL(`../public/motions/gene/${file}`, import.meta.url));
    const vmd = new MMDParser.Parser().parseVmd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), true);
    const clip = new VmdBodyMotion(vmd);
    assert.ok(clip.tracks.size >= 2);
    assert.equal(clip.sample('leftUpperArm', 1), null, 'model-specific arm data must not override the calibrated rig');
    assert.ok(clip.sample('spine', 0).angleTo(clip.sample('spine', 1.7)) > 0.05);
    for (let t = 0; t < 11; t += 0.07) for (const name of clip.tracks.keys()) assert.ok(Math.abs(clip.sample(name, t).length() - 1) < 1e-6);
  }
  assert.ok(Math.abs(vmdBezier(0.5, [0.2, 0.8, 0.2, 0.8]) - 0.5) < 0.001);
});
test('head and neck turn toward the pointer', () => {
  const base={state:'idle',elapsed:0,remaining:0,dragging:false,sway:0,reactionId:0};
  const left=sampleMotion(base,0,{x:-1,y:0},false),right=sampleMotion(base,0,{x:1,y:0},false);
  assert.ok(left.bones.head[1]<0 && left.bones.neck[1]<0,'left pointer turns head left');
  assert.ok(right.bones.head[1]>0 && right.bones.neck[1]>0,'right pointer turns head right');
  const above=sampleMotion(base,0,{x:0,y:-1},false),below=sampleMotion(base,0,{x:0,y:1},false);
  assert.ok(above.bones.head[0]<below.bones.head[0],'vertical gaze follows pointer height');
});
