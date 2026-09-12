import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 9231);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
try {
  const pages = browser.contexts().flatMap(context => context.pages());
  const page = pages.find(candidate => candidate.url().includes('dist/index.html'));
  if (!page) throw new Error('DesktopMate page not found');
  await page.waitForSelector('.avatar-renderer[data-loaded="true"]', { timeout: 60000 });
  const state = await page.evaluate(() => ({
    title: document.title,
    visibility: document.visibilityState,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    devicePixelRatio: window.devicePixelRatio,
    model: document.querySelector('.avatar-renderer')?.getAttribute('data-model'),
    loaded: document.querySelector('.avatar-renderer')?.getAttribute('data-loaded'),
    chatVisible: Boolean(document.querySelector('.chat-bubble')),
  }));
  await page.screenshot({ path: path.join(root, 'artifacts/portable-0.2.0.png'), omitBackground: true });
  console.log(JSON.stringify(state, null, 2));
} finally {
  await browser.close();
}
