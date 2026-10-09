import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Combobox, ComboboxButton, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { cx, errorClass, labelClass, menuClass, optionClass, type InputColorMode } from './styles';

type NorthSouth = 'North' | 'South';
type EastWest = 'East' | 'West';

interface BearingErrors {
    degrees: boolean;
    minutes: boolean;
    seconds: boolean;
}

/**
 * Props for the shared survey bearing input.
 */
export interface BearingProperties {
    /** Field name used for ids and callbacks. */
    field: string;
    /** Visible label text. When omitted, a screen-reader label is still rendered. */
    label?: string;
    /** Controlled bearing value formatted as "North 00°00'00\" East". */
    value?: string;
    /** Called whenever a bearing segment changes. */
    onChange?: (field: string, value: string) => void;
    /** Target color mode for the control. Defaults to "light". */
    colorMode?: InputColorMode;
    /** Optional validation configuration. */
    properties?: {
        required?: boolean;
    };
}

function convertNumber(val: string): string {
    const numericValue = Number(val || 0);
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        minimumIntegerDigits: 2
    }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function parseBearing(value: string | undefined): { northSouth: NorthSouth; degrees: string; minutes: string; seconds: string; eastWest: EastWest } {
    if (!value) return { northSouth: 'North', degrees: '', minutes: '', seconds: '', eastWest: 'East' };
    const match = value.match(/^(North|South)\s+(\d{1,2})°(\d{1,2})'(\d{1,2})"\s+(East|West)$/);
    if (!match) return { northSouth: 'North', degrees: '', minutes: '', seconds: '', eastWest: 'East' };
    return {
        northSouth: (match[1] ?? 'North') as NorthSouth,
        degrees: match[2] ?? '',
        minutes: match[3] ?? '',
        seconds: match[4] ?? '',
        eastWest: (match[5] ?? 'East') as EastWest
    };
}

/**
 * Dense industrial quadrant bearing input for surveying workflows.
 */
export function Bearing({ field, label, value, onChange, properties }: BearingProperties): React.JSX.Element {
    const parsedValue = parseBearing(value);
    const [northSouth, setNorthSouth] = useState<NorthSouth>(parsedValue.northSouth);
    const [degrees, setDegrees] = useState<string>(parsedValue.degrees);
    const [minutes, setMinutes] = useState<string>(parsedValue.minutes);
    const [seconds, setSeconds] = useState<string>(parsedValue.seconds);
    const [eastWest, setEastWest] = useState<EastWest>(parsedValue.eastWest);
    const [errors, setErrors] = useState<BearingErrors>({ degrees: false, minutes: false, seconds: false });

    useEffect(() => {
        const nextValue = parseBearing(value);
        setNorthSouth(nextValue.northSouth);
        setDegrees(nextValue.degrees);
        setMinutes(nextValue.minutes);
        setSeconds(nextValue.seconds);
        setEastWest(nextValue.eastWest);
    }, [value]);

    const validateDegrees = (nextValue: string): boolean => {
        if (nextValue === '') return !properties?.required;
        const num = parseFloat(nextValue);
        return !Number.isNaN(num) && num >= 0 && num <= 90;
    };

    const validateMinutesOrSeconds = (nextValue: string): boolean => {
        if (nextValue === '') return !properties?.required;
        const num = parseFloat(nextValue);
        return !Number.isNaN(num) && num >= 0 && num <= 59;
    };

    const emitChange = (
        nextNorth: NorthSouth,
        nextDegrees: string,
        nextMinutes: string,
        nextSeconds: string,
        nextEast: EastWest
    ): void => {
        const bearingString = `${nextNorth} ${convertNumber(nextDegrees)}°${convertNumber(nextMinutes)}'${convertNumber(nextSeconds)}" ${nextEast}`;
        onChange?.(field, bearingString.trim());
    };

    const hasError = errors.degrees || errors.minutes || errors.seconds;
    const controlTextClass = "text-gray-900";

    return (
        <div>
            <label htmlFor={`${field}-northSouth`} className={labelClass({ required: properties?.required, hidden: !label })}>
                {label ?? field}
            </label>
            <div id={field}>
                <div className={cx(
                    "flex w-full items-center border-b bg-transparent py-1 transition-colors focus-within:border-b-2 focus-within:border-primary",
                    hasError ? "border-red-500" : "border-gray-300",
                    controlTextClass
                )}>
                    <BearingSelect
                        value={northSouth}
                        options={["North", "South"]}
                        onChange={(nextNorth) => {
                            setNorthSouth(nextNorth as NorthSouth);
                            emitChange(nextNorth as NorthSouth, degrees, minutes, seconds, eastWest);
                        }}
                    />
                    <BearingNumberInput
                        id={`${field}-degrees`}
                        name={`${field}-degrees`}
                        value={degrees}
                        placeholder="00"
                        onChange={(nextValue) => {
                            setDegrees(nextValue);
                            const isValid = validateDegrees(nextValue);
                            setErrors((prev) => ({ ...prev, degrees: !isValid }));
                            emitChange(northSouth, nextValue, minutes, seconds, eastWest);
                        }}
                    />
                    <div className="shrink-0 select-none text-sm/6 text-gray-500">°</div>
                    <BearingNumberInput
                        id={`${field}-minutes`}
                        name={`${field}-minutes`}
                        value={minutes}
                        placeholder="00"
                        onChange={(nextValue) => {
                            setMinutes(nextValue);
                            const isValid = validateMinutesOrSeconds(nextValue);
                            setErrors((prev) => ({ ...prev, minutes: !isValid }));
                            emitChange(northSouth, degrees, nextValue, seconds, eastWest);
                        }}
                    />
                    <div className="shrink-0 select-none text-sm/6 text-gray-500">'</div>
                    <BearingNumberInput
                        id={`${field}-seconds`}
                        name={`${field}-seconds`}
                        value={seconds}
                        placeholder="00"
                        onChange={(nextValue) => {
                            setSeconds(nextValue);
                            const isValid = validateMinutesOrSeconds(nextValue);
                            setErrors((prev) => ({ ...prev, seconds: !isValid }));
                            emitChange(northSouth, degrees, minutes, nextValue, eastWest);
                        }}
                    />
                    <div className="shrink-0 select-none text-sm/6 text-gray-500">"</div>
                    <BearingSelect
                        value={eastWest}
                        options={["East", "West"]}
                        onChange={(nextEast) => {
                            setEastWest(nextEast as EastWest);
                            emitChange(northSouth, degrees, minutes, seconds, nextEast as EastWest);
                        }}
                    />
                </div>
                {hasError ? (
                    <div className={errorClass()} id={`${field}-error`}>
                        {errors.degrees && <div><span className="font-medium">Error: </span>Degrees must be between 0 and 90</div>}
                        {errors.minutes && <div><span className="font-medium">Error: </span>Minutes must be between 0 and 59</div>}
                        {errors.seconds && <div><span className="font-medium">Error: </span>Seconds must be between 0 and 59</div>}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function BearingSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }): React.JSX.Element {
    return (
        <Combobox as="div" className="relative px-2" value={value} onChange={(nextValue) => onChange(String(nextValue ?? value))}>
            <ComboboxButton className="flex items-center gap-1 text-sm/6 focus:outline-none">
                {value}
                <ChevronDown aria-hidden="true" className="size-4 text-gray-500" />
            </ComboboxButton>
            <ComboboxOptions className={menuClass("light", "min-w-24")}>
                {options.map((option) => (
                    <ComboboxOption key={option} value={option} className={({ focus, selected }) => optionClass({ colorMode: "light", focus, selected })}>
                        {option}
                    </ComboboxOption>
                ))}
            </ComboboxOptions>
        </Combobox>
    );
}

function BearingNumberInput({ id, name, value, placeholder, onChange }: { id: string; name: string; value: string; placeholder: string; onChange: (value: string) => void }): React.JSX.Element {
    return (
        <input
            id={id}
            name={name}
            type="number"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={cx(
                "block w-12 min-w-0 bg-transparent py-0 pl-1 pr-1 text-sm/6 placeholder:text-gray-400 focus:outline-none",
                "text-gray-900"
            )}
        />
    );
}
