import { RotateCcw } from 'lucide-react';
import { defaultOutline, type OutlineStyle } from './outline';
import { NumericSetting } from './SettingsField';
import './outline.css';

export function OutlineSettings({ value, onChange, supportsMmdToon = false }: { value: OutlineStyle; onChange: (value: OutlineStyle) => void; supportsMmdToon?: boolean }) {
  const transparency = Math.round((1 - value.opacity) * 100);
  return <fieldset className="outline-settings">
    <legend>캐릭터 외곽선</legend>
    <div className="outline-subheading">전체 실루엣 테두리</div>
    <div className="outline-color-row">
      <label htmlFor="outline-color">외곽선 색상</label>
      <span>{value.color.toUpperCase()}</span>
      <input id="outline-color" type="color" value={value.color} onChange={event => onChange({ ...value, color: event.target.value })} />
    </div>
    <NumericSetting id="outline-transparency" label="외곽선 투명도" value={transparency} min={0} max={100} step={1} unit="%" onChange={next => onChange({ ...value, opacity: 1 - next / 100 })} />
    <NumericSetting id="outline-thickness" label="외곽선 두께" value={value.thickness} min={0} max={8} step={0.1} unit="px" onChange={next => onChange({ ...value, thickness: next })} />
    <label className={`outline-toggle${supportsMmdToon ? '' : ' disabled'}`}><input type="checkbox" checked={value.mmdToon} disabled={!supportsMmdToon} onChange={event => onChange({ ...value, mmdToon: event.target.checked })} />MMD 카툰 외곽선</label>
    <div className={`outline-color-row mmd-toon-color${supportsMmdToon && value.mmdToon ? '' : ' disabled'}`}>
      <label htmlFor="mmd-toon-outline-color">카툰 외곽선 색상</label>
      <span>{value.mmdToonColor.toUpperCase()}</span>
      <input id="mmd-toon-outline-color" aria-label="카툰 외곽선 색상" type="color" disabled={!supportsMmdToon || !value.mmdToon} value={value.mmdToonColor} onChange={event => onChange({ ...value, mmdToonColor: event.target.value })} />
    </div>
    <NumericSetting id="mmd-toon-outline-thickness" label="카툰 외곽선 굵기" value={value.mmdToonThickness} min={0.25} max={3} step={0.05} displayScale={100} unit="%" disabled={!supportsMmdToon || !value.mmdToon} onChange={next => onChange({ ...value, mmdToonThickness: next })} />
    <p className="appearance-hint">카툰 외곽선은 PMX 재질의 머리카락·얼굴·의상 경계를 표시합니다.<br />100%는 모델 제작자가 지정한 원래 굵기입니다.</p>
    <button type="button" className="appearance-reset" onClick={() => onChange({ ...defaultOutline })}><RotateCcw size={12} />모든 외곽선 초기화</button>
  </fieldset>;
}
