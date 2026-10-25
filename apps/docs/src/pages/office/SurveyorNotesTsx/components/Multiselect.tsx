import { useEffect, useRef, useState } from "react";
import { cx, labelClass } from "./styles";

const emptySelectedValues: string[] = [];

/**
 * Props for the shared dense multiselect card group.
 */
export interface MultiselectComponentProps {
  /** Field name used for callback identification. */
  field: string;
  /** Visible fieldset label. */
  label: string;
  /** Optional parent grid span from 1 to 6. */
  columns?: number;
  /** Options rendered as selectable cards. */
  options?: { key: string, value: string, exportValue?: string }[];
  /** Called after user interaction with the formatted selected values. */
  onChange?: (field: string, value: string) => void;
  /** Called after user interaction with the selected option values. */
  onValueChange?: (field: string, values: string[]) => void;
  /** Separator used when formatting three or more selected values. */
  separator?: string;
  /** Helper copy shown below the legend. */
  helperText?: string;
  /** Whether callback output uses option keys or values. Defaults to "key". */
  exportType?: 'key' | 'value';
  /** Controlled selected option values. */
  value?: string[];
  /** Uncontrolled initial selected option values. */
  defaultValue?: string[];
}

/**
 * Dense industrial multiselect card grid with formatted value output.
 */
export function Multiselect ({
  field,
  label,
  columns = 1,
  options = [],
  onChange,
  onValueChange,
  separator = ', ',
  helperText = '',
  exportType = 'key',
  value,
  defaultValue = emptySelectedValues,
}: MultiselectComponentProps): React.JSX.Element {
  const [internalSelectedValues, setInternalSelectedValues] = useState<string[]>(defaultValue);
  const selectedValues = value ?? internalSelectedValues;
  const hasInteractedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onValueChangeRef = useRef(onValueChange);

  const formatSelectedValues = (values: string[]): string => {
    if (!values.length) return '';
    if (values.length === 1) return values[0] ?? '';
    if (values.length === 2) return values.join(' and ');
    const allButLast = values.slice(0, -1).join(separator);
    const last = values[values.length - 1] ?? '';
    return `${allButLast}, and ${last}`;
  };

  useEffect(() => {
    onChangeRef.current = onChange;
    onValueChangeRef.current = onValueChange;
  }, [onChange, onValueChange]);

  useEffect(() => {
    if (value === undefined) setInternalSelectedValues(defaultValue);
  }, [defaultValue, value]);

  const handleCheckboxChange = (optionValue: string): void => {
    hasInteractedRef.current = true;
    const nextSelectedValues = selectedValues.includes(optionValue)
      ? selectedValues.filter((val) => val !== optionValue)
      : [...selectedValues, optionValue];

    if (value === undefined) setInternalSelectedValues(nextSelectedValues);
    onChangeRef.current?.(field, formatSelectedValues(nextSelectedValues));
    onValueChangeRef.current?.(field, nextSelectedValues);
  };

  const getGridColsClass = (cols: number): string => {
    const colMap: Record<number, string> = {
      1: 'md:col-span-1',
      2: 'md:col-span-2',
      3: 'md:col-span-3',
      4: 'md:col-span-4',
      5: 'md:col-span-5',
      6: 'md:col-span-6',
    };
    return colMap[cols] || 'md:col-span-1';
  };

  return (
    <fieldset className={`mb-4 ${getGridColsClass(columns)} gap-2`}>
      <legend className={cx("mb-2", labelClass({ hidden: false }))}>
        {label}
      </legend>
      {helperText ? (
        <p className={cx("mb-2 mt-1 text-sm", "text-gray-500")}>{helperText}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {options.map((option, index) => {
          const optionValue = option.exportValue ?? (exportType === 'key' ? option.key : option.value);
          const optionLabel = option.key;
          const displayValue = option.value;
          const optionId = `${field}-${index}`;
          const isSelected = selectedValues.includes(optionValue);

          return (
            <label
              key={optionId}
              htmlFor={optionId}
              className={cx(
                "relative flex cursor-pointer items-start border p-3 transition-colors focus-within:ring-2 focus-within:ring-primary/35",
                "border-gray-200 bg-white text-gray-900",
                isSelected && ("border-green-500 bg-primary/10 ring-2 ring-green-500/35")
              )}
            >
              <input
                id={optionId}
                name={field}
                type="checkbox"
                checked={isSelected}
                onChange={() => handleCheckboxChange(optionValue)}
                className="sr-only"
              />
              <div className="text-sm/6 flex-1">
                <span className="font-medium">{optionLabel}</span>
                {displayValue ? (
                  <span className={cx("mt-1 block", "text-gray-600")}>{displayValue}</span>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
