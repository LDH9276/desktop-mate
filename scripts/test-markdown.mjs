import { _electron as electron, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=process.cwd(),artifacts=path.join(root,'artifacts');mkdirSync(artifacts,{recursive:true});
const packaged=process.argv.includes('--packaged');
const env={...process.env,MATE_TEST_USER_DATA:mkdtempSync(path.join(artifacts,'markdown-'))};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch(packaged?{executablePath:path.join(root,'portable-release','win-unpacked','DesktopMate.exe'),env,timeout:30000}:{args:[root],env,timeout:30000});
try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('.avatar-renderer[data-loaded="true"]',{timeout:60000});
  const content='# 서식 확인\n\n**굵은 글씨**와 *기울임* 및 `인라인 코드`\n\n- 첫 항목\n- 둘째 항목\n\n| 항목 | 값 |\n| --- | ---: |\n| 사과 | 2 |\n| 배 | 3 |\n\n> 인용문\n\n```js\nconst safe = true;\n```\n\n[외부 링크](https://example.com) ![원격 그림](https://example.com/a.png)\n\n<script>window.markdownUnsafe=true</script>';
  await app.evaluate(({BrowserWindow},state)=>BrowserWindow.getAllWindows()[0].webContents.send('mate:state',state),{status:'connected',conversationId:'markdown-test',title:'Markdown',detail:'',messages:[{id:'assistant-markdown',role:'assistant',content,delivery:'complete'}]});
  const message=page.locator('.message.assistant .message-content');await expect(message).toBeVisible();
  await expect(message.locator('h1')).toHaveText('서식 확인');await expect(message.locator('strong')).toHaveText('굵은 글씨');
  await expect(message.locator('em')).toHaveText('기울임');assert.equal(await message.locator('li').count(),2);
  assert.equal(await message.locator('table').count(),1);assert.equal(await message.locator('th').count(),2);assert.equal(await message.locator('td').count(),4);
  assert.equal(await message.locator('pre code').count(),1);assert.equal(await message.locator('blockquote').count(),1);
  assert.equal(await message.locator('a,img,script').count(),0);await expect(message.locator('.markdown-link')).toHaveText('외부 링크');await expect(message.locator('.markdown-image')).toHaveText('이미지: 원격 그림');
  assert.equal(await page.evaluate(()=>window.markdownUnsafe),undefined);assert.deepEqual(errors,[]);
  const picture=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  const suffix=packaged?'packaged':'source';
  writeFileSync(path.join(artifacts,`markdown-render-${suffix}.png`),Buffer.from(picture,'base64'));
  writeFileSync(path.join(artifacts,`markdown-render-${suffix}.json`),JSON.stringify({result:'passed',packaged,elements:{heading:1,strong:1,listItems:2,tableCells:4,codeBlock:1,blockquote:1},rawHtml:'escaped',externalMedia:'not loaded'},null,2));
  console.log('Markdown UI passed: headings, emphasis, lists, GFM table, quote and code; raw HTML and external media stayed inert.');
}finally{await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});}
