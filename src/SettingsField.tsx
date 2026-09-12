import { useEffect, useState } from 'react';

type NumericSettingProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  unit?: string;
  displayScale?: number;
  disabled?: boolean;
};

function precision(step: number) {
  const text = String(step);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

/** A range input with a matching number field, so values are never limited to drag increments. */
export function NumericSetting({ id, label, value, min, max, step, onChange, unit = '', displayScale = 1, disabled = false }: NumericSettingProps) {
  const displayValue = value * displayScale;
  const displayMin = min * displayScale;
  const displayMax = max * displayScale;
  const displayStep = step * displayScale;
  const [draft, setDraft] = useState(String(Number(displayValue.toFixed(precision(displayStep)))));

  useEffect(() => {
    setDraft(String(Number(displayValue.toFixed(precision(displayStep)))));
  }, [displayValue, displayStep]);

  const commit = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) { setDraft(String(Number(displayValue.toFixed(precision(displayStep))))); return; }
    const clamped = Math.min(displayMax, Math.max(displayMin, next));
    onChange(clamped / displayScale);
  };

  return <div className="numeric-setting">
    <label className="slider-label" htmlFor={id}><span>{label}</span><span className="numeric-value"><input id={`${id}-value`} aria-label={`${label} 값`} type="number" min={displayMin} max={displayMax} step={displayStep} disabled={disabled} value={draft} onChange={event => setDraft(event.target.value)} onBlur={event => commit(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.currentTarget.blur(); } }} />{unit}</span></label>
    <input id={id} aria-label={label} type="range" min={min} max={max} step={step} disabled={disabled} value={value} onChange={event => onChange(Number(event.target.value))} />
  </div>;
}
