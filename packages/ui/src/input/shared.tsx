import { useState, type ReactNode } from "react";

export type FieldProps = {
  label?: string;
  description?: string;
  error?: string;
  field?: string;
  labelPosition?: "top" | "side";
  colorMode?: "light" | "auto";
};

export const join = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

export const controlClass = join(
  "block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm",
  "placeholder:text-slate-400 hover:border-slate-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20",
  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-invalid:border-red-600 aria-invalid:focus:ring-red-600/20",
);

export function FieldFrame({ id, name, label, description, error, required, children, className, labelPosition = "top" }: FieldProps & {
  id: string;
  name?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return <div className={join("min-w-0", labelPosition === "side" && "sm:grid sm:grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)] sm:items-start sm:gap-3", className)}>
    <label htmlFor={id} className={join("mb-1.5 block text-sm font-medium text-slate-700", labelPosition === "side" && "sm:pt-2.5")}>
      {label ?? name ?? "Field"}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
    </label>
    <div className="min-w-0">
      {children}
      {description && <p id={`${id}-description`} className="mt-1.5 text-xs text-slate-600">{description}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-700">{error}</p>}
    </div>
  </div>;
}

export function describedBy(id: string, description?: string, error?: string, external?: string) {
  return join(external, description && `${id}-description`, error && `${id}-error`) || undefined;
}

export function useControlledValue<T>(value: T | undefined, defaultValue: T, onChange?: (value: T) => void) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value === undefined ? internal : value;
  const set = (next: T) => {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };
  return [current, set] as const;
}
