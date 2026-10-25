import { useEffect, useRef, useState } from 'react';
import { Textbox } from '@whitepoint/ui/input';
import { centsToDollars, dollarsToCents } from './currency';

type CurrencyFieldProps = {
  label: string;
  valueCents: number | null | undefined;
  onCentsChange: (cents: number | null) => void;
  disabled: boolean;
  nullable?: boolean;
  placeholder?: string;
};

export function CurrencyField({ label, valueCents, onCentsChange, disabled, nullable = false, placeholder }: CurrencyFieldProps) {
  const [display, setDisplay] = useState(() => centsToDollars(valueCents));
  const lastReported = useRef(valueCents);

  useEffect(() => {
    if (valueCents !== lastReported.current) {
      setDisplay(centsToDollars(valueCents));
      lastReported.current = valueCents;
    }
  }, [disabled, valueCents]);

  return (
    <Textbox
      label={label}
      textPrefix="$"
      inputMode="decimal"
      placeholder={placeholder}
      value={display}
      disabled={disabled}
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
  );
}
