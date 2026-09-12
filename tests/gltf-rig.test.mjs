import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group } from 'three';
import { createGltfRig, normalizeGltfBoneName } from '../src/gltf-rig.mjs';

test('maps common Blender, Rigify and Mixamo bone names', () => {
  const root = new Group();
  for (const name of ['mixamorig:Head', 'DEF-upper_arm.L', 'forearm.R', 'LeftUpLeg', '左足首']) {
    const bone = new Bone(); bone.name = name; root.add(bone);
  }
  const rig = createGltfRig(root);
  assert.equal(rig.get('head').bone.name, 'mixamorig:Head');
  assert.equal(rig.get('leftUpperArm').bone.name, 'DEF-upper_arm.L');
  assert.equal(rig.get('rightLowerArm').bone.name, 'forearm.R');
  assert.equal(rig.get('leftUpperLeg').bone.name, 'LeftUpLeg');
  assert.equal(rig.get('leftFoot').bone.name, '左足首');
  assert.equal(normalizeGltfBoneName('Armature|mixamorig:Head'), 'head');
});
