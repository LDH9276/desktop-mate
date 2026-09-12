import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { openSettingsWindow } from './settings-window.mjs';

const root = process.cwd();
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const artifacts = path.join(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const env = { ...process.env, MATE_TEST_USER_DATA: mkdtempSync(path.join(artifacts, 'lighting-')) };
delete env.ELECTRON_RUN_AS_NODE;
delete env.MATE_DEV_URL;
const packaged = process.argv.includes('--packaged');

const launch = () => electron.launch({
  ...(packaged
    ? { executablePath: path.join(root, 'portable-release', 'win-unpacked', 'DesktopMate.exe') }
    : { args: [root] }),
  env,
  timeout: 30000,
});
let app = await launch();
const capture = () => app.evaluate(async ({ BrowserWindow }) => {
  const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage();
  return image.toBitmap().toString('base64');
});

try {
  let page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
  await page.waitForSelector('.avatar-renderer[data-loaded="true"]', { timeout: 60000 });
  let settings = await openSettingsWindow(app, page);
  await settings.getByText(`Version ${version} · 로컬 실행`, { exact: true }).waitFor();
  const lighting = settings.getByLabel('조명 강도', { exact: true });
  const brightness = settings.getByLabel('명도', { exact: true });
  const saturation = settings.getByLabel('채도', { exact: true });
  assert.equal(await lighting.inputValue(), '1');
  assert.equal(await brightness.inputValue(), '0.65');
  assert.equal(await saturation.inputValue(), '1');
  await page.evaluate(() => { window.initialLightingCanvas = document.querySelector('.avatar-renderer canvas'); });

  await lighting.fill('0');
  await page.waitForFunction(() => document.querySelector('.avatar-renderer')?.dataset.lighting === '0');
  await lighting.fill('1.5');
  await page.waitForFunction(() => document.querySelector('.avatar-renderer')?.dataset.lighting === '1.5');

  await brightness.fill('0');
  await page.waitForFunction(() => document.querySelector('.avatar-renderer')?.dataset.brightness === '0');
  await page.waitForTimeout(150);
  const dark = Buffer.from(await capture(), 'base64');
  assert.equal(await page.locator('.avatar-renderer').evaluate(element => element.style.filter), 'brightness(0) saturate(1)');
  assert.ok(await page.evaluate(() => window.initialLightingCanvas === document.querySelector('.avatar-renderer canvas')));

  await brightness.fill('1.5');
  await page.waitForFunction(() => document.querySelector('.avatar-renderer')?.dataset.brightness === '1.5');
  await page.waitForTimeout(150);
  const bright = Buffer.from(await capture(), 'base64');
  assert.equal(await page.locator('.avatar-renderer').evaluate(element => element.style.filter), 'brightness(1.5) saturate(1)');
  assert.ok(await page.evaluate(() => window.initialLightingCanvas === document.querySelector('.avatar-renderer canvas')));
  assert.equal(dark.length, bright.length);
  let changed = 0;
  let brightnessGain = 0;
  for (let index = 0; index < dark.length; index += 4) {
    const delta = bright[index] + bright[index + 1] + bright[index + 2] - dark[index] - dark[index + 1] - dark[index + 2];
    if (Math.abs(delta) > 30) changed++;
    brightnessGain += delta;
  }
  assert.ok(changed > 500, '0% and 150% must visibly change the rendered character');
  assert.ok(brightnessGain > 10000, '150% output must be brighter than 0% output');
  await brightness.fill('1');
  await saturation.fill('2');
  await page.waitForFunction(() => document.querySelector('.avatar-renderer')?.dataset.saturation === '2');
  assert.equal(await page.locator('.avatar-renderer').evaluate(element => element.style.filter), 'brightness(1) saturate(2)');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('mate.visual'))), { lighting: 1.5, brightness: 1, saturation: 2 });

  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await app.close().catch(() => {});
  app = await launch();
  page = await app.firstWindow();
  await page.waitForSelector('.avatar-renderer[data-loaded="true"]', { timeout: 60000 });
  assert.equal(await page.locator('.avatar-renderer').getAttribute('data-lighting'), '1.5');
  assert.equal(await page.locator('.avatar-renderer').getAttribute('data-brightness'), '1');
  assert.equal(await page.locator('.avatar-renderer').getAttribute('data-saturation'), '2');
  settings = await openSettingsWindow(app, page);
  await settings.getByRole('button', { name: '조명과 색상 초기화', exact: true }).click();
  assert.equal(await settings.getByLabel('조명 강도', { exact: true }).inputValue(), '1');
  assert.equal(await settings.getByLabel('명도', { exact: true }).inputValue(), '0.65');
  assert.equal(await settings.getByLabel('채도', { exact: true }).inputValue(), '1');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('mate.visual'))), { lighting: 1, brightness: 0.65, saturation: 1 });
  console.log(`Lighting, brightness, and saturation update in place, persist, and reset (${packaged ? 'packaged' : 'source'}): passed`);
} finally {
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await app.close().catch(() => {});
}
