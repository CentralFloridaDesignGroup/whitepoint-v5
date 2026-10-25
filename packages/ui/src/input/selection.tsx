import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Switch,
} from "@headlessui/react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import {
  FieldFrame,
  LockedLinkOverlay,
  controlClass,
  linkedLockedClass,
  describedBy,
  join,
  useControlledValue,
  type FieldProps,
} from "./shared";

export type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectProps = FieldProps & {
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
  "aria-describedby"?: string;
};

const menuClass =
  "z-50 mt-1 max-h-64 w-[var(--button-width)] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg [--anchor-gap:4px] empty:hidden";
const optionClass =
  "group flex cursor-default items-center justify-between gap-3 px-3 py-2 text-sm text-slate-800 outline-none data-focus:bg-primary-50 data-selected:font-medium data-disabled:opacity-40";

export type DropdownProps = SelectProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onChange" | "value" | "defaultValue" | "children" | "name"
  >;
export function Dropdown({
  id,
  name,
  label,
  description,
  error,
  labelPosition,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Select an option",
  disabled,
  required,
  className,
  "aria-describedby": ariaDescribedBy,
  ...buttonProps
}: DropdownProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [selected, setSelected] = useControlledValue(
    value,
    defaultValue,
    onChange,
  );
  const selectedLabel = options.find(
    (option) => option.value === selected,
  )?.label;
  return (
    <FieldFrame
      id={inputId}
      label={label}
      description={description}
      error={error}
      required={required}
      labelPosition={labelPosition}
    >
      <Listbox
        value={selected}
        onChange={setSelected}
        name={name}
        disabled={disabled}
        invalid={Boolean(error)}
      >
        <ListboxButton
          {...buttonProps}
          id={inputId}
          aria-required={required}
          aria-describedby={describedBy(
            inputId,
            description,
            error,
            ariaDescribedBy,
          )}
          className={join(
            controlClass,
            "flex items-center justify-between gap-2 text-left",
            className,
          )}
        >
          <span
            className={join("truncate", !selectedLabel && "text-slate-400")}
          >
            {selectedLabel ?? placeholder}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-slate-500"
          />
        </ListboxButton>
        <ListboxOptions anchor="bottom start" className={menuClass}>
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className={optionClass}
            >
              {option.label}
              <Check
                aria-hidden="true"
                className="size-4 text-primary-700 opacity-0 group-data-selected:opacity-100"
              />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </FieldFrame>
  );
}

export type LinkedDropdownProps = DropdownProps & {
  /** Link to navigate to when the dropdown is readonly and clicked */
  linkRef: string;
};

export function LinkedDropdown({
  id,
  name,
  label,
  description,
  error,
  labelPosition,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Select an option",
  disabled,
  required,
  className,
  "aria-describedby": ariaDescribedBy,
  linkRef,
  ...buttonProps
}: LinkedDropdownProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [selected, setSelected] = useControlledValue(
    value,
    defaultValue,
    onChange,
  );
  const selectedLabel = options.find(
    (option) => option.value === selected,
  )?.label;
  return (
    <FieldFrame
      id={inputId}
      label={label}
      description={description}
      error={error}
      required={required}
      labelPosition={labelPosition}
    >
      <Listbox
        value={selected}
        onChange={setSelected}
        name={name}
        disabled={disabled}
        invalid={Boolean(error)}
      >
        <div className="relative">
          <ListboxButton
            {...buttonProps}
            id={inputId}
            aria-required={required}
            aria-describedby={describedBy(
              inputId,
              description,
              error,
              ariaDescribedBy,
            )}
            className={join(
              controlClass,
              "flex w-full items-center justify-between gap-2 text-left",
              linkedLockedClass,
              className,
            )}
          >
            <span
              className={join("truncate", !selectedLabel && "text-slate-400")}
            >
              {selectedLabel ?? placeholder}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-slate-500"
            />
          </ListboxButton>
          <LockedLinkOverlay
            href={linkRef}
            locked={Boolean(disabled)}
            label={label}
          />
        </div>
        <ListboxOptions anchor="bottom start" className={menuClass}>
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className={optionClass}
            >
              {option.label}
              <Check
                aria-hidden="true"
                className="size-4 text-primary-700 opacity-0 group-data-selected:opacity-100"
              />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </FieldFrame>
  );
}

export type SearchableDropdownProps = SelectProps &
  Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value" | "defaultValue" | "children" | "name" | "size"
  > & { emptyText?: string };
