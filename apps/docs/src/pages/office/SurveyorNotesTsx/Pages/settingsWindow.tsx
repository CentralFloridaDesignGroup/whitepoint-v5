import { useState, useEffect } from 'react';
import { parameters as Parameters } from './SurveyNoteDefinitions.json';
import { TextboxSuggestion, Textbox, Combobox, Button, Bearing, Multiselect, Checkbox } from '@whitepoint/ui/input';
import { type SurveyNotesProps } from '../SurveyorNotes';


export function SettingsWindow({
    parameters = [],
    onAccept,
    onHide
}: {
    parameters?: SurveyNotesProps[];
    onAccept: (newParameters: SurveyNotesProps[]) => void;
    onHide: () => void;
}) {
    const getColumnClass = (columns: number) => {
        switch (columns) {
            case 1: return "grid-cols-1";
            case 2: return "grid-cols-1 md:grid-cols-2";
            case 3: return "grid-cols-1 md:grid-cols-3";
            case 4: return "grid-cols-1 md:grid-cols-4";
            case 5: return "grid-cols-1 md:grid-cols-5";
            case 6: return "grid-cols-1 md:grid-cols-6";
            default: return "grid-cols-1 md:grid-cols-3";
        }
    };
    const [intParameters, setIntParameters] = useState<SurveyNotesProps[]>([]);
    const [loading, setLoading] = useState(true);

    function processParameters(): void {
        onAccept(intParameters);
    }

    useEffect(() => {
        const parameters: SurveyNotesProps[] = [];
        Parameters.forEach(group => {
            group.content.forEach(param => {
                const getValue = () => {
                    if (param.type !== 'toggle') return null;
                    const opts = param.options as CheckboxProperties['options'];
                    return opts.defaultValue ? opts.trueValue : opts.falseValue;
                };
                parameters.push({
                    key: param.key,
                    value: getValue()
                });
            })
        });

        setIntParameters(parameters);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (parameters.length === 0) {
            return;
        }

        setIntParameters(prev => {
            const base = prev.length > 0 ? prev : Parameters.flatMap(group =>
                group.content.map(param => ({
                    key: param.key,
                    value: null
                }))
            );
            const incoming = new Map(parameters.map(param => [param.key, param.value]));

            return base.map(param => incoming.has(param.key)
                ? { ...param, value: incoming.get(param.key) ?? null }
                : param
            );
        });
        setLoading(false);
    }, [parameters]);

    if (loading) {
        return (
            <div className='max-w-7xl mx-auto p-4'>
                <h2 className='text-xl font-bold mb-4 text-center'>Loading Parameters...</h2>
            </div>
        );
    }

    return (
        <div className='max-w-7xl mx-auto p-4'>
            <h2 className='text-xl font-bold mb-4 text-center'>Survey Parameters</h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mt-4'>
                <Button colorMode="auto"
                    label="Accept Parameters"
                    style='primary'
                    onClick={processParameters}
                />
                <Button colorMode="auto"
                    label="Hide Settings"
                    style='secondary'
                    onClick={onHide}
                />
            </div>
            <div className='divide-y divide-gray-300 '>
                {Parameters.map(group => (
                    <div key={group.name} className={`${group.name !== '' ? '' : ''} py-8`}>
                        {group.name !== '' ? (<h3 className='text-lg font-semibold mb-2 text-center'>{group.name}</h3>) : null}
                        <div className={`grid gap-4 ${getColumnClass(group.columns)}`}>
                            {group.content.map(param => {
                                if (param.type === 'text') {
                                    const textParam = param as TextProperties;
                                    return (
                                        <Textbox colorMode="auto"
                                            key={textParam.key}
                                            field={textParam.key}
                                            label={textParam.displayName}
                                            placeholder={textParam.options?.placeholder ? textParam.options.placeholder : ''}
                                            type={textParam.options?.format ? textParam.options.format : 'text'}
                                            regexFormat={{ format: textParam.options?.regex ? new RegExp(textParam.options.regex) : (/^[\s\S]*$/) }}
                                            required={textParam.options?.required ? textParam.options.required : false}
                                            defaultValue={intParameters.find(p => p.key === textParam.key)?.value || ''}
                                            onValidChange={(_, value) => {
                                                setIntParameters(prev => prev.map(p => p.key === textParam.key ? { ...p, value } : p));
                                            }}
                                        />
                                    );
                                }
                                if (param.type === 'textSuggestion') {
                                    const textSuggestionParam = param as TextSuggestionProperties;
                                    return (
                                        <TextboxSuggestion colorMode="auto"
                                            key={textSuggestionParam.key}
                                            field={textSuggestionParam.key}
                                            label={textSuggestionParam.displayName}
                                            placeholder={textSuggestionParam.options?.placeholder ? textSuggestionParam.options.placeholder : ''}
                                            regexFormat={{ format: textSuggestionParam.options?.regex ? new RegExp(textSuggestionParam.options.regex) : (/^[\s\S]*$/) }}
                                            required={{ isRequired: textSuggestionParam.options?.required ? textSuggestionParam.options.required : false }}
                                            defaultValue={intParameters.find(p => p.key === textSuggestionParam.key)?.value || ''}
                                            suggestions={textSuggestionParam.options.options}
                                            onValidChange={(_, value) => {
                                                setIntParameters(prev => prev.map(p => p.key === textSuggestionParam.key ? { ...p, value } : p));
                                            }}
                                        />
                                    );
                                }
                                if (param.type === 'list') {
                                    const comboboxParam = param as ComboboxProperties;
                                    return (
                                        <Combobox colorMode="auto"
                                            key={comboboxParam.key}
                                            field={comboboxParam.key}
                                            label={comboboxParam.displayName}
                                            required={comboboxParam.options?.required ? comboboxParam.options.required : false}
                                            selections={comboboxParam.options?.options as { key: string; value: string }[] ? comboboxParam.options?.options as { key: string; value: string }[] : []}
                                            onValidChange={(_, value) => {
                                                setIntParameters(prev => prev.map(p => p.key === comboboxParam.key ? { ...p, value } : p));
                                            }}

                                        />
                                    );
                                }
                                if (param.type === 'multiSelection') {
                                    const multiSelectParam = param as MultSelectProperties;
                                    return (
                                        <Multiselect colorMode="auto"
                                            key={multiSelectParam.key}
                                            field={multiSelectParam.key}
                                            label={multiSelectParam.displayName}
                                            columns={multiSelectParam.options?.columnSpan ? multiSelectParam.options.columnSpan : 3}
                                            options={multiSelectParam.options.options.map(option => ({ key: option.key, value: option.value }))}
                                            onChange={(_, value) => {
                                                setIntParameters(prev => prev.map(p => p.key === multiSelectParam.key ? { ...p, value } : p));
                                            }}
                                        />
                                    );
                                }
                                if (param.type === 'bearing') {
                                    const bearingParam = param as BearingProperties;
                                    return (
                                        <Bearing colorMode="auto"
                                            key={bearingParam.key}
                                            field={bearingParam.key}
                                            label={bearingParam.displayName}
                                            value={intParameters.find(p => p.key === bearingParam.key)?.value || ''}
                                            onChange={(_, value) => {
                                                setIntParameters(prev => prev.map(p => p.key === bearingParam.key ? { ...p, value } : p));
                                            }}
                                            properties={{
                                                required: bearingParam.options?.required ? bearingParam.options.required : undefined
                                            }}
                                        />
                                    );
                                }
                                if (param.type === 'toggle') {
                                    const toggleParam = param as CheckboxProperties;
                                    const currentValue = intParameters.find(p => p.key === toggleParam.key)?.value;
                                    return (
                                        <Checkbox colorMode="auto"
                                            key={toggleParam.key}
                                            label={toggleParam.displayName}
                                            type="switch"
                                            checked={(currentValue ?? (toggleParam.options.defaultValue ? toggleParam.options.trueValue : toggleParam.options.falseValue)) === toggleParam.options.trueValue}
                                            onChange={(e) => {
                                                const value = e.target.checked;
                                                const stringValue = value ? toggleParam.options.trueValue : toggleParam.options.falseValue;
                                                setIntParameters(prev => prev.map(p => p.key === toggleParam.key ? { ...p, value: stringValue } : p));
                                            }}
                                        />
                                    );
                                }
                                return null;
                            })}
                        </div>
                    </div>

                ))}
            </div>
        </div >
    );
}


