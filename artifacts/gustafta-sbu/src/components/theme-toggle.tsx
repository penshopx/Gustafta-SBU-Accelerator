import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getTheme, subscribeTheme, toggleTheme } from '@/lib/theme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'dark' as const);
  const dark = theme === 'dark';
  const label = dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap';
  return <button type="button" data-testid="button-theme-toggle" onClick={toggleTheme} aria-label={label} title={label} aria-pressed={dark}
    className={`theme-toggle ${className}`}>
    {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
  </button>;
}
