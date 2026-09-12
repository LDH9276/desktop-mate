// Small, irregular adjustments around relaxed arms. Smooth seeded targets are
// sampled from animation time so FPS, pauses and pose crossfades stay stable.
const ease = value => { const x = Math.max(0, Math.min(1, value)); return x * x * x * (x * (x * 6 - 15) + 10); };
const timeValue = time => Number.isFinite(time) ? Math.max(0, time) : 0;
function random(index, seed) {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(seed + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}
function drift(time, seed, period) {
  const position = time / period + seed * 0.37, index = Math.floor(position);
  // Spend some time still at each end instead of constantly waving.
  const weight = ease((position - index - 0.18) / 0.64);
  const from = random(index, seed), to = random(index + 1, seed);
  return from + (to - from) * weight;
}
const rest = {
  leftShoulder: [0, 0, -0.018], rightShoulder: [0, 0, 0.018],
  leftUpperArm: [-0.035, 0.015, 1.40], rightUpperArm: [0.04, -0.025, -1.37],
  leftLowerArm: [0.025, -0.38, -0.11], rightLowerArm: [-0.02, 0.43, 0.14],
  leftHand: [0.065, -0.07, -0.09], rightHand: [-0.05, 0.06, 0.075],
};
const amplitudes = {
  Shoulder: [0.012, 0.014, 0.018], UpperArm: [0.04, 0.03, 0.045],
  LowerArm: [0.024, 0.055, 0.03], Hand: [0.018, 0.035, 0.025],
};
// Once per long idle cycle: slow entry, a quiet hold, then a slow release.
export function idlePoseWeight(time, reduced = false) {
  if (reduced) return 0;
  const phase = timeValue(time) % 52;
  return ease((phase - 28) / 4) * (1 - ease((phase - 36) / 4));
}
const behindBack = {
  leftShoulder: [-0.025, -0.025, -0.04], rightShoulder: [-0.025, 0.025, 0.04],
  leftUpperArm: [-0.32, 0.12, 1.27], rightUpperArm: [-0.32, -0.12, -1.27],
  leftLowerArm: [0.3, 0.25, 1.22], rightLowerArm: [0.3, -0.25, -1.22],
  leftHand: [0.1, -0.25, 0.12], rightHand: [0.1, 0.25, -0.12],
};
export function sampleIdleArms(time, reduced = false) {
  const t = timeValue(time), weight = reduced ? 0 : ease(t / 2);
  const bones = {};
  Object.entries(rest).forEach(([name, neutral], index) => {
    const amount = amplitudes[name.replace(/^(left|right)/, '')];
    bones[name] = neutral.map((value, axis) => value + amount[axis]
      * drift(t, index * 3 + axis, 5.2 + (index % 3) * 1.3 + axis * 0.45) * weight);
  });
  const poseWeight = idlePoseWeight(t, reduced);
  for (const [name, target] of Object.entries(behindBack)) bones[name] = bones[name].map((value, axis) => value + (target[axis] - value) * poseWeight);
  return { bones, body: [-0.14 * poseWeight, 0, -0.055 * poseWeight], poseWeight, weight, name: poseWeight > 0 ? 'hands-behind-back' : weight ? 'quiet-idle' : 'rest' };
}

export function sampleIdleFingers(time, reduced = false) {
  const t = timeValue(time), weight = reduced ? 0 : ease(t / 2);
  const fingers = {};
  for (const [sideIndex, side] of ['left', 'right'].entries()) {
    const hand = drift(t, 81 + sideIndex, 6.8 + sideIndex) * 0.016;
    for (const [index, finger] of ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].entries()) {
      fingers[side + finger] = weight ? (hand + drift(t, 101 + sideIndex * 11 + index, 3.7 + index * 0.47 + sideIndex * 0.63)
        * (finger === 'Thumb' ? 0.028 : 0.045)) * weight : 0;
    }
  }
  return fingers;
}
