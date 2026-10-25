import { Input, Textarea as HeadlessTextarea } from "@headlessui/react";
import {
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import {
  FieldFrame,
  LockedLinkOverlay,
  controlClass,
  linkedLockedClass,
  describedBy,
  join,
  type FieldProps,
} from "./shared";

export type TextboxProps = InputHTMLAttributes<HTMLInputElement> & FieldProps & {
  /** Text to display before the input value. For instance, a currency symbol like "$" */
  textPrefix?: string;
};

export function Textbox({
  id,
  label,
  description,
  error,
  labelPosition,
  className,
  textPrefix,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: TextboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <FieldFrame
      id={inputId}
      label={label}
      description={description}
      error={error}
      required={props.required}
      labelPosition={labelPosition}
    >
      <div className="relative">
        <Input
          {...props}
          id={inputId}
          type={props.type ?? "text"}
          aria-describedby={describedBy(
            inputId,
            description,
            error,
            ariaDescribedBy,
          )}
          aria-invalid={ariaInvalid ?? Boolean(error)}
          className={join(controlClass, textPrefix && "pl-5", className)}
        />
        {textPrefix && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-500">
            {textPrefix}
          </span>
        )}
      </div>
    </FieldFrame>
  );
}

export type LinkedTextboxProps = TextboxProps & {
  /** Link to navigate to when the textbox is readonly and clicked */
  linkRef: string;
};

export function LinkedTextbox({
  id,
  label,
  description,
  error,
  labelPosition,
  className,
  textPrefix,
  linkRef,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: LinkedTextboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <FieldFrame
      id={inputId}
      label={label}
      description={description}
      error={error}
      required={props.required}
      labelPosition={labelPosition}
    >
      <div className="relative">
        <Input
          {...props}
          id={inputId}
          type={props.type ?? "text"}
          aria-describedby={describedBy(
            inputId,
            description,
            error,
            ariaDescribedBy,
          )}
          aria-invalid={ariaInvalid ?? Boolean(error)}
          className={join(controlClass, linkedLockedClass, textPrefix && "pl-5", className)}
        />
        {textPrefix && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-500">
            {textPrefix}
          </span>
        )}
        <LockedLinkOverlay
          href={linkRef}
          locked={Boolean(props.readOnly || props.disabled)}
          label={label}
        />
      </div>
    </FieldFrame>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  FieldProps;

export function Textarea({
  id,
  label,
  description,
  error,
  labelPosition,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <FieldFrame
      id={inputId}
      label={label}
      description={description}
      error={error}
      required={props.required}
      labelPosition={labelPosition}
    >
      <HeadlessTextarea
        {...props}
        id={inputId}
        aria-describedby={describedBy(
          inputId,
          description,
          error,
          ariaDescribedBy,
        )}
        aria-invalid={ariaInvalid ?? Boolean(error)}
        className={join(controlClass, "min-h-28 resize-y", className)}
      />
    </FieldFrame>
  );
}
