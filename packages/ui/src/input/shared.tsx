import { useState, type ReactNode } from "react";

export type FieldProps = {
  label?: string;
  description?: string;
  error?: string;
  labelPosition?: "top" | "side";
};

/** Covers a locked field with a real link; disabled controls swallow clicks. */
export function LockedLinkOverlay({
  href,
  locked,
  label,
}: {
  href: string;
  locked: boolean;
  label?: ReactNode;
}) {
  if (!locked) return null;
  return (
    <a
      href={href}
      aria-label={typeof label === "string" ? `Open ${label}` : "Open linked record"}
      className="absolute inset-0 z-10 cursor-pointer rounded-md"
    />
  );
}

export const join = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");

export const linkedLockedClass =
  "disabled:text-blue-500 data-disabled:text-blue-500 read-only:text-blue-500";

export const controlClass = join(
  "block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm",
  "placeholder:text-slate-400 hover:border-slate-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20",
  "disabled:cursor-not-allowed disabled:bg-slate-50 aria-invalid:border-red-600 aria-invalid:focus:ring-red-600/20",
);

export function FieldFrame({
  id,
  label,
  description,
  error,
  required,
  children,
  className,
  labelPosition = "top",
}: FieldProps & {
  id: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={join(
        "min-w-0",
        labelPosition === "side" && "flex w-full items-center gap-3",
        className,
      )}
    >
      {label && (
        <label
          htmlFor={id}
          className={join(
            "font-medium text-slate-700",
            labelPosition === "side"
              ? "flex shrink-0 items-center whitespace-nowrap"
              : "mb-1.5 block",
          )}
        >
          {label}
          {required && (
            <span className="ml-1 text-red-600" aria-hidden="true">*</span>
          )}
        </label>
      )}
      <div className={join("min-w-0", labelPosition === "side" && "flex-1")}>
        {description && (
          <p id={`${id}-description`} className="mb-1.5 text-sm text-slate-600">
            {description}
          </p>
        )}
        {children}
        {error && (
          <p
            id={`${id}-error`}
            role="alert"
            className="mt-1.5 text-xs text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function describedBy(
  id: string,
  description?: string,
  error?: string,
  external?: string,
) {
  return (
    join(
      external,
      description && `${id}-description`,
      error && `${id}-error`,
    ) || undefined
  );
}

export function useControlledValue<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value === undefined ? internal : value;
  const set = (next: T) => {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };
  return [current, set] as const;
}
