import { _electron as electron, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=process.cwd(),artifacts=path.join(root,'artifacts');mkdirSync(artifacts,{recursive:true});
const packaged=process.argv.includes('--packaged');
const version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;
const report={version,packaged,startedAt:new Date().toISOString(),cases:[]};
for(const displayScale of [null,2]){
  const env={...process.env,MATE_TEST_USER_DATA:mkdtempSync(path.join(artifacts,'hidpi-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.MATE_DEV_URL;
  const args=displayScale?[`--force-device-scale-factor=${displayScale}`]:[];
  const app=await electron.launch({...(packaged?{executablePath:path.join(root,'portable-release','win-unpacked','DesktopMate.exe'),args}:{args:[root,...args]}),env,timeout:30000});
  try{
    assert.equal(await app.evaluate(({app})=>app.getVersion()),version);
    const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.waitForSelector('.avatar-renderer[data-loaded="true"]',{timeout:60000});
    const measure=()=>page.evaluate(()=>{
      const host=document.querySelector('.avatar-renderer'),canvas=host.querySelector('canvas'),rect=canvas.getBoundingClientRect();
      return {dpr:devicePixelRatio,ratio:Number(host.dataset.pixelRatio),limited:host.dataset.hidpiLimited,width:rect.width,height:rect.height,pixels:[canvas.width,canvas.height],model:host.dataset.model};
    });
    for(const zoom of [1,1.5,2]){
      // Changes only this test app's web contents, including during execution.
      await app.evaluate(({BrowserWindow},zoom)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),zoom);
      await expect.poll(async()=>{const m=await measure();return Math.abs(m.ratio-m.dpr);}).toBeLessThan(0.00001);
      await expect.poll(async()=>{const m=await measure();return Math.max(Math.abs(m.pixels[0]-Math.floor(m.width*m.dpr)),Math.abs(m.pixels[1]-Math.floor(m.height*m.dpr)));}).toBeLessThanOrEqual(1);
      const m=await measure();assert.equal(m.limited,'false');
      if(displayScale)assert.ok(Math.abs(m.dpr-displayScale*zoom)<0.01,'Windows scale and app zoom applied once');
      report.cases.push({displayScale:displayScale??'system',zoom,...m});
    }
    await page.waitForSelector('.avatar-renderer[data-model="mate"][data-model-license="DesktopMate-original"]');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const mate=await measure();assert.equal(mate.ratio,mate.dpr);assert.ok(mate.ratio>1.5);
    report.cases.push({displayScale:displayScale??'system',zoom:2,...mate});
    const screenshot=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toDataURL());
    writeFileSync(path.join(artifacts,`hidpi-${packaged?'packaged':'source'}-${displayScale??'system'}.png`),Buffer.from(screenshot.split(',')[1],'base64'));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({displayScale:displayScale??'system',result:'passed',mate}));
  }finally{await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});}
}
report.result='passed';report.finishedAt=new Date().toISOString();
writeFileSync(path.join(artifacts,`hidpi-${packaged?'packaged':'source'}.json`),JSON.stringify(report,null,2));
