import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUp, Check, ChevronDown, FileArchive, Hand, Heart, Link2, LoaderCircle, MessageCircle, Minus, PawPrint, Power, RotateCcw, Settings2, Sparkles, Unplug, X } from 'lucide-react';
import { Avatar, type AvatarModel } from './Avatar';
import { CompanionBehavior, clamp } from './behavior.mjs';
import { ChatMotionController } from './chat-motion.mjs';
import type { ChatCandidate, ChatState } from './types';
import './reactions.css';
import { loadPhysicsWeight } from './physics-settings.mjs';
import { emotionChoices, emotionLabels, ReplyEmotionController } from './emotions.mjs';
import { WindowMoveBar, WindowResizeHandles, WindowSizeSettings } from './WindowControls';
import { appearancePresets, appearanceRange, appearanceRanges, defaultAppearance, loadAppearance, type Appearance } from './appearance';
import { loadOutline } from './outline';
import { OutlineSettings } from './OutlineSettings';
import { MarkdownMessage } from './MarkdownMessage';
import './markdown.css';
import { defaultVisualSettings, loadVisualSettings, saveVisualSettings, visualRanges, type VisualSettings } from './lighting';
import { ChatAppearanceSettings } from './ChatAppearanceSettings';
import { loadChatAppearance, saveChatAppearance, type ChatAppearance } from './chat-appearance';
import { NumericSetting } from './SettingsField';

