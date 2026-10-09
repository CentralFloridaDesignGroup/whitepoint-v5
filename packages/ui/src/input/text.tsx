import { Input, Textarea as HeadlessTextarea } from "@headlessui/react";
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import {
  FieldFrame,
  controlClass,
  describedBy,
  join,
  type FieldProps,
} from "./shared";

type TextFieldProps = FieldProps & {
  /** Existing callers may supply a required rule with a custom error message. */
  required?: boolean | { isRequired?: boolean; errorMessage?: string };
  regexFormat?: { format: RegExp; errorMessage?: string };
  /** @deprecated No longer supported. Will be removed in future versions. */
  onValidChange?: (field: string, value: string) => void;
  /** @deprecated No longer supported. Will be removed in future versions. */
  onValidReport?: (field: string, valid: boolean) => void;
};

function isRequired(rule: TextFieldProps["required"]) {
  return typeof rule === "boolean" ? rule : Boolean(rule?.isRequired);
}

function validationError(
  value: string,
  rule: TextFieldProps["required"],
  regex?: TextFieldProps["regexFormat"],
) {
  if (isRequired(rule) && !value.trim())
    return typeof rule === "object"
      ? (rule.errorMessage ?? "This field is required.")
      : "This field is required.";
  if (
    value &&
    regex &&
    !new RegExp(
      regex.format.source,
      regex.format.flags.replace(/[gy]/g, ""),
    ).test(value)
  )
    return regex.errorMessage ?? "Enter a valid value.";
  return undefined;
}

type NativeTextProps = Omit<InputHTMLAttributes<HTMLInputElement>, "required">;
export type TextboxProps = NativeTextProps &
  TextFieldProps & {
    autocompleteField?: string;
    characterLimit?: number;
    showRequiredError?: boolean;
  };

/** Native value/defaultValue and change events work without an adapter. */
export function Textbox({
  field,
  id,
  name,
  label,
  description,
  error,
  labelPosition,
  required,
  regexFormat,
  onValidChange,
  onValidReport,
  autocompleteField,
  characterLimit,
  showRequiredError = true,
  className,
  onChange,
  onBlur,
  autoComplete,
  maxLength,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: TextboxProps) {
  const generatedId = useId();
  const inputId = id ?? field ?? generatedId;
  const inputName = name ?? field;
  const requiredFlag = isRequired(required);
  const [validationMessage, setValidationMessage] = useState<string>();
  const message = error ?? validationMessage;
  const report = (value: string) => {
    const problem = validationError(value, required, regexFormat);
    setValidationMessage(problem);
    onValidReport?.(inputName ?? inputId, !problem);
    if (!problem) onValidChange?.(inputName ?? inputId, value);
  };
  return (
    <FieldFrame
      id={inputId}
      name={inputName}
      label={label}
      description={description}
      error={showRequiredError ? message : undefined}
      required={requiredFlag}
      labelPosition={labelPosition}
    >
      <Input
        {...props}
        id={inputId}
        name={inputName}
        type={props.type ?? "text"}
        required={requiredFlag}
        autoComplete={autoComplete ?? autocompleteField}
        maxLength={maxLength ?? characterLimit}
        aria-describedby={describedBy(
          inputId,
          description,
          showRequiredError ? message : undefined,
          ariaDescribedBy,
        )}
        aria-invalid={ariaInvalid ?? Boolean(message)}
        className={join(controlClass, className)}
        onChange={(event) => {
          onChange?.(event);
          report(event.target.value);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          report(event.target.value);
        }}
      />
    </FieldFrame>
  );
}

export type TextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "required"
> &
  TextFieldProps & {
    allowNewlines?: boolean;
    readonly?: boolean;
  };

export function Textarea({
  field,
  id,
  name,
  label,
  description,
  error,
  labelPosition,
  required,
  regexFormat,
  onValidChange,
  onValidReport,
  allowNewlines = true,
  readonly,
  className,
  onChange,
  onBlur,
  onKeyDown,
  readOnly,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? field ?? generatedId;
  const inputName = name ?? field;
  const requiredFlag = isRequired(required);
  const [validationMessage, setValidationMessage] = useState<string>();
  const message = error ?? validationMessage;
  const report = (value: string) => {
    const problem = validationError(value, required, regexFormat);
    setValidationMessage(problem);
    onValidReport?.(inputName ?? inputId, !problem);
    if (!problem) onValidChange?.(inputName ?? inputId, value);
  };
  return (
    <FieldFrame
      id={inputId}
      name={inputName}
      label={label}
      description={description}
      error={message}
      required={requiredFlag}
      labelPosition={labelPosition}
    >
      <HeadlessTextarea
        {...props}
        id={inputId}
        name={inputName}
        required={requiredFlag}
        readOnly={readOnly ?? readonly}
        aria-describedby={describedBy(
          inputId,
          description,
          message,
          ariaDescribedBy,
        )}
        aria-invalid={ariaInvalid ?? Boolean(message)}
        className={join(controlClass, "min-h-28 resize-y", className)}
        onChange={(event) => {
          onChange?.(event);
          report(event.target.value);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          report(event.target.value);
        }}
        onKeyDown={(event) => {
          if (!allowNewlines && event.key === "Enter") event.preventDefault();
          onKeyDown?.(event);
        }}
      />
    </FieldFrame>
  );
}
