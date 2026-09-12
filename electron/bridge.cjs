const { spawn } = require('node:child_process');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { formatEmotionRequest } = require('./emotion-protocol.cjs');

function targetUrl(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || !/^https:\/\/chatgpt\.com\/(?:g\/[^/]+\/)?c\/[a-zA-Z0-9-]+(?:[?#].*)?$/i.test(value.trim())) throw new Error('올바른 ChatGPT 대화 주소를 입력해 주세요.');
  return value.trim();
}

class NativeTransport {
  constructor() { this.child = null; this.pending = new Map(); this.sequence = 0; this.queue = Promise.resolve(); }
  start() {
    if (this.child) return;
    const child = spawn(path.join(__dirname, '../native/ChatBridge.exe'), [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 4000000) { child.kill(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/^\uFEFF/, ''); buffer = buffer.slice(end + 1);
        try {
          const response = JSON.parse(line), pending = this.pending.get(response.id);
          if (pending) {
            clearTimeout(pending.timer); this.pending.delete(response.id);
            if (response.ok) pending.resolve(response.result);
            else {
              const error = new Error(response.error);
              error.code = response.errorCode; error.notSent = response.notSent === true;
              error.retryable = response.retryable === true;
              error.diagnostic = response.diagnostic;
              pending.reject(error);
            }
          }
        } catch { child.kill(); }
      }
    });
    const failed = () => {
      if (this.child !== child) return;
      this.child = null;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('연결 도우미가 종료됐어요. 대화를 다시 연결해 주세요.')); }
      this.pending.clear();
    };
    child.on('error', failed); child.on('exit', failed); child.stderr.resume();
  }
  request(command, payload = {}) {
    const work = () => new Promise((resolve, reject) => {
      this.start(); const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(command === 'send' ? '전송 결과를 확인할 수 없어요. ChatGPT에서 확인해 주세요. 자동 재전송하지 않습니다.' : 'ChatGPT 접근성 응답이 지연돼요. 창을 복원하고 다시 연결해 주세요.'));
        this.child?.kill();
      }, 12000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...payload, id, command }) + '\n');
    });
    const result = this.queue.then(work); this.queue = result.catch(() => {}); return result;
  }
  close() { this.child?.kill(); }
}

