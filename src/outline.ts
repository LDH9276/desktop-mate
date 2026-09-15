import { getPreference } from './preferences';

export type OutlineStyle = { color: string; opacity: number; thickness: number; mmdToon: boolean; mmdToonThickness: number; mmdToonColor: string };
export const defaultOutline: OutlineStyle = { color: '#343941', opacity: 0.95, thickness: 1, mmdToon: false, mmdToonThickness: 1, mmdToonColor: '#343941' };

export function loadOutline(): OutlineStyle {
  const result = { ...defaultOutline };
  try {
    const saved = JSON.parse(getPreference('mate.outline') || '{}');
    if (typeof saved?.color === 'string' && /^#[0-9a-f]{6}$/i.test(saved.color)) result.color = saved.color;
    if (typeof saved?.opacity === 'number' && Number.isFinite(saved.opacity)) result.opacity = Math.max(0, Math.min(1, saved.opacity));
    if (typeof saved?.thickness === 'number' && Number.isFinite(saved.thickness)) result.thickness = Math.max(0, Math.min(8, saved.thickness));
    if (typeof saved?.mmdToon === 'boolean') result.mmdToon = saved.mmdToon;
    if (typeof saved?.mmdToonThickness === 'number' && Number.isFinite(saved.mmdToonThickness)) result.mmdToonThickness = Math.max(0.25, Math.min(3, saved.mmdToonThickness));
    if (typeof saved?.mmdToonColor === 'string' && /^#[0-9a-f]{6}$/i.test(saved.mmdToonColor)) result.mmdToonColor = saved.mmdToonColor;
  } catch { /* Invalid saved settings use the default outline. */ }
  return result;
}