interface CommonProperties {
    key: string;
    displayName: string;
}

interface TextProperties extends CommonProperties {
    options: {
        placeholder?: string;
        format?: "number"
        | "text"
        | "date"
        | "password"
        | "email"
        | "tel"
        | undefined;
        regex?: string;
        errorMessage?: string;
        required?: boolean;
    }
}

interface TextSuggestionProperties extends TextProperties {
    options: {
        placeholder?: string;
        format?: "number"
        | "text"
        | "date"
        | "password"
        | "email"
        | "tel"
        | undefined;
        regex?: string;
        errorMessage?: string;
        required?: boolean;
        options: {
            key: string;
            value: string;
        }[];
    };
}

interface MultSelectProperties extends CommonProperties {
    options: {
        columnSpan: number;
        options: {
            key: string;
            value: string;
        }[];
    }
}

interface ComboboxProperties extends CommonProperties {
    options?: {
        errorMessage?: string;
        required?: boolean;
        defaultIndex?: number;
        options: {
            key: string;
            value: string;
        }[];
    }
}

interface BearingProperties extends CommonProperties {
    options?: {
        required?: boolean;
    }
}

interface CheckboxProperties extends CommonProperties {
    options: {
        defaultValue: boolean;
        trueValue: string;
        falseValue: string;
    }
}
