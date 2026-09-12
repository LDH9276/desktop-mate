// User reference: one index finger beside the chin, the other hand loosely
// folded behind the lower back. The raised arm keeps Gene's authored motion.
export const thinkingPose = {
  rightUpperArm: [-0.32, -0.12, -1.27], rightLowerArm: [0.30, -0.25, -1.22],
  rightHand: [0.10, 0.25, -0.12],
  leftIndexIntermediate: [0.025, 0, 0.12], leftIndexDistal: [0, 0, 0.08],
};
for (const [finger, curl] of [['Index', 0.34], ['Middle', 0.4], ['Ring', 0.45], ['Little', 0.48]]) {
  thinkingPose[`right${finger}Proximal`] = [0, 0, -curl * 0.85];
  thinkingPose[`right${finger}Intermediate`] = [0, 0, -curl * 1.1];
  thinkingPose[`right${finger}Distal`] = [0, 0, -curl * 0.65];
}
thinkingPose.rightThumbMetacarpal = [-0.16, -0.04, -0.10];
thinkingPose.rightThumbProximal = [-0.12, 0, -0.21];
thinkingPose.rightThumbDistal = [-0.04, 0, -0.25];

// Calibrated still frame for reduced motion or while the VMD is loading.
export const thinkingFallback = {
  leftUpperArm: [0.27, -0.146, 1.064], leftLowerArm: [-Math.PI, -0.384, -3.069],
  leftHand: [0.776, 0.688, -0.062], leftIndexProximal: [-0.034, -0.16, -0.009],
};
