import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { ChatSession }=createRequire(import.meta.url)('../electron/bridge.cjs');
function fake(responses={}){const calls=[];return {calls,request:async(command,payload)=>{calls.push({command,payload});if(responses[command])return responses[command](payload);if(command==='connect')return {connected:true,conversationId:'chat-one',title:'ChatGPT'};if(command==='poll')return {complete:true,text:'원문 답변'};return {};}};}
test('disconnected sessions cannot send',async()=>{const t=fake(),s=new ChatSession(t);await assert.rejects(s.send('hello'),/연결/);assert.equal(t.calls.length,0);});
test('target conversation URL is validated and forwarded',async()=>{
  const t=fake(),s=new ChatSession(t),url='https://chatgpt.com/c/00000000-0000-4000-8000-000000000000';
  await s.scan(url);await s.connect(123,url);
  assert.deepEqual(t.calls.slice(0,2),[{command:'scan',payload:{targetUrl:url}},{command:'connect',payload:{windowId:123,targetUrl:url}}]);
  await assert.rejects(s.scan('https://example.com/c/not-chatgpt'),/올바른 ChatGPT/);
});
test('one connection carries multiple messages and returns unmodified answers',async()=>{
  const t=fake(),s=new ChatSession(t,{wait:async()=>{}});await s.connect(123);await s.send('첫 질문');await s.send('두 번째 질문');
  assert.equal(t.calls.filter(c=>c.command==='connect').length,1);assert.equal(t.calls.filter(c=>c.command==='send').length,2);
  assert.deepEqual(s.snapshot().messages.map(m=>m.content),['첫 질문','원문 답변','두 번째 질문','원문 답변']);assert.equal(s.snapshot().conversationId,'chat-one');
});
test('unknown send result is never retried and blocks future sends',async()=>{
  const t=fake({send:async()=>{throw new Error('unknown outcome');}}),s=new ChatSession(t);await s.connect(123);
  await assert.rejects(s.send('한 번만'),/unknown/);await assert.rejects(s.send('한 번만'),/연결/);
  assert.equal(t.calls.filter(c=>c.command==='send').length,1);assert.equal(s.snapshot().status,'uncertain');assert.equal(s.snapshot().messages[0].delivery,'unknown');
});
test('a definite pre-send draft rejection preserves the message and allows explicit retry',async()=>{
  let attempts=0;
  const t=fake({send:async()=>{if(++attempts===1)throw Object.assign(new Error('draft detected'),{code:'COMPOSER_NOT_EMPTY',notSent:true});return {sent:true};}});
  const s=new ChatSession(t,{wait:async()=>{}});await s.connect(123);
  await assert.rejects(s.send('보존할 질문'),/draft detected/);
  assert.equal(s.snapshot().status,'connected');
  assert.equal(s.snapshot().messages[0].delivery,'not_sent');
  assert.equal(s.snapshot().messages[0].content,'보존할 질문');
  assert.equal(t.calls.filter(c=>c.command==='poll').length,0);
  assert.equal(attempts,1,'never retries automatically');
  await s.send('보존할 질문');
  assert.equal(attempts,2);assert.equal(s.snapshot().messages[1].delivery,'sent');
  assert.equal(s.snapshot().messages[2].delivery,'complete');
});
test('pre-send metadata cannot downgrade an uncertain response after send succeeded',async()=>{
  const t=fake({poll:async()=>{throw Object.assign(new Error('poll failed'),{notSent:true});}});
  const s=new ChatSession(t,{wait:async()=>{}});await s.connect(123);
  await assert.rejects(s.send('한 번만 전송'),/poll failed/);
  assert.equal(s.snapshot().status,'uncertain');assert.equal(s.snapshot().messages[0].delivery,'sent');
  assert.equal(t.calls.filter(c=>c.command==='send').length,1);
});
test('session changes interrupt reception without resending',async()=>{
  const t=fake({poll:async()=>{throw new Error('session changed');}}),s=new ChatSession(t,{wait:async()=>{}});await s.connect(123);await assert.rejects(s.send('질문'),/session changed/);
  assert.equal(s.snapshot().status,'uncertain');assert.equal(t.calls.filter(c=>c.command==='send').length,1);
});
test('concurrent submissions and reconnects are blocked',async()=>{
  let resolve;const t=fake({send:()=>new Promise(r=>resolve=r)}),s=new ChatSession(t,{wait:async()=>{}});await s.connect(123);const first=s.send('첫 번째');
  await assert.rejects(s.send('두 번째'),/기다려/);await assert.rejects(s.connect(456),/기다려/);resolve({sent:true});await first;
});
test('response timeout preserves the message and requires explicit recovery',async()=>{
  let now=0;const t=fake({poll:async()=>({complete:false,text:'부분 답변'})}),s=new ChatSession(t,{wait:async()=>{now+=700;},now:()=>now,timeout:1000});
  await s.connect(123);await assert.rejects(s.send('질문'),/자동 재전송/);assert.equal(s.snapshot().messages[1].delivery,'incomplete');assert.equal(t.calls.filter(c=>c.command==='send').length,1);
});
test('closing ChatGPT makes the existing session unavailable',async()=>{
  const t=fake({status:async()=>{throw new Error('ChatGPT closed');}}),s=new ChatSession(t);await s.connect(123);await s.refresh();assert.equal(s.snapshot().status,'disconnected');
});

