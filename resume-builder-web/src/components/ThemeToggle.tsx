'use client';

import { useThemeMode } from './ThemeModeProvider';
import type { ThemeMode } from '@/src/lib/theme';
import { TkxButton } from 'tekivex-ui';

const OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Light', icon: '☀' },
  { mode: 'dark', label: 'Dark', icon: '☾' },
  { mode: 'system', label: 'System', icon: '⌘' },
];

/**
 * Three-way light / dark / system control.
 *
 * A three-way switch rather than a binary toggle on purpose: 'system' is a
 * distinct state, and collapsing it into a two-way toggle means a user who
 * wants to follow their OS has no way to say so once they have touched it.
 *
 * Uses a radiogroup rather than buttons so screen readers announce it as one
 * control with three choices instead of three unrelated buttons.
 */
export default function ThemeToggle() {
  const { mode, setMode } = useThemeMode();

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((opt) => (
        <TkxButton
          key={opt.mode}
          type="button"
          role="radio"
          aria-checked={mode === opt.mode}
          className="theme-toggle__option"
          data-active={mode === opt.mode ? 'true' : undefined}
          onClick={() => setMode(opt.mode)}
          title={`${opt.label} theme`}
        >
          <span aria-hidden="true">{opt.icon}</span>
          <span className="theme-toggle__label">{opt.label}</span>
        </TkxButton>
      ))}
    </div>
  );
}
