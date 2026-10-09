import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const labelClass = "block text-sm font-semibold text-gray-900";
const helpClass = "mt-1 text-sm text-gray-500";
const fieldClass = "mt-2 block w-full border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";

export interface MarketingTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  field: string;
  label: string;
  helperText?: string;
  error?: string | null;
}

export function MarketingTextField({ field, label, helperText, error, className, ...inputProps }: MarketingTextFieldProps): React.JSX.Element {
  return (
    <div className={className}>
      <label htmlFor={field} className={labelClass}>{label}</label>
      {helperText ? <p className={helpClass}>{helperText}</p> : null}
      <input
        {...inputProps}
        id={field}
        name={field}
        className={cx(fieldClass, error && "border-red-500 focus:border-red-600 focus:ring-red-500/15")}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${field}-error` : undefined}
      />
      {error ? <p id={`${field}-error`} className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
    </div>
  );
}

export interface MarketingTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  field: string;
  label: string;
  helperText?: string;
  error?: string | null;
}

export function MarketingTextarea({ field, label, helperText, error, className, ...textareaProps }: MarketingTextareaProps): React.JSX.Element {
  return (
    <div className={className}>
      <label htmlFor={field} className={labelClass}>{label}</label>
      {helperText ? <p className={helpClass}>{helperText}</p> : null}
      <textarea
        {...textareaProps}
        id={field}
        name={field}
        className={cx(fieldClass, "min-h-36 resize-y", error && "border-red-500 focus:border-red-600 focus:ring-red-500/15")}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${field}-error` : undefined}
      />
      {error ? <p id={`${field}-error`} className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
    </div>
  );
}

export interface MarketingSelectOption {
  label: string;
  value: string;
}

export interface MarketingSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  field: string;
  label: string;
  options: MarketingSelectOption[];
  helperText?: string;
  error?: string | null;
}

export function MarketingSelect({ field, label, options, helperText, error, className, ...selectProps }: MarketingSelectProps): React.JSX.Element {
  return (
    <div className={className}>
      <label htmlFor={field} className={labelClass}>{label}</label>
      {helperText ? <p className={helpClass}>{helperText}</p> : null}
      <select
        {...selectProps}
        id={field}
        name={field}
        className={cx(fieldClass, "appearance-none", error && "border-red-500 focus:border-red-600 focus:ring-red-500/15")}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${field}-error` : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {error ? <p id={`${field}-error`} className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
