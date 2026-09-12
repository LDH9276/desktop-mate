import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root=process.cwd(),port=5188,artifacts=path.join(root,'artifacts','blender-models');mkdirSync(artifacts,{recursive:true});
let server;
try{const response=await fetch(`http://127.0.0.1:${port}/scripts/blender-preview.html`);if(!response.ok)throw new Error();}catch{server=spawn(process.execPath,[path.join(root,'node_modules','vite','bin','vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});}
async function ready(){for(let i=0;i<60;i++){try{const response=await fetch(`http://127.0.0.1:${port}/scripts/blender-preview.html`);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Vite preview did not start');}
let app;
try{
  await ready();const env={...process.env,MATE_TEST_USER_DATA:mkdtempSync(path.join(artifacts,'profile-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.MATE_DEV_URL;
  app=await electron.launch({args:[root],env,timeout:30000});await app.firstWindow();
  const preview=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow})=>{global.blenderPreview=new BrowserWindow({show:false,width:720,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});global.blenderPreview.loadURL('about:blank');});
  const page=await preview;await page.setViewportSize({width:720,height:900});
  const reports=[];
  for(const name of ['Hsin','Suoming']){
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/scripts/blender-preview.html?model=/local-only/blender/${name}.glb`);
    await page.locator('body[data-ready]').waitFor({timeout:60000});
    assert.equal(await page.locator('body').getAttribute('data-ready'),'true',await page.locator('body').getAttribute('data-error'));
    const report=JSON.parse(await page.locator('body').getAttribute('data-report'));assert.ok(report.skinned>0);assert.ok(report.meshes>0);assert.ok(report.bones>=15,`${name} mapped only ${report.bones} motion bones`);assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(artifacts,`${name}.png`),omitBackground:false});reports.push({name,...report});
  }
  console.log(JSON.stringify(reports,null,2));
}finally{await app?.evaluate(({app})=>app.quit()).catch(()=>{});await app?.close().catch(()=>{});server?.kill();}
