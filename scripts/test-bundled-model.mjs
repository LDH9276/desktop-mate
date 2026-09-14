import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const artifacts=path.join(root,'artifacts');
mkdirSync(artifacts,{recursive:true});
const env={...process.env,MATE_TEST_USER_DATA:mkdtempSync(path.join(artifacts,'bundled-model-'))};
delete env.ELECTRON_RUN_AS_NODE;
delete env.MATE_DEV_URL;
const app=await electron.launch({args:[root,'--force-device-scale-factor=1'],env,timeout:30000});
try {
  const page=await app.firstWindow();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.waitForSelector('.avatar-renderer[data-model="syaoty"][data-loaded="true"][data-model-license="CC0-1.0"]',{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('.avatar-renderer')?.dataset.physics==='active',{timeout:60000});
  const state=await page.locator('.avatar-renderer').evaluate(node=>({
    model:node.dataset.model,
    license:node.dataset.modelLicense,
    physics:node.dataset.physics,
    bodies:Number(node.dataset.physicsBodies||0),
    constraints:Number(node.dataset.physicsConstraints||0),
    grants:Number(node.dataset.mmdGrants||0),
    motionClips:Number(node.dataset.motionClips||0),
  }));
  assert.equal(state.model,'syaoty');
  assert.equal(state.license,'CC0-1.0');
  assert.equal(state.physics,'active');
  assert.ok(state.bodies>0);
  assert.ok(state.constraints>0);
  assert.ok(state.grants>0);
  assert.ok(state.motionClips>0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(artifacts,'bundled-syaoty.png'),omitBackground:true});
  console.log(JSON.stringify({result:'passed',...state}));
} finally {
  await app.evaluate(({app})=>app.quit()).catch(()=>{});
  await app.close().catch(()=>{});
}
