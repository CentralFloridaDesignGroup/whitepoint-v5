import { useId, useRef, type ClipboardEvent, type ChangeEvent, type KeyboardEvent } from "react";
import { describedBy, join, useControlledValue } from "./shared";

const LENGTH = 6;
const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, LENGTH);

export type OTPInputProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Receives the completed code so callers need not wait for a state update. */
  triggerSubmittal?: (value: string) => void;
  label?: string;
  description?: string;
  error?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
};

/** Six-digit OTP entry with local focus handling and full-code paste support. */
export function OTPInput({ value, defaultValue = "", onChange, triggerSubmittal, label = "One-time password", description, error, id, name, disabled, readOnly, required = true, autoFocus, className, inputClassName }: OTPInputProps) {
  const generatedId = useId();
  const groupId = id ?? generatedId;
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [current, setCurrent] = useControlledValue(value === undefined ? undefined : onlyDigits(value), onlyDigits(defaultValue), onChange);

  const publish = (next: string, focusIndex: number) => {
    const code = onlyDigits(next);
    if (code === current) return;
    setCurrent(code);
    inputRefs.current[Math.min(focusIndex, LENGTH - 1)]?.focus();
    if (code.length === LENGTH) triggerSubmittal?.(code);
  };

  const insert = (index: number, text: string) => {
    const digits = onlyDigits(text);
    if (!digits) return;
    const start = Math.min(index, current.length);
    const next = (current.slice(0, start) + digits + current.slice(start + digits.length)).slice(0, LENGTH);
    publish(next, start + digits.length);
  };

  const handleChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value.replace(/\D/g, "");
    if (text) insert(index, text.length > 1 ? text : text.slice(-1));
    else if (index < current.length) publish(current.slice(0, index) + current.slice(index + 1), index);
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    insert(index, event.clipboardData.getData("text"));
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const removeAt = current[index] ? index : index - 1;
      if (removeAt >= 0) publish(current.slice(0, removeAt) + current.slice(removeAt + 1), Math.max(0, index - 1));
      else inputRefs.current[0]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < LENGTH - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  return <fieldset id={groupId} disabled={disabled} className={join("min-w-0", className)} aria-describedby={describedBy(groupId, description, error)} aria-invalid={Boolean(error)}>
    <legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend>
    <div className="grid max-w-sm grid-cols-6 gap-2">
      {Array.from({ length: LENGTH }, (_, index) => <input
        id={`${groupId}-digit-${index}`}
        key={index}
        ref={(element) => { inputRefs.current[index] = element; }}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={1}
        autoComplete={index === 0 ? "one-time-code" : "off"}
        autoFocus={autoFocus && index === 0}
        aria-label={`Digit ${index + 1} of ${LENGTH}`}
        aria-invalid={Boolean(error)}
        required={required}
        readOnly={readOnly}
        disabled={disabled}
        value={current[index] ?? ""}
        onChange={(event) => handleChange(index, event)}
        onPaste={(event) => handlePaste(index, event)}
        onKeyDown={(event) => handleKeyDown(index, event)}
        onFocus={(event) => event.target.select()}
        className={join("h-12 min-w-0 w-full rounded-lg border border-slate-300 bg-white text-center text-lg font-medium tabular-nums text-slate-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20 disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-red-600", inputClassName)}
      />)}
    </div>
    {name && <input type="hidden" name={name} value={current} />}
    {description && <p id={`${groupId}-description`} className="mt-1.5 text-xs text-slate-600">{description}</p>}
    {error && <p id={`${groupId}-error`} role="alert" className="mt-1.5 text-xs text-red-700">{error}</p>}
  </fieldset>;
}
