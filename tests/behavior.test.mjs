import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionBehavior } from '../src/behavior.mjs';

test('a smooth long drag does not cause dizziness',()=>{
  const b=new CompanionBehavior();b.grab(0,0,1000);
  for(let i=1;i<30;i++){b.move(i*60,0,1000+i*100);b.tick(.05,1000+i*100);}
  assert.equal(b.state,'held');assert.equal(b.energy,0);
  b.release(4100);assert.equal(b.state,'landing');b.tick(.05,5000);assert.equal(b.state,'idle');
});
test('repeated energetic reversals cause dizziness, then recover',()=>{
  const b=new CompanionBehavior();b.grab(0,0,1000);
  for(let i=1;i<=8;i++)b.move(i%2?150:0,0,1000+i*110);
  assert.equal(b.state,'dizzy');assert.ok(b.energy>=65);b.release(2000);
  for(let i=0;i<160;i++)b.tick(.05,2000+i*50);
  assert.equal(b.state,'idle');assert.equal(b.energy,0);
});
test('click reaction and render stalls stay bounded',()=>{
  const b=new CompanionBehavior();b.grab(10,10,100);b.release(120);b.react('happy',120);
  assert.equal(b.state,'happy');b.tick(10,5000);assert.ok(Number.isFinite(b.sway));assert.equal(b.state,'idle');
});
