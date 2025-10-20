interface MapModeToggleProps {
  mode: "choropleth" | "heat";
  onChange: (mode: "choropleth" | "heat") => void;
}

export function MapModeToggle({ mode, onChange }: MapModeToggleProps) {
  return (
    <div role="radiogroup" aria-label="Jenis visualisasi peta" className="mode-toggle">
      <button
        type="button"
        role="radio"
        aria-checked={mode === "choropleth"}
        className={mode === "choropleth" ? "mode-toggle__button active" : "mode-toggle__button"}
        onClick={() => onChange("choropleth")}
      >
        Choropleth
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "heat"}
        className={mode === "heat" ? "mode-toggle__button active" : "mode-toggle__button"}
        onClick={() => onChange("heat")}
      >
        Heatmap
      </button>
    </div>
  );
}
