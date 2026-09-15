/**
 * Electron preferences live in userData so portable-app extraction paths do
 * not change the storage origin. localStorage remains the browser-preview fallback.
 */
export function getPreference(key: string): string | null {
  return localStorage.getItem(key);
}

export function setPreference(key: string, value: string): void {
  localStorage.setItem(key, value);
  void window.mate?.setPreference?.(key, value);
}

export function removePreference(key: string): void {
  localStorage.removeItem(key);
  void window.mate?.removePreference?.(key);
}

export async function hydratePreferences(): Promise<void> {
  if (!window.mate?.preferences) return;
  const saved = await window.mate.preferences();
  const entries = Object.entries(saved).filter(([key, value]) => key.startsWith('mate.') && typeof value === 'string');
  if (entries.length) {
    for (const [key, value] of entries) localStorage.setItem(key, value);
    return;
  }
  const legacy = Object.keys(localStorage)
    .filter(key => key.startsWith('mate.'))
    .map(key => [key, localStorage.getItem(key)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);
  await Promise.all(legacy.map(([key, value]) => window.mate!.setPreference(key, value)));
}
