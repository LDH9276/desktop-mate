import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdirSync} from 'node:fs';
const out='artifacts/shading-study';mkdirSync(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,watch:{ignored:['**/artifacts/**','**/portable-release/**']}}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:1100}});page.on('pageerror',e=>console.error(e));
 await page.goto(server.resolvedUrls.local[0]+'scripts/shading-study.html');await page.waitForSelector('body[data-ready="true"]',{timeout:60000});
 console.log(await page.evaluate(()=>window.materials));
 for(const shaded of [false,true]){console.log(await page.evaluate(s=>window.draw(s),shaded));await page.screenshot({path:`${out}/${shaded?'shaded':'current'}.png`});}
}finally{await browser.close();await server.close();}
