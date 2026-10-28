export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'gustafta-theme';
export const THEME_EVENT = 'gustafta-theme-change';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type RootLike = { classList: { toggle(name: string, force?: boolean): boolean | void }; style?: { colorScheme?: string }; setAttribute?(n: string, v: string): void };

export const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark';

/** Reads the stored preference; any storage failure (blocked, private mode) yields null. */
export function readStoredTheme(storage?: StorageLike | null): Theme | null {
  try { const v = storage?.getItem(THEME_STORAGE_KEY); return isTheme(v) ? v : null; } catch { return null; }
}

/** Persists only the theme preference. Returns false if storage is unavailable. */
export function writeStoredTheme(theme: Theme, storage?: StorageLike | null): boolean {
  try { if (!storage) return false; storage.setItem(THEME_STORAGE_KEY, theme); return true; } catch { return false; }
}

/** Default when nothing is stored: follow the system, falling back to dark (high-contrast). */
export function resolveTheme(stored: Theme | null, prefersLight?: boolean): Theme {
  return stored ?? (prefersLight ? 'light' : 'dark');
}

export function applyTheme(theme: Theme, root?: RootLike | null) {
  if (!root) return;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  if (root.style) root.style.colorScheme = theme;
  root.setAttribute?.('data-theme', theme);
}

function safeStorage(): Storage | null { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } }
function prefersLight(): boolean { try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: light)').matches; } catch { return false; } }

let current: Theme | null = null;

export function getTheme(): Theme {
  if (current) return current;
  if (typeof document !== 'undefined') {
    const a = document.documentElement.getAttribute('data-theme');
    if (isTheme(a)) return (current = a);
  }
  return (current = resolveTheme(readStoredTheme(safeStorage()), prefersLight()));
}

/** Call before React mounts. Idempotent. */
export function initTheme(): Theme {
  current = resolveTheme(readStoredTheme(safeStorage()), prefersLight());
  if (typeof document !== 'undefined') applyTheme(current, document.documentElement);
  return current;
}

export function setTheme(theme: Theme) {
  current = theme;
  if (typeof document !== 'undefined') applyTheme(theme, document.documentElement);
  writeStoredTheme(theme, safeStorage());
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(THEME_EVENT));
}

export function toggleTheme() { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }

/** Subscribe to local and cross-tab changes (storage event fires only in other tabs). */
export function subscribeTheme(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== THEME_STORAGE_KEY) return;
    const next = isTheme(e.newValue) ? e.newValue : resolveTheme(null, prefersLight());
    current = next;
    applyTheme(next, document.documentElement);
    cb();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_EVENT, cb);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(THEME_EVENT, cb); };
}
