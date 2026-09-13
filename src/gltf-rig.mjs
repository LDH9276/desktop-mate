import { Quaternion } from 'three';
import { mmdBoneAliases } from './motion-rig.mjs';

// Blender rigs are not standardized. Match the names emitted by Blender's
// common Rigify/Mixamo workflows as well as MMD rigs imported into Blender.
const aliases = {
  head: ['head'], neck: ['neck'], spine: ['spine', 'spine1', 'torso'], chest: ['chest', 'upperchest', 'spine2', 'spine3'],
  leftShoulder: ['leftshoulder', 'shoulderl', 'claviclel'], rightShoulder: ['rightshoulder', 'shoulderr', 'clavicler'],
  leftUpperArm: ['leftarm', 'leftupperarm', 'upperarml'], rightUpperArm: ['rightarm', 'rightupperarm', 'upperarmr'],
  leftLowerArm: ['leftforearm', 'leftlowerarm', 'forearml', 'lowerarml'], rightLowerArm: ['rightforearm', 'rightlowerarm', 'forearmr', 'lowerarmr'],
  leftHand: ['lefthand', 'handl', 'wristl'], rightHand: ['righthand', 'handr', 'wristr'],
  leftUpperLeg: ['leftupleg', 'leftupperleg', 'thighl', 'upperlegl'], rightUpperLeg: ['rightupleg', 'rightupperleg', 'thighr', 'upperlegr'],
  leftLowerLeg: ['leftleg', 'leftlowerleg', 'shinl', 'calfl', 'lowerlegl'], rightLowerLeg: ['rightleg', 'rightlowerleg', 'shinr', 'calfr', 'lowerlegr'],
  leftFoot: ['leftfoot', 'footl', 'anklel'], rightFoot: ['rightfoot', 'footr', 'ankler'],
};

for (const side of ['left', 'right']) {
  const short = side === 'left' ? 'l' : 'r';
  for (const finger of ['Index', 'Middle', 'Ring', 'Little']) {
    const lower = finger.toLowerCase();
    aliases[`${side}${finger}Proximal`] = [`${side}hand${lower}1`, `${lower}1${short}`, `${lower}01${short}`, `f${lower}01${short}`];
    aliases[`${side}${finger}Intermediate`] = [`${side}hand${lower}2`, `${lower}2${short}`, `${lower}02${short}`, `f${lower}02${short}`];
    aliases[`${side}${finger}Distal`] = [`${side}hand${lower}3`, `${lower}3${short}`, `${lower}03${short}`, `f${lower}03${short}`];
  }
  aliases[`${side}ThumbMetacarpal`] = [`${side}handthumb1`, `thumb0${short}`, `thumb01${short}`, `fthumb01${short}`];
  aliases[`${side}ThumbProximal`] = [`${side}handthumb2`, `thumb1${short}`, `thumb02${short}`, `fthumb02${short}`];
  aliases[`${side}ThumbDistal`] = [`${side}handthumb3`, `thumb2${short}`, `thumb03${short}`, `fthumb03${short}`];
}

export function normalizeGltfBoneName(name) {
  return String(name || '').toLowerCase()
    .replace(/^(?:(?:mixamorig|armature|rig|def|org|mch)[\s:_.|\-]*)+/i, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, '');
}

export function createGltfRig(root) {
  root.updateMatrixWorld(true);
  const nodes = new Map();
  root.traverse(node => {
    const key = normalizeGltfBoneName(node.name);
    if (key && !nodes.has(key)) nodes.set(key, node);
  });
  const rig = new Map();
  for (const [canonical, common] of Object.entries(aliases)) {
    const candidates = [canonical, ...common, ...(mmdBoneAliases[canonical] || [])].map(normalizeGltfBoneName);
    const bone = candidates.map(name => nodes.get(name)).find(Boolean);
    if (bone) rig.set(canonical, { bone, base: bone.quaternion.clone() });
  }
  return rig;
}

export function gltfRotation(entry, canonical, reference = new Quaternion()) {
  // Generic Blender rigs can be authored in A-pose, T-pose or a relaxed pose.
  // Apply the motion relative to its first neutral frame so importing a model
  // never adds the app's full VRM rest rotation on top of the authored pose.
  const delta = new Quaternion(reference.x, reference.y, reference.z, reference.w).invert().multiply(canonical);
  return entry.base.clone().multiply(delta).normalize();
}
