'use client';

import { TkxDatePicker } from 'tekivex-ui';
import { toMonthInputValue } from '@/src/lib/date-utils';

/**
 * Month/Year picker backed by tekivex TkxDatePicker (the calendar the
 * founder wants), but storing the app's canonical `YYYY-MM` string.
 *
 * Resumes only need month + year, so we normalise any picked day to the
 * first of the month on the way out and always feed day=1 on the way in.
 * "Present" end-dates are handled by the caller's checkbox (this renders
 * disabled then).
 */
function toDate(value?: string | null): Date | null {
  const ym = toMonthInputValue(value || ''); // '' or 'YYYY-MM'
  if (!ym) return null;
  const [y, m] = ym.split('-').map((n) => Number(n));
  if (!y || !m) return null;
  return new Date(y, m - 1, 1);
}

function toYearMonthString(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function MonthYearPicker({
  value,
  onChange,
  disabled,
  invalid,
  placeholder = 'Pick month & year',
}: {
  value?: string | null;
  /** Called with a canonical `YYYY-MM` string (or '' when cleared). */
  onChange: (yearMonth: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <TkxDatePicker
      value={toDate(value)}
      onChange={(date) => onChange(toYearMonthString(date))}
      isDisabled={disabled}
      isInvalid={invalid}
      placeholder={placeholder}
      dateFormat="MMM yyyy"
    />
  );
}
