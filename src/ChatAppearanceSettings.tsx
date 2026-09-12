import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { chatColorFields, chatFontOptions, chatNumberRanges, defaultChatAppearance, type ChatAppearance } from './chat-appearance';
import { NumericSetting } from './SettingsField';
import './chat-appearance.css';

function ColorSetting({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  const commit = () => {
    if (/^#[0-9a-f]{6}$/i.test(draft)) onChange(draft);
    else setDraft(value.toUpperCase());
  };
  return <div className="color-setting"><label>{label}</label><div><input aria-label={`${label} 색상`} type="color" value={value} onChange={event => onChange(event.target.value)} /><input aria-label={`${label} HEX 값`} className="color-code" type="text" spellCheck={false} value={draft} maxLength={7} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></div></div>;
}

export function ChatAppearanceSettings({ value, onChange }: { value: ChatAppearance; onChange: (value: ChatAppearance) => void }) {
  return <fieldset className="chat-appearance-settings">
    <legend>채팅창 모양과 글꼴</legend>
    <p className="appearance-hint">숫자를 직접 입력하거나 슬라이더로 1px·1%씩 조절할 수 있습니다. 창 배율을 키워도 채팅 글자 크기는 실제 화면 크기로 유지됩니다. 장평은 100%가 기본이며 글자의 가로 폭만 조절합니다.</p>
    {chatNumberRanges.map(range => <NumericSetting key={range.key} id={`chat-${range.key}`} label={range.label} value={value[range.key]} min={range.min} max={range.max} step={range.step} unit={range.unit} displayScale={range.displayScale} onChange={next => onChange({ ...value, [range.key]: next })} />)}
    <label className="font-select-label" htmlFor="chat-font">채팅 글꼴<select id="chat-font" value={value.font} onChange={event => onChange({ ...value, font: event.target.value as ChatAppearance['font'] })}>{chatFontOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <div className="chat-color-grid">{chatColorFields.map(field => <ColorSetting key={field.key} label={field.label} value={value[field.key]} onChange={next => onChange({ ...value, [field.key]: next })} />)}</div>
    <button type="button" className="appearance-reset" onClick={() => onChange({ ...defaultChatAppearance })}><RotateCcw size={12} />채팅창 모양 초기화</button>
  </fieldset>;
}
