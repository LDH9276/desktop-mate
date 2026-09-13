import { _electron as electron } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { ModelLibrary } from '../electron/model-library.cjs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),artifacts=path.join(root,'artifacts','pmx-transparency');mkdirSync(artifacts,{recursive:true});
const profile=mkdtempSync(path.join(artifacts,'profile-')),library=new ModelLibrary(path.join(profile,'model-library'));
const result=await library.importZip(process.argv[2]||path.join(root,'..','Denia.zip'));
const model=result.models[0],file=await library.resolve(model.url),modelURL='/'+path.relative(root,file).replaceAll('\\','/');
const server=await createServer({server:{host:'127.0.0.1',port:5192,strictPort:true}});await server.listen();
const env={...process.env,MATE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.MATE_DEV_URL;
let app;
try{
  app=await electron.launch({args:[root,'--force-device-scale-factor=1'],env,timeout:30000});await app.firstWindow();
  const pending=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow})=>{global.pmxPreview=new BrowserWindow({show:false,width:900,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});global.pmxPreview.loadURL('about:blank');});
  const page=await pending;const reports=[];
  await page.setViewportSize({width:900,height:1000});
  for(const fixed of [false,true]){
    await page.goto(`http://127.0.0.1:5192/scripts/pmx-transparency-preview.html?model=${encodeURIComponent(modelURL)}&fixed=${fixed}`);
    await page.waitForSelector('body[data-ready="true"]',{timeout:60000});
    assert.equal(await page.getAttribute('body','data-error'),null);
    reports.push({fixed,materials:await page.evaluate(()=>window.materialReport)});
    if(fixed){
      const pixels=await page.evaluate(()=>window.checkCompositing());
      assert.equal(pixels.before.invisible[3],0,'old PMX depth writing reproduces a hole through the hair');
      assert.equal(pixels.after.invisible[3],255,'invisible fur must retain the opaque hair behind it');
      assert.equal(pixels.after.partial[3],255,'partial fur coverage must retain background model alpha');
      assert.equal(pixels.isolated.invisible[3],0,'empty desktop stays transparent');
      assert.ok(Math.abs(pixels.isolated.partial[3]-128)<=1,'isolated half coverage must not be squared');
      assert.ok(pixels.occlusion.partial.slice(0,3).every(value=>value>=254),'opaque front texels must hide a later transparent material group');
      reports.push({compositing:pixels});
    }
    for(const [name,angle] of [['front',0],['side',.65],['opposite',-.65]]){
      await page.evaluate(angle=>window.draw(angle),angle);
      await page.screenshot({path:path.join(artifacts,`${fixed?'after':'before'}-${name}.png`)});
      if(name==='side')await page.screenshot({path:path.join(artifacts,`${fixed?'after':'before'}-shoulder.png`),clip:{x:170,y:280,width:540,height:350}});
    }
  }
  writeFileSync(path.join(artifacts,'materials.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({result:'passed',artifacts,model:model.name}));
}finally{await app?.evaluate(({app})=>app.quit()).catch(()=>{});await app?.close().catch(()=>{});await server.close();}
