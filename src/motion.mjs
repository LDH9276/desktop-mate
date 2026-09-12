import { Euler, Quaternion } from 'three';
import { clamp } from './behavior.mjs';
import { sampleIdleArms, sampleIdleFingers } from './idle-motion.mjs';

export const smooth = value => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x); };
export const envelope = (elapsed, remaining, attack = 0.3, release = 0.5) => smooth(elapsed / attack) * smooth(remaining / release);

// A normalized VRM T-pose: left points -X, forward is -Z. The rig adapter
// converts this single convention to the actual PMX rest pose.
export function sampleMotion(snapshot, t, pointer = { x: 0, y: 0 }, reduced = false) {
  const { state, dragging, sway, elapsed: a = 0, remaining = 3, reactionId = 0 } = snapshot;
  const b = {};
  const set = (name, x = 0, y = 0, z = 0) => { b[name] = [x, y, z]; };
  const idle = reduced ? 0 : Math.sin(t * 0.85) * 0.025;
  const breath = reduced ? 0 : Math.sin(t * 1.8) * 0.008;
  const e = dragging ? smooth(a / 0.18) : envelope(a, remaining);
  const side = reactionId % 2 ? 1 : -1;
  const shift = reduced ? 0 : Math.sin(t * 0.63) * 0.018;
  const root = { x: shift, y: 0, rx: 0, ry: 0, rz: dragging ? sway : sway * 0.3 };
  const face = { blink: 0, happy: 0.06, angry: 0, sad: 0, relaxed: 0, aa: 0, surprised: 0 };
  set('spine', breath, idle, -idle * 0.5);
  set('chest', breath * 0.5, -idle * 0.4, idle * 0.7);
  set('neck', 0, pointer.x * 0.045, 0);
  set('head', pointer.y * 0.08, pointer.x * 0.16, idle * 0.5);
  set('leftShoulder', 0, 0, -0.018);
  set('rightShoulder', 0, 0, 0.018);
  // Let the arms hang close to the body with a soft forward elbow bend.
  // Slightly different timing on each side avoids a rigid mirrored pose.
  const armDrift = reduced ? 0 : Math.sin(t * 0.83 - 0.5) * 0.022;
  const wristDrift = reduced ? 0 : Math.sin(t * 0.83 - 1.0) * 0.024;
  set('leftUpperArm', -0.035 + breath, 0.015, 1.40 + armDrift);
  set('rightUpperArm', 0.04 - breath, -0.025, -1.37 + armDrift * 0.7);
  set('leftLowerArm', 0.025, -0.38 + armDrift, -0.11);
  set('rightLowerArm', -0.02, 0.43 + armDrift * 0.7, 0.14);
  set('leftHand', 0.075 + wristDrift, -0.075, -0.13 - wristDrift * 0.5);
  set('rightHand', -0.055 + wristDrift * 0.6, 0.065, 0.10 - wristDrift * 0.4);
  const freeArms = sampleIdleArms(t, reduced);
  // The same moving rest pose underlies reactions, so the start and release
  // connect without an abrupt return to a fixed mannequin pose.
  if (!dragging) {
    const quiet = state === 'idle' ? 1 : 1 - e;
    const neutral = sampleIdleArms(t, true).bones;
    for (const [name, angles] of Object.entries(freeArms.bones)) b[name] = angles.map((value, axis) => neutral[name][axis] + (value - neutral[name][axis]) * quiet);
    b.spine = b.spine.map((value, axis) => value + freeArms.body[axis] * quiet);
    b.chest[1] -= freeArms.body[1] * quiet * 0.5;
    b.head[2] += freeArms.body[2] * quiet * 0.45;
  }
  for (const s of ['left', 'right']) {
    set(`${s}UpperLeg`, 0, 0, 0);
    set(`${s}LowerLeg`, 0, 0, 0);
    set(`${s}Foot`, 0, 0, 0);
  }
  let curl = 0.28;
  const mix = (name, values, weight = e) => {
    b[name] = b[name].map((v, i) => v + (values[i] - v) * weight);
  };
  if (dragging) {
    const trail = clamp(snapshot.angularVelocity || 0, -2, 2);
    const kick = reduced ? 0 : Math.sin(a * 7) * 0.13;
    root.y = 0.075; root.rx = -0.1;
    mix('spine', [-0.1, trail * 0.04, -sway * 0.12]);
    mix('head', [0.12, 0, sway * -0.22]);
    mix('leftUpperArm', [0.08, -0.16, 1.05 + trail * 0.14]);
    mix('rightUpperArm', [-0.06, 0.2, -1.02 + trail * 0.14]);
    mix('leftLowerArm', [0, -0.25, -0.25 - kick]);
    mix('rightLowerArm', [0, 0.3, 0.28 - kick]);
    mix('leftUpperLeg', [0.24 + kick, 0, 0.045]);
    mix('rightUpperLeg', [0.18 - kick, 0, -0.045]);
    mix('leftLowerLeg', [-0.55 - kick, 0, 0]);
    mix('rightLowerLeg', [-0.48 + kick, 0, 0]);
    mix('leftFoot', [-0.16, 0, 0]); mix('rightFoot', [-0.1, 0, 0]);
    face.sad = 0.25; face.aa = 0.08;
  } else if (state === 'wave') {
    // Raise, wave at the elbow/wrist, then lower; the opposite arm stays relaxed.
    const wave = reduced ? 0 : Math.sin(Math.max(0, a - 0.45) * 9);
    mix('leftUpperArm', [0.08, -0.25, 0.20]);
    mix('leftLowerArm', [0, -0.18, -1.55 + wave * 0.12]);
    mix('leftHand', [wave * 0.11, -0.12, wave * 0.24]);
    mix('leftShoulder', [0, 0, -0.08]);
    mix('spine', [-0.045, -0.10, -0.035]);
    mix('head', [-0.06, -0.08, 0.13]);
    face.happy = 0.75 * e; curl = 0.04;
  } else if (state === 'happy') {
    const bounce = reduced ? 0 : Math.sin(Math.max(0, a - 0.2) * 7) * Math.exp(-a * 0.65);
    mix('spine', [-0.065, side * 0.08, side * 0.07]);
    mix('chest', [0.04, -side * 0.09, -side * 0.035]);
    mix('head', [-0.08, -side * 0.08, side * 0.20]);
    const raised = side > 0 ? 'left' : 'right', resting = side > 0 ? 'right' : 'left';
    mix(`${raised}UpperArm`, [0.06, -side * 0.2, side * 1.2]);
    mix(`${raised}LowerArm`, [0, -side * 0.3, -side * (2.45 + bounce * 0.12)]);
    mix(`${resting}UpperArm`, [0.04, side * 0.12, -side * 1.3]);
    mix(`${resting}LowerArm`, [0, side * 0.55, side * 0.28]);
    root.rz += side * 0.028 * e; root.y += Math.max(0, bounce) * 0.015 * e;
    face.happy = 0.85 * e; face.blink = 0.45 * e; curl = 0.5;
  } else if (state === 'surprise') {
    const jolt = reduced ? 0 : Math.exp(-a * 4) * Math.sin(a * 13);
    mix('spine', [0.10, 0, 0]); mix('head', [0.12, side * 0.08, -side * 0.1]);
    mix('leftUpperArm', [-0.1, -0.3, 1.15]); mix('rightUpperArm', [-0.1, 0.3, -1.23]);
    mix('leftLowerArm', [0, -0.3, -2.35]); mix('rightLowerArm', [0, 0.35, 2.5]);
    root.y = Math.max(0, jolt) * 0.045; face.surprised = e * 0.8; face.aa = e * 0.22; curl = 0.05;
  } else if (state === 'angry') {
    // Lean in with fists held close to the waist; a short shoulder accent settles.
    const accent = reduced ? 0 : Math.exp(-a * 1.5) * Math.sin(a * 8) * 0.05;
    mix('spine', [-0.11 + accent, 0.03, 0]);
    mix('chest', [-0.045, -0.06, 0.02]);
    mix('head', [-0.10, -0.06, -0.04]);
    mix('leftShoulder', [0, 0, -0.07]); mix('rightShoulder', [0, 0, 0.07]);
    mix('leftUpperArm', [-0.05, -0.15, 1.12]); mix('rightUpperArm', [-0.05, 0.15, -1.12]);
    mix('leftLowerArm', [0, -0.72, 0.38]); mix('rightLowerArm', [0, 0.72, -0.38]);
    face.angry = 0.88 * e; face.happy = 0; curl = 0.95;
  } else if (state === 'smile') {
    const nod = reduced ? 0 : Math.sin(a * 2.3) * 0.025;
    mix('head', [-0.045 + nod, -0.055, 0.105]);
    mix('spine', [-0.035, 0.04, 0.025]);
    mix('rightUpperArm', [0.06, 0.12, -1.3]);
    mix('rightLowerArm', [0, 0.6, -0.8]);
    face.happy = 0.68 * e; face.relaxed = 0.14 * e; face.blink = 0.12 * e;
  } else if (state === 'laugh') {
    const chuckle = reduced ? 0 : Math.sin(a * 10) * (0.5 + 0.5 * Math.sin(a * 2.3));
    mix('spine', [-0.17 + chuckle * 0.035, 0.03, -0.045]);
    mix('chest', [-0.07 + chuckle * 0.025, -0.04, 0.03]);
    mix('head', [0.055 + chuckle * 0.055, -0.07, 0.09]);
    mix('leftShoulder', [0, 0, -0.05 - chuckle * 0.025]);
    mix('rightShoulder', [0, 0, 0.05 + chuckle * 0.025]);
    mix('leftUpperArm', [0.10, -0.3, 1.35]);
    mix('leftLowerArm', [0, -0.8, 0.8]);
    mix('rightUpperArm', [-0.04, 0.25, -1.2]);
    mix('rightLowerArm', [0, 0.35, 2.55]);
    face.happy = 0.92 * e; face.blink = 0.65 * e;
    face.aa = (0.26 + chuckle * 0.12) * e; curl = 0.22;
  } else if (state === 'annoyed') {
    const sigh = reduced ? 0 : Math.sin(Math.min(a / 2, 1) * Math.PI);
    mix('head', [0.055, -0.30, -0.11]);
    mix('spine', [0.025, 0.13, 0.065]);
    mix('chest', [sigh * 0.025, -0.07, -0.03]);
    mix('rightUpperArm', [0.1, 0.3, -1.1]);
    mix('rightLowerArm', [0, 0.8, -0.5]);
    face.angry = 0.43 * e; face.blink = 0.40 * e; face.happy = 0;
    face.aa = sigh * 0.08 * e; curl = 0.25;
  } else if (state === 'embarrassed') {
    const fidget = reduced ? 0 : Math.sin(a * 5) * 0.04;
    mix('spine', [-0.045, -0.08, 0.04]);
    mix('head', [-0.11, 0.2 + fidget, 0.15]);
    mix('leftUpperArm', [-0.10, -0.2, 0.42]);
    mix('leftLowerArm', [0, -0.12, -2.05]);
    mix('leftHand', [0, fidget, -0.2 + fidget]);
    mix('rightUpperArm', [0.04, 0.1, -1.32]);
    mix('rightLowerArm', [0, 0.6, -0.35]);
    face.sad = 0.28 * e; face.happy = 0.20 * e; face.blink = 0.14 * e;
    face.aa = 0.07 * e; curl = 0.25;
  } else if (state === 'sad') {
    mix('spine', [-0.10, -0.035, 0.025]);
    mix('chest', [-0.07, 0.025, -0.025]);
    mix('head', [-0.25, 0.08, 0.08]);
    mix('leftShoulder', [0, 0, 0.025]); mix('rightShoulder', [0, 0, -0.025]);
    mix('leftUpperArm', [0.035, 0, 1.4]); mix('rightUpperArm', [0.035, 0, -1.4]);
    mix('leftLowerArm', [0, -0.12, -0.025]); mix('rightLowerArm', [0, 0.12, 0.025]);
    face.sad = 0.83 * e; face.blink = 0.23 * e; face.happy = 0; curl = 0.08;
  } else if (state === 'bow') {
    const bow = Math.sin(clamp(a / 2.8, 0, 1) * Math.PI) * e;
    mix('spine', [-0.32, 0, 0], bow); mix('chest', [-0.18, 0, 0], bow);
    mix('head', [-0.12, 0, 0], e); face.happy = 0.35 * e;
  } else if (state === 'sleep') {
    mix('spine', [-0.06, 0, -0.04]); mix('head', [-0.2, 0.1, 0.13]);
    face.blink = e; face.relaxed = 0.6 * e;
  } else if (state === 'thinking') {
    const ponder = reduced ? 0 : Math.sin(a * 0.85) * 0.04;
    mix('spine', [-0.04, -0.04, -0.025]);
    mix('head', [-0.08 + ponder * 0.4, 0.10 + ponder, 0.13]);
    mix('rightUpperArm', [0.06, 0.18, -1.05]);
    mix('rightLowerArm', [0, 0.35, 2.42 + ponder]);
    mix('rightHand', [-0.06, -0.18, -0.10]);
    mix('leftUpperArm', [-0.04, -0.08, 1.45]);
    mix('leftLowerArm', [0, -1.35, 0.4]);
    face.happy = 0.02; face.relaxed = 0.12 * e; curl = 0.38;
  } else if (state === 'talking') {
    const phrase = reduced ? 0 : Math.sin(a * 3.4);
    mix('spine', [-0.025, phrase * 0.045, 0.015]);
    mix('head', [-0.045 + phrase * 0.035, pointer.x * 0.10, 0.04]);
    mix('rightUpperArm', [0.12, 0.18, -0.95]);
    mix('rightLowerArm', [0, 0.6, 0.55 + phrase * 0.16]);
    mix('rightHand', [0, 0.2 + phrase * 0.1, 0.08]);
    face.aa = reduced ? 0.08 : (Math.sin(a * 13) * 0.5 + 0.5) * 0.28 * e;
  } else if (state === 'landing') {
    const settle = Math.exp(-a * 5) * (reduced ? 0.3 : Math.cos(a * 10));
    const crouch = Math.max(0, settle);
    root.y = -0.045 * crouch;
    mix('spine', [-0.1, 0, 0], crouch);
    for (const s of ['left', 'right']) {
      mix(`${s}UpperLeg`, [0.18, 0, 0], crouch);
      mix(`${s}LowerLeg`, [-0.36, 0, 0], crouch);
      mix(`${s}Foot`, [0.18, 0, 0], crouch);
    }
  }
  if (state === 'dizzy') {
    const wobble = reduced ? 0 : Math.sin(a * 4.6) * 0.065;
    root.rz += wobble * e;
    mix('head', [-0.1, Math.sin(a * 2) * 0.14, -wobble * 1.8]);
    mix('chest', [0.035, -wobble, wobble]);
    if (!dragging) {
      mix('rightUpperArm', [0.08, 0.25, -0.55]);
      mix('rightLowerArm', [0, 0.3, 1.95]);
    }
    face.blink = 0.48; face.sad = 0.65;
  }
  // Quiet, occasional head turns instead of a constant symmetric idle loop.
  if (!dragging && !reduced) {
    const cycle = t % 18;
    const glance = smooth((cycle - 9) / 1.2) * smooth((14 - cycle) / 1.5) * (state === 'idle' ? 1 : 1 - e);
    b.head[1] += glance * 0.2 * (Math.floor(t / 18) % 2 ? -1 : 1);
    b.head[2] += glance * 0.08;
  }
  const downwardGaze = dragging ? 0 : freeArms.poseWeight * (state === 'idle' ? 1 : 1 - e);
  if (downwardGaze) {
    b.head = b.head.map((value, axis) => value + ([-0.28, 0, -0.025][axis] - value) * downwardGaze);
    b.neck = b.neck.map((value, axis) => value + ([-0.06, 0, 0][axis] - value) * downwardGaze);
  }
  curl = 0.28 + (curl - 0.28) * e;
  const idleFingers = sampleIdleFingers(t, reduced);
  const quietHands = dragging ? 0 : state === 'idle' ? 1 : 1 - e;
  for (const s of ['left', 'right']) {
    const sign = s === 'left' ? 1 : -1;
    const reactionSoftness = reduced ? 0 : Math.sin(t * 0.83 - (s === 'left' ? 1.15 : 1.65)) * 0.014;
    for (const [finger, bias] of [['Index', -0.07], ['Middle', 0], ['Ring', 0.065], ['Little', 0.10]]) {
      // The ring and little fingers close a little more at rest. Flex all three
      // joints, with a larger middle-joint bend and a softer fingertip.
      const softness = reactionSoftness * (1 - quietHands) + idleFingers[`${s}${finger}`] * quietHands;
      const flex = clamp(curl + (bias + softness) * (1 - curl), 0.045, 1);
      set(`${s}${finger}Proximal`, 0, 0, sign * flex * 0.85);
      set(`${s}${finger}Intermediate`, 0, 0, sign * flex * 1.1);
      set(`${s}${finger}Distal`, 0, 0, sign * flex * 0.65);
    }
    // A relaxed thumb sits near the palm instead of remaining in the model's
    // fully spread bind pose. X folds across the palm; Z adds a gentle curl.
    const thumbCurl = clamp(curl + idleFingers[`${s}Thumb`] * quietHands, 0, 1);
    set(`${s}ThumbMetacarpal`, -0.12 - thumbCurl * 0.12, sign * 0.04, sign * (0.06 + thumbCurl * 0.10));
    set(`${s}ThumbProximal`, -0.08 - thumbCurl * 0.10, 0, sign * (0.10 + thumbCurl * 0.28));
    set(`${s}ThumbDistal`, -0.04, 0, sign * (0.10 + thumbCurl * 0.38));
  }
  const blinkTime = t % 4.9;
  if (!reduced && blinkTime > 4.72) face.blink = Math.max(face.blink, Math.sin((blinkTime - 4.72) / 0.18 * Math.PI));
  return { bones: b, root, face, weight: e, idleGesture: state === 'idle' && !dragging ? freeArms.name : '' };
}

