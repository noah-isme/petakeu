import { Map, Flame } from "lucide-react";
import { cn } from "../../lib/utils";

interface MapModeToggleProps {
  mode: "choropleth" | "heat";
  onChange: (mode: "choropleth" | "heat") => void;
}

export function MapModeToggle({ mode, onChange }: MapModeToggleProps) {
  return (
    <div role="radiogroup" aria-label="Jenis visualisasi peta" className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
      <button
        type="button"
        role="radio"
        aria-checked={mode === "choropleth"}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
          mode === "choropleth"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        )}
        onClick={() => onChange("choropleth")}
      >
        <Map className="w-4 h-4" />
        Choropleth
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "heat"}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
          mode === "heat"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        )}
        onClick={() => onChange("heat")}
      >
        <Flame className="w-4 h-4" />
        Heatmap
      </button>
    </div>
  );
}
