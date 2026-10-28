import assert from 'node:assert/strict';
import test from 'node:test';
import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, resolveTheme, writeStoredTheme } from './theme.ts';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };
const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
const root = () => { const s = new Set<string>(); const attrs: Record<string, string> = {}; return { s, attrs, style: {} as { colorScheme?: string }, classList: { toggle: (n: string, f?: boolean) => { if (f) s.add(n); else s.delete(n); return !!f; } }, setAttribute: (n: string, v: string) => { attrs[n] = v; } }; };

test('theme: resolves default from system, stored value wins', () => {
  assert.equal(resolveTheme(null, true), 'light');
  assert.equal(resolveTheme(null, false), 'dark');
  assert.equal(resolveTheme('dark', true), 'dark');
});

test('theme: persists only the theme key and restores it', () => {
  const s = mem();
  assert.equal(writeStoredTheme('light', s), true);
  assert.deepEqual([...s.m.keys()], [THEME_STORAGE_KEY]);
  assert.equal(readStoredTheme(s), 'light');
  s.setItem(THEME_STORAGE_KEY, 'neon');
  assert.equal(readStoredTheme(s), null);
});

test('theme: blocked storage never throws', () => {
  assert.equal(readStoredTheme(blocked), null);
  assert.equal(writeStoredTheme('dark', blocked), false);
  assert.equal(readStoredTheme(null), null);
});

test('theme: apply toggles dark class and color-scheme', () => {
  const r = root();
  applyTheme('dark', r);
  assert.ok(r.s.has('dark')); assert.equal(r.style.colorScheme, 'dark'); assert.equal(r.attrs['data-theme'], 'dark');
  applyTheme('light', r);
  assert.ok(!r.s.has('dark')); assert.ok(r.s.has('light')); assert.equal(r.attrs['data-theme'], 'light');
});
