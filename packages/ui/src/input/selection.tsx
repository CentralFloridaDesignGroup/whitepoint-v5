import { Combobox as HCombobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions, Listbox, ListboxButton, ListboxOption, ListboxOptions, Switch } from "@headlessui/react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { FieldFrame, controlClass, describedBy, join, useControlledValue, type FieldProps } from "./shared";

export type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectionProps = FieldProps & {
  id?: string;
  name?: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  optionsClassName?: string;
  "aria-describedby"?: string;
};

function OptionList({ options, option: Option }: { options: SelectOption[]; option: typeof ListboxOption | typeof ComboboxOption }) {
  return options.map((item) => <Option key={item.value} value={item.value} disabled={item.disabled}
    className="group flex cursor-default items-center justify-between gap-3 px-3 py-2 text-sm text-slate-800 outline-none data-focus:bg-primary-50 data-selected:font-medium data-disabled:opacity-40">
    {item.label}<Check aria-hidden="true" className="size-4 text-primary-700 opacity-0 group-data-selected:opacity-100" />
  </Option>);
}

const menuClass = "z-50 mt-1 max-h-64 w-[var(--button-width)] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg [--anchor-gap:4px] empty:hidden";

export type DropdownProps = SelectionProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value" | "defaultValue" | "children" | "name">;
export function Dropdown({ id, name, field, label, description, error, labelPosition, options, value, defaultValue = "", onChange, placeholder = "Select an option", disabled, required, className, optionsClassName, "aria-describedby": ariaDescribedBy, ...buttonProps }: DropdownProps) {
  const generatedId = useId();
  const inputId = id ?? field ?? generatedId;
  const inputName = name ?? field;
  const [selected, setSelected] = useControlledValue(value, defaultValue, onChange);
  const selectedLabel = options.find((item) => item.value === selected)?.label;
  return <FieldFrame id={inputId} name={inputName} label={label} description={description} error={error} required={required} labelPosition={labelPosition}>
    <Listbox value={selected} onChange={setSelected} name={inputName} disabled={disabled} invalid={Boolean(error)}>
      <ListboxButton {...buttonProps} id={inputId} aria-required={required} aria-describedby={describedBy(inputId, description, error, ariaDescribedBy)} className={join(controlClass, "flex items-center justify-between gap-2 text-left", className)}>
        <span className={join("truncate", !selectedLabel && "text-slate-400")}>{selectedLabel ?? placeholder}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-500" />
      </ListboxButton>
      <ListboxOptions anchor="bottom start" className={join(menuClass, optionsClassName)}>
        <OptionList options={options} option={ListboxOption} />
      </ListboxOptions>
    </Listbox>
  </FieldFrame>;
}

export type SearchableDropdownProps = SelectionProps & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "defaultValue" | "children" | "name" | "size"> & {
  emptyText?: string;
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  filter?: (option: SelectOption, query: string) => boolean;
};

export function SearchableDropdown({ id, name, field, label, description, error, labelPosition, options, value, defaultValue = "", onChange, placeholder = "Search options", disabled, required, className, optionsClassName, emptyText = "No matches found", query, defaultQuery = "", onQueryChange, filter, "aria-describedby": ariaDescribedBy, ...inputProps }: SearchableDropdownProps) {
  const generatedId = useId();
  const inputId = id ?? field ?? generatedId;
  const inputName = name ?? field;
  const [selected, setSelected] = useControlledValue(value, defaultValue, onChange);
  const [search, setSearch] = useControlledValue(query, defaultQuery, onQueryChange);
  const selectedLabel = options.find((item) => item.value === selected)?.label ?? "";
  const matches = options.filter((item) => filter ? filter(item, search) : item.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <FieldFrame id={inputId} name={inputName} label={label} description={description} error={error} required={required} labelPosition={labelPosition}>
    <HCombobox value={selected} onChange={(next) => { setSelected(next ?? ""); setSearch(""); }} onClose={() => setSearch("")} name={inputName} disabled={disabled} invalid={Boolean(error)}>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <ComboboxInput {...inputProps} id={inputId} displayValue={() => selectedLabel} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} autoComplete="off"
          aria-required={required} aria-describedby={describedBy(inputId, description, error, ariaDescribedBy)} className={join(controlClass, "pl-9 pr-9", className)} />
        <ComboboxButton className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600">
          <ChevronDown aria-hidden="true" className="size-4" />
        </ComboboxButton>
      </div>
      <ComboboxOptions anchor="bottom start" className={join(menuClass, "w-[var(--input-width)]", optionsClassName)}>
        {matches.length ? <OptionList options={matches} option={ComboboxOption} /> : <div className="px-3 py-2 text-sm text-slate-500">{emptyText}</div>}
      </ComboboxOptions>
    </HCombobox>
  </FieldFrame>;
}

type CheckProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & FieldProps & { label?: string; children?: ReactNode };
export type CheckboxProps = CheckProps & { type?: "checkbox" | "switch" };
export function Checkbox({ type, ...props }: CheckboxProps) {
  const { id, field, name, label, description, error, colorMode: _colorMode, labelPosition: _labelPosition, checked, defaultChecked, onChange, disabled, className, children, "aria-describedby": ariaDescribedBy, ...rest } = props;
  void _colorMode;
  void _labelPosition;
  const generatedId = useId();
  const inputId = id ?? field ?? generatedId;
  return <div className="flex items-start gap-2.5">
    <input {...rest} id={inputId} name={name ?? field} type="checkbox" role={type === "switch" ? "switch" : undefined} checked={checked} defaultChecked={defaultChecked} onChange={onChange} disabled={disabled}
      aria-describedby={describedBy(inputId, description, error, ariaDescribedBy)} aria-invalid={Boolean(error)}
      className={join(type === "switch" ? "mt-0.5 h-5 w-9 appearance-none rounded-full bg-slate-300 p-0.5 before:block before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:bg-primary-700 checked:before:translate-x-4" : "mt-0.5 size-4 rounded border-slate-400 text-primary-700 accent-primary-700", "shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 disabled:cursor-not-allowed disabled:opacity-50", className)} />
    <div><label htmlFor={inputId} className="cursor-pointer text-sm font-medium text-slate-700">{children ?? label ?? name ?? field ?? "Checkbox"}</label>
      {description && <p id={`${inputId}-description`} className="text-xs text-slate-600">{description}</p>}
      {error && <p id={`${inputId}-error`} role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  </div>;
}

export type ToggleProps = Omit<CheckProps, "onChange"> & { onChange?: (checked: boolean) => void; onCheckedChange?: (checked: boolean) => void };
export function Toggle({ id, field, name, label, description, error, checked, defaultChecked, onChange, onCheckedChange, disabled, className, children, required, "aria-describedby": ariaDescribedBy }: ToggleProps) {
  const generatedId = useId();
  const inputId = id ?? field ?? generatedId;
  const [enabled, setEnabled] = useControlledValue(checked, defaultChecked ?? false, (next) => { onChange?.(next); onCheckedChange?.(next); });
  return <div className="flex items-center gap-3">
    <Switch id={inputId} name={name ?? field} value="on" checked={enabled} onChange={setEnabled} disabled={disabled} aria-required={required} aria-invalid={Boolean(error)}
      aria-describedby={describedBy(inputId, description, error, ariaDescribedBy)}
      className={join("group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full bg-slate-300 p-0.5 transition-colors data-checked:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 data-disabled:cursor-not-allowed data-disabled:opacity-50", className)}>
      <span aria-hidden="true" className="size-5 rounded-full bg-white shadow-sm transition-transform group-data-checked:translate-x-5" />
    </Switch>
    <div><label htmlFor={inputId} className="cursor-pointer text-sm font-medium text-slate-700">{children ?? label ?? name ?? field ?? "Toggle"}</label>
      {description && <p id={`${inputId}-description`} className="text-xs text-slate-600">{description}</p>}
      {error && <p id={`${inputId}-error`} role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  </div>;
}
