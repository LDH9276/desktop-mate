import { _electron as electron } from '@playwright/test';
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=process.cwd(),artifacts=path.join(root,'artifacts');mkdirSync(artifacts,{recursive:true});
const packaged=process.argv.includes('--packaged');
const env={...process.env,MATE_TEST_USER_DATA:mkdtempSync(path.join(artifacts,'outline-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.MATE_DEV_URL;
const launch=()=>electron.launch({...(packaged?{executablePath:path.join(root,'portable-release','win-unpacked','DesktopMate.exe'),args:['--force-device-scale-factor=2']}:{args:[root,'--force-device-scale-factor=2']}),env,timeout:30000});
let app=await launch();
const version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;
const report={version,packaged,cases:[],settings:[]};
async function firstPage(){
  const page=await app.firstWindow();
  page.setDefaultTimeout(30000);
  return page;
}
const capture=()=>app.evaluate(async({BrowserWindow})=>{
  const picture=await BrowserWindow.getAllWindows()[0].webContents.capturePage();
  return {png:picture.toPNG().toString('base64'),bitmap:picture.toBitmap().toString('base64'),...picture.getSize()};
});
try{
  assert.equal(await app.evaluate(({app})=>app.getVersion()),version);
  const page=await firstPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('.avatar-renderer[data-loaded="true"]',{timeout:60000});
  await page.evaluate(()=>window.mate.setWindowScale(1));
  await page.getByRole('button',{name:'채팅 접기',exact:true}).dispatchEvent('click');
  await page.evaluate(()=>document.body.style.setProperty('background','#f5f5f2','important'));
  for(const [id,label] of [['syaoty','Syaoty']]){
    await page.getByRole('button',{name:'연결 및 설정',exact:true}).dispatchEvent('click');
    await page.getByRole('radio',{name:`${label} 모델 선택`,exact:true}).dispatchEvent('click');
    await page.waitForSelector(`.avatar-renderer[data-model="${id}"][data-loaded="true"]`,{timeout:60000});
    await page.getByRole('button',{name:'설정 닫기',exact:true}).dispatchEvent('click');
    await page.locator('.settings-panel').waitFor({state:'detached'});
    // Freeze only this test renderer between captures, so the difference must
    // come from the outline rather than a blink or animation pose.
    await page.evaluate(()=>{window.savedMateRaf=window.requestAnimationFrame;window.matePausedFrames=[];window.requestAnimationFrame=callback=>{window.matePausedFrames.push(callback);return 0;};});
    await new Promise(resolve=>setTimeout(resolve,200));
    const filter=await page.locator('.avatar-renderer canvas').evaluate(canvas=>{const filter=canvas.style.filter;canvas.style.filter='none';return filter;});
    await new Promise(resolve=>setTimeout(resolve,100));const before=await capture();
    await page.locator('.avatar-renderer canvas').evaluate((canvas,filter)=>{canvas.style.filter=filter;},filter);
    await new Promise(resolve=>setTimeout(resolve,100));const after=await capture();
    const a=Buffer.from(before.bitmap,'base64'),b=Buffer.from(after.bitmap,'base64');assert.equal(a.length,b.length);
    let changed=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>12)changed++;
    assert.ok(changed>100,`${id}: actual outline pixels must be visible`);
    assert.ok(changed<after.width*after.height*0.15,`${id}: outline must stay narrow`);
    const metrics=await page.evaluate(()=>{const h=document.querySelector('.avatar-renderer');return{dpr:devicePixelRatio,ratio:Number(h.dataset.pixelRatio),outline:h.dataset.outline,feather:Number(h.querySelector('feGaussianBlur').getAttribute('stdDeviation'))};});
    assert.equal(metrics.ratio,metrics.dpr);assert.equal(metrics.outline,'silhouette');
    assert.equal(metrics.feather,0.8);
    report.cases.push({id,changedPixels:changed,...metrics});
    writeFileSync(path.join(artifacts,`outline-${packaged?'packaged':'source'}-${id}.png`),Buffer.from(after.png,'base64'));
    await page.evaluate(()=>{window.requestAnimationFrame=window.savedMateRaf;for(const callback of window.matePausedFrames)requestAnimationFrame(callback);delete window.matePausedFrames;delete window.savedMateRaf;});
  }
  // Exercise the actual controls on one frozen pose, comparing rendered pixels
  // and keeping the same WebGL canvas (setting changes must not reload a model).
  await page.evaluate(()=>{window.outlineCanvas=document.querySelector('.avatar-renderer canvas');window.savedMateRaf=window.requestAnimationFrame;window.matePausedFrames=[];window.requestAnimationFrame=callback=>{window.matePausedFrames.push(callback);return 0;};});
  await new Promise(resolve=>setTimeout(resolve,200));
  const filter=await page.locator('.avatar-renderer canvas').evaluate(canvas=>{const value=canvas.style.filter;canvas.style.filter='none';return value;});
  await new Promise(resolve=>setTimeout(resolve,100));const bare=await capture();
  await page.locator('.avatar-renderer canvas').evaluate((canvas,value)=>{canvas.style.filter=value;},filter);
  const pixelsChanged=(first,second)=>{
    const a=Buffer.from(first.bitmap,'base64'),b=Buffer.from(second.bitmap,'base64');assert.equal(a.length,b.length);
    let count=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>12)count++;
    return count;
  };
  let defaultPixels=0;
  for(const [name,color,transparency,thickness] of [['default','#343941',5,1],['thick','#ff3388',0,8],['soft','#ff3388',65,8],['transparent','#ff3388',100,8],['zero','#ff3388',0,0],['saved','#276ef1',35,3.5]]){
    await page.getByRole('button',{name:'연결 및 설정',exact:true}).dispatchEvent('click');
    await page.getByLabel('외곽선 색상',{exact:true}).fill(color);
    await page.getByLabel('외곽선 투명도',{exact:true}).fill(String(transparency));
    await page.getByLabel('외곽선 두께',{exact:true}).fill(String(thickness));
    await page.getByRole('button',{name:'설정 닫기',exact:true}).dispatchEvent('click');
    await page.locator('.settings-panel').waitFor({state:'detached'});
    await new Promise(resolve=>setTimeout(resolve,150));
    const actual=await page.evaluate(()=>({
      sameCanvas:window.outlineCanvas===document.querySelector('.avatar-renderer canvas'),
      color:document.querySelector('feFlood').getAttribute('flood-color'),
      opacity:Number(document.querySelector('feFlood').getAttribute('flood-opacity')),
      thickness:Number(document.querySelector('feMorphology').getAttribute('radius')),
      saved:JSON.parse(localStorage.getItem('mate.outline')),
    }));
    assert.ok(actual.sameCanvas);assert.equal(actual.color,color);assert.equal(actual.thickness,thickness);
    assert.ok(Math.abs(actual.opacity-(thickness>0?1-transparency/100:0))<0.000001);
    if(name!=='default')assert.deepEqual(actual.saved,{color,opacity:1-transparency/100,thickness,mmdToon:false,mmdToonThickness:1,mmdToonColor:'#343941'});
    const picture=await capture(),changedPixels=pixelsChanged(bare,picture);
    if(name==='default'){defaultPixels=changedPixels;assert.ok(changedPixels>100);}
    if(name==='thick')assert.ok(changedPixels>defaultPixels*2,'larger thickness must enlarge the visible outline');
    if(name==='transparent'||name==='zero')assert.ok(changedPixels<20,`${name}: outline should disappear`);
    report.settings.push({name,...actual,changedPixels});
    if(name==='saved')writeFileSync(path.join(artifacts,`outline-${packaged?'packaged':'source'}-custom.png`),Buffer.from(picture.png,'base64'));
  }
  assert.ok(report.settings.find(x=>x.name==='soft').changedPixels<report.settings.find(x=>x.name==='thick').changedPixels,'increased transparency must soften the actual stroke');
  await page.evaluate(()=>{window.requestAnimationFrame=window.savedMateRaf;for(const callback of window.matePausedFrames)requestAnimationFrame(callback);});
  await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});
  app=await launch();const restoredPage=await firstPage();
  await restoredPage.waitForSelector('.avatar-renderer[data-loaded="true"]',{timeout:60000});
  const restored=await restoredPage.evaluate(()=>({color:document.querySelector('feFlood').getAttribute('flood-color'),opacity:Number(document.querySelector('feFlood').getAttribute('flood-opacity')),thickness:Number(document.querySelector('feMorphology').getAttribute('radius'))}));
  assert.deepEqual(restored,{color:'#276ef1',opacity:0.65,thickness:3.5});report.restored=restored;
  await restoredPage.getByRole('button',{name:'연결 및 설정',exact:true}).dispatchEvent('click');
  await restoredPage.locator('.outline-settings').scrollIntoViewIfNeeded();
  await restoredPage.evaluate(()=>document.querySelector('.outline-settings').scrollIntoView({block:'center',behavior:'instant'}));
  await restoredPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await new Promise(resolve=>setTimeout(resolve,150));
  writeFileSync(path.join(artifacts,`outline-${packaged?'packaged':'source'}-settings.png`),Buffer.from((await capture()).png,'base64'));
  await restoredPage.getByRole('button',{name:'모든 외곽선 초기화',exact:true}).dispatchEvent('click');
  assert.deepEqual(await restoredPage.evaluate(()=>JSON.parse(localStorage.getItem('mate.outline'))),{color:'#343941',opacity:0.95,thickness:1,mmdToon:false,mmdToonThickness:1,mmdToonColor:'#343941'});
  assert.deepEqual(errors,[]);report.result='passed';console.log(JSON.stringify(report));
  writeFileSync(path.join(artifacts,`outline-${packaged?'packaged':'source'}.json`),JSON.stringify(report,null,2));
}finally{await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});}
