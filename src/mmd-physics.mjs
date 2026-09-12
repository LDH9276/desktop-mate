import { FileLoader } from 'three';
import { MMDPhysics } from './vendor/MMDPhysics.js';
import { physicsWeight, physicsCategory } from './physics-settings.mjs';

let ammoReady;
export function loadAmmo() {
  if (globalThis.Ammo?.btVector3) return Promise.resolve(globalThis.Ammo);
  if (ammoReady) return ammoReady;
  ammoReady = (async () => {
    const script = document.createElement('script');
    script.src = new URL('./physics/ammo.wasm.js', document.baseURI).href;
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error('물리 엔진을 불러오지 못했습니다.')); };
      document.head.append(script);
    });
    const wasmBinary = await new FileLoader().setResponseType('arraybuffer').loadAsync('./physics/ammo.wasm.wasm');
    globalThis.Ammo = await globalThis.Ammo({ wasmBinary });
    return globalThis.Ammo;
  })().catch(error => { ammoReady = null; throw error; });
  return ammoReady;
}

export function collisionBodies(data, bones) {
  const result = data.map(body => ({ ...body }));
  const armNames = /^(?:左|右)(?:腕|ひじ|肘|手首)$|^(?:left|right) (?:arm|elbow|wrist)$/i;
  const attachedToArm = body => {
    for (let bone = bones[body.boneIndex]; bone; bone = bone.parent) if (armNames.test(bone.name)) return true;
    return false;
  };
  const garments = result.filter(body => body.type !== 0 && !attachedToArm(body)
    && /スカート|skirt|裙|衣摆|披|coat|cloth|dress|piao|摆|(?:^|[左右後前])Q(?:_|d)/i.test(`${body.name} ${bones[body.boneIndex]?.name}`));
  const arms = result.filter(body => body.type === 0 && /手首|wrist/i.test(`${body.name} ${bones[body.boneIndex]?.name}`));
  // Add hand contacts while retaining the author's upper-arm exclusions. Large
  // upper-arm capsules can otherwise lift an entire skirt from inside it.
  for (const cloth of garments) for (const arm of arms) {
    cloth.groupTarget |= 1 << arm.groupIndex;
    arm.groupTarget |= 1 << cloth.groupIndex;
  }
  return result;
}

