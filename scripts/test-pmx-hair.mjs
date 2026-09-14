import { _electron as electron } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync,mkdtempSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'artifacts','pmx-rendering');mkdirSync(out,{recursive:true});
const profile=mkdtempSync(path.join(out,'hair-profile-')),env={...process.env,MATE_TEST_USER_DATA:profile};
delete env.ELECTRON_RUN_AS_NODE;delete env.MATE_DEV_URL;
const server=await createServer({server:{host:'127.0.0.1',port:5195,strictPort:true}});await server.listen();
let app;
try{
  app=await electron.launch({args:[root],env,timeout:30000});await app.firstWindow();
  const pending=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow})=>{global.hairAudit=new BrowserWindow({show:false,width:900,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});global.hairAudit.loadURL('about:blank');});
  const page=await pending,errors=[],reports=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:900,height:900});
  for(const [label,legacy,weight] of [['before',true,.35],['after',false,.35],['full',false,1]]){
    await page.goto('http://127.0.0.1:5195/scripts/pmx-rendering-preview.html?'+new URLSearchParams({model:'/artifacts/user-collision-model/桑多涅.pmx'}));
    await page.waitForSelector('body[data-ready="true"]',{timeout:60000});
    assert.equal(await page.getAttribute('body','data-error'),null);
    const report=await page.evaluate(({legacy,weight})=>window.runHairStudy(legacy,weight),{legacy,weight});
    assert.ok(report.finite);assert.ok(report.steps>200);assert.equal(report.bodies,571);
    reports.push(report);
    await page.screenshot({path:path.join(out,'hair-'+label+'.png')});
  }
  assert.ok(reports[1].maxHairAngle>.035,'long hair must retain simulated rotation beyond the ornament cap');
  assert.ok(reports[1].maxHairAngle>reports[0].maxHairAngle+.02,'simulated rotation must survive blending');
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(out,'hair-report.json'),JSON.stringify({result:'passed',reports,errors},null,2));
  console.log(JSON.stringify({result:'passed',reports}));
}finally{await app?.evaluate(({app})=>app.quit()).catch(()=>{});await app?.close().catch(()=>{});await server.close();}
