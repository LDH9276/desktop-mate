import definitions from '../electron/emotions.json' with { type: 'json' };

export const emotionChoices = definitions.filter(x => x.state !== 'idle');
export const emotionDurations = Object.fromEntries(definitions.map(x => [x.state, x.duration]));
export const emotionLabels = Object.fromEntries(definitions.map(x => [x.state, x.label]));

// Only an explicit final metadata line may trigger a reaction. References to
// emotions in prose, quoted examples and unfinished streamed tags are ignored.
export function parseEmotionTag(content) {
  if (typeof content !== 'string') return null;
  const lines = content.trimEnd().split(/\r?\n/);
  let fence = null;
  for (const line of lines.slice(0, -1)) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!match) continue;
    if (!fence) fence = match[1];
    else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
  }
  if (fence) return null;
  const last = lines.at(-1).trim().replace(/\*\*/g, '');
  const match = last.match(/^현재\s*상태\s*[:：]\s*([^\s:：]+)\s*$/);
  return match ? definitions.find(x => x.label === match[1]) || null : null;
}

export class ReplyEmotionController {
  constructor() { this.seen = new Set(); this.pending = null; this.conversation = null; }
  observe(chat) {
    if (chat.conversationId !== this.conversation) { this.pending = null; this.conversation = chat.conversationId; }
    if (chat.status !== 'connected' || !chat.conversationId) return;
    const message = chat.messages.at(-1);
    if (message?.role !== 'assistant' || message.delivery !== 'complete') return;
    const key = `${chat.conversationId}:${message.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 120) this.seen.delete(this.seen.values().next().value);
    this.pending = parseEmotionTag(message.content)?.state || 'idle';
  }
  take(blocked = false) {
    if (blocked) return null;
    const value = this.pending; this.pending = null; return value;
  }
}
