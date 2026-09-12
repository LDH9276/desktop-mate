// Reproducible import from the author's CC BY 4.0 repository. The reference
// model is only parsed for rest-bone frames; no additional character is shipped.
import { writeFileSync, mkdirSync } from 'node:fs';
import { Bone, Group, Vector3 } from 'three';
import { MMDParser } from 'three/addons/libs/mmdparser.module.js';
import { createMmdRig } from '../src/motion-rig.mjs';

const revision = 'c7eace43dffaccff6ad0597433ef85fa57c91e03';
const base = `https://raw.githubusercontent.com/mmdagent-ex/gene/${revision}/`;
async function download(file) {
  const response = await fetch(base + file);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return await response.arrayBuffer();
}
const data = new MMDParser.Parser().parsePmx(await download('Gene_light.pmx'), true);
const root = new Group();
const bones = data.bones.map(source => { const bone = new Bone(); bone.name = source.name; bone.position.fromArray(source.position); return bone; });
data.bones.forEach((source, i) => {
  if (source.parentIndex >= 0) {
    bones[i].position.sub(new Vector3().fromArray(data.bones[source.parentIndex].position));
    bones[source.parentIndex].add(bones[i]);
  } else root.add(bones[i]);
});
root.skeleton = { bones };
const frames = Object.fromEntries([...createMmdRig(root)].map(([name, entry]) => [name, {
  name: entry.bone.name, pre: entry.pre.toArray(), post: entry.post.toArray(), base: entry.base.toArray(),
}]));
writeFileSync('src/gene-rest.json', JSON.stringify({ revision, frames }, null, 2) + '\n');
mkdirSync('public/motions/gene', { recursive: true });
for (const file of ['02_laugh.vmd', '16_thinking.vmd', '26_mortifying.vmd', '32_frustrated.vmd', '34_sad.vmd', '38_Ashamed.vmd']) {
  const buffer = Buffer.from(await download(`motion/${file}`));
  if (!buffer.subarray(0, 30).toString().startsWith('Vocaloid Motion Data')) throw new Error(`Invalid VMD: ${file}`);
  writeFileSync(`public/motions/gene/${file}`, buffer);
  console.log(`${file}: ${buffer.length} bytes`);
}
console.log(`Imported ${Object.keys(frames).length} calibrated bone frames.`);
