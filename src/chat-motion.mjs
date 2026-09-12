// Waiting starts before the IPC round trip. Only text belonging to the current
// reply changes the character to speaking; a previous answer is not speech.
export function chatActivity(state) {
  if (state.status === 'sending') return 'thinking';
  if (state.status !== 'receiving') return null;
  const messages = state.messages || [];
  const lastUser = messages.findLastIndex(message => message.role === 'user');
  return messages.slice(lastUser + 1).some(message => message.role === 'assistant'
    && message.delivery === 'receiving' && message.content?.trim()) ? 'talking' : 'thinking';
}

export class ChatMotionController {
  activity = null;
  owned = null;
  begin() { this.activity = 'thinking'; }
  observe(state) { this.activity = chatActivity(state); }
  finish() { this.activity = null; }
  sync(behavior, now) {
    if (behavior.dragging || ['landing', 'dizzy'].includes(behavior.state)) return;
    if (this.activity) {
      behavior.react(this.activity, now, 1600);
      this.owned = this.activity;
    } else if (this.owned) {
      // Let the last gesture release softly. A completed emotional reaction or
      // a manually selected pose retains its own duration.
      if (behavior.state === this.owned) behavior.until = Math.min(behavior.until, now + 450);
      this.owned = null;
    }
  }
}
