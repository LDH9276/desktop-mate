export type Appearance = { zoom: number; width: number; height: number; offsetY: number; rotation: number };
import { getPreference } from './preferences';
export const defaultAppearance: Appearance = { zoom: 1, width: 1, height: 1, offsetY: 0, rotation: 0 };
export const appearanceRanges: { key: keyof Appearance; label: string; min: number; max: number; step: number; unit: '%' | '°' }[] = [
  { key: 'zoom', label: '캐릭터 크기', min: 0.5, max: 6, step: 0.01, unit: '%' },
  { key: 'width', label: '가로 비율', min: 0.3, max: 3, step: 0.01, unit: '%' },
  { key: 'height', label: '세로 비율', min: 0.3, max: 3, step: 0.01, unit: '%' },
  // The actual offset range is derived from zoom; this is the 600% maximum
  // used for storage validation and gets narrowed in the settings UI.
  { key: 'offsetY', label: '위아래 위치', min: -3.6, max: 3.6, step: 0.01, unit: '%' },
  { key: 'rotation', label: '바라보는 방향', min: -180, max: 180, step: 1, unit: '°' },
];

export function appearanceRange(key: keyof Appearance, zoom: number) {
  const base = appearanceRanges.find(range => range.key === key)!;
  if (key !== 'offsetY') return base;
  const scale = Math.max(0.5, Math.min(6, zoom));
  const limit = Number((0.6 * scale).toFixed(2));
  return { ...base, min: -limit, max: limit };
}
export const appearancePresets: { label: string; value: Appearance }[] = [
  { label: '기본', value: defaultAppearance },
  { label: '작게', value: { ...defaultAppearance, zoom: 0.75 } },
  { label: '크게', value: { ...defaultAppearance, zoom: 1.35 } },
  { label: '슬림', value: { ...defaultAppearance, width: 0.8, height: 1.1 } },
  { label: '통통', value: { ...defaultAppearance, width: 1.25, height: 0.85 } },
];
export function loadAppearance(id: string): Appearance {
  const result = { ...defaultAppearance };
  try {
    const saved = JSON.parse(getPreference(`mate.appearance.${id}`) || '{}');
    for (const { key, min, max } of appearanceRanges) {
      if (key === 'offsetY') continue;
      if (typeof saved?.[key] === 'number' && Number.isFinite(saved[key])) result[key] = Math.max(min, Math.min(max, saved[key]));
    }
    if (typeof saved?.offsetY === 'number' && Number.isFinite(saved.offsetY)) {
      const range = appearanceRange('offsetY', result.zoom);
      result.offsetY = Math.max(range.min, Math.min(range.max, saved.offsetY));
    }
  } catch { /* Corrupt preferences fall back to the original proportions. */ }
  return result;
}
