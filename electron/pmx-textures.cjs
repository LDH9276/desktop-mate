const path = require('node:path');

// Rewrite the PMX texture table, preserving all geometry, bones and morphs.
// Paths are resolved inside the archive, including Windows slashes and casing.
function normalizePmx(bytes, modelPath, files) {
  if (bytes.length < 17 || bytes.toString('ascii', 0, 4) !== 'PMX ') throw new Error('올바른 PMX 모델 파일이 아닙니다.');
  if (bytes[8] !== 8 || bytes[9] !== 0) throw new Error('현재 UTF-16 PMX 2.0/2.1 모델을 지원합니다. PMX 편집기에서 UTF-16으로 저장해 주세요.');
  const uv = bytes[10], vertexIndex = bytes[11], boneIndex = bytes[14];
  if (uv > 4 || ![1, 2, 4].includes(vertexIndex) || ![1, 2, 4].includes(boneIndex)) throw new Error('PMX 헤더가 손상되었습니다.');
  let offset = 17;
  const skip = n => { if (!Number.isSafeInteger(n) || n < 0 || offset + n > bytes.length) throw new Error('PMX 데이터가 잘렸습니다.'); offset += n; };
  const uint = () => { skip(4); return bytes.readUInt32LE(offset - 4); };
  const string = () => { const size = uint(); if (size > 4 * 1024 * 1024 || size % 2) throw new Error('PMX 문자열이 손상되었습니다.'); skip(size); return bytes.toString('utf16le', offset - size, offset); };
  const modelName = string(); string(); const comment = string(); string();
  const vertices = uint(); if (vertices > 2000000) throw new Error('모델의 정점 수가 너무 많습니다.');
  for (let i = 0; i < vertices; i++) {
    skip(32 + uv * 16); skip(1); const type = bytes[offset - 1];
    const weights = [boneIndex, boneIndex * 2 + 4, boneIndex * 4 + 16, boneIndex * 2 + 40][type];
    if (weights === undefined) throw new Error('이 모델의 스키닝 방식은 현재 지원하지 않습니다.');
    skip(weights + 4);
  }
  skip(uint() * vertexIndex);
  const count = uint(); if (count > 20000) throw new Error('모델의 텍스처 수가 너무 많습니다.');
  const tableStart = offset, replacements = [], missing = [];
  const lookup = new Map(files.map(file => [file.normalize('NFC').toLowerCase(), file]));
  for (let i = 0; i < count; i++) {
    const original = string(), normalized = original.replace(/\\/g, '/');
    if (/^(?:[a-z]+:|\/)/i.test(normalized)) throw new Error('PMX의 외부 텍스처 경로는 사용할 수 없습니다.');
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(modelPath), normalized));
    if (relative === '..' || relative.startsWith('../')) throw new Error('텍스처가 ZIP 폴더 밖을 참조합니다.');
    const found = lookup.get(relative.normalize('NFC').toLowerCase());
    if (!found && original) missing.push(original);
    const target = found ? path.posix.relative(path.posix.dirname(modelPath), found) : normalized;
    // MMDLoader appends these to the model URL. Encode reserved URL characters.
    const encoded = target.split('/').map(part => part === '..' ? part : encodeURIComponent(part)).join('/');
    const text = Buffer.from(encoded, 'utf16le'), length = Buffer.alloc(4); length.writeUInt32LE(text.length);
    replacements.push(length, text);
  }
  return { bytes: Buffer.concat([bytes.subarray(0, tableStart), ...replacements, bytes.subarray(offset)]), modelName, comment, missing };
}
module.exports = { normalizePmx };
