export type Appearance = { zoom: number; width: number; height: number; offsetY: number; rotation: number };
export const defaultAppearance: Appearance = { zoom: 1, width: 1, height: 1, offsetY: 0, rotation: 0 };
export const appearanceRanges: { key: keyof Appearance; label: string; min: number; max: number; step: number; unit: '%' | '°' }[] = [
  { key: 'zoom', label: '캐릭터 크기', min: 0.5, max: 2, step: 0.05, unit: '%' },
  { key: 'width', label: '가로 비율', min: 0.6, max: 1.6, step: 0.05, unit: '%' },
  { key: 'height', label: '세로 비율', min: 0.6, max: 1.6, step: 0.05, unit: '%' },
  { key: 'offsetY', label: '위아래 위치', min: -0.6, max: 0.6, step: 0.05, unit: '%' },
  { key: 'rotation', label: '바라보는 방향', min: -180, max: 180, step: 5, unit: '°' },
];
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
    const saved = JSON.parse(localStorage.getItem(`mate.appearance.${id}`) || '{}');
    for (const { key, min, max } of appearanceRanges) if (typeof saved?.[key] === 'number' && Number.isFinite(saved[key])) result[key] = Math.max(min, Math.min(max, saved[key]));
  } catch { /* Corrupt preferences fall back to the original proportions. */ }
  return result;
}
