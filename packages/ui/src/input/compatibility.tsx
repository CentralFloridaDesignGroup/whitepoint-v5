import { useId, type ChangeEvent } from "react";
import { SearchableDropdown, type SelectOption } from "./selection";
import { Textbox, type TextboxProps } from "./text";

type LegacySelection = { key: string; value: string };
export type ComboboxProperties = {
  field: string;
  label?: string;
  labelPosition?: "top" | "side";
  selections: Record<string, unknown> | LegacySelection[];
  value?: string;
  defaultIndex?: number;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  colorMode?: "light" | "dark" | "auto";
  portal?: boolean;
  maxOptionsHeight?: string | number;
  onChange?: (field: string, value: string) => void;
  onValidChange?: (field: string, value: string) => void;
  onValidReport?: (field: string, valid: boolean) => void;
  props?: { classNames?: string; inputClassNames?: string; optionsClassNames?: string };
};

/** @deprecated Use SearchableDropdown with its value callback. Retained for current Manage and Docs callers. */
export function Combobox({ field, label, labelPosition, selections, value, defaultIndex, disabled, required, placeholder, onChange, onValidChange, onValidReport, props }: ComboboxProperties) {
  const options: SelectOption[] = Array.isArray(selections)
    ? selections.map(({ key, value }) => ({ label: key, value: String(value) }))
    : Object.entries(selections).map(([key, item]) => ({ label: key, value: String(item) }));
  const handleChange = (next: string) => {
    onChange?.(field, next);
    const valid = !required || Boolean(next);
    onValidReport?.(field, valid);
    if (valid) onValidChange?.(field, next);
  };
  return <div className={props?.classNames}>
    <SearchableDropdown field={field} label={label} labelPosition={labelPosition} options={options} value={value}
      defaultValue={defaultIndex === undefined ? "" : options[defaultIndex]?.value ?? ""} onChange={handleChange}
      disabled={disabled} required={required} placeholder={placeholder} className={props?.inputClassNames} optionsClassName={props?.optionsClassNames} />
  </div>;
}

export type TextboxSuggestionProperties = Omit<TextboxProps, "onChange"> & {
  field: string;
  suggestions: Array<Record<string, unknown> | LegacySelection>;
  onChange?: (field: string, value: string) => void;
};

/** @deprecated Use Textbox with an app-owned datalist. Retained for the Docs survey notes editor. */
export function TextboxSuggestion({ field, suggestions, onChange, ...props }: TextboxSuggestionProperties) {
  const listId = useId();
  return <>
    <Textbox {...props} field={field} list={listId} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange?.(field, event.target.value)} />
    <datalist id={listId}>{suggestions.map((suggestion, index) => {
      const value = "value" in suggestion ? suggestion.value : Object.values(suggestion)[0];
      return <option key={`${index}-${String(value ?? "")}`} value={String(value ?? "")} />;
    })}</datalist>
  </>;
}
