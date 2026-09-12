import { Quaternion } from 'three';
import { sampleMotion, rotationQuaternion, smooth, envelope, VmdBodyMotion } from './motion.mjs';
import { clamp } from './behavior.mjs';
import reference from './gene-rest.json' with { type: 'json' };
import { mmdBoneAliases } from './motion-rig.mjs';
import { thinkingPose, thinkingFallback } from './thinking-motion.mjs';

export const clipFiles = ['22_apology.vmd', '28_sleepy.vmd', '02_laugh.vmd', '16_thinking.vmd', '26_mortifying.vmd', '32_frustrated.vmd', '34_sad.vmd', '38_Ashamed.vmd'];
export function createMotionClip(file, vmd) {
  if (['22_apology.vmd', '28_sleepy.vmd'].includes(file)) return new VmdBodyMotion(vmd);
  const frames = { ...reference.frames };
  // Newly driven thumbs and fingertips use the same calibrated hand frame as
  // the existing finger joints. Keep their authored VMD rotations when present.
  const names = new Set(vmd.motions.map(key => key.boneName));
  for (const [name, aliases] of Object.entries(mmdBoneAliases)) {
    if (frames[name] || !/Thumb|Distal/.test(name)) continue;
    const sourceName = aliases.find(alias => names.has(alias));
    if (sourceName) frames[name] = { ...reference.frames[`${name.startsWith('left') ? 'left' : 'right'}Hand`], name: sourceName };
  }
  return new VmdBodyMotion(vmd, frames);
}

// Source selections and retiming are editorial adaptations, not unmodified
// playback. Full arm/wrist/finger tracks are retained for the six added VMDs.
export const reactionSources = {
  angry: { file: '26_mortifying.vmd', start: 0.5, end: 8.5 },
  annoyed: { file: '32_frustrated.vmd', start: 0.5, end: 8.8 },
  laugh: { file: '02_laugh.vmd', start: 0.6, end: 8.9 },
  smile: { file: '02_laugh.vmd', start: 0.6, end: 2.2 },
  embarrassed: { file: '38_Ashamed.vmd', start: 0.5, end: 8.4 },
  sad: { file: '34_sad.vmd', start: 0.3, end: 2.9 },
  surprise: { file: '38_Ashamed.vmd', start: 0.5, end: 1.0 },
  happy: { file: '16_thinking.vmd', start: 0.5, end: 3.0 },
  thinking: { file: '16_thinking.vmd', start: 0.7, end: 3.0 },
  bow: { file: '22_apology.vmd', start: 0, end: 3 },
  sleep: { file: '28_sleepy.vmd', start: 0, end: 10 },
};

// Each channel has a wind-up, a fast pose change, a held silhouette and a
// follow-through. Smooth individual segments preserve deliberate pauses.
export function channel(time, keys) {
  if (time <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (time <= keys[i][0]) {
      const [a, from] = keys[i - 1], [b, to] = keys[i];
      return from + (to - from) * smooth((time - a) / (b - a));
    }
  }
  return keys.at(-1)[1];
}

