import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import preferenceModule from '../electron/preferences.cjs';

const { PreferenceStore } = preferenceModule;

test('Mate preferences survive a new application process', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mate-preferences-'));
  try {
    const file = path.join(folder, 'user-data', 'preferences.json');
    const firstRun = new PreferenceStore(file);
    firstRun.set('mate.physicsWeight', '0.72');
    firstRun.set('mate.settingsTab', '채팅창');

    const nextRun = new PreferenceStore(file);
    assert.equal(nextRun.get('mate.physicsWeight'), '0.72');
    assert.equal(nextRun.get('mate.settingsTab'), '채팅창');
    assert.equal(nextRun.get('unrelated.value'), null);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