test('temporary accessibility loss preserves history and reconnects the same session',async()=>{
  let unavailable=true;
  const t=fake({status:async()=>{if(unavailable)throw Object.assign(new Error('window minimized'),{retryable:true});return {};}});
  const s=new ChatSession(t,{wait:async()=>{}});await s.connect(123);await s.send('이전 질문');
  const before=s.snapshot();await s.refresh();
  assert.equal(s.snapshot().status,'reconnecting');assert.deepEqual(s.snapshot().messages,before.messages);
  await assert.rejects(s.send('아직 전송 금지'),/연결/);
  unavailable=false;await s.refresh();
  assert.equal(s.snapshot().status,'connected');assert.equal(s.snapshot().conversationId,before.conversationId);
  assert.equal(t.calls.filter(c=>c.command==='connect').length,1);
  assert.equal(t.calls.filter(c=>c.command==='send').length,1);
});

test('unavailable time does not consume response timeout or resend a pending message',async()=>{
  let now=0,polls=0;const states=[];
  const t=fake({poll:async()=>{
    polls++;
    if(polls===1)return {complete:false,text:'첫 문장'};
    if(polls<=4){now+=180000;throw Object.assign(new Error('accessibility tree unavailable'),{retryable:true});}
    return {complete:true,text:'첫 문장\n최종 답변'};
  }});
  const s=new ChatSession(t,{wait:async()=>{now+=700;},now:()=>now,timeout:3000});
  s.on('change',state=>states.push(state));await s.connect(123);await s.send('한 번만 보내기');
  assert.equal(polls,5);assert.equal(t.calls.filter(c=>c.command==='send').length,1);
  assert.equal(s.snapshot().status,'connected');assert.equal(s.snapshot().messages[1].delivery,'complete');
  assert.equal(s.snapshot().messages[1].content,'첫 문장\n최종 답변');
  assert.ok(states.some(state=>state.detail.includes('이미 보낸 메시지는 재전송하지 않고')));
  assert.ok(!states.some(state=>state.status==='uncertain'));
});

test('pre-send unavailability waits for validation and never queues an automatic send',async()=>{
  let attempts=0;
  const t=fake({send:async()=>{attempts++;throw Object.assign(new Error('minimized'),{retryable:true,notSent:true});}});
  const s=new ChatSession(t);await s.connect(123);await assert.rejects(s.send('보존할 질문'),/minimized/);
  assert.equal(s.snapshot().status,'reconnecting');assert.equal(s.snapshot().messages[0].delivery,'not_sent');
  await s.refresh();assert.equal(s.snapshot().status,'connected');assert.equal(attempts,1);
  assert.equal(t.calls.filter(c=>c.command==='poll').length,0);
});

test('retryable metadata cannot cause an ambiguous send to run again',async()=>{
  const t=fake({send:async()=>{throw Object.assign(new Error('Invoke outcome unknown'),{retryable:true});}});
  const s=new ChatSession(t);await s.connect(123);await assert.rejects(s.send('질문'),/Invoke/);
  assert.equal(s.snapshot().status,'uncertain');assert.equal(s.snapshot().messages[0].delivery,'unknown');
  await s.refresh();assert.equal(t.calls.filter(c=>c.command==='send').length,1);
});

test('a changed transcript after temporary loss remains a fatal reception error',async()=>{
  let polls=0;
  const t=fake({poll:async()=>{if(++polls===1)throw Object.assign(new Error('stale element'),{retryable:true});throw new Error('transcript changed');}});
  const s=new ChatSession(t,{wait:async()=>{}});await s.connect(123);await assert.rejects(s.send('질문'),/transcript changed/);
  assert.equal(s.snapshot().status,'uncertain');assert.equal(t.calls.filter(c=>c.command==='send').length,1);
});

test('background status verification does not reject a simultaneous user send',async()=>{
  let finishStatus;
  const t=fake({status:()=>new Promise(resolve=>{finishStatus=resolve;})});
  const s=new ChatSession(t,{wait:async()=>{}});await s.connect(123);
  const refresh=s.refresh(),send=s.send('정상 전송');
  assert.equal(t.calls.filter(c=>c.command==='send').length,0);
  finishStatus({});await refresh;await send;
  assert.equal(t.calls.filter(c=>c.command==='send').length,1);assert.equal(s.snapshot().messages[1].delivery,'complete');
});
test('a completed non-text generation fallback finishes the session',async()=>{
  const text='이미지 생성이 완료되었습니다.\n\n원본 이미지는 ChatGPT 창에서 확인해 주세요.';
  const t=fake({poll:async()=>({complete:true,text})}),s=new ChatSession(t,{wait:async()=>{}});
  await s.connect(123);await s.send('이미지를 만들어 줘');
  assert.equal(s.snapshot().status,'connected');assert.equal(s.snapshot().messages.at(-1).delivery,'complete');
  assert.equal(s.snapshot().messages.at(-1).content,text);
});