class ChatSession extends EventEmitter {
  constructor(transport = new NativeTransport(), options = {}) {
    super(); this.transport = transport;
    this.wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.now = options.now || Date.now;
    // Image and other artifact generation can legitimately take several
    // minutes after ChatGPT acknowledges the user's turn.
    this.timeout = options.timeout || 600000;
    this.state = { status: 'disconnected', conversationId: null, title: '', detail: '일반 ChatGPT에서 사용할 대화를 열고 연결해 주세요.', messages: [] };
    this.busy = false; this.disposed = false; this.mutating = false;
  }
  update(patch) { Object.assign(this.state, patch); this.emit('change', this.snapshot()); }
  snapshot() { return structuredClone(this.state); }
  async scan(url = '') {
    if (this.busy || this.mutating) throw new Error('현재 연결 작업이 끝나기를 기다려 주세요.');
    return this.transport.request('scan', { targetUrl: targetUrl(url) });
  }
  async connect(windowId, url = '') {
    if (!Number.isSafeInteger(windowId) || windowId <= 0) throw new Error('올바른 ChatGPT 창을 선택해 주세요.');
    if (this.busy || this.mutating) throw new Error('현재 연결 작업이 끝나기를 기다려 주세요.');
    this.mutating = true;
    try {
      const result = await this.transport.request('connect', { windowId, targetUrl: targetUrl(url) });
      if (!result.connected || !result.conversationId) throw new Error('대화 연결을 확인하지 못했어요.');
      const same = this.state.conversationId === result.conversationId;
      this.update({ status: 'connected', conversationId: result.conversationId, title: result.title, detail: '이 대화에만 메시지를 보냅니다.', messages: same ? this.state.messages : [] });
      return this.snapshot();
    } catch (error) { this.update({ status: 'disconnected', detail: error.message }); throw error; }
    finally { this.mutating = false; }
  }
  async refresh() {
    if (this.busy || this.mutating || !['connected', 'reconnecting'].includes(this.state.status)) return;
    this.mutating = true;
    this.refreshing = this.transport.request('status');
    try {
      await this.refreshing;
      if (this.state.status === 'reconnecting') this.update({ status: 'connected', detail: '같은 대화를 다시 확인했어요. 메시지를 보낼 수 있습니다.' });
    }
    catch (error) { this.update({ status: error.retryable === true ? 'reconnecting' : 'disconnected', detail: error.message }); }
    finally { this.mutating = false; this.refreshing = null; }
  }
  async send(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 6000) throw new Error('메시지는 1~6000자로 입력해 주세요.');
    // A background status read must not reject an otherwise valid send merely
    // because it happened to overlap the user's click.
    if (this.refreshing) await this.refreshing.catch(() => {});
    if (this.busy || this.mutating) throw new Error('현재 연결 작업이 끝나기를 기다려 주세요.');
    if (this.state.status !== 'connected') throw new Error('먼저 Chrome 또는 ChatGPT 앱의 대화를 연결해 주세요.');
    this.busy = true;
    const user = { id: crypto.randomUUID(), role: 'user', content: text.trim(), delivery: 'sending' };
    this.update({ status: 'sending', messages: [...this.state.messages, user].slice(-60), detail: 'ChatGPT에 보내는 중…' });
    let assistant;
    try {
      await this.transport.request('send', { text: formatEmotionRequest(text) });
      user.delivery = 'sent'; this.update({ status: 'receiving', detail: 'ChatGPT의 답변을 기다리는 중…' });
      let remaining = this.timeout, wasUnavailable = false;
      while (!this.disposed && remaining > 0) {
        const started = this.now();
        await this.wait(700);
        let result;
        try { result = await this.transport.request('poll'); }
        catch (error) {
          if (error.retryable !== true) throw error;
          wasUnavailable = true;
          this.update({ detail: `${error.message} 이미 보낸 메시지는 재전송하지 않고 답변을 기다립니다.` });
          continue;
        }
        remaining -= Math.max(0, this.now() - started);
        if (wasUnavailable) { wasUnavailable = false; this.update({ detail: '대화를 다시 확인했어요. ChatGPT의 답변을 이어 받는 중…' }); }
        if (result.text) {
          if (!assistant) { assistant = { id: crypto.randomUUID(), role: 'assistant', content: result.text, delivery: 'receiving' }; this.state.messages.push(assistant); }
          assistant.content = result.text; this.update({ messages: this.state.messages });
        }
        if (result.complete) {
          if (!assistant?.content.trim()) throw new Error('답변 완료를 확인했지만 본문을 받지 못했어요.');
          assistant.delivery = 'complete'; this.update({ status: 'connected', detail: '이 대화에만 메시지를 보냅니다.' }); return this.snapshot();
        }
      }
      throw new Error('답변 완료를 확인하지 못했어요. ChatGPT에서 확인해 주세요. 같은 메시지를 자동 재전송하지 않습니다.');
    } catch (error) {
      if (error.notSent === true && user.delivery === 'sending') {
        user.delivery = 'not_sent';
        this.update({ status: error.retryable === true ? 'reconnecting' : 'connected', detail: error.message }); throw error;
      }
      if (user.delivery === 'sending') user.delivery = 'unknown';
      if (assistant) assistant.delivery = 'incomplete';
      this.update({ status: 'uncertain', detail: error.message }); throw error;
    } finally { this.busy = false; }
  }
  async disconnect() {
    if (this.busy || this.mutating) throw new Error('전송 결과를 기다리는 중에는 연결을 바꿀 수 없어요.');
    this.mutating = true;
    try { await this.transport.request('disconnect'); this.update({ status: 'disconnected', conversationId: null, title: '', detail: '일반 ChatGPT에서 사용할 대화를 열고 연결해 주세요.', messages: [] }); }
    finally { this.mutating = false; }
  }
  dispose() { this.disposed = true; this.transport.close?.(); }
}
module.exports = { ChatSession, NativeTransport };