export function composeMotion(snapshot, t, pointer, reduced, clips = new Map()) {
  const motion = sampleMotion(snapshot, t, pointer, reduced);
  const { state, elapsed: a = 0, remaining = 0, dragging } = snapshot;
  const selection = reactionSources[state];
  const source = !reduced && !dragging && selection ? clips.get(selection.file) : null;
  const targets = Object.fromEntries(Object.entries(motion.bones).map(([name, values]) => [name, rotationQuaternion(values)]));
  const offsets = {};
  let phase = 'rest', sourceTime = a;
  const weight = envelope(a, remaining, 0.15, 0.65);
  const major = !dragging && ['angry', 'annoyed', 'laugh', 'smile', 'embarrassed', 'sad', 'surprise', 'happy', 'wave'].includes(state);
  if (major) {
    phase = a < 0.23 ? 'anticipation' : a < 0.65 ? 'accent' : remaining < 0.65 ? 'release' : a < 1.3 ? 'hold' : 'follow-through';
    const hit = channel(a, [[0, 0], [0.2, -0.16], [0.48, 1.1], [0.7, 1], [1.2, 1], [1.8, 0.72], [2.1, 0.94], [2.6, 0.75]]);
    const react = channel(a, [[0, 0], [0.2, -0.15], [0.5, 1.1], [0.75, 1], [1.35, 1], [1.9, 0.7], [2.5, 0.85]]);
    const pulse = reduced ? 0 : Math.sin(Math.max(0, a - 0.8) * 9) * smooth((a - 0.8) / 0.35);
    const strong = (name, x = 0, y = 0, z = 0) => { offsets[name] = [x, y, z]; };
    const leg = (side, thigh, knee, roll = 0) => {
      strong(`${side}UpperLeg`, thigh, 0, roll);
      strong(`${side}LowerLeg`, knee, 0, 0);
      strong(`${side}Foot`, -(thigh + knee), 0, 0);
    };
    if (state === 'angry') {
      const stomp = channel(a, [[0, 0], [0.7, 0], [0.9, 0.55], [1.12, 0], [1.45, 0], [1.6, 0.35], [1.8, 0]]);
      strong('spine', -0.24 * hit, 0.12 * hit, -0.06 * hit);
      strong('chest', -0.08 * hit, -0.16 * hit, 0.04 * hit);
      strong('head', -0.16 * hit, -0.10 * hit, -0.07 * hit);
      strong('leftShoulder', 0, 0, -0.12 * hit); strong('rightShoulder', 0, 0, 0.12 * hit);
      leg('left', 0.16 * hit, -0.28 * hit, 0.07 * hit);
      leg('right', 0.16 * hit + stomp, -0.28 * hit - stomp * 1.6, -0.07 * hit);
      motion.root.ry = -0.11 * hit * weight;
    } else if (state === 'laugh') {
      const fold = channel(a, [[0, 0], [0.22, -0.06], [0.58, 0.25], [1.15, 0.4], [1.5, 0.5], [2.2, 0.34], [3, 0.45]]);
      strong('spine', -fold - pulse * 0.055, 0.08 * hit, -0.10 * hit);
      strong('chest', -0.13 * hit - pulse * 0.025, -0.1 * hit, 0.06 * hit);
      strong('head', 0.20 * hit + pulse * 0.06, -0.14 * hit, 0.13 * hit);
      leg('left', 0.25 * hit + pulse * 0.025, -0.48 * hit, 0.04 * hit);
      leg('right', 0.20 * hit, -0.38 * hit, -0.04 * hit);
      motion.face.aa = (0.44 + pulse * 0.12) * weight;
      motion.root.ry = 0.10 * hit * weight;
    } else if (state === 'embarrassed') {
      const turn = channel(a, [[0, 0], [0.4, -0.17], [0.7, 0.26], [1.3, 0.26], [1.75, -0.22], [2.1, -0.22], [2.55, 0.15]]);
      strong('spine', -0.13 * hit, turn * 0.35, 0.10 * hit);
      strong('chest', -0.05 * hit, -turn * 0.25, -0.06 * hit);
      strong('head', -0.15 * hit, turn * 0.7, 0.16 * hit);
      leg('left', 0.16 * hit, -0.30 * hit, -0.035 * hit);
      leg('right', 0.23 * hit, -0.43 * hit, 0.035 * hit);
      motion.root.ry = turn * weight;
    } else if (state === 'sad') {
      const sink = channel(a, [[0, 0], [0.3, 0.15], [1.1, 0.9], [1.7, 1], [2.3, 0.85], [3.1, 1]]);
      strong('spine', -0.26 * sink, 0.08 * sink, 0.08 * sink);
      strong('chest', -0.16 * sink, -0.04 * sink, -0.035 * sink);
      strong('head', -0.2 * sink, 0.08 * sink, 0.08 * sink);
      leg('left', 0.24 * sink, -0.48 * sink, 0);
      leg('right', 0.2 * sink, -0.40 * sink, 0);
    } else if (state === 'annoyed') {
      const turn = channel(a, [[0, 0], [0.2, -0.08], [0.55, 0.34], [1.3, 0.34], [1.8, 0.2], [2.3, 0.31]]);
      strong('spine', 0.07 * hit, turn * 0.3, 0.1 * hit);
      strong('head', 0.13 * hit, -turn * 0.7, -0.14 * hit);
      leg('left', 0.1 * hit, -0.18 * hit, 0.05 * hit);
      leg('right', 0.18 * hit, -0.30 * hit, -0.025 * hit);
      motion.root.ry = -turn * weight;
    } else if (state === 'surprise') {
      const recoil = channel(a, [[0, 0], [0.16, -0.1], [0.34, 0.27], [0.55, 0.2], [0.9, 0.2], [1.25, 0.12], [1.7, 0.06]]);
      strong('spine', recoil, 0, -0.08 * hit);
      strong('chest', recoil * 0.35, 0.10 * hit, 0.04 * hit);
      strong('head', 0.20 * hit, -0.18 * hit, -0.09 * hit);
      leg('left', 0.28 * react, -0.60 * react, 0.12 * react);
      leg('right', 0.32 * react, -0.64 * react, -0.12 * react);
      motion.root.y = reduced ? 0 : channel(a, [[0, 0], [0.19, 0], [0.37, 0.065], [0.59, 0], [1, 0]]) * weight;
      motion.face.aa = 0.42 * weight;
    } else if (state === 'smile' || state === 'happy') {
      strong('spine', -0.13 * hit, -0.14 * hit, -0.12 * hit);
      strong('chest', 0.07 * hit, 0.1 * hit, 0.06 * hit);
      strong('head', -0.06 * hit, -0.10 * hit, 0.23 * hit);
      leg('left', 0.12 * hit, -0.25 * hit, 0.03 * hit);
      leg('right', 0.19 * hit, -0.36 * hit, -0.03 * hit);
      motion.root.y = reduced ? 0 : Math.max(0, Math.sin(Math.max(0, a - 0.25) * 7)) * Math.exp(-a) * 0.035 * weight;
    } else if (state === 'wave') {
      strong('spine', -0.08 * hit, -0.18 * hit, -0.08 * hit);
      strong('head', -0.06 * hit, 0, 0.08 * hit);
      leg('left', 0.10 * hit, -0.2 * hit, 0.02 * hit);
      leg('right', 0.04 * hit, -0.08 * hit, -0.02 * hit);
    }
    if (selection) {
      const duration = Math.max(1, a + remaining - 0.8);
      sourceTime = selection.start + (selection.end - selection.start) * clamp((a - 0.2) / duration, 0, 1);
    }
    // Respect reduced motion: keep a readable static pose, suppress the dynamic
    // accents and leg lifting rather than simply hiding the facial expression.
    if (reduced) {
      for (const [name, values] of Object.entries(offsets)) offsets[name] = values.map(v => v * (/Leg|Foot/.test(name) ? 0 : 0.35));
      motion.root.y = 0; motion.root.ry *= 0.3;
    }
  }
  if (state === 'thinking' && !dragging) {
    phase = a < 0.5 ? 'anticipation' : remaining < 0.65 ? 'release' : 'ponder';
    // Slowly revisit the held thinking section without snapping to frame zero
    // or stretching a finite clip over an unpredictable network wait.
    sourceTime = selection.start + (selection.end - selection.start) * (0.5 - Math.cos(a * Math.PI / 3.8) * 0.5);
    if (!reduced) offsets.head = [Math.sin(a * 0.7) * 0.018, Math.sin(a * 0.53) * 0.045, 0];
  }
  const rest = sampleMotion({ ...snapshot, state: 'idle', dragging: false }, t, pointer, reduced);
  for (const [name, target] of Object.entries(targets)) {
    const thinkingAngles = state === 'thinking' && !dragging ? thinkingPose[name] || (!source && thinkingFallback[name]) : null;
    const recorded = thinkingAngles ? rotationQuaternion(thinkingAngles) : source?.sample(name, sourceTime);
    if (recorded) target.copy(rotationQuaternion(rest.bones[name])).slerp(recorded, weight);
    if (offsets[name]) target.multiply(new Quaternion().slerp(rotationQuaternion(offsets[name]), weight));
  }
  return { ...motion, targets, phase, source: source ? selection.file : null, sourceTime };
}
