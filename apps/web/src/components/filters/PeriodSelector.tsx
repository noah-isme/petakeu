import { format, subMonths } from "date-fns";

interface PeriodSelectorProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
}

const defaultOptions = Array.from({ length: 12 }, (_, index) => format(subMonths(new Date(), index), "yyyy-MM"));

export function PeriodSelector({ value, onChange, options = defaultOptions }: PeriodSelectorProps) {
  return (
    <label className="field-group">
      <span className="field-label">Periode</span>
      <input
        type="month"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby="period-help"
        list="period-options"
      />
      <span id="period-help" className="field-hint">
        Format: YYYY-MM
      </span>
      <datalist id="period-options">
        {options.map((period) => (
          <option key={period} value={period} />
        ))}
      </datalist>
    </label>
  );
}
