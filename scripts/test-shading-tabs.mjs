import {_electron as electron,expect} from '@playwright/test';
import {cpSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'artifacts/shading-tabs');mkdirSync(out,{recursive:true});
const profile=mkdtempSync(path.join(out,'profile-')),archive='abc123abc123abc123abc123';mkdirSync(path.join(profile,'model-library'),{recursive:true});
cpSync('local-only/restricted-models/denia/red',path.join(profile,'model-library',archive),{recursive:true});
writeFileSync(path.join(profile,'model-library/catalog.json'),JSON.stringify([{id:'zip-shading-denia',archive,file:'model.pmx',name:'Denia red',creator:'local',kind:'pmx',loadingName:'Denia',url:`mate-model://${archive}/model.pmx`}]));
const env={...process.env,MATE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>electron.launch({args:[root],env});let app=await launch();const errors=[];
async function settingsFor(page){const opened=app.waitForEvent('window');await page.getByRole('button',{name:'연결 및 설정',exact:true}).click();const settings=await opened;settings.on('pageerror',e=>errors.push(e.message));await settings.waitForSelector('.settings-tabs');return settings;}
try{
 let page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.avatar-renderer[data-loaded="true"]',{timeout:60000});
 let settings=await settingsFor(page);const tabs=settings.getByRole('tab');await expect(tabs).toHaveText(['채팅창','모델설정','GPT연결']);
 await settings.getByRole('tab',{name:'채팅창',exact:true}).click();await expect(settings.getByText('채팅창 모양과 글꼴',{exact:true})).toBeVisible();await expect(settings.getByRole('slider',{name:'그림자 강도',exact:true})).toHaveCount(0);
 await settings.getByRole('tab',{name:'GPT연결',exact:true}).click();await expect(settings.getByLabel('ChatGPT 대화 주소')).toBeVisible();
 await settings.getByRole('tab',{name:'모델설정',exact:true}).click();await settings.getByRole('radio',{name:'Denia red 모델 선택',exact:true}).click();
 const avatar=page.locator('.avatar-renderer');await expect(avatar).toHaveAttribute('data-model','zip-shading-denia');await expect(avatar).toHaveAttribute('data-loaded','true',{timeout:60000});await expect(avatar).toHaveAttribute('data-unshadowed-eye-materials','4');
 const slider=settings.getByRole('slider',{name:'그림자 강도',exact:true});
 await slider.fill('0');await expect(avatar).toHaveAttribute('data-shadow','0');
 await avatar.screenshot({path:path.join(out,'shadow-off.png')});
 await slider.fill('1');await expect(avatar).toHaveAttribute('data-shadow','1');await avatar.screenshot({path:path.join(out,'shadow-full.png')});
 await slider.fill('0.65');await expect(avatar).toHaveAttribute('data-shadow','0.65');
 await settings.screenshot({path:path.join(out,'model-tab.png')});
 await app.close();app=await launch();page=await app.firstWindow();await expect(page.locator('.avatar-renderer')).toHaveAttribute('data-shadow','0.65',{timeout:60000});settings=await settingsFor(page);await expect(settings.getByRole('slider',{name:'그림자 강도',exact:true})).toHaveValue('0.65');
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,tabs:3,eyeMaterials:4,shadow:[0,1,.65],persisted:true,realGptMessages:0},null,2));console.log('Passed: three tabs, live PMX shadow strength, unshadowed eyes, persistence. No GPT messages.');
}finally{await app.close();}