export function SearchableDropdown({
  id,
  name,
  label,
  description,
  error,
  labelPosition,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Search options",
  disabled,
  required,
  className,
  emptyText = "No matches found",
  "aria-describedby": ariaDescribedBy,
  ...inputProps
}: SearchableDropdownProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [selected, setSelected] = useControlledValue(
    value,
    defaultValue,
    onChange,
  );
  const [query, setQuery] = useState("");
  const selectedLabel =
    options.find((option) => option.value === selected)?.label ?? "";
  const matches = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <FieldFrame
      id={inputId}
      label={label}
      description={description}
      error={error}
      required={required}
      labelPosition={labelPosition}
    >
      <Combobox
        value={selected}
        onChange={(next) => {
          setSelected(next ?? "");
          setQuery("");
        }}
        onClose={() => setQuery("")}
        name={name}
        disabled={disabled}
        invalid={Boolean(error)}
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          />
          <ComboboxInput
            {...inputProps}
            id={inputId}
            displayValue={() => selectedLabel}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            aria-required={required}
            aria-describedby={describedBy(
              inputId,
              description,
              error,
              ariaDescribedBy,
            )}
            className={join(controlClass, "pl-9 pr-9", className)}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600">
            <ChevronDown aria-hidden="true" className="size-4" />
          </ComboboxButton>
        </div>
        <ComboboxOptions
          anchor="bottom start"
          className={join(menuClass, "w-[var(--input-width)]")}
        >
          {matches.length ? (
            matches.map((option) => (
              <ComboboxOption
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={optionClass}
              >
                {option.label}
                <Check
                  aria-hidden="true"
                  className="size-4 text-primary-700 opacity-0 group-data-selected:opacity-100"
                />
              </ComboboxOption>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500">{emptyText}</div>
          )}
        </ComboboxOptions>
      </Combobox>
    </FieldFrame>
  );
}

export type LinkedSearchableDropdownProps = SearchableDropdownProps & {
  /** Link to navigate to when the dropdown is readonly and clicked */
  linkRef: string;
};

export function LinkedSearchableDropdown({
  id,
  name,
  label,
  description,
  error,
  labelPosition,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Search options",
  disabled,
  required,
  className,
  emptyText = "No matches found",
  "aria-describedby": ariaDescribedBy,
  linkRef,
  ...inputProps
}: LinkedSearchableDropdownProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [selected, setSelected] = useControlledValue(
    value,
    defaultValue,
    onChange,
  );
  const [query, setQuery] = useState("");
  const selectedLabel =
    options.find((option) => option.value === selected)?.label ?? "";
  const matches = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <FieldFrame
      id={inputId}
      label={label}
      description={description}
      error={error}
      required={required}
      labelPosition={labelPosition}
    >
      <Combobox
        value={selected}
        onChange={(next) => {
          setSelected(next ?? "");
          setQuery("");
        }}
        onClose={() => setQuery("")}
        name={name}
        disabled={disabled}
        invalid={Boolean(error)}
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          />
          <ComboboxInput
            {...inputProps}
            id={inputId}
            displayValue={() => selectedLabel}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            aria-required={required}
            aria-describedby={describedBy(
              inputId,
              description,
              error,
              ariaDescribedBy,
            )}
            className={join(controlClass, linkedLockedClass, "pl-9 pr-9", className)}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600">
            <ChevronDown aria-hidden="true" className="size-4" />
          </ComboboxButton>
          <LockedLinkOverlay
            href={linkRef}
            locked={Boolean(disabled)}
            label={label}
          />
        </div>
        <ComboboxOptions
          anchor="bottom start"
          className={join(menuClass, "w-[var(--input-width)]")}
        >
          {matches.length ? (
            matches.map((option) => (
              <ComboboxOption
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={optionClass}
              >
                {option.label}
                <Check
                  aria-hidden="true"
                  className="size-4 text-primary-700 opacity-0 group-data-selected:opacity-100"
                />
              </ComboboxOption>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500">{emptyText}</div>
          )}
        </ComboboxOptions>
      </Combobox>
    </FieldFrame>
  );
}

type CheckProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "children"
> &
  FieldProps;
export type CheckboxProps = CheckProps;
export function Checkbox({
  id,
  label,
  description,
  error,
  labelPosition: _labelPosition,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: CheckboxProps) {
  void _labelPosition;
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex items-center gap-2.5">
      <input
        {...props}
        id={inputId}
        type="checkbox"
        aria-describedby={describedBy(
          inputId,
          description,
          error,
          ariaDescribedBy,
        )}
        aria-invalid={ariaInvalid ?? Boolean(error)}
        className={join(
          "size-4 shrink-0 rounded border-slate-400 accent-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      />
      <div>
        {label && (
          <label
            htmlFor={inputId}
            className="cursor-pointer text-sm font-medium text-slate-700"
          >
            {label}
          </label>
        )}
        {description && (
          <p id={`${inputId}-description`} className="text-xs text-slate-600">
            {description}
          </p>
        )}
        {error && (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="text-xs text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export type ToggleProps = Omit<CheckProps, "onChange"> & {
  onChange?: (checked: boolean) => void;
};
export function Toggle({
  id,
  name,
  label,
  description,
  error,
  labelPosition: _labelPosition,
  checked,
  defaultChecked,
  onChange,
  disabled,
  className,
  required,
  "aria-describedby": ariaDescribedBy,
}: ToggleProps) {
  void _labelPosition;
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [enabled, setEnabled] = useControlledValue(
    checked,
    defaultChecked ?? false,
    onChange,
  );
  return (
    <div className="flex items-center gap-3">
      <Switch
        id={inputId}
        name={name}
        value="on"
        checked={enabled}
        onChange={setEnabled}
        disabled={disabled}
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(
          inputId,
          description,
          error,
          ariaDescribedBy,
        )}
        className={join(
          "group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full bg-slate-300 p-0.5 transition-colors data-checked:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 data-disabled:cursor-not-allowed data-disabled:opacity-50",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="size-5 rounded-full bg-white shadow-sm transition-transform group-data-checked:translate-x-5"
        />
      </Switch>
      <div>
        <label
          htmlFor={inputId}
          className="cursor-pointer text-sm font-medium text-slate-700"
        >
          {label}
        </label>
        {description && (
          <p id={`${inputId}-description`} className="text-xs text-slate-600">
            {description}
          </p>
        )}
        {error && (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="text-xs text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
