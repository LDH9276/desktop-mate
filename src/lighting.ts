import { getPreference, setPreference } from './preferences';

export type VisualSettings = {
  lighting: number;
  brightness: number;
  saturation: number;
  shadow: number;
};

export const defaultVisualSettings: VisualSettings = {
  lighting: 1,
  brightness: 0.65,
  saturation: 1,
  shadow: 0.65,
};

export const visualRanges: { key: keyof VisualSettings; label: string; min: number; max: number; step: number }[] = [
  { key: 'lighting', label: '조명 강도', min: 0, max: 1.5, step: 0.01 },
  { key: 'brightness', label: '명도', min: 0, max: 1.5, step: 0.01 },
  { key: 'saturation', label: '채도', min: 0, max: 2, step: 0.01 },
  { key: 'shadow', label: '그림자 강도', min: 0, max: 1, step: 0.01 },
];

const clampSetting = (key: keyof VisualSettings, value: unknown, fallback: number) => {
  const range = visualRanges.find(candidate => candidate.key === key)!;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(range.min, Math.min(range.max, value))
    : fallback;
};

export function loadVisualSettings(): VisualSettings {
  const result = { ...defaultVisualSettings };
  try {
    const saved = JSON.parse(getPreference('mate.visual') || '{}');
    for (const { key } of visualRanges) result[key] = clampSetting(key, saved?.[key], result[key]);
    if (!getPreference('mate.visual')) {
      // In 0.4.5 the single lighting slider controlled final-output
      // brightness. Carry that preference forward as the new brightness value.
      const legacyRaw = getPreference('mate.lighting');
      const legacy = legacyRaw === null ? Number.NaN : Number(legacyRaw);
      if (Number.isFinite(legacy)) result.brightness = clampSetting('brightness', legacy, result.brightness);
    }
  } catch { /* Invalid saved settings use the eye-comfort defaults. */ }
  return result;
}

export function saveVisualSettings(value: VisualSettings) {
  setPreference('mate.visual', JSON.stringify(value));
}
