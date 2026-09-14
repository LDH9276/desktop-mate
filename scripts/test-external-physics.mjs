import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='artifacts/external-physics';mkdirSync(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:700,height:850}}),reports=[];page.on('pageerror',e=>console.error(e));
 for(const [name,model] of [['sandrone','/artifacts/user-collision-model/桑多涅.pmx'],['denia','/local-only/restricted-models/denia/blue/model.pmx']]){
  for(const [mode,c,h] of [['off',0,0],['cloth',.35,0],['hair',0,.35],['both',.35,.35],['full',1,1]]){
   await page.goto(server.resolvedUrls.local[0]+'scripts/external-physics-preview.html?'+new URLSearchParams({model}));await page.waitForSelector('body[data-ready="true"]',{timeout:60000});
   const result=await page.evaluate(([c,h])=>window.study(c,h),[c,h]);
   assert.ok(result.maximumJump < (mode==='full' ? .065 : .025),`${name} ${mode}: excessive late-idle angular jump`);
   reports.push({name,mode,...result});console.log(JSON.stringify(reports.at(-1)));
   await page.screenshot({path:`${out}/${name}-${mode}.png`});
  }
 }
 writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));
}finally{await browser.close();await server.close();}
