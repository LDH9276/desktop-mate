import { _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NtExecutable, NtExecutableResource } from 'pe-library';
import { Resource, Data } from 'resedit';
import { ModelLibrary } from '../electron/model-library.cjs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),version=JSON.parse(readFileSync('package.json')).version;
const artifacts=path.join(root,'artifacts','pmx-packaged');mkdirSync(artifacts,{recursive:true});
const packed=path.join(root,'portable-release','win-unpacked'),executablePath=path.join(packed,'DesktopMate.exe');
const hash=data=>createHash('sha256').update(Buffer.from(data)).digest('hex');
const icons=Data.IconFile.from(readFileSync('assets/icon.ico')).icons.map(i=>i.data);
const iconReports=[];
for(const file of [executablePath,path.join(root,'portable-release',`DesktopMate-${version}-portable.exe`)]){
  const resources=NtExecutableResource.from(NtExecutable.from(readFileSync(file)));
  const groups=Resource.IconGroupEntry.fromEntries(resources.entries);
  const embedded=resources.entries.filter(e=>e.type===3).map(e=>hash(e.bin));
  for(const icon of icons)assert.ok(embedded.includes(hash(icon.bin)),`${path.basename(file)} missing ${icon.width}px icon`);
  iconReports.push({file,groups:groups.length,sizes:icons.map(i=>i.width)});
}
const dist=path.join(packed,'resources','app','dist','assets');
for(const file of readdirSync('dist/assets'))assert.equal(hash(readFileSync(path.join(dist,file))),hash(readFileSync(path.join('dist/assets',file))));
const profile=mkdtempSync(path.join(artifacts,'profile-')),library=new ModelLibrary(path.join(profile,'model-library'));
const models=(await library.importZip(process.argv[2]||path.join(root,'..','Denia.zip'))).models;
const env={...process.env,MATE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.MATE_DEV_URL;
const app=await electron.launch({executablePath,args:['--force-device-scale-factor=1'],env,timeout:30000});
try{
  assert.equal(await app.evaluate(({app})=>app.getVersion()),version);
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('.avatar-renderer[data-loaded="true"]',{timeout:60000});
  await page.evaluate(id=>{localStorage.setItem('mate.avatar',id);localStorage.setItem('mate.chatAppearance',JSON.stringify({characterHeight:850}));},models[0].id);
  await page.reload();await page.waitForSelector(`.avatar-renderer[data-model="${models[0].id}"][data-loaded="true"]`,{timeout:60000});
  await page.waitForSelector('.avatar-renderer[data-physics="ready"]',{timeout:60000});
  await page.getByRole('button',{name:'채팅 접기',exact:true}).click();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentBounds({x:100,y:50,width:800,height:1000}));
  assert.equal(await page.locator('.avatar-renderer canvas').evaluate(canvas=>canvas.getContext('webgl2').getContextAttributes().premultipliedAlpha),true);
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.waitForTimeout(100);
  for(const [name,background] of [['dark','#354656'],['light','#e9eef3']]){
    await page.evaluate(color=>document.body.style.setProperty('background',color,'important'),background);
    await page.screenshot({path:path.join(artifacts,`denia-${name}.png`)});
  }
  const icon=await app.evaluate(async({app},file)=>(await app.getFileIcon(file,{size:'large'})).toPNG().toString('base64'),path.join(root,'portable-release',`DesktopMate-${version}-portable.exe`));
  writeFileSync(path.join(artifacts,'windows-icon.png'),Buffer.from(icon,'base64'));
  assert.deepEqual(errors,[]);
  const report={result:'passed',version,model:models[0].name,icons:iconReports,packagedAssetsMatch:true};
  writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});}
