import { Quaternion, Vector3 } from 'three';

export const mmdBoneAliases = {
  head: ['頭', 'head'], neck: ['首', 'neck'], spine: ['上半身', 'spine'], chest: ['上半身2', '上半身２', 'chest'],
  leftShoulder: ['左肩', 'left shoulder'], rightShoulder: ['右肩', 'right shoulder'],
  leftUpperArm: ['左腕', 'left arm'], rightUpperArm: ['右腕', 'right arm'],
  leftLowerArm: ['左ひじ', '左肘', 'left elbow'], rightLowerArm: ['右ひじ', '右肘', 'right elbow'],
  leftHand: ['左手首', 'left wrist'], rightHand: ['右手首', 'right wrist'],
  leftUpperLeg: ['左足', 'left leg'], rightUpperLeg: ['右足', 'right leg'],
  leftLowerLeg: ['左ひざ', '左膝', 'left knee'], rightLowerLeg: ['右ひざ', '右膝', 'right knee'],
  leftFoot: ['左足首', 'left ankle'], rightFoot: ['右足首', 'right ankle'],
};
for (const [side, prefix] of [['left', '左'], ['right', '右']]) {
  for (const [finger, jp] of [['Index', '人指'], ['Middle', '中指'], ['Ring', '薬指'], ['Little', '小指']]) {
    mmdBoneAliases[`${side}${finger}Proximal`] = [`${prefix}${jp}１`, `${prefix}${jp}1`];
    mmdBoneAliases[`${side}${finger}Intermediate`] = [`${prefix}${jp}２`, `${prefix}${jp}2`];
    mmdBoneAliases[`${side}${finger}Distal`] = [`${prefix}${jp}３`, `${prefix}${jp}3`];
  }
  for (const [joint, digit, wide] of [['Metacarpal', '0', '０'], ['Proximal', '1', '１'], ['Distal', '2', '２']]) {
    mmdBoneAliases[`${side}Thumb${joint}`] = [`${prefix}親指${wide}`, `${prefix}親指${digit}`];
  }
}

export function createMmdRig(mesh) {
  mesh.updateMatrixWorld(true);
  const rig = new Map();
  for (const [name, aliases] of Object.entries(mmdBoneAliases)) {
    const bone = mesh.skeleton.bones.find(b => aliases.includes(b.name) || aliases.includes(b.name.toLowerCase()));
    if (bone) rig.set(name, { bone, base: bone.quaternion.clone(), pre: new Quaternion(), post: new Quaternion() });
  }
  for (const side of ['left', 'right']) {
    const arm = rig.get(`${side}UpperArm`), elbow = rig.get(`${side}LowerArm`), hand = rig.get(`${side}Hand`);
    if (!arm || !elbow || !hand) continue;
    const axis = new Vector3(side === 'left' ? 1 : -1, 0, 0);
    const direction = (from, to) => to.bone.getWorldPosition(new Vector3()).sub(from.bone.getWorldPosition(new Vector3())).normalize();
    const upperFrame = new Quaternion().setFromUnitVectors(axis, direction(arm, elbow));
    const lowerFrame = new Quaternion().setFromUnitVectors(axis, direction(elbow, hand));
    // PMX models often start in an A-pose. Align both arm segments to the
    // normalized T-pose, including the elbow's bending axis, not just its sign.
    arm.post.copy(upperFrame).invert();
    elbow.pre.copy(upperFrame); elbow.post.copy(lowerFrame).invert();
    hand.pre.copy(lowerFrame); hand.post.copy(lowerFrame).invert();
    for (const [name, entry] of rig) {
      if (name.startsWith(side) && /Thumb|Index|Middle|Ring|Little/.test(name)) {
        entry.pre.copy(lowerFrame); entry.post.copy(lowerFrame).invert();
      }
    }
  }
  return rig;
}

export function mmdRotation(entry, canonical) {
  const q = new Quaternion(-canonical.x, canonical.y, -canonical.z, canonical.w);
  return entry.base.clone().multiply(entry.pre).multiply(q).multiply(entry.post).normalize();
}

// PMX often skins legs to the D bones, which inherit rotations from the
// animation controls through grants rather than through the bone hierarchy.
// Restore the ungranted pose before each frame so inheritance never compounds.
export function createMmdGrantUpdater(mesh) {
  const bones = mesh.skeleton.bones;
  const entries = (mesh.geometry.userData.MMD?.grants || [])
    .filter(g => !g.isLocal && g.affectRotation && bones[g.index] && bones[g.parentIndex] && g.index !== g.parentIndex && Number.isFinite(g.ratio))
    .map(grant => ({ ...grant, saved: bones[grant.index].quaternion.clone() }));
  const byIndex = new Map(entries.map(entry => [entry.index, entry]));
  const turn = new Quaternion();
  return {
    restore() { for (const entry of entries) bones[entry.index].quaternion.copy(entry.saved); },
    update() {
      for (const entry of entries) entry.saved.copy(bones[entry.index].quaternion);
      const completed = new Set(), active = new Set();
      const visit = entry => {
        if (completed.has(entry.index) || active.has(entry.index)) return;
        active.add(entry.index);
        const parent = byIndex.get(entry.parentIndex); if (parent) visit(parent);
        turn.identity().slerp(bones[entry.parentIndex].quaternion, entry.ratio);
        bones[entry.index].quaternion.multiply(turn).normalize();
        active.delete(entry.index); completed.add(entry.index);
      };
      for (const entry of entries) visit(entry);
    },
    count: entries.length,
  };
}
