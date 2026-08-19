'use client';

import { TkxSelect } from 'tekivex-ui';
import { toMonthInputValue } from '@/src/lib/date-utils';

/**
 * Month + Year selector for resume dates.
 *
 * Resumes only need month + year (never a day), so a day-grid calendar is
 * the wrong tool — it confused users and showed a literal "yyyy". This is
 * two plain dropdowns (Month, Year) that read/write the app's canonical
 * `YYYY-MM` string. "Present" end-dates are handled by the caller's
 * checkbox (this renders disabled then).
 */
const MONTHS = [
  ['01', 'Jan'], ['02', 'Feb'], ['03', 'Mar'], ['04', 'Apr'],
  ['05', 'May'], ['06', 'Jun'], ['07', 'Jul'], ['08', 'Aug'],
  ['09', 'Sep'], ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'],
] as const;

const CURRENT_YEAR = 2026;
// Wide enough for education (older grads) through near-future graduations.
const YEARS: number[] = [];
for (let y = CURRENT_YEAR + 6; y >= 1965; y -= 1) YEARS.push(y);

function parse(value?: string | null): { year: string; month: string } {
  const ym = toMonthInputValue(value || ''); // '' or 'YYYY-MM'
  if (!ym) return { year: '', month: '' };
  const [y, m] = ym.split('-');
  return { year: y || '', month: m || '' };
}

export function MonthYearPicker({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value?: string | null;
  /** Called with a canonical `YYYY-MM` string (or '' when either part is cleared). */
  onChange: (yearMonth: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const { year, month } = parse(value);

  const emit = (nextMonth: string, nextYear: string) => {
    if (nextMonth && nextYear) onChange(`${nextYear}-${nextMonth}`);
    else onChange('');
  };

  const selectClass = `month-year-picker__select${invalid ? ' input-error' : ''}`;

  return (
    <div className="month-year-picker">
      {/* `label` carries the accessible name that aria-label used to provide —
       * TkxSelect exposes no aria-label prop. The labels are hidden visually by
       * .month-year-picker__select in globals.css, because "Month"/"Year" is
       * already obvious from the placeholder and two stacked labels would
       * double the height of every date row in the editor. */}
      <TkxSelect
        className={selectClass}
        label="Month"
        placeholder="Month"
        value={month || undefined}
        isDisabled={disabled}
        isInvalid={invalid}
        options={MONTHS.map(([v, label]) => ({ value: v, label }))}
        onChange={(next) => emit(String(next || ''), year)}
      />
      <TkxSelect
        className={selectClass}
        label="Year"
        placeholder="Year"
        searchable
        value={year || undefined}
        isDisabled={disabled}
        isInvalid={invalid}
        options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
        onChange={(next) => emit(month, String(next || ''))}
      />
    </div>
  );
}
