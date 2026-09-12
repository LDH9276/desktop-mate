const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const unzipper = require('unzipper');
const { normalizePmx } = require('./pmx-textures.cjs');
const { setTimeout: delay } = require('node:timers/promises');

const MB = 1024 * 1024;
const assetTypes = new Set(['.pmx', '.vrm', '.glb', '.png', '.jpg', '.jpeg', '.bmp', '.tga', '.sph', '.spa', '.webp', '.txt', '.md', '.pdf']);
const servedTypes = new Set([...assetTypes].filter(ext => !['.txt', '.md', '.pdf'].includes(ext)));
function safePath(input) {
  const name = input.replace(/\\/g, '/').normalize('NFC').replace(/\/$/, '');
  if (!name || name.length > 240 || /[\x00-\x1f:<>"|?*]/.test(name) || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('ZIP에 사용할 수 없는 파일 경로가 있습니다.');
  return name;
}
function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);
}
function entryName(entry, legacyEncoding = 'shift_jis') {
  const bytes = entry.pathBuffer;
  // Bit 11 is the ZIP specification's UTF-8 marker. Archives without it can
  // contain GBK bytes that coincidentally form valid UTF-8 sequences, so do
  // not test individual names as UTF-8 before applying the archive encoding.
  if ((entry.flags & 0x800) || legacyEncoding === 'utf-8') {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { if (legacyEncoding === 'utf-8') return new TextDecoder('utf-8').decode(bytes); }
  }
  try {
    // Older MMD archives commonly store Japanese CP932 or Chinese GBK names
    // without the UTF-8 flag. A single vendor-specific byte must not abort
    // the entire model import.
    return new TextDecoder(legacyEncoding).decode(bytes);
  } catch { return entry.path || new TextDecoder('windows-1252').decode(bytes); }
}
async function chooseLegacyEncoding(entries) {
  const models = entries.filter(entry => /\.pmx$/i.test(path.posix.extname(entry.path)));
  if (!models.length) return 'shift_jis';
  let selected = 'utf-8', best = Infinity;
  for (const encoding of ['utf-8', 'gb18030', 'shift_jis']) {
    try {
      const names = entries.map(entry => entryName(entry, encoding));
      let missing = 0;
      for (const model of models) {
        const index = entries.indexOf(model);
        const normalized = normalizePmx(await model.buffer(), names[index], names);
        missing += normalized.missing.length;
      }
      if (missing < best) { selected = encoding; best = missing; }
    } catch { /* A malformed candidate loses to a readable one. */ }
  }
  return selected;
}
async function renameReady(source, target) {
  // Windows file scanners can briefly hold a freshly extracted directory.
  // Retry only transient locks; never change destinations or bypass validation.
  for (let attempt = 0; ; attempt++) {
    try { await fsp.rename(source, target); return; }
    catch (error) {
      if (attempt >= 7 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      await delay(Math.min(40 * 2 ** attempt, 640));
    }
  }
}
class ModelLibrary {
  constructor(root) { this.root = path.resolve(root); this.queue = Promise.resolve(); }
  async list() {
    try { const rows = JSON.parse(await fsp.readFile(path.join(this.root, 'catalog.json'), 'utf8')); return Array.isArray(rows) ? rows : []; }
    catch (e) { if (e.code === 'ENOENT') return []; throw new Error('저장된 모델 목록을 읽지 못했습니다.'); }
  }
  importZip(zip) {
    const job = this.queue.then(() => this.extract(zip));
    this.queue = job.catch(() => {}); return job;
  }
  async extract(zip) {
    if (path.extname(zip).toLowerCase() !== '.zip') throw new Error('PMX, VRM 또는 Blender에서 내보낸 GLB가 들어 있는 ZIP을 선택해 주세요.');
    const stat = await fsp.stat(zip);
    if (!stat.isFile() || stat.size > 512 * MB) throw new Error('ZIP은 512MB 이하의 파일만 불러올 수 있습니다.');
    const digest = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(zip)) digest.update(chunk);
    const key = digest.digest('hex').slice(0, 24), catalog = await this.list();
    const existing = catalog.filter(model => model.archive === key);
    if (existing.length && existing.every(model => fs.existsSync(path.join(this.root, key, model.file)))) return { models: catalog, added: existing.map(m => m.id), duplicate: true, warnings: [] };
    let directory;
    try { directory = await unzipper.Open.file(zip, { tailSize: 65557 }); }
    catch { throw new Error('ZIP을 읽을 수 없습니다. 압축 파일이 손상되었는지 확인해 주세요.'); }
    if (directory.files.length > 10000) throw new Error('ZIP의 파일 수가 너무 많습니다.');
    const sourceEntries = []; let total = 0;
    for (const entry of directory.files) {
      if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw new Error('심볼릭 링크가 들어 있는 ZIP은 사용할 수 없습니다.');
      if (entry.type === 'Directory') continue;
      if (!assetTypes.has(path.posix.extname(entry.path).toLowerCase())) continue;
      if (entry.flags & 1) throw new Error('암호가 걸린 ZIP은 지원하지 않습니다.');
      if (![0, 8].includes(entry.compressionMethod)) throw new Error('일반 ZIP 압축 방식으로 다시 압축해 주세요.');
      total += entry.uncompressedSize;
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize > 256 * MB || total > 1024 * MB) throw new Error('압축을 푼 모델의 크기가 너무 큽니다.');
      sourceEntries.push(entry);
    }
    const encoding = await chooseLegacyEncoding(sourceEntries);
    const entries = [], names = new Set();
    for (const entry of sourceEntries) {
      const name = safePath(entryName(entry, encoding));
      if (names.has(name.toLowerCase())) throw new Error('ZIP 안에 이름이 겹치는 파일이 있습니다.');
      names.add(name.toLowerCase()); entries.push({ entry, name });
    }
    // Multi-model MMD archives often put props before the character. Present
    // larger model files first so the initial automatic selection is normally
    // the complete character rather than a chair, weapon or display prop.
    const models = entries.filter(({ name }) => /\.(pmx|vrm|glb)$/i.test(name))
      .sort((left, right) => right.entry.uncompressedSize - left.entry.uncompressedSize || left.name.localeCompare(right.name));
    if (!models.length) throw new Error('ZIP 안에 PMX, VRM 또는 Blender에서 내보낸 GLB 모델이 없습니다.');
    if (models.length > 30) throw new Error('한 ZIP에는 모델을 30개까지 넣을 수 있습니다.');
    await fsp.mkdir(this.root, { recursive: true });
    const staging = await fsp.mkdtemp(path.join(this.root, '.import-'));
    const warnings = [], imported = []; let expanded = 0;
    try {
      for (const { entry, name } of entries) {
        const target = path.resolve(staging, name);
        if (!inside(staging, target)) throw new Error('잘못된 ZIP 경로입니다.');
        await fsp.mkdir(path.dirname(target), { recursive: true });
        let size = 0;
        const limiter = new Transform({ transform(chunk, _, callback) {
          size += chunk.length; expanded += chunk.length;
          if (size > entry.uncompressedSize || size > 256 * MB || expanded > 1024 * MB) callback(new Error('ZIP의 실제 압축 해제 크기가 제한을 초과했습니다.'));
          else callback(null, chunk);
        } });
        await pipeline(entry.stream(), limiter, fs.createWriteStream(target, { flags: 'wx' }));
        if (size !== entry.uncompressedSize) throw new Error('ZIP의 파일 크기가 올바르지 않습니다.');
      }
      for (const [index, { name }] of models.entries()) {
        const kind = /\.vrm$/i.test(name) ? 'vrm' : /\.glb$/i.test(name) ? 'gltf' : 'pmx', file = path.join(staging, name);
        let creator = '사용자 추가 모델';
        if (kind === 'pmx') {
          const normalized = normalizePmx(await fsp.readFile(file), name, entries.map(e => e.name));
          await fsp.writeFile(file, normalized.bytes);
          if (normalized.missing.length) warnings.push(`${path.basename(name)}: 텍스처 ${normalized.missing.length}개가 ZIP에 없습니다.`);
          const credit = normalized.comment.match(/created by\s+([^\r\n]+)/i)?.[1];
          if (credit) creator = credit.slice(0, 100);
        } else {
          const handle = await fsp.open(file); const header = Buffer.alloc(12);
          try { await handle.read(header, 0, 12, 0); } finally { await handle.close(); }
          if (header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2) {
            throw new Error(kind === 'vrm' ? '올바른 VRM 파일이 아닙니다.' : 'Blender에서 glTF 2.0의 GLB 형식으로 다시 내보내 주세요.');
          }
        }
        const displayName = path.posix.basename(name, path.posix.extname(name));
        imported.push({ id: `zip-${key}-${index}`, archive: key, file: name, name: displayName, creator, kind, loadingName: displayName,
          url: `mate-model://${key}/${name.split('/').map(encodeURIComponent).join('/')}` });
      }
      const destination = path.join(this.root, key);
      // Only replace this library's content-addressed directory during repair.
      if (fs.existsSync(destination) && inside(this.root, destination)) await fsp.rm(destination, { recursive: true, force: true });
      await renameReady(staging, destination);
      const next = [...catalog.filter(model => model.archive !== key), ...imported];
      const temporary = path.join(this.root, 'catalog.tmp');
      await fsp.writeFile(temporary, JSON.stringify(next, null, 2));
      await renameReady(temporary, path.join(this.root, 'catalog.json'));
      return { models: next, added: imported.map(model => model.id), warnings, duplicate: false };
    } finally { if (inside(this.root, staging)) await fsp.rm(staging, { recursive: true, force: true }); }
  }
  async resolve(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'mate-model:' || !/^[a-f0-9]{24}$/.test(parsed.hostname)) throw new Error('Invalid model URL');
    const name = safePath(decodeURIComponent(parsed.pathname.slice(1)));
    if (!servedTypes.has(path.extname(name).toLowerCase())) throw new Error('Unsupported resource');
    const root = await fsp.realpath(path.join(this.root, parsed.hostname));
    if (!inside(await fsp.realpath(this.root), root)) throw new Error('Invalid library path');
    const file = await fsp.realpath(path.join(root, name));
    if (!inside(root, file)) throw new Error('Invalid resource path');
    return file;
  }
}
module.exports = { ModelLibrary, safePath };
