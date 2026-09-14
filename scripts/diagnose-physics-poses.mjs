import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const weight=Number(process.argv[3]||.35);
const out='artifacts/physics-poses';mkdirSync(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:700,height:850}}),reports=[];page.on('pageerror',e=>console.error(e));
 for(const [name,model] of [['denia-red','/local-only/restricted-models/denia/red/model.pmx'],['sandrone','/artifacts/user-collision-model/桑多涅.pmx']]){
  for(const state of weight===1?['annoyed','drag']:['idle','annoyed','drag']){
   await page.goto(server.resolvedUrls.local[0]+'scripts/external-physics-preview.html?'+new URLSearchParams({model}));await page.waitForSelector('body[data-ready="true"]',{timeout:60000});
   const result=await page.evaluate(([state,weight])=>window.study(weight,weight,state,1/30),[state,weight]);
   assert.ok(result.maximumJump<(weight===1?.065:state==='drag'?.04:.015),`${name} ${state}: angular jump`);
   assert.ok(result.maximumPositionJump<.05*weight+.0001,`${name} ${state}: positional jump`);
   reports.push({name,state,...result});console.log(JSON.stringify(reports.at(-1)));
   await page.screenshot({path:`${out}/${name}-${state}-${weight}.png`});
  }
 }
 writeFileSync(`${out}/${process.argv[2]||'report'}.json`,JSON.stringify(reports,null,2));
}finally{await browser.close();await server.close();}
