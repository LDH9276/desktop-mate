const fs = require('node:fs');
const path = require('node:path');

class PreferenceStore {
  constructor(filePath, fsImpl = fs) {
    this.filePath = filePath;
    this.fs = fsImpl;
    this.values = this.read();
  }

  read() {
    try {
      const value = JSON.parse(this.fs.readFileSync(this.filePath, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      return Object.fromEntries(Object.entries(value).filter(([key, item]) => key.startsWith('mate.') && typeof item === 'string'));
    } catch { return {}; }
  }

  get(key) {
    return typeof key === 'string' && key.startsWith('mate.') ? this.values[key] ?? null : null;
  }

  all() {
    return { ...this.values };
  }

  set(key, value) {
    if (typeof key !== 'string' || !key.startsWith('mate.') || typeof value !== 'string') throw new TypeError('Invalid Mate preference');
    this.values[key] = value;
    this.save();
    return value;
  }

  remove(key) {
    if (typeof key !== 'string' || !key.startsWith('mate.')) throw new TypeError('Invalid Mate preference');
    delete this.values[key];
    this.save();
  }

  save() {
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    this.fs.writeFileSync(temporaryPath, JSON.stringify(this.values, null, 2), 'utf8');
    this.fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = { PreferenceStore };
