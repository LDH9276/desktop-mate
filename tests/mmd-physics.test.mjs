import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Bone, BufferGeometry, Group, Skeleton, SkinnedMesh, Vector3, Quaternion } from 'three';
import { MMDPhysics } from '../src/vendor/MMDPhysics.js';
import { boundSecondaryRotation, collisionBodies, createMmdPhysics } from '../src/mmd-physics.mjs';
import { physicsWeight, physicsCategory, isHairStrand } from '../src/physics-settings.mjs';

test('physics preferences clamp corrupt values and classify hair and clothes', () => {
  assert.equal(physicsWeight(null), 0.35); assert.equal(physicsWeight('NaN'), 0.35);
  assert.equal(physicsWeight('0'), 0); assert.equal(physicsWeight('2'), 1); assert.equal(physicsWeight('-1'), 0);
  const head = new Bone(); head.name = '頭';
  const ribbon = new Bone(); ribbon.name = 'ribbon'; head.add(ribbon);
  assert.equal(physicsCategory(ribbon), 'hair');
  ribbon.name = 'skirt'; assert.equal(physicsCategory(ribbon), 'cloth');
  assert.equal(physicsCategory({ name: '前髪', parent: null }), 'hair');
  assert.equal(isHairStrand({ name: 'Bone_HairSideA01_L', parent: head }), true);
  assert.equal(isHairStrand({ name: '发带1', parent: head }), false);
  ribbon.name = 'hair-ribbon'; assert.equal(isHairStrand(ribbon), false);
});

test('fractional secondary rotation stays continuous through repeated half turns', () => {
  const filtered = new Quaternion(), previous = new Quaternion(), axis = new Vector3(0, 0, 1);
  for (let frame = 0; frame < 900; frame++) {
    const target = new Quaternion().setFromAxisAngle(axis, frame * 0.03);
    const angle = filtered.angleTo(target);
    filtered.slerp(target, Math.min(1, 0.05 / Math.max(angle, 1e-6)));
    boundSecondaryRotation(filtered);
    const rendered = new Quaternion().slerp(filtered, 0.35);
    assert.ok(previous.angleTo(rendered) < 0.018, '35% blending must not flip by 126 degrees');
    assert.ok(new Quaternion().angleTo(filtered) <= Math.PI / 2 + 1e-6);
    previous.copy(rendered);
  }
});

test('authored collision masks remain unchanged, including excluded wrist groups', () => {
  const original = [{ name: '右手首', type: 0, groupIndex: 6, groupTarget: 0, boneIndex: 0 }, { name: 'スカート_0', type: 1, groupIndex: 2, groupTarget: 0, boneIndex: 1 }, { name: 'hair', type: 1, groupIndex: 1, groupTarget: 0, boneIndex: 2 }];
  const result = collisionBodies(original, []);
  assert.equal(result[0].groupTarget, 0); assert.equal(result[1].groupTarget, 0);
  assert.equal(result[2].groupTarget, 0); assert.ok(original.every(body => body.groupTarget === 0));
  const arm = { name: '右腕', parent: null }, sleeve = { name: 'cloth-sleeve', parent: arm };
  const alternate = collisionBodies([{ ...original[0], boneIndex: 0 }, { ...original[1], name: 'Q_0_1', boneIndex: 2 }, { ...original[1], name: 'cloth-sleeve', boneIndex: 1 }], [arm, sleeve]);
  assert.equal(alternate[1].groupTarget, 0, 'Q skirt masks remain authored');
  assert.equal(alternate[2].groupTarget, 0, 'do not force a sleeve to collide with its own arm');
});