// Per-joint response creates small follow-through at the wrists and fingers.
// Exponential interpolation is stable across frame rates and cannot overshoot.
export function jointBlend(name, dt, reduced = false) {
  const rate = reduced ? 20 : /Hand$/.test(name) ? 10 : /Thumb|Index|Middle|Ring|Little/.test(name) ? 13
    : /LowerArm$/.test(name) ? 14 : /UpperArm$/.test(name) ? 17 : 20;
  return 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * rate);
}

// VMD rotation uses a cubic Bezier curve stored on the destination key.
export function vmdBezier(x, curve) {
  const [x1, x2, y1, y2] = curve;
  const cubic = (u, p1, p2) => 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u ** 2 * p2 + u ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 15; i++) { const m = (lo + hi) / 2; if (cubic(m, x1, x2) < x) lo = m; else hi = m; }
  return cubic((lo + hi) / 2, y1, y2);
}

export class VmdBodyMotion {
  constructor(vmd, reference = null) {
    this.tracks = new Map();
    const names = reference ? Object.fromEntries(Object.entries(reference).map(([name, frame]) => [frame.name, name]))
      : { '上半身': 'spine', '上半身2': 'chest', '首': 'neck', '頭': 'head' };
    for (const key of vmd.motions) {
      const name = names[key.boneName]; if (!name) continue;
      const keys = this.tracks.get(name) || [];
      // MMDLoader already converted handedness; now rotate into VRM's reference.
      const raw = new Quaternion().fromArray(key.rotation);
      const frame = reference?.[name];
      // Invert the source rig's A-pose adapter before applying the target rig's
      // adapter. An elbow copied with a sign flip alone bends around the wrong axis.
      if (frame) raw.premultiply(new Quaternion().fromArray(frame.base).invert())
        .premultiply(new Quaternion().fromArray(frame.pre).invert())
        .multiply(new Quaternion().fromArray(frame.post).invert());
      const { x, y, z, w } = raw;
      keys.push({ t: key.frameNum / 30, q: new Quaternion(-x, y, -z, w).normalize(),
        articulated: Math.abs(key.rotation[3]) < 0.99999,
        curve: [3, 11, 7, 15].map(i => key.interpolation[i] / 127) });
      this.tracks.set(name, keys);
    }
    for (const [name, keys] of this.tracks) {
      keys.sort((a, b) => a.t - b.t);
      if (reference ? keys.length < 2 && !keys[0].articulated : keys.length < 2) this.tracks.delete(name);
    }
  }
  sample(name, seconds) {
    const keys = this.tracks.get(name); if (!keys) return null;
    const end = keys.findIndex(k => k.t >= seconds);
    if (end === 0) return keys[0].q;
    if (end === -1) return keys[keys.length - 1].q;
    const from = keys[end - 1], to = keys[end];
    const amount = vmdBezier(clamp((seconds - from.t) / (to.t - from.t), 0, 1), to.curve);
    return from.q.clone().slerp(to.q, amount);
  }
}

export const rotationQuaternion = values => new Quaternion().setFromEuler(new Euler(...values));
