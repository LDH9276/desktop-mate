import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { emotionChoices } from '../src/emotions.mjs';
import { clipFiles, reactionSources } from '../src/expressive-motion.mjs';

mkdirSync('artifacts/motion-v2', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 5175, strictPort: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 820 }, deviceScaleFactor: 1.5 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  const shot = async name => page.locator('.companion-shell').screenshot({ path: `artifacts/motion-v2/${name}.png` });
  const react = async name => {
    await page.getByRole('button', { name: '모션 선택', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
  };
  for (const [id] of process.argv.includes('--events-only') ? [] : [['mate', 'Mate']]) {
    await page.waitForSelector(`.avatar-renderer[data-model="${id}"][data-loaded="true"][data-motion-clips="${clipFiles.length}"]`, { timeout: 60000 });
    await page.waitForTimeout(1200); await shot(`${id}-idle`);
    await react('손 흔들기'); await page.waitForTimeout(1100); await shot(`${id}-wave`);
    await react('기뻐하기'); await page.waitForTimeout(850); await shot(`${id}-happy`);
    await react('꾸벅 인사'); await page.waitForTimeout(1650);
    assert.equal(await page.locator('.avatar-renderer').getAttribute('data-motion-source'), 'gene-vmd');
    await shot(`${id}-bow`);
    for (const { state, label } of emotionChoices) {
      await react(label); await page.waitForTimeout(state === 'laugh' ? 1450 : 900);
      assert.equal(await page.locator('.avatar-renderer').getAttribute('data-motion'), state);
      assert.equal(await page.locator('.avatar-renderer').getAttribute('data-motion-clip'), reactionSources[state].file);
      await shot(`${id}-${state}`);
    }
    await react('꾸벅꾸벅'); await page.waitForTimeout(1700);
    assert.equal(await page.locator('.avatar-renderer').getAttribute('data-motion-source'), 'gene-vmd');
    await shot(`${id}-sleep`);
    await react('편하게 서기'); await page.waitForTimeout(1000);
    assert.equal(await page.locator('.avatar-renderer').getAttribute('data-motion'), 'idle');
    const hit = await page.locator('.character-touch').boundingBox();
    await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2);
    await page.mouse.down();
    await page.mouse.move(hit.x + hit.width / 2 + 40, hit.y + hit.height / 2 - 30, { steps: 8 });
    await page.waitForTimeout(550);
    assert.equal(await page.locator('.avatar-renderer').getAttribute('data-motion'), 'held');
    await shot(`${id}-held`);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.avatar-renderer').getAttribute('data-motion'), 'idle');
    // Restore the preview-only drag offset before switching to the next model.
    const moved = await page.locator('.character-touch').boundingBox();
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
    await page.mouse.down();
    await page.mouse.move(moved.x + moved.width / 2 - 40, moved.y + moved.height / 2 + 30, { steps: 8 });
    await page.mouse.up(); await page.waitForTimeout(1000);
  }
  // Feed test-only bridge events through the real React subscription. This
  // page has no Electron IPC and cannot communicate with an actual GPT tab.
  const replies = await browser.newPage({ viewport: { width: 900, height: 820 }, deviceScaleFactor: 1.5 });
  replies.on('pageerror', e => errors.push(e.message));
  await replies.addInitScript(() => {
    let subscriber;
    window.mate = {
      state: async () => ({ status: 'connected', conversationId: 'test-only', title: 'test', detail: '', messages: [] }),
      onState: callback => { subscriber = callback; return () => { subscriber = undefined; }; },
      onSettings: () => () => {}, onMotion: () => () => {}, setRegions: () => {}, endDrag: () => {},
    };
    window.emitTestReply = value => subscriber?.(value);
  });
  await replies.goto(server.resolvedUrls.local[0]);
  await replies.waitForSelector('.avatar-renderer[data-loaded="true"]', { timeout: 60000 });
  for (const { state, label } of emotionChoices) {
    const emit = (delivery, content) => replies.evaluate(value => window.emitTestReply(value), {
      status: delivery === 'complete' ? 'connected' : 'receiving', conversationId: 'test-only', title: 'test', detail: '',
      messages: [{ id: state, role: 'assistant', content, delivery }],
    });
    await emit('receiving', `테스트 답변\n현재상태: ${label}`);
    await replies.waitForSelector('.avatar-renderer[data-motion="talking"]');
    await emit('complete', `테스트 답변\n현재상태: ${label}`);
    await replies.waitForSelector(`.avatar-renderer[data-motion="${state}"]`);
    await replies.waitForTimeout(350);
    assert.ok((await replies.locator('.character-caption').textContent()).includes(`현재상태: ${label}`));
    assert.ok((await replies.locator('.message.assistant').textContent()).includes(`현재상태: ${label}`));
  }
  await replies.locator('.companion-shell').screenshot({ path: 'artifacts/motion-v2/gpt-state-reaction.png' });
  await replies.close();
  assert.deepEqual(errors, []);
  console.log(process.argv.includes('--events-only')
    ? 'GPT state UI passed: seven completed reply tags drive seven reactions; only mock bridge events were used.'
    : 'Motion preview passed: original procedural Mate, seven emotions, VMD playback, drag/landing, completed GPT state events, no renderer errors. Only mock GPT events were used.');
} finally { await browser.close(); await server.close(); }
