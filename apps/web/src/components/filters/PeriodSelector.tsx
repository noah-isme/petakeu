import { format, subMonths } from "date-fns";
import { Calendar } from "lucide-react";
import { cn } from "../../lib/utils";

interface PeriodSelectorProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
}

const defaultOptions = Array.from({ length: 12 }, (_, index) => format(subMonths(new Date(), index), "yyyy-MM"));

export function PeriodSelector({ value, onChange, options = defaultOptions }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-gray-500" />
      <div className="relative">
        <input
          type="month"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          list="period-options"
          className={cn(
            "px-4 py-2 pr-10 rounded-lg border border-gray-200 bg-white text-sm font-medium",
            "hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
            "transition-all duration-200 cursor-pointer"
          )}
        />
        <datalist id="period-options">
          {options.map((period) => (
            <option key={period} value={period} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
