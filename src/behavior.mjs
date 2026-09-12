export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
import { emotionDurations } from './emotions.mjs';

// Motion is sampled in screen pixels and seconds, independent of render rate.
// Only energetic direction reversals add nausea; a long smooth drag does not.
export class CompanionBehavior {
  constructor() {
    this.state = 'idle'; this.energy = 0; this.sway = 0; this.angularVelocity = 0;
    this.last = null; this.velocity = { x: 0, y: 0 }; this.lastTurn = 0;
    this.until = 0; this.dragging = false; this.sensitivity = 1;
    this.startedAt = 0; this.reactionId = 0;
  }
  transition(state, now, duration) {
    this.state = state; this.startedAt = now; this.until = now + duration; this.reactionId++;
  }
  grab(x, y, now) {
    this.dragging = true; this.last = { x, y, now }; this.velocity = { x: 0, y: 0 };
    this.transition(this.energy >= 65 ? 'dizzy' : 'held', now, 4800);
  }
  move(x, y, now) {
    if (!this.dragging || !this.last) return;
    const dt = (now - this.last.now) / 1000;
    if (dt < 0.006) return;
    const vx = clamp((x - this.last.x) / dt, -3500, 3500);
    const vy = clamp((y - this.last.y) / dt, -3500, 3500);
    const speed = Math.hypot(vx, vy);
    const oldSpeed = Math.hypot(this.velocity.x, this.velocity.y);
    const dot = vx * this.velocity.x + vy * this.velocity.y;
    if (dt < 0.22 && speed > 480 && oldSpeed > 380 && dot < -0.2 * speed * oldSpeed && now - this.lastTurn > 85) {
      this.energy = clamp(this.energy + Math.min(speed / 70, 27) * this.sensitivity, 0, 100);
      this.lastTurn = now;
    }
    this.angularVelocity += clamp((vx - this.velocity.x) * -0.0007, -1.6, 1.6);
    this.velocity = { x: vx, y: vy }; this.last = { x, y, now };
    if (this.energy >= 65) {
      if (this.state !== 'dizzy') this.transition('dizzy', now, 4800);
      this.until = now + 4800;
    }
  }
  release(now) {
    if (!this.dragging) return;
    this.dragging = false; this.last = null;
    const next = this.energy >= 65 || (this.state === 'dizzy' && this.until > now) ? 'dizzy' : 'landing';
    this.transition(next, now, next === 'dizzy' ? 4800 : 900);
  }
  react(state, now, duration = ({ wave: 3400, happy: 3200, bow: 3400, sleep: 11000, thinking: 6500, ...emotionDurations })[state] ?? 2800) {
    if (this.dragging) return;
    // Request updates extend continuous gestures without restarting their clock.
    if ((state === 'talking' || state === 'thinking') && this.state === state) this.until = now + duration;
    else this.transition(state, now, duration);
    if (state === 'dizzy') this.energy = 85;
  }
  tick(dt, now) {
    dt = clamp(dt, 0, 0.05);
    this.energy = Math.max(0, this.energy - dt * (this.dragging ? 3 : 15));
    this.angularVelocity += (-20 * this.sway - 4.8 * this.angularVelocity) * dt;
    this.sway = clamp(this.sway + this.angularVelocity * dt, -0.65, 0.65);
    if (!this.dragging && this.state !== 'idle' && now >= this.until) this.transition('idle', now, 0);
    return { state: this.state, energy: this.energy, sway: this.sway, dragging: this.dragging,
      elapsed: Math.max(0, (now - this.startedAt) / 1000), remaining: Math.max(0, (this.until - now) / 1000),
      reactionId: this.reactionId, velocity: { ...this.velocity }, angularVelocity: this.angularVelocity };
  }
}
