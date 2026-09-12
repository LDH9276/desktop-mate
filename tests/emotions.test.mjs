import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { emotionChoices, parseEmotionTag, ReplyEmotionController } from '../src/emotions.mjs';
import { CompanionBehavior } from '../src/behavior.mjs';
const require = createRequire(import.meta.url);
const { ChatSession } = require('../electron/bridge.cjs');
const { formatEmotionRequest } = require('../electron/emotion-protocol.cjs');

const state = (content, delivery = 'complete', id = 'reply-one') => ({
  status: delivery === 'complete' ? 'connected' : 'receiving', conversationId: 'one',
  messages: [{ id, role: 'assistant', content, delivery }],
});

test('all seven explicit Korean state tags map to different reactions', () => {
  assert.equal(new Set(emotionChoices.map(x => x.state)).size, 7);
  for (const { label, state } of emotionChoices) {
    assert.equal(parseEmotionTag(`답변입니다.\n\n현재상태: ${label}`)?.state, state);
    assert.equal(parseEmotionTag(`답변\r\n**현재 상태:** ${label}  \r\n`)?.state, state);
  }
  assert.equal(parseEmotionTag('답변\n현재상태: 기본')?.state, 'idle');
});

test('prose, quoted/code examples, unknown states and partial tags cannot trigger emotions', () => {
  for (const content of ['화남이란 감정입니다.', '예: 현재상태: 화남', '> 현재상태: 화남',
    '```text\n현재상태: 화남', '~~~\n현재상태: 슬픔', '현재상태: 화남\n설명을 계속합니다.',
    '답변\n현재상태: 화', '답변\n현재상태: 기쁨', '답변\n현재상태: 화남 슬픔']) {
    assert.equal(parseEmotionTag(content), null, content);
  }
  assert.equal(parseEmotionTag('```\n현재상태: 화남\n```\n현재상태: 웃음')?.state, 'smile');
});

test('streaming waits for completion, repeated snapshots do not replay, grabbing defers the reaction', () => {
  const controller = new ReplyEmotionController();
  controller.observe(state('답변\n현재상태: 화남', 'receiving'));
  assert.equal(controller.take(), null);
  controller.observe(state('답변\n현재상태: 화남'));
  assert.equal(controller.take(true), null);
  assert.equal(controller.take(), 'angry');
  controller.observe(state('답변\n현재상태: 화남'));
  assert.equal(controller.take(), null);
  controller.observe(state('다른 답변\n현재상태: 화남', 'complete', 'reply-two'));
  assert.equal(controller.take(), 'angry');
  controller.observe(state('태그가 없는 답변', 'complete', 'reply-three'));
  assert.equal(controller.take(), 'idle');
});

test('only completed assistant replies affect the character; changing conversations clears pending reactions', () => {
  const controller = new ReplyEmotionController();
  controller.observe({ ...state('현재상태: 화남'), messages: [{ id: 'u', role: 'user', content: '현재상태: 화남', delivery: 'complete' }] });
  assert.equal(controller.take(), null);
  controller.observe(state('답변\n현재상태: 슬픔'));
  controller.observe({ status: 'connected', conversationId: 'two', messages: [] });
  assert.equal(controller.take(), null);
  controller.observe(state('미완료\n현재상태: 폭소', 'incomplete'));
  assert.equal(controller.take(), null);
});

test('future GPT messages request the tag, preserve the visible question, and drive the completed reaction', async () => {
  const calls = [];
  let poll = 0;
  const transport = { request: async (command, payload) => {
    calls.push({ command, payload });
    if (command === 'connect') return { connected: true, conversationId: 'one', title: 'test' };
    if (command === 'poll') return ++poll === 1 ? { complete: false, text: '놀랐어요.\n현재상태: 놀' } : { complete: true, text: '놀랐어요.\n현재상태: 놀람' };
    return {};
  } };
  const session = new ChatSession(transport, { wait: async () => {} });
  const controller = new ReplyEmotionController(); const b = new CompanionBehavior();
  session.on('change', next => { controller.observe(next); const emotion = controller.take(); if (emotion) b.react(emotion, 1000); });
  await session.connect(1); await session.send('안녕');
  const wire = calls.find(c => c.command === 'send').payload.text;
  assert.ok(wire.startsWith('안녕\n\n'));
  assert.ok(wire.includes('현재상태: 화남'));
  for (const { label } of emotionChoices) assert.ok(wire.includes(label));
  assert.equal(session.snapshot().messages[0].content, '안녕');
  assert.equal(session.snapshot().messages[1].content, '놀랐어요.\n현재상태: 놀람');
  assert.equal(b.state, 'surprise');
  assert.ok(formatEmotionRequest('가'.repeat(6000)).length <= 7000, 'native limit leaves space for the format instruction');
});
