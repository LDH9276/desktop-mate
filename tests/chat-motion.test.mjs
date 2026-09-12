import test from 'node:test';
import assert from 'node:assert/strict';
import { chatActivity, ChatMotionController } from '../src/chat-motion.mjs';
import { CompanionBehavior } from '../src/behavior.mjs';
import { ReplyEmotionController } from '../src/emotions.mjs';

const user = { id: 'u', role: 'user', content: 'hello', delivery: 'sent' };
const answer = { id: 'a', role: 'assistant', content: '답변', delivery: 'receiving' };
test('waiting ignores old replies and changes to speech only on current text', () => {
  assert.equal(chatActivity({ status: 'sending', messages: [answer] }), 'thinking');
  assert.equal(chatActivity({ status: 'receiving', messages: [answer, user] }), 'thinking');
  assert.equal(chatActivity({ status: 'receiving', messages: [user, { ...answer, content: '  ' }] }), 'thinking');
  assert.equal(chatActivity({ status: 'receiving', messages: [user, answer] }), 'talking');
  for (const status of ['connected', 'uncertain', 'disconnected', 'reconnecting']) {
    assert.equal(chatActivity({ status, messages: [user, answer] }), null);
  }
});

test('long waits preserve the thinking clock, survive dragging, and finish softly', () => {
  const controller = new ChatMotionController(), behavior = new CompanionBehavior();
  controller.begin(); controller.sync(behavior, 1000);
  const id = behavior.reactionId;
  for (let now = 1100; now <= 301000; now += 100) {
    controller.sync(behavior, now); behavior.tick(0.016, now);
    assert.equal(behavior.state, 'thinking'); assert.equal(behavior.reactionId, id);
  }
  assert.equal(behavior.tick(0, 301000).elapsed, 300);
  behavior.grab(0, 0, 301100); controller.sync(behavior, 301200); assert.equal(behavior.state, 'held');
  behavior.release(301300); controller.sync(behavior, 301400); assert.equal(behavior.state, 'landing');
  behavior.tick(0.016, 302300); controller.sync(behavior, 302300); assert.equal(behavior.state, 'thinking');
  controller.observe({ status: 'receiving', messages: [user, answer] }); controller.sync(behavior, 302500);
  assert.equal(behavior.state, 'talking');
  controller.finish(); controller.sync(behavior, 302600);
  behavior.tick(0.016, 303100); assert.equal(behavior.state, 'idle');
});

test('completion keeps GPT emotion and failures clear activity before another request', () => {
  const controller = new ChatMotionController(), behavior = new CompanionBehavior(), emotions = new ReplyEmotionController();
  controller.begin(); controller.sync(behavior, 1000);
  const complete = { status: 'connected', conversationId: 'mock', messages: [user, { ...answer, delivery: 'complete', content: '응답\n현재상태: 화남' }] };
  controller.observe(complete); emotions.observe(complete);
  behavior.react(emotions.take(false), 2000); const until = behavior.until;
  controller.sync(behavior, 2100); assert.equal(behavior.state, 'angry'); assert.equal(behavior.until, until);
  controller.begin(); controller.sync(behavior, 3000); assert.equal(behavior.state, 'thinking');
  controller.observe({ status: 'uncertain', messages: [user] }); controller.finish(); controller.sync(behavior, 3100);
  behavior.tick(0, 3600); assert.equal(behavior.state, 'idle');
  behavior.react('thinking', 4000); controller.sync(behavior, 4100);
  assert.equal(behavior.until, 10500, 'manual thinking retains its preview duration');
});
