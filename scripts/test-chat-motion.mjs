import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const out = 'artifacts/chat-motion'; mkdirSync(out, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 820 }, deviceScaleFactor: 1.5 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    let subscriber, resolveSend, rejectSend;
    window.mate = {
      state: async () => ({ status: 'connected', conversationId: 'mock', title: 'test', detail: '', messages: [] }),
      onState: callback => { subscriber = callback; return () => { subscriber = null; }; },
      onSettings: () => () => {}, onMotion: () => () => {}, setRegions: () => {}, endDrag: () => {},
      send: () => new Promise((resolve, reject) => { resolveSend = resolve; rejectSend = reject; }),
    };
    window.mockChat = state => subscriber?.(state);
    window.mockFinish = error => error ? rejectSend(new Error(error)) : resolveSend();
  });
  await page.goto(server.resolvedUrls.local[0]);
  const avatar = page.locator('.avatar-renderer');
  await expect(avatar).toHaveAttribute('data-loaded', 'true', { timeout: 60000 });
  await expect(avatar).toHaveAttribute('data-motion-clips', '8');
  const pose = state => expect(avatar).toHaveAttribute('data-motion', state);
  const emit = (status, messages) => page.evaluate(state => window.mockChat(state), { status, messages, conversationId: 'mock', title: 'test', detail: '테스트 응답 대기' });
  const user = { id: 'u1', role: 'user', content: '모션 테스트', delivery: 'sent' };
  const old = { id: 'old', role: 'assistant', content: '이전 답변', delivery: 'complete' };
  await page.getByRole('textbox', { name: '메시지 입력' }).fill(user.content);
  await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
  await pose('thinking'); // Before any bridge event.
  await page.waitForTimeout(3200); await pose('thinking');
  await emit('receiving', [old, user]); await page.waitForTimeout(1800); await pose('thinking');
  await expect(avatar).toHaveAttribute('data-motion-clip', '16_thinking.vmd');
  await page.locator('.companion-shell').screenshot({ path: `${out}/waiting.png` });
  const hit = await page.locator('.character-touch').boundingBox();
  await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2); await page.mouse.down();
  await page.mouse.move(hit.x + hit.width / 2 + 12, hit.y + hit.height / 2, { steps: 4 });
  await pose('held'); await page.mouse.up(); await pose('landing'); await pose('thinking');
  const answer = { id: 'a1', role: 'assistant', content: '반가워요!', delivery: 'receiving' };
  await emit('receiving', [old, user, answer]); await pose('talking');
  await page.waitForTimeout(2000); await pose('talking');
  await emit('connected', [old, user, { ...answer, content: '반가워요!\n현재상태: 웃음', delivery: 'complete' }]);
  await page.evaluate(() => window.mockFinish()); await pose('smile');
  await pose('idle');
  await page.getByRole('textbox', { name: '메시지 입력' }).fill('전송 실패 테스트');
  await page.getByRole('button', { name: '메시지 보내기', exact: true }).click(); await pose('thinking');
  await page.evaluate(() => window.mockFinish('테스트 전송 실패')); await pose('idle');
  await expect(page.getByRole('textbox', { name: '메시지 입력' })).toHaveValue('전송 실패 테스트');
  await page.getByRole('button', { name: '모션 선택', exact: true }).click();
  await page.getByRole('button', { name: '생각하기', exact: true }).click(); await pose('thinking');
  await page.waitForTimeout(2500); await pose('thinking');
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/result.json`, JSON.stringify({ passed: true, realGptMessages: 0, checks: ['immediate thinking', 'long empty wait', 'old reply ignored', 'grab and resume', 'streaming speech', 'completed emotion', 'failure release'] }, null, 2));
  console.log('Chat motion UI passed: immediate/long waiting, grab and resume, speech, completed emotion, failed send, manual thinking. Mock events only.');
} finally { await browser.close(); await server.close(); }
