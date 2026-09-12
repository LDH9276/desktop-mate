import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ModelLibrary } from '../electron/model-library.cjs';
import { normalizePmx } from '../electron/pmx-textures.cjs';
import { MMDParser } from 'three/addons/libs/mmdparser.module.js';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
// Minimal stored ZIP writer: fixtures exercise importer boundaries, not a real
// renderer or third-party files. Tests never invoke the native file dialog.
function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const { name, rawName, data = Buffer.from('test'), attrs = 0, claimed = data.length } of entries) {
    const filename = rawName || Buffer.from(name), head = Buffer.alloc(30), cd = Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(2048, 6);
    head.writeUInt32LE(crc32(data), 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(claimed, 22); head.writeUInt16LE(filename.length, 26);
    cd.writeUInt32LE(0x02014b50); cd.writeUInt16LE(0x0314, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(2048, 8);
    cd.writeUInt32LE(crc32(data), 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(claimed, 24); cd.writeUInt16LE(filename.length, 28); cd.writeUInt32LE(attrs >>> 0, 38); cd.writeUInt32LE(offset, 42);
    local.push(head, filename, data); central.push(cd, filename); offset += head.length + filename.length + data.length;
  }
  const body = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(body.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, body, end]);
}
function pmx(textures = ['..\\Tex\\눈 #1.png']) {
  const string = text => { const b = Buffer.from(text, 'utf16le'), n = Buffer.alloc(4); n.writeUInt32LE(b.length); return Buffer.concat([n, b]); };
  const header = Buffer.from([80, 77, 88, 32, 0, 0, 0, 64, 8, 0, 0, 1, 1, 1, 1, 1, 1]);
  const count = Buffer.alloc(4); count.writeUInt32LE(textures.length);
  return Buffer.concat([header, ...['테스트', 'test', 'created by Test Author', ''].map(string), Buffer.alloc(8), count, ...textures.map(string), Buffer.alloc(24)]);
}
function glb(version = 2) {
  const source = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }));
  const json = Buffer.concat([source, Buffer.alloc((4 - source.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(12), chunk = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(version, 4); header.writeUInt32LE(20 + json.length, 8);
  chunk.writeUInt32LE(json.length); chunk.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunk, json]);
}
async function fixture(entries) {
  const root = await mkdtemp(path.resolve('artifacts/zip-test-'));
  const archive = path.join(root, 'model.zip'); await writeFile(archive, zip(entries));
  return { archive, lib: new ModelLibrary(path.join(root, 'library')), root };
}
test('nested PMX ZIP resolves Unicode/case/slashes, retains credits and survives a new library instance', async () => {
  const { archive, lib } = await fixture([{ name: 'モデル/model.pmx', data: pmx() }, { name: 'tex/눈 #1.png' }, { name: 'readme.txt' }, { name: 'run.exe' }]);
  const first = await lib.importZip(archive), model = first.models[0];
  assert.equal(model.creator, 'Test Author'); assert.deepEqual(first.warnings, []);
  const file = await lib.resolve(model.url), bytes = await readFile(file);
  const parsed = new MMDParser.Parser().parsePmx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), true);
  assert.deepEqual(parsed.textures, ['../tex/%EB%88%88%20%231.png']);
  const texture = new URL(parsed.textures[0], model.url).href;
  assert.equal((await readFile(await lib.resolve(texture))).toString(), 'test');
  const restarted = new ModelLibrary(lib.root), second = await restarted.importZip(archive);
  assert.equal(second.duplicate, true); assert.equal((await restarted.list()).length, 1);
  await assert.rejects(lib.resolve(new URL('../readme.txt', model.url).href));
  await assert.rejects(lib.resolve(new URL('../run.exe', model.url).href));
});
test('non-UTF8 Shift-JIS filenames do not abort a model import', async () => {
  const { archive, lib } = await fixture([{ name: 'あ/model.pmx', rawName: Buffer.from([0x82, 0xa0, 0x2f, 0x6d, 0x6f, 0x64, 0x65, 0x6c, 0x2e, 0x70, 0x6d, 0x78]), data: pmx() }]);
  const result = await lib.importZip(archive);
  assert.equal(result.models.length, 1);
  assert.match(result.models[0].file, /model\.pmx$/i);
});
test('GBK ZIP names are matched to UTF-16 PMX texture references', async () => {
  const modelName = Buffer.from([0xc4, 0xa3, 0xd0, 0xcd, 0x2e, 0x70, 0x6d, 0x78]); // 模型.pmx in GBK
  const textureName = Buffer.from([0x74, 0x65, 0x78, 0x2f, 0xc1, 0xb3, 0x2e, 0x70, 0x6e, 0x67]); // tex/脸.png in GBK
  const { archive, lib } = await fixture([{ name: '模型.pmx', rawName: modelName, data: pmx(['tex/脸.png']) }, { name: 'tex/脸.png', rawName: textureName }]);
  const result = await lib.importZip(archive);
  assert.deepEqual(result.warnings, []);
  assert.match(result.models[0].name, /模型/);
  assert.equal((await readFile(await lib.resolve(new URL('tex/%E8%84%B8.png', result.models[0].url).href))).toString(), 'test');
});
test('a multi-model ZIP selects the largest PMX before accessory models', async () => {
  const { archive, lib } = await fixture([
    { name: 'models/chair.pmx', data: pmx() },
    { name: 'models/character.pmx', data: Buffer.concat([pmx(), Buffer.alloc(256)]) },
  ]);
  const result = await lib.importZip(archive);
  assert.match(result.added[0], /-0$/);
  assert.equal(result.models[0].name, 'character');
});
test('imports a Blender-exported glTF 2.0 GLB as a generic rig model', async () => {
  const { archive, lib } = await fixture([{ name: 'blender/Hsin.glb', data: glb() }]);
  const result = await lib.importZip(archive), model = result.models[0];
  assert.equal(model.kind, 'gltf'); assert.equal(model.name, 'Hsin');
  assert.equal((await readFile(await lib.resolve(model.url))).toString('ascii', 0, 4), 'glTF');
});
test('rejects obsolete or malformed GLB files', async () => {
  for (const data of [glb(1), Buffer.from('not a glb')]) {
    const { archive, lib } = await fixture([{ name: 'model.glb', data }]);
    await assert.rejects(lib.importZip(archive));
  }
});
test('rejects traversal, symlinks, case collisions, invalid models and expansion lies without registering a model', async () => {
  for (const entries of [
    [{ name: '../outside.pmx', data: pmx() }],
    [{ name: 'C:/outside.pmx', data: pmx() }],
    [{ name: 'model.pmx', data: pmx(), attrs: 0xa1ff0000 }],
    [{ name: 'model.pmx', data: pmx() }, { name: 'MODEL.PMX', data: pmx() }],
    [{ name: 'model.pmx', data: Buffer.from('invalid') }],
    [{ name: 'model.pmx', data: pmx(), claimed: 1 }],
    [{ name: 'model.pmx', data: pmx(), claimed: 300 * 1024 * 1024 }],
    [{ name: 'motion.vmd' }],
  ]) {
    const { archive, lib } = await fixture(entries);
    await assert.rejects(lib.importZip(archive)); assert.deepEqual(await lib.list(), []);
    assert.equal((await readdir(lib.root).catch(() => [])).some(name => name.startsWith('.import-')), false);
  }
});
test('blocks external PMX texture URLs and traversal outside the ZIP', () => {
  for (const texture of ['https://example.com/skin.png', 'C:\\secret.png', '../../secret.png']) {
    assert.throws(() => normalizePmx(pmx([texture]), 'model.pmx', []));
  }
});
