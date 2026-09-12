export type OutlineStyle = { color: string; opacity: number; thickness: number };
export const defaultOutline: OutlineStyle = { color: '#343941', opacity: 0.95, thickness: 1 };

export function loadOutline(): OutlineStyle {
  const result = { ...defaultOutline };
  try {
    const saved = JSON.parse(localStorage.getItem('mate.outline') || '{}');
    if (typeof saved?.color === 'string' && /^#[0-9a-f]{6}$/i.test(saved.color)) result.color = saved.color;
    if (typeof saved?.opacity === 'number' && Number.isFinite(saved.opacity)) result.opacity = Math.max(0, Math.min(1, saved.opacity));
    if (typeof saved?.thickness === 'number' && Number.isFinite(saved.thickness)) result.thickness = Math.max(0, Math.min(8, saved.thickness));
  } catch { /* Invalid saved settings use the default outline. */ }
  return result;
}
