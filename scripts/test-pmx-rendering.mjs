import { _electron as electron } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { ModelLibrary } from '../electron/model-library.cjs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),artifacts=path.join(root,'artifacts','pmx-rendering');
mkdirSync(artifacts,{recursive:true});
const profile=mkdtempSync(path.join(artifacts,'profile-')),library=new ModelLibrary(path.join(profile,'model-library'));
const {models}=await library.importZip(path.join(root,'..','Denia.zip'));
const server=await createServer({server:{host:'127.0.0.1',port:5194,strictPort:true}});await server.listen();
const env={...process.env,MATE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.MATE_DEV_URL;
let app;
try{
  app=await electron.launch({args:[root,'--force-device-scale-factor=1'],env,timeout:30000});await app.firstWindow();
  const pending=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow})=>{
    global.pmxAudit=new BrowserWindow({show:false,width:900,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
    global.pmxAudit.loadURL('about:blank');
  });
  const page=await pending,reports=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:900,height:900});
  for(const [i,model] of models.entries()){
    const file=await library.resolve(model.url),modelURL='/'+path.relative(root,file).replaceAll('\\','/');
    for(const fixed of [false,true]){
      await page.goto('http://127.0.0.1:5194/scripts/pmx-rendering-preview.html?'+new URLSearchParams({model:modelURL,fixed:String(fixed)}));
      await page.waitForSelector('body[data-ready="true"]',{timeout:60000});
      assert.equal(await page.getAttribute('body','data-error'),null);
      const alpha=await page.evaluate(()=>window.checkOutlineAlpha());
      if(fixed){
        assert.equal(alpha.empty[3],0,'outline must discard invisible texture texels');
        assert.ok(Math.abs(alpha.partial[3]-128)<=1,'outline must preserve partial coverage');
      }else assert.equal(alpha.empty[3],255,'baseline must reproduce solid invisible outline');
      const materials=await page.evaluate(()=>window.materialReport);
      if(fixed) {
        const hair=materials.filter(m=>/发\+/.test(m.name));
        assert.equal(hair.length,2);
        for(const m of hair){assert.ok(Number.isInteger(m.overlayOf));assert.equal(m.outline.visible,false);assert.equal(m.depthWrite,false);}
      }
      reports.push({model:model.name,fixed,alpha,materials});
      for(const [view,angle] of [['front',0],['side',.65],['opposite',-.65]]){
        await page.evaluate(angle=>window.draw(angle),angle);
        await page.screenshot({path:path.join(artifacts,i+'-'+(fixed?'after':'before')+'-'+view+'.png')});
      }
      if(fixed){
        await page.evaluate(()=>window.draw(.35,true,true));
        await page.screenshot({path:path.join(artifacts,i+'-shadow-study.png')});
      }
    }
  }
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({result:'passed',errors,reports},null,2));
  console.log(JSON.stringify({result:'passed',models:models.map(m=>m.name),artifacts}));
}finally{await app?.evaluate(({app})=>app.quit()).catch(()=>{});await app?.close().catch(()=>{});await server.close();}