export function createMmdPhysics(mesh) {
  const data = mesh.geometry.userData.MMD;
  if (!data?.rigidBodies?.some(body => body.type !== 0)) return null;
  if (!globalThis.Ammo?.btVector3) throw new Error('물리 엔진 준비 전입니다.');
  const bones = mesh.skeleton.bones;
  const bodies = collisionBodies(data.rigidBodies, bones);
  const constraints = data.constraints || [];
  if (bodies.length > 1500 || constraints.length > 4000) throw new Error('모델의 물리 데이터가 너무 큽니다.');
  for (const body of bodies) {
    if (!Number.isInteger(body.boneIndex) || body.boneIndex < -1 || body.boneIndex >= bones.length
      || ![0, 1, 2].includes(body.shapeType) || ![0, 1, 2].includes(body.type)
      || !Number.isInteger(body.groupIndex) || body.groupIndex < 0 || body.groupIndex > 15
      || ![...body.position, ...body.rotation, body.width, body.height, body.depth, body.weight, body.positionDamping, body.rotationDamping, body.friction, body.restitution].every(Number.isFinite)
      || body.width < 0 || body.height < 0 || body.depth < 0 || body.weight < 0) {
      throw new Error('유효하지 않은 모델 충돌체입니다.');
    }
  }
  for (const joint of constraints) {
    if (!bodies[joint.rigidBodyIndex1] || !bodies[joint.rigidBodyIndex2]
      || !['position', 'rotation', 'translationLimitation1', 'translationLimitation2', 'rotationLimitation1', 'rotationLimitation2', 'springPosition', 'springRotation'].every(key => joint[key]?.every(Number.isFinite))) {
      throw new Error('유효하지 않은 모델 물리 관절입니다.');
    }
  }
  const savedPosition = mesh.position.clone(), savedQuaternion = mesh.quaternion.clone(), savedScale = mesh.scale.clone();
  const inModelSpace = operation => {
    const parent = mesh.parent;
    savedPosition.copy(mesh.position); savedQuaternion.copy(mesh.quaternion); savedScale.copy(mesh.scale);
    mesh.parent = null; mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld(true);
    try { return operation(); }
    finally {
      mesh.parent = parent; mesh.position.copy(savedPosition); mesh.quaternion.copy(savedQuaternion); mesh.scale.copy(savedScale);
      mesh.updateMatrixWorld(true);
    }
  };
  const followsHead = bone => {
    for (let parent = bone.parent; parent?.isBone; parent = parent.parent) if (/^(頭|head)$/i.test(parent.name)) return true;
    return false;
  };
  const animated = bones.map((bone, index) => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), headAccessory: followsHead(bone), category: physicsCategory(bone, bodies.filter(body => body.boneIndex === index).map(body => body.name).join(' ')) }));
  let simulation;
  inModelSpace(() => {
    mesh.pose(); mesh.updateMatrixWorld(true);
    try { simulation = new MMDPhysics(mesh, bodies, constraints, { unitStep: 1 / 65, maxStepNum: 3 }); }
    finally {
      for (const entry of animated) { entry.bone.position.copy(entry.position); entry.bone.quaternion.copy(entry.quaternion); }
      mesh.updateMatrixWorld(true);
    }
  });
  const dynamicIndices = new Set(bodies.filter(body => body.type !== 0 && body.boneIndex >= 0).map(body => body.boneIndex));
  const dynamic = animated.filter((_, index) => dynamicIndices.has(index));
  let reset = true, accumulator = 0, disposed = false, steps = 0;
  const zero = new globalThis.Ammo.btVector3(0, 0, 0);
  return {
    bodyCount: bodies.length, constraintCount: constraints.length, dynamicCount: dynamic.length,
    get steps() { return steps; },
    restore() {
      if (disposed) return;
      for (const entry of dynamic) { entry.bone.position.copy(entry.position); entry.bone.quaternion.copy(entry.quaternion); }
    },
    update(delta, enabled = true, clothWeight = 1, hairWeight = clothWeight) {
      if (disposed) return;
      const weights = { cloth: physicsWeight(clothWeight, 0), hair: physicsWeight(hairWeight, 0) };
      if (!enabled || (!weights.cloth && !weights.hair) || !Number.isFinite(delta) || delta <= 0) { reset = true; accumulator = 0; return; }
      if (delta > 0.25) reset = true;
      for (const entry of dynamic) { entry.position.copy(entry.bone.position); entry.quaternion.copy(entry.bone.quaternion); }
      inModelSpace(() => {
        if (reset) {
          simulation.reset();
          for (const entry of simulation.bodies) {
            entry.body.clearForces(); entry.body.setLinearVelocity(zero); entry.body.setAngularVelocity(zero);
          }
          simulation.warmup(12); reset = false; accumulator = 0;
        }
        accumulator = Math.min(accumulator + Math.min(delta, 0.05), 3 / 65);
        while (accumulator >= 1 / 65) { simulation.update(1 / 65); accumulator -= 1 / 65; steps++; }
      });
      for (const { bone } of dynamic) if (!Number.isFinite(bone.position.x + bone.position.y + bone.position.z
        + bone.quaternion.x + bone.quaternion.y + bone.quaternion.z + bone.quaternion.w)) throw new Error('모델 물리 계산이 불안정합니다.');
      // Long head ribbons can amplify tiny movements along many joints. Keep
      // their secondary motion subtle while clothes retain full collision output.
      for (const entry of dynamic) if (entry.headAccessory) {
        const angle = entry.quaternion.angleTo(entry.bone.quaternion);
        const amount = Math.min(0.25, 0.035 / Math.max(angle, 0.000001));
        entry.bone.quaternion.slerpQuaternions(entry.quaternion, entry.bone.quaternion, amount);
        entry.bone.position.copy(entry.position);
      }
      // Blend only the rendered bones. The Bullet simulation keeps its full state,
      // and restore() recovers the authored pose before the next animation frame.
      for (const entry of dynamic) {
        const weight = weights[entry.category];
        entry.bone.position.lerpVectors(entry.position, entry.bone.position, weight);
        entry.bone.quaternion.slerpQuaternions(entry.quaternion, entry.bone.quaternion, weight);
      }
      mesh.updateMatrixWorld(true);
    },
    dispose() {
      if (disposed) return;
      this.restore(); simulation.dispose(); globalThis.Ammo.destroy(zero); disposed = true;
    },
  };
}
