import { useEffect, useRef, useState } from 'react';
import { centsToDollars, dollarsToCents } from './currency';

type CurrencyFieldProps = {
  label: string;
  valueCents: number | null | undefined;
  onCentsChange: (cents: number | null) => void;
  editing: boolean;
  nullable?: boolean;
  placeholder?: string;
};

export function CurrencyField({ label, valueCents, onCentsChange, editing, nullable = false, placeholder }: CurrencyFieldProps) {
  const [display, setDisplay] = useState(() => centsToDollars(valueCents));
  const lastReported = useRef(valueCents);

  useEffect(() => {
    if (!editing || valueCents !== lastReported.current) setDisplay(centsToDollars(valueCents));
    lastReported.current = valueCents;
  }, [editing, valueCents]);

  return <label className="block text-sm text-slate-700">{label}
    <input
      className="mt-1 w-full rounded border border-slate-300 bg-white p-2 tabular-nums read-only:bg-slate-50"
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      placeholder={placeholder}
      value={display}
      readOnly={!editing}
      onChange={event => {
        const text = event.target.value;
        if (!/^\d*(?:\.\d{0,2})?$/.test(text)) return;
        setDisplay(text);
        const cents = dollarsToCents(text);
        if (cents !== null || text === '' || text === '.') {
          const next = cents ?? (nullable ? null : 0);
          lastReported.current = next;
          onCentsChange(next);
        }
      }}
      onBlur={() => setDisplay(centsToDollars(lastReported.current))}
    />
  </label>;
}
