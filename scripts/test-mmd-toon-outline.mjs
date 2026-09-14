import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ModelLibrary } from '../electron/model-library.cjs';
import { openSettingsWindow } from './settings-window.mjs';
import { createServer } from 'vite';

const root=process.cwd(),artifacts=path.join(root,'artifacts','mmd-toon-outline');mkdirSync(artifacts,{recursive:true});
const profile=mkdtempSync(path.join(artifacts,'profile-')),library=new ModelLibrary(path.join(profile,'model-library'));
const archive=process.argv.find(argument=>/\.zip$/i.test(argument))||path.join(root,'..','Denia.zip');
const models=(await library.importZip(archive)).models,packaged=process.argv.includes('--packaged');
const model=models[0],env={...process.env,MATE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.MATE_DEV_URL;
let server;
if(!packaged){env.MATE_DEV_URL='http://127.0.0.1:5173';server=await createServer({server:{host:'127.0.0.1',port:5173,strictPort:true}});await server.listen();}
const app=await electron.launch({...(packaged?{executablePath:path.join(root,'portable-release','win-unpacked','DesktopMate.exe'),args:['--force-device-scale-factor=1']}:{args:[root,'--force-device-scale-factor=1']}),env,timeout:30000});
try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForSelector('.avatar-renderer[data-loaded="true"]',{timeout:60000});
  await page.evaluate(id=>{
    localStorage.setItem('mate.avatar',id);
    localStorage.setItem(`mate.appearance.${id}`,JSON.stringify({zoom:1.35,width:1,height:1,offsetY:0,rotation:0}));
    localStorage.setItem('mate.chatAppearance',JSON.stringify({characterHeight:850}));
    localStorage.setItem('mate.outline',JSON.stringify({color:'#343941',opacity:.95,thickness:1,mmdToon:false,mmdToonThickness:1,mmdToonColor:'#343941'}));
  },model.id);
  await page.reload();await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForSelector(`.avatar-renderer[data-model="${model.id}"][data-loaded="true"]`,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('.avatar-renderer')?.dataset.mmdToonOutline==='false',undefined,{timeout:10000});
  await page.getByRole('button',{name:'채팅 열고 접기',exact:true}).click();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentBounds({x:100,y:50,width:800,height:1000}));
  await page.evaluate(()=>{window.mmdToonCanvas=document.querySelector('.avatar-renderer canvas');document.body.style.setProperty('background','#354656','important');});
  await page.waitForTimeout(400);await page.screenshot({path:path.join(artifacts,'denia-off.png')});
  const settings=await openSettingsWindow(app,page);
  await settings.getByRole('checkbox',{name:'MMD 카툰 외곽선',exact:true}).waitFor();
  assert.equal(await settings.getByRole('checkbox',{name:'MMD 카툰 외곽선',exact:true}).isEnabled(),true);
  await settings.getByRole('checkbox',{name:'MMD 카툰 외곽선',exact:true}).check();
  await page.waitForSelector('.avatar-renderer[data-mmd-toon-outline="true"]');
  await settings.getByLabel('카툰 외곽선 굵기 값',{exact:true}).fill('175');
  await settings.getByLabel('카툰 외곽선 굵기 값',{exact:true}).press('Enter');
  await page.waitForSelector('.avatar-renderer[data-mmd-toon-thickness="1.75"]');
  await settings.getByLabel('카툰 외곽선 색상',{exact:true}).fill('#2457d6');
  await page.waitForSelector('.avatar-renderer[data-mmd-toon-color="#2457d6"]');
  await settings.locator('.outline-settings').scrollIntoViewIfNeeded();
  await settings.screenshot({path:path.join(artifacts,'settings.png')});
  assert.ok(await page.evaluate(()=>window.mmdToonCanvas===document.querySelector('.avatar-renderer canvas')),'toggle must not reload the model');
  assert.deepEqual(await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('mate.outline'));return {enabled:value.mmdToon,thickness:value.mmdToonThickness,color:value.mmdToonColor};}),{enabled:true,thickness:1.75,color:'#2457d6'});
  await settings.getByRole('button',{name:'설정 닫기',exact:true}).click();
  await page.waitForTimeout(400);await page.screenshot({path:path.join(artifacts,'denia-on.png')});
  const report={result:'passed',model:model.name,packaged,sameCanvas:true,persisted:true,errors};
  assert.deepEqual(errors,[]);writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});await server?.close();}
