import { RotateCcw } from 'lucide-react';
import { defaultOutline, type OutlineStyle } from './outline';
import { NumericSetting } from './SettingsField';
import './outline.css';

export function OutlineSettings({ value, onChange }: { value: OutlineStyle; onChange: (value: OutlineStyle) => void }) {
  const transparency = Math.round((1 - value.opacity) * 100);
  return <fieldset className="outline-settings">
    <legend>캐릭터 외곽선</legend>
    <div className="outline-color-row">
      <label htmlFor="outline-color">외곽선 색상</label>
      <span>{value.color.toUpperCase()}</span>
      <input id="outline-color" type="color" value={value.color} onChange={event => onChange({ ...value, color: event.target.value })} />
    </div>
    <NumericSetting id="outline-transparency" label="외곽선 투명도" value={transparency} min={0} max={100} step={1} unit="%" onChange={next => onChange({ ...value, opacity: 1 - next / 100 })} />
    <NumericSetting id="outline-thickness" label="외곽선 두께" value={value.thickness} min={0} max={8} step={0.1} unit="px" onChange={next => onChange({ ...value, thickness: next })} />
    <p className="appearance-hint">투명도 100% 또는 두께 0이면 외곽선을 숨깁니다.<br />모든 모델에 공통 적용됩니다.</p>
    <button type="button" className="appearance-reset" onClick={() => onChange({ ...defaultOutline })}><RotateCcw size={12} />외곽선 초기화</button>
  </fieldset>;
}
