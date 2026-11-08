export interface SaveResult<T> { value: T | null; warning: string | null }
const prefix = 'puzzle-room:save:1:';

export function loadSave<T>(key: string, validate: (value: unknown) => T | null): SaveResult<T> {
  try {
    const raw = localStorage.getItem(prefix + key);
    if (raw === null) return { value: null, warning: null };
    const value = validate(JSON.parse(raw));
    return { value, warning: value === null ? 'Your saved game could not be read. A fresh board is ready.' : null };
  } catch {
    return { value: null, warning: 'Browser storage is unavailable or this save is unreadable. You can play, but progress may not be saved.' };
  }
}

export function saveSave(key: string, value: unknown): string | null {
  try { localStorage.setItem(prefix + key, JSON.stringify(value)); return null; }
  catch { return 'Progress could not be saved in this browser. Keep this tab open to continue playing.'; }
}
