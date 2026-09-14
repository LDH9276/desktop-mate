// Launches the single portable EXE itself. It never accesses or sends to ChatGPT.
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),artifacts=path.join(root,'artifacts'),version=JSON.parse(readFileSync('package.json')).version;
mkdirSync(artifacts,{recursive:true});const executable=path.join(root,'portable-release',`DesktopMate-${version}-portable.exe`);
const env={...process.env,MATE_TEST_USER_DATA:mkdtempSync(path.join(artifacts,'portable-content-'))};delete env.ELECTRON_RUN_AS_NODE;
const freePort=async()=>{const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;};
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const port=await freePort(),mainPort=await freePort();let launcher,browser,inspector,sequence=0;const pending=new Map();
const mainEval=expression=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(new Error('main inspector timeout')),10000);pending.set(id,{resolve,reject,timer});inspector.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});
try{
  launcher=spawn(executable,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1',`--inspect=127.0.0.1:${mainPort}`],{env,windowsHide:true,stdio:'ignore'});
  let endpoint;for(let i=0;i<180&&!endpoint;i++){try{endpoint=(await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
  assert.ok(endpoint,'portable renderer started');const targets=await (await fetch(`http://127.0.0.1:${mainPort}/json/list`)).json();inspector=new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{inspector.addEventListener('open',resolve,{once:true});inspector.addEventListener('error',reject,{once:true});});
  inspector.addEventListener('message',event=>{const response=JSON.parse(event.data),item=pending.get(response.id);if(!item)return;clearTimeout(item.timer);pending.delete(response.id);response.error||response.result.exceptionDetails?item.reject(new Error(JSON.stringify(response.error||response.result.exceptionDetails))):item.resolve(response.result.result.value);});
  browser=await chromium.connectOverCDP(endpoint);const page=browser.contexts()[0].pages()[0];await page.waitForURL('file:///**/dist/index.html#companion',{timeout:30000});
  await page.waitForSelector('.avatar-renderer[data-model="syaoty"][data-loaded="true"][data-model-license="CC0-1.0"][data-physics="active"]',{timeout:60000});
  const appPath=await mainEval("process.mainModule.require('electron').app.getAppPath()");assert.equal(await mainEval("process.mainModule.require('electron').app.getVersion()"),version);
  assert.equal(hash(path.join(appPath,'native','ChatBridge.exe')),hash(path.join(root,'native','ChatBridge.exe')));
  assert.equal(hash(path.join(appPath,'dist','index.html')),hash(path.join(root,'dist','index.html')),'portable includes the latest renderer build');
  const opened=page.context().waitForEvent('page');await page.getByRole('button',{name:'연결 및 설정',exact:true}).click();const settings=await opened;await settings.waitForSelector('.settings-panel');await expect(settings.getByText(`Version ${version} · 로컬 실행`,{exact:true})).toBeVisible();
  const lighting=settings.getByLabel('조명 강도',{exact:true}),brightness=settings.getByLabel('명도',{exact:true}),saturation=settings.getByLabel('채도',{exact:true});await lighting.fill('0');await page.waitForFunction(()=>document.querySelector('.avatar-renderer')?.dataset.lighting==='0');await brightness.fill('0');await page.waitForFunction(()=>document.querySelector('.avatar-renderer')?.style.filter==='brightness(0) saturate(1)');await brightness.fill('1.5');await saturation.fill('2');await page.waitForFunction(()=>document.querySelector('.avatar-renderer')?.style.filter==='brightness(1.5) saturate(2)');
  const closed=settings.waitForEvent('close');await settings.getByRole('button',{name:'설정 닫기',exact:true}).click().catch(()=>{});await closed;
  const content='# 패키지 서식\n\n**굵게**\n\n| 종류 | 상태 |\n| --- | --- |\n| 이미지 | 완료 |\n\n`코드`';
  const state={status:'connected',conversationId:'portable-content',title:'test',detail:'',messages:[{id:'m',role:'assistant',content,delivery:'complete'}]};
  await mainEval(`(()=>{const {BrowserWindow}=process.mainModule.require('electron');BrowserWindow.getAllWindows()[0].webContents.send('mate:state',${JSON.stringify(state)});return true;})()`);
  const message=page.locator('.message-content');await expect(message.locator('h1')).toHaveText('패키지 서식');await expect(message.locator('strong')).toHaveText('굵게');assert.equal(await message.locator('table').count(),1);assert.equal(await message.locator('code').count(),1);
  const report={result:'passed',version,executable,sha256:hash(executable),model:'syaoty',modelLicense:'CC0-1.0',physics:'active',nativeBridgeMatched:true,visuals:{lighting:[0,1.5],brightness:[0,1.5],saturation:[0,2]},markdown:{heading:true,strong:true,table:true,code:true}};
  writeFileSync(path.join(artifacts,`portable-content-${version}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(inspector?.readyState===WebSocket.OPEN)await mainEval("process.mainModule.require('electron').app.quit();true").catch(()=>{});inspector?.close();if(browser)await browser.close().catch(()=>{});launcher?.unref();}
