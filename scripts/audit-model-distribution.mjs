import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
const { normalizePmx }=require('../electron/pmx-textures.cjs');
const root=process.cwd();
const packaged=process.argv.includes('--packaged');
const target=packaged?path.join(root,'portable-release','win-unpacked','resources','app','dist'):path.join(root,'dist');
assert.ok(existsSync(target),`build output missing: ${target}`);
const files=[];
const walk=folder=>{for(const name of readdirSync(folder)){const file=path.join(folder,name),stat=statSync(file);if(stat.isDirectory())walk(file);else files.push(file);}};
walk(target);
const relative=files.map(file=>path.relative(target,file).replaceAll('\\','/'));

const bundledModel='models/syaoty/Syaoty_01_optimize.pmx';
const modelFiles=relative.filter(file=>/\.(?:vrm|pmx|pmd|fbx|unitypackage)$/i.test(file));
assert.deepEqual(modelFiles,[bundledModel],'only the audited Syaoty CC0 PMX may be packaged');
const modelFile=path.join(target,...bundledModel.split('/'));
const normalized=normalizePmx(readFileSync(modelFile),bundledModel,relative);
assert.equal(normalized.modelName,'Syaoty_01');
assert.deepEqual(normalized.missing,[],'bundled Syaoty textures must be complete');
assert.match(normalized.comment,/Author\s*:yomox9/i);
assert.match(normalized.comment,/License\s*[\r\n]+CC0/i);
assert.equal(relative.filter(file=>/^models\/syaoty\/tex\/.*\.png$/i.test(file)).length,18,'unexpected Syaoty texture set');

const modelNotice=path.join(target,'models','syaoty','LICENSE.txt');
assert.ok(existsSync(modelNotice),'Syaoty distribution notice missing');
const notice=readFileSync(modelNotice,'utf8');
assert.match(notice,/CC0 1\.0 Universal/);
assert.match(notice,/https:\/\/booth\.pm\/en\/items\/2276392/);
assert.match(notice,/23441EA85CE3115E085FD6FBA2CF8FEABC149FF47C12C9F6273692B2D9D8C65F/);
const scripts=files.filter(file=>/\.js$/i.test(file)).map(file=>readFileSync(file,'utf8')).join('\n');
assert.ok(scripts.includes('CC0-1.0'),'Syaoty license marker missing');

const attribution=path.join(target,'motions','gene','ATTRIBUTION.txt');
assert.ok(existsSync(attribution),'CC BY motion attribution missing');
assert.match(readFileSync(attribution,'utf8'),/Creative Commons Attribution 4\.0 International/);
const report={result:'passed',version:JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version,packaged,target,files:relative.length,modelFiles,defaultModel:'Syaoty',defaultModelSource:'Syaoty_01 Normal_cc0 by yomox9',modelLicense:'CC0 1.0 Universal',modelTextures:18,motionAttribution:'CC BY 4.0 included'};
mkdirSync(path.join(root,'artifacts'),{recursive:true});
writeFileSync(path.join(root,'artifacts',`model-distribution-audit-${packaged?'packaged':'source'}.json`),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