const initial: ChatState = { status: 'disconnected', conversationId: null, title: '', detail: '일반 ChatGPT에서 사용할 대화를 열고 연결해 주세요.', messages: [] };
const labels = { disconnected: '연결 대기', connected: '연결됨', reconnecting: '대화 확인 중', sending: '전송 중', receiving: '답변 작성 중', uncertain: '확인 필요' };
const actions: Record<string, string> = { idle: '잡아서 옮기기', held: '이동 중', dizzy: '어지러움 · 회복 중', happy: '쓰다듬기', wave: '인사', bow: '꾸벅 인사', surprise: '깜짝!', sleep: '꾸벅꾸벅', landing: '착지', thinking: '생각 중 · 답변 기다리는 중', talking: '답변 수신' };
const builtInAvatars: AvatarModel[] = [
  { id: 'mate', name: 'Mate', creator: 'DesktopMate', kind: 'procedural', url: '', loadingName: '메이트' },
];
const connectionPreferenceVersion = '2';
const conversationUrlPattern = /^https:\/\/chatgpt\.com\/(?:g\/[^/]+\/)?c\/[a-zA-Z0-9-]+(?:[?#].*)?$/i;
function savedAvatar() {
  const saved = localStorage.getItem('mate.avatar');
  return saved || 'mate';
}
function savedConversationUrl() {
  // Version 2 deliberately starts without a preconfigured conversation URL.
  if (localStorage.getItem('mate.connectionPreferenceVersion') !== connectionPreferenceVersion) {
    localStorage.removeItem('mate.conversationUrl');
    localStorage.setItem('mate.connectionPreferenceVersion', connectionPreferenceVersion);
    return '';
  }
  return localStorage.getItem('mate.conversationUrl') || '';
}

export function App() {
  const settingsWindow = location.hash === '#settings';
  const desktop = location.hash === '#companion' || settingsWindow;
  const behavior = useRef(new CompanionBehavior());
  const replyEmotions = useRef(new ReplyEmotionController());
  const chatMotion = useRef(new ChatMotionController());
  const [state, setState] = useState<ChatState>(initial);
  const [ready, setReady] = useState(false);
  const [pose, setPose] = useState('idle');
  const [chatOpen, setChatOpen] = useState(true);
  const [settings, setInlineSettings] = useState(settingsWindow);
  function setSettings(open: boolean) {
    if (window.mate) {
      if (open) void window.mate.openSettings();
      else if (settingsWindow) void window.mate.closeSettings();
    } else setInlineSettings(open);
  }
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [conversationUrl, setConversationUrl] = useState(savedConversationUrl);
  const [candidates, setCandidates] = useState<ChatCandidate[]>([]);
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [appearance, setAppearance] = useState(() => loadAppearance(savedAvatar()));
  const [outline, setOutline] = useState(loadOutline);
  const [visuals, setVisuals] = useState(loadVisualSettings);
  const [chatAppearance, setChatAppearance] = useState(loadChatAppearance);
  const [physics, setPhysics] = useState(() => localStorage.getItem('mate.physics') !== 'off');
  const [physicsWeight, setPhysicsWeight] = useState(() => loadPhysicsWeight('mate.physicsWeight'));
  const [hairPhysics, setHairPhysics] = useState(() => localStorage.getItem('mate.hairPhysics') !== 'off');
  const [hairPhysicsWeight, setHairPhysicsWeight] = useState(() => loadPhysicsWeight('mate.hairPhysicsWeight'));
  const [sensitivity, setSensitivity] = useState(() => Number(localStorage.getItem('mate.sensitivity')) || 1);
  const [avatarId, setAvatarId] = useState<AvatarModel['id']>(savedAvatar);
  const [importedAvatars, setImportedAvatars] = useState<AvatarModel[]>([]);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; distance: number; ox: number; oy: number } | null>(null);
  const busy = sending || state.status === 'sending' || state.status === 'receiving';
  const connected = state.status === 'connected' || busy;
  const avatars = [...builtInAvatars, ...importedAvatars];
  const avatar = avatars.find(candidate => candidate.id === avatarId) || builtInAvatars[0];

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key && !event.key.startsWith('mate.'))) return;
      const id = savedAvatar();
      if (event.key === 'mate.avatar') {
        void window.mate?.listModels().then(models => { setImportedAvatars(models); setAvatarId(id); });
      }
      setAppearance(loadAppearance(id)); setOutline(loadOutline()); setVisuals(loadVisualSettings()); setChatAppearance(loadChatAppearance());
      setPhysics(localStorage.getItem('mate.physics') !== 'off');
      setPhysicsWeight(loadPhysicsWeight('mate.physicsWeight'));
      setHairPhysics(localStorage.getItem('mate.hairPhysics') !== 'off');
      setHairPhysicsWeight(loadPhysicsWeight('mate.hairPhysicsWeight'));
      setSensitivity(Number(localStorage.getItem('mate.sensitivity')) || 1);
      setConversationUrl(savedConversationUrl());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    let disposed = false;
    window.mate?.listModels?.().then(models => {
      if (disposed) return;
      setImportedAvatars(models);
      const saved = savedAvatar();
      if (!builtInAvatars.some(model => model.id === saved) && !models.some(model => model.id === saved)) {
        setAvatarId('mate'); setAppearance(loadAppearance('mate'));
      }
    }).catch(error => { if (!disposed) setImportNotice(clean(error)); });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('companion-mode', desktop);
    window.mate?.state().then(next => { setState(next); chatMotion.current.observe(next); }).catch(e => setError(clean(e)));
    const receive = window.mate?.onState(next => {
      setState(next);
      replyEmotions.current.observe(next);
      chatMotion.current.observe(next);
    });
    const prefs = window.mate?.onSettings(() => setSettings(true));
    const motion = window.mate?.onMotion(event => {
      if (event.kind === 'start') behavior.current.grab(event.x, event.y, event.now);
      if (event.kind === 'move') behavior.current.move(event.x, event.y, event.now);
      if (event.kind === 'end') { behavior.current.release(event.now); gesture.current = null; }
    });
    const timer = setInterval(() => {
      const current = behavior.current;
      const emotion = replyEmotions.current.take(current.dragging || current.state === 'landing');
      if (emotion) current.react(emotion, Date.now());
      else chatMotion.current.sync(current, Date.now());
      setPose(current.state);
    }, 90);
    const blur = () => { window.mate?.endDrag(); behavior.current.release(Date.now()); gesture.current = null; };
    window.addEventListener('blur', blur);
    return () => { receive?.(); prefs?.(); motion?.(); clearInterval(timer); window.removeEventListener('blur', blur); };
  }, [desktop]);
  useEffect(() => { behavior.current.sensitivity = sensitivity; }, [sensitivity]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [state.messages, chatOpen]);
  useEffect(() => {
    if (!window.mate || settingsWindow) return;
    const update = () => window.mate!.setRegions([...document.querySelectorAll('[data-interactive]')].map(node => {
      const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    }));
    update(); const timer = setInterval(update, 200); return () => clearInterval(timer);
  }, [chatOpen, settings, ready, appearance, avatarId, reactionsOpen, chatAppearance]);
  function chooseAvatar(id: AvatarModel['id']) {
    if (id === avatarId) return;
    setReady(false); setAvatarId(id); setAppearance(loadAppearance(id)); localStorage.setItem('mate.avatar', id);
  }
  function changeAppearance(next: Appearance) {
    const offset = appearanceRange('offsetY', next.zoom);
    const normalized = { ...next, offsetY: Math.max(offset.min, Math.min(offset.max, next.offsetY)) };
    setAppearance(normalized); localStorage.setItem(`mate.appearance.${avatarId}`, JSON.stringify(normalized));
  }
  function changeChatAppearance(next: ChatAppearance) { setChatAppearance(next); saveChatAppearance(next); }
  async function importZip() {
    if (!window.mate?.importModel) { setImportNotice('ZIP 불러오기는 바탕화면 앱에서 사용할 수 있습니다.'); return; }
    setImporting(true); setImportNotice('');
    try {
      const result = await window.mate.importModel();
      if (!result) return;
      setImportedAvatars(result.models);
      if (result.added[0]) chooseAvatar(result.added[0]);
      setImportNotice([result.duplicate ? '이미 등록된 모델을 선택했어요.' : `모델 ${result.added.length}개를 추가했어요. 다음 실행에도 유지됩니다.`, ...result.warnings].join(' '));
    } catch (error) { setImportNotice(clean(error)); }
    finally { setImporting(false); }
  }
  function clean(error: unknown) { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '연결 작업을 완료하지 못했습니다.'; }
  async function scan() {
    if (!window.mate) { setError('바탕화면 앱에서 연결할 수 있습니다.'); return; }
    const targetUrl = conversationUrl.trim();
    if (!conversationUrlPattern.test(targetUrl)) { setError('https://chatgpt.com/c/... 형식의 대화 주소를 입력해 주세요.'); return; }
    localStorage.setItem('mate.conversationUrl', targetUrl);
    setScanning(true); setError(''); setSelected(null);
    try { const results = await window.mate.scan(targetUrl); setCandidates(results); setScanned(true); if (results.length === 1 && results[0].supported) setSelected(results[0].windowId); }
    catch (error) { setError(clean(error)); }
    finally { setScanning(false); }
  }
  async function connect() {
    if (selected === null || !window.mate) return;
    setScanning(true); setError('');
    try { setState(await window.mate.connect(selected, conversationUrl.trim())); setSettings(false); }
    catch (error) { setError(clean(error)); }
    finally { setScanning(false); }
  }
  async function send() {
    const text = input.trim();
    if (!text || sendingRef.current || busy || state.status !== 'connected' || !window.mate) return;
    sendingRef.current = true; setSending(true); setError(''); setInput('');
    chatMotion.current.begin(); chatMotion.current.sync(behavior.current, Date.now());
    try { await window.mate.send(text); }
    catch (error) { setError(clean(error)); setInput(current => current || text); }
    finally { chatMotion.current.finish(); sendingRef.current = false; setSending(false); }
  }
  function grab(event: ReactPointerEvent<HTMLDivElement>) {
    if (!ready || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { x: event.screenX, y: event.screenY, distance: 0, ox: offset.x, oy: offset.y };
    behavior.current.grab(event.screenX, event.screenY, Date.now());
    if (desktop && window.mate) window.mate.startDrag();
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current; if (!g) return;
    const dx = event.screenX - g.x, dy = event.screenY - g.y;
    g.distance = Math.max(g.distance, Math.hypot(dx, dy));
    if (!desktop || !window.mate) {
      behavior.current.move(event.screenX, event.screenY, Date.now());
      setOffset({ x: clamp(g.ox + dx, -70, 70), y: clamp(g.oy + dy, -55, 45) });
    }
  }
  function release(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current; gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    window.mate?.endDrag(); behavior.current.release(Date.now());
    if (g && g.distance < 6) behavior.current.react('happy', Date.now());
  }

  return <main className={settingsWindow ? 'settings-host' : desktop ? 'desktop-host' : 'preview-host'}>
    {!desktop && <div className="preview-caption"><PawPrint size={21} /><span>MATE <b>DESKTOP COMPANION</b></span><h1>대화는 가까이.<br />바탕화면은 가볍게.</h1><p>일반 ChatGPT와 이어지는 작은 채팅창.</p><span className="preview-label">로컬 미리보기 · 연결은 데스크톱 앱에서</span></div>}
    <div className="companion-shell" style={{
      '--mate-chat-width': `${chatAppearance.width}px`, '--mate-chat-height': `${chatAppearance.height}px`, '--mate-character-height': `${chatAppearance.characterHeight}px`,
      '--mate-chat-font': chatAppearance.font, '--mate-chat-font-size': `${chatAppearance.fontSize}px`, '--mate-chat-surface': chatAppearance.surface,
      '--mate-chat-border': chatAppearance.border, '--mate-chat-header': chatAppearance.header, '--mate-chat-composer': chatAppearance.composer,
      '--mate-chat-user': chatAppearance.userBubble, '--mate-chat-user-text': chatAppearance.userText, '--mate-chat-assistant-text': chatAppearance.assistantText,
      '--mate-chat-accent': chatAppearance.accent,
    } as CSSProperties}>
      {!settingsWindow && <>
      {desktop && <WindowMoveBar />}
      {chatOpen ? <section className="chat-bubble" data-interactive aria-label="ChatGPT 미니 채팅">
        <header className="chat-header"><span className="brand-mark"><PawPrint size={16} /></span><div><b>ChatGPT</b><span><i className={connected ? 'online' : ''} />{labels[state.status]}{state.conversationId && ' · 한 대화에 연결'}</span></div><button title="연결 설정" aria-label="연결 설정" onClick={() => { setError(''); setSettings(true); }}><Settings2 size={16} /></button><button title="채팅 접기" aria-label="채팅 접기" onClick={() => setChatOpen(false)}><Minus size={17} /></button></header>
        <div className="message-log" ref={log} role="log" aria-live="polite" aria-label="ChatGPT 대화 내용">
          {state.messages.length === 0 ? <div className="empty-chat"><span className="empty-icon"><MessageCircle size={26} strokeWidth={1.3} /></span><h2>열린 대화와 이어 보세요</h2><p>여기에 입력한 메시지를 ChatGPT에 보내고,<br />같은 대화의 답변을 가져옵니다.</p><button onClick={() => setSettings(true)}><Link2 size={14} />ChatGPT 대화 연결<ArrowUp size={13} className="rotate-arrow" /></button><span className="empty-note">일반 채팅 · 마우스 조작 없음</span></div> : state.messages.map(message => <article key={message.id} className={`message ${message.role}`}><span className="message-author">{message.role === 'assistant' ? 'ChatGPT' : '나'}{message.delivery === 'not_sent' && ' · 전송되지 않음'}{message.delivery === 'unknown' && ' · 전송 확인 필요'}{message.delivery === 'incomplete' && ' · 수신 미완료'}</span>{message.role === 'assistant' ? <MarkdownMessage content={message.content} /> : <p>{message.content}</p>}</article>)}
          {(busy || state.status === 'reconnecting') && <div className="reply-status"><LoaderCircle size={13} className="spin" />{state.detail}</div>}
        </div>
        {(error || state.status === 'uncertain') && !settings && <div className="inline-error" role="alert">{error || state.detail}</div>}
        <form className="composer" onSubmit={event => { event.preventDefault(); void send(); }}><textarea aria-label="메시지 입력" placeholder={connected ? '메시지를 입력하세요…' : '먼저 ChatGPT 대화를 연결하세요'} value={input} maxLength={6000} rows={2} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><div><span>{connected ? 'Enter 전송 · Shift + Enter 줄바꿈' : '두 앱이 실행 중일 때 연결됩니다'}</span><button className="send-button" aria-label="메시지 보내기" disabled={!input.trim() || busy || state.status !== 'connected'}><ArrowUp size={17} /></button></div></form>
        <div className="bubble-tail" />
      </section> : <button className="collapsed-chat" data-interactive onClick={() => setChatOpen(true)}><MessageCircle size={16} /><span>ChatGPT 열기</span><i className={connected ? 'online' : ''} /><ChevronDown size={13} /></button>}

      <div className={`character-stage ${chatOpen ? '' : 'chat-closed'}`} data-state={pose}>
        <div className="floor-shadow" /><div className="avatar-wrap" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
          <Avatar key={avatar.id} behavior={behavior} model={avatar} compact zoom={appearance.zoom} proportions={appearance} outline={outline} lighting={visuals.lighting} brightness={visuals.brightness} saturation={visuals.saturation} physics={physics} physicsWeight={physicsWeight} hairPhysics={hairPhysics} hairPhysicsWeight={hairPhysicsWeight} onReady={() => setReady(true)} />
          {ready && <div className="character-touch" data-interactive role="button" tabIndex={0} aria-label="캐릭터 쓰다듬기 또는 잡아서 옮기기" title="톡 누르면 반응 · 꾹 잡으면 이동" onPointerDown={grab} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={() => { if (gesture.current) { gesture.current = null; window.mate?.endDrag(); behavior.current.release(Date.now()); } }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); behavior.current.react('happy', Date.now()); } }} />}
          {behavior.current.dragging && <div className="scruff-hand"><Hand size={22} /></div>}
          {pose === 'dizzy' && <div className="dizzy-stars" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span></div>}
          {pose === 'happy' && <div className="love-particles" aria-hidden="true">♡ <span>♡</span> ♡</div>}
        </div>
        <div className="character-caption"><span>{avatar.name}</span><i />{emotionLabels[pose] && pose !== 'idle' ? `현재상태: ${emotionLabels[pose]}` : actions[pose]}</div>
      </div>
      <nav className="mini-toolbar" data-interactive aria-label="캐릭터 도구"><button aria-label="채팅 열고 접기" className={chatOpen ? 'selected' : ''} onClick={() => setChatOpen(!chatOpen)}><MessageCircle size={16} /></button><span /><button aria-label="쓰다듬기" onClick={() => behavior.current.react('happy', Date.now())}><Heart size={16} /></button><button aria-label="인사하기" onClick={() => behavior.current.react('wave', Date.now())}><Hand size={16} /></button><button aria-label="모션 선택" title="모션 선택" aria-expanded={reactionsOpen} className={reactionsOpen ? 'selected' : ''} onClick={() => setReactionsOpen(!reactionsOpen)}><Sparkles size={16} /></button><button aria-label="연결 및 설정" onClick={() => { setError(''); setSettings(true); }}><Settings2 size={16} /></button><span /><button aria-label="트레이에 보관" title="트레이에 보관" onClick={() => window.mate ? window.mate.hide() : setError('트레이는 데스크톱 앱에서 사용할 수 있습니다.')}><Minus size={17} /></button></nav>

      {reactionsOpen && <section className="reaction-palette" data-interactive aria-label="캐릭터 모션" onKeyDown={event => { if (event.key === 'Escape') setReactionsOpen(false); }}>
        <header><b>오늘은 어떤 반응?</b><button autoFocus aria-label="모션 선택 닫기" onClick={() => setReactionsOpen(false)}><X size={15} /></button></header>
        <div className="reaction-options">{[['wave', '손 흔들기'], ['happy', '기뻐하기'], ['bow', '꾸벅 인사'], ['sleep', '꾸벅꾸벅'], ['thinking', '생각하기'], ['idle', '편하게 서기'], ...emotionChoices.map(({state, label}) => [state, label])].map(([state, label]) => <button key={state} onClick={() => { behavior.current.react(state, Date.now()); setReactionsOpen(false); }}>{label}</button>)}</div>
        <small>MMD 모션: CG-CA Gene · NIT / Avatar Symbiotic Society · CC BY 4.0</small>
      </section>}

      </>}
      {settings && <section className="settings-panel" data-interactive role="dialog" aria-modal={!settingsWindow} aria-labelledby="settings-title" onKeyDown={event => { if (event.key === 'Escape') setSettings(false); }}>
        <header><div><span className="eyebrow">MATE SETTINGS</span><h2 id="settings-title">캐릭터와 창 설정</h2></div><button autoFocus aria-label="설정 닫기" onClick={() => setSettings(false)}><X size={19} /></button></header>
        <div className="settings-divider" />
        {desktop && <WindowSizeSettings />}
        <ChatAppearanceSettings value={chatAppearance} onChange={changeChatAppearance} />
        <div className="settings-divider" />
        <fieldset className="model-picker"><legend>캐릭터 모델</legend><div>{avatars.map(candidate => <button key={candidate.id} type="button" role="radio" aria-checked={avatarId === candidate.id} aria-label={`${candidate.name} 모델 선택`} className={avatarId === candidate.id ? 'selected' : ''} onClick={() => chooseAvatar(candidate.id)}><span className={`model-swatch ${candidate.id}`} /><span><b>{candidate.name}</b><small>{candidate.kind.toUpperCase()}</small></span>{avatarId === candidate.id && <Check size={14} />}</button>)}</div></fieldset>
        <button className="model-import" type="button" disabled={importing} onClick={() => void importZip()}>{importing ? <LoaderCircle size={15} className="spin" /> : <FileArchive size={15} />}{importing ? 'ZIP 모델 불러오는 중…' : '3D 모델 ZIP 불러오기'}</button>
        <p className="model-import-hint">PMX·VRM 또는 Blender에서 내보낸 GLB가 든 ZIP을 선택하세요.<br />Mate 실행 파일 옆에 ZIP을 놓아도 자동으로 추가됩니다.</p>
        <fieldset className="physics-settings"><legend>모델 물리</legend>
          <label className="physics-toggle"><input type="checkbox" checked={physics} onChange={event => { setPhysics(event.target.checked); localStorage.setItem('mate.physics', event.target.checked ? 'on' : 'off'); }} />의상 물리</label>
          <NumericSetting id="physics-weight" label="의상 물리 가중치" value={physicsWeight} min={0} max={1} step={0.01} displayScale={100} unit="%" disabled={!physics} onChange={value => { setPhysicsWeight(value); localStorage.setItem('mate.physicsWeight', String(value)); }} />
          <label className="physics-toggle"><input type="checkbox" checked={hairPhysics} onChange={event => { setHairPhysics(event.target.checked); localStorage.setItem('mate.hairPhysics', event.target.checked ? 'on' : 'off'); }} />머리카락 물리</label>
          <NumericSetting id="hair-physics-weight" label="머리카락 물리 가중치" value={hairPhysicsWeight} min={0} max={1} step={0.01} displayScale={100} unit="%" disabled={!hairPhysics} onChange={value => { setHairPhysicsWeight(value); localStorage.setItem('mate.hairPhysicsWeight', String(value)); }} />
          <p className="model-import-hint">0%는 기본 형태, 100%는 물리 움직임을 전부 적용합니다.<br />낮출수록 흔들림이 작아집니다. 머리 장식은 머리카락에 포함됩니다.<br />현재 실시간 의상·머리 물리는 PMX 물리 데이터에 적용되며 설정은 자동 저장됩니다.</p>
        </fieldset>
        {importNotice && <p className="model-import-notice" role="status">{importNotice}</p>}
        <div className="appearance-heading">모델 크기와 비율<small>모델마다 따로 저장</small></div>
        <div className="appearance-presets" role="group" aria-label="모델 비율 프리셋">{appearancePresets.map(preset => <button type="button" key={preset.label} onClick={() => changeAppearance({ ...preset.value })}>{preset.label}</button>)}</div>
        {appearanceRanges.map(({ key }) => { const range = appearanceRange(key, appearance.zoom); return <NumericSetting key={key} id={`appearance-${key}`} label={range.label} value={appearance[key]} min={range.min} max={range.max} step={range.step} unit={range.unit} displayScale={range.unit === '%' ? 100 : 1} onChange={value => changeAppearance({ ...appearance, [key]: value })} />; })}
        <p className="appearance-hint">크기 50–600% · 가로/세로 30–300%<br />위아래 위치 범위는 캐릭터 크기에 비례해 최대 ±360%까지 넓어집니다.</p>
        <button type="button" className="appearance-reset" onClick={() => changeAppearance({ ...defaultAppearance })}><RotateCcw size={12} />이 모델의 비율 초기화</button>
        <fieldset className="lighting-settings">
          <legend>캐릭터 조명과 색상</legend>
          {visualRanges.map(({ key, label, min, max, step }) => <NumericSetting key={key} id={`visual-${key}`} label={label} value={visuals[key]} min={min} max={max} step={step} displayScale={100} unit="%" onChange={next => { const value: VisualSettings = { ...visuals, [key]: next }; setVisuals(value); saveVisualSettings(value); }} />)}
          <p className="appearance-hint">조명·명도 0–150% · 채도 0–200%<br />채도 0%는 흑백이며 모든 모델에 공통 적용됩니다.</p>
          <button type="button" className="appearance-reset" onClick={() => { const value = { ...defaultVisualSettings }; setVisuals(value); saveVisualSettings(value); }}><RotateCcw size={12} />조명과 색상 초기화</button>
        </fieldset>
        <NumericSetting id="shake" label="흔들림 민감도" value={sensitivity} min={0.5} max={1.5} step={0.01} displayScale={100} unit="%" onChange={value => { setSensitivity(value); localStorage.setItem('mate.sensitivity', String(value)); }} />
        <OutlineSettings value={outline} onChange={value => { setOutline(value); localStorage.setItem('mate.outline', JSON.stringify(value)); }} />
        <div className="settings-divider" />
        <h3 className="appearance-heading">ChatGPT 연결</h3>
        <p className="settings-intro">Chrome에서 연결할 ChatGPT 대화 탭을 열어 두세요.<br />다른 탭을 보고 있어도 아래 주소로 정확히 찾습니다.</p>
        <label className="conversation-url-label" htmlFor="conversation-url">ChatGPT 대화 주소</label>
        <div className="conversation-url-field"><Link2 size={14} /><input id="conversation-url" type="url" spellCheck={false} disabled={scanning || busy} value={conversationUrl} onChange={event => { setConversationUrl(event.target.value); setScanned(false); setCandidates([]); setSelected(null); }} placeholder="https://chatgpt.com/c/..." /></div>
        <button className="scan-button" disabled={scanning || busy} onClick={scan}>{scanning ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}이 대화가 열린 Chrome 찾기</button>
        <div className="candidate-list">{scanned && !candidates.length && <p className="no-window">설정한 대화가 열린 Chrome 창을 찾지 못했습니다.<br />탭을 열어 둔 뒤 다시 찾아 주세요.</p>}{candidates.map(candidate => <label className={`candidate ${!candidate.supported ? 'unsupported' : ''}`} key={candidate.windowId}><input type="radio" name="chat-window" checked={selected === candidate.windowId} disabled={!candidate.supported || busy} onChange={() => setSelected(candidate.windowId)} /><div><b>{candidate.title || 'ChatGPT'}</b><span>{candidate.supported ? `대화 ${candidate.conversationId?.slice(0, 8)}… · URL 일치` : candidate.reason}</span></div>{candidate.supported && <Check size={14} />}</label>)}</div>
        {selected !== null && <button className="connect-button" disabled={scanning || busy} onClick={connect}><Link2 size={15} />이 대화에 연결</button>}
        {state.conversationId && <div className="bound-session"><span><i className={connected ? 'online' : ''} />대화 {state.conversationId.slice(0, 8)}…</span><button disabled={busy || scanning} onClick={async () => { try { await window.mate?.disconnect(); } catch (error) { setError(clean(error)); } }}><Unplug size={13} />연결 해제</button></div>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <p className="compatibility-note">주소는 이 PC의 Mate 설정에만 저장됩니다. 해당 탭을 닫거나 다른 대화로 이동하면 전송 전에 확인을 멈춥니다. 최소화 중 대화를 읽지 못하면 Chrome 창을 복원해 주세요. 같은 대화를 확인한 뒤 답변을 이어 받습니다.</p>
        <footer><span>{avatar.name} · {avatar.creator}<br /><small>Version 0.5.0 · 로컬 실행</small></span><button aria-label="프로그램 종료" onClick={() => window.mate?.quit()}><Power size={15} />종료</button></footer>
      </section>}
      {desktop && !settingsWindow && <WindowResizeHandles />}
    </div>
  </main>;
}