test('native simulation separates clothing from a body and survives scale, pause and disposal', async () => {
  const context = vm.createContext({ WebAssembly, console, TextDecoder, setTimeout, clearTimeout });
  vm.runInContext(readFileSync('public/physics/ammo.wasm.js', 'utf8'), context);
  globalThis.Ammo = await context.Ammo({ wasmBinary: readFileSync('public/physics/ammo.wasm.wasm') });
  // A free body must keep its world orientation when its animated parent
  // turns around multiple axes (quaternion multiplication is not commutative).
  const rotationMesh = new SkinnedMesh(new BufferGeometry()), parentBone = new Bone(), childBone = new Bone();
  rotationMesh.add(parentBone); parentBone.add(childBone); childBone.position.y = 1;
  rotationMesh.bind(new Skeleton([parentBone, childBone]));
  const rotationPhysics = new MMDPhysics(rotationMesh, [{ boneIndex: 1, type: 1, shapeType: 0, width: .1, height: 0, depth: 0,
    position: [0, 0, 0], rotation: [0, 0, 0], weight: 1, positionDamping: .9, rotationDamping: .9,
    friction: 0, restitution: 0, groupIndex: 1, groupTarget: 0 }], [], { gravity: new Vector3() });
  parentBone.rotation.set(.4, .5, -.2); childBone.rotation.set(-.3, .2, .6); rotationMesh.updateMatrixWorld(true); rotationPhysics.reset();
  const expectedRotation = childBone.getWorldQuaternion(new Quaternion());
  for (let i = 0; i < 60; i++) {
    parentBone.rotation.set(-.2 + i / 100, .8, .4); rotationMesh.updateMatrixWorld(true); rotationPhysics.update(1 / 65);
    assert.ok(expectedRotation.angleTo(childBone.getWorldQuaternion(new Quaternion())) < 1e-5, 'animated parents must not twist free dynamic bones');
  }
  rotationPhysics.dispose(); rotationMesh.geometry.dispose(); rotationMesh.material.dispose();
  const make = (collisions, headAccessory = false, clothWeight = 1, hairWeight = clothWeight, hair = false) => {
    const mesh = new SkinnedMesh(new BufferGeometry());
    const torso = new Bone(), skirt = new Bone(); torso.name = headAccessory ? '頭' : 'torso'; skirt.name = 'skirt'; skirt.position.x = 0.5;
    mesh.add(torso); torso.add(skirt); mesh.bind(new Skeleton([torso, skirt]));
    mesh.geometry.userData.MMD = { rigidBodies: [0, 1].map((type, index) => ({ name: index ? 'skirt' : 'torso', boneIndex: index, type, shapeType: 0, width: index ? 0.35 : 1, height: 0, depth: 0, position: [0, 0, 0], rotation: [0, 0, 0], weight: 1, positionDamping: 0.9, rotationDamping: 0.9, friction: 0.5, restitution: 0, groupIndex: index, groupTarget: collisions ? 65535 : 0 })), constraints: [] };
    const parent = new Group(); parent.add(mesh); parent.scale.set(1.2, 0.7, 1.2); parent.rotation.y = 0.8;
    mesh.position.set(0.2, -1.2, 0.1); mesh.scale.setScalar(0.08);
    if (hair) { skirt.name = 'hair'; mesh.geometry.userData.MMD.rigidBodies[1].name = 'hair'; }
    const simulation = createMmdPhysics(mesh);
    // The displayed secondary motion settles gradually rather than snapping
    // to the first contact correction on the activation frame.
    for (let frame = 0; frame < 30; frame++) {
      simulation.restore(); simulation.update(1 / 30, true, clothWeight, hairWeight);
    }
    return { mesh, skirt, simulation, parent };
  };
  const free = make(false), collided = make(true);
  const half = make(true, false, 0.35), off = make(true, false, 0, 1);
  const hairOnly = make(true, false, 0, 0.6, true), hairOff = make(true, false, 1, 0, true);
  const headHair = make(true, true, 0, 1, true);
  assert.ok(headHair.skirt.position.x > 1, 'head-parented hair must retain torso collision displacement');
  assert.ok(Math.abs(headHair.skirt.position.x - collided.skirt.position.x) < 0.0001,
    'hair at full weight receives the same contact response as other dynamic bodies');
  assert.ok(headHair.skirt.quaternion.angleTo(off.skirt.quaternion) > 0.0001,
    'blending must not overwrite the simulated rotation with the original pose');
  assert.ok(Math.abs(half.skirt.position.x - (0.5 + (collided.skirt.position.x - 0.5) * 0.35)) < 0.0001);
  assert.equal(off.skirt.position.x, 0.5, 'clothing off while hair simulation continues');
  assert.ok(Math.abs(hairOnly.skirt.position.x - (0.5 + (collided.skirt.position.x - 0.5) * 0.6)) < 0.0001);
  assert.equal(hairOff.skirt.position.x, 0.5, 'hair off while clothing simulation continues');
  for (const { simulation, skirt, mesh } of [half, off, hairOnly, hairOff, headHair]) {
    simulation.restore(); const steps = simulation.steps; simulation.update(1 / 30, true, 0, 0);
    assert.equal(simulation.steps, steps); assert.equal(skirt.position.x, 0.5);
    simulation.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
  }
  assert.ok(collided.skirt.position.x > free.skirt.position.x + 0.4, 'native contact pushes the cloth outside the torso');
  const ribbon = make(true, true);
  assert.deepEqual(ribbon.skirt.position.toArray(), [0.5, 0, 0], 'head ornaments retain their segment lengths');
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(ribbon.skirt.quaternion.w))) <= 0.0351);
  ribbon.simulation.dispose(); ribbon.mesh.geometry.dispose(); ribbon.mesh.material.dispose();
  for (const { mesh, skirt, simulation, parent } of [free, collided]) {
    assert.equal(mesh.parent, parent); assert.deepEqual(mesh.scale.toArray(), [0.08, 0.08, 0.08]);
    assert.deepEqual(mesh.position.toArray(), [0.2, -1.2, 0.1]);
    simulation.restore(); simulation.update(1 / 30, false); assert.equal(skirt.position.x, 0.5);
    for (let frame = 0; frame < 30; frame++) { simulation.restore(); simulation.update(1 / 60); }
    assert.ok(skirt.getWorldPosition(new Vector3()).toArray().every(Number.isFinite));
    simulation.restore(); simulation.update(5); assert.ok(skirt.position.toArray().every(Number.isFinite));
    simulation.dispose(); simulation.dispose(); assert.equal(skirt.position.x, 0.5);
    mesh.geometry.dispose(); mesh.material.dispose();
  }
});
