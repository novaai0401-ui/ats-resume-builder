'use client';

import { AutocompleteInput } from './AutocompleteInput';
import { TkxButton } from 'tekivex-ui';

/**
 * Tag input WITH autocomplete suggestions.
 *
 * Layout is deliberate: the removable chips render ABOVE the text input and
 * the suggestion dropdown opens BELOW it. The earlier skills UI put the
 * chips + Add button directly under the input, so the absolutely-positioned
 * suggestion menu covered them and swallowed the clicks (nothing added or
 * removed). Chips-above + menu-below can never overlap, so add and delete
 * both work while keeping suggestions.
 */
export function SuggestingTagInput({
  label,
  tags,
  onAdd,
  onRemove,
  fetchSuggestions,
  localSuggestions,
  placeholder,
  inputValue,
  onInputChange,
  chipClassName = 'skill-chip',
  testId,
}: {
  label?: string;
  tags: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  fetchSuggestions?: (query: string) => Promise<string[]>;
  localSuggestions?: string[];
  placeholder?: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  chipClassName?: string;
  testId?: string;
}) {
  return (
    <div className="tag-input" data-testid={testId}>
      {label ? <label className="label">{label}</label> : null}
      {tags.length > 0 ? (
        <div className="tag-input__chips">
          {tags.map((tag) => (
            <TkxButton
              type="button"
              key={`${testId || 'tag'}-${tag}`}
              className={chipClassName}
              onClick={() => onRemove(tag)}
              title={`Remove ${tag}`}
              aria-label={`Remove ${tag}`}
            >
              {tag} <span aria-hidden>×</span>
            </TkxButton>
          ))}
        </div>
      ) : null}
      <AutocompleteInput
        value={inputValue}
        onChange={onInputChange}
        onSelect={(value) => {
          const clean = String(value || '').trim();
          if (clean) onAdd(clean);
          onInputChange('');
        }}
        fetchSuggestions={fetchSuggestions}
        localSuggestions={localSuggestions}
        placeholder={placeholder}
        className="input"
        testId={testId ? `${testId}-input` : undefined}
      />
    </div>
  );
}
