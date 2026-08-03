import type { LegendDefinition, LegendRange } from "../types/geo";

interface LegendProps {
  legend?: LegendDefinition;
  stops?: number[] | LegendDefinition;
  publicMode?: boolean;
}

const colors = ["#0f4c5c", "#10b981", "#06b6d4", "#f59e0b", "#eab308"];

function formatCurrency(value: number) {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function formatRange(range: LegendRange, index: number, ranges: LegendRange[]) {
  if (index === 0) {
    return `≤ ${formatCurrency(range.max)}`;
  }
  if (index === ranges.length - 1) {
    return `> ${formatCurrency(range.min)}`;
  }
  return `${formatCurrency(range.min)} – ${formatCurrency(range.max)}`;
}

export function Legend({ legend: legendProp, stops, publicMode }: LegendProps) {
  const activeLegend = legendProp ?? (stops && !Array.isArray(stops) ? (stops as LegendDefinition) : undefined);
  const activeStops = Array.isArray(stops) ? stops : undefined;

  if (activeStops) {
    if (!activeStops.length) return null;
    return (
      <section className="legend" aria-label="Legenda klasifikasi nilai setoran" role="list">
        {activeStops.map((stop, index) => {
          let labelText = "";
          if (index === 0) {
            labelText = `≤ ${formatCurrency(stop)}`;
          } else if (index === activeStops.length - 1) {
            labelText = `> ${formatCurrency(activeStops[activeStops.length - 2] ?? stop)}`;
          } else {
            labelText = `${formatCurrency(activeStops[index - 1])} – ${formatCurrency(stop)}`;
          }
          return (
            <div key={`stop-${index}`} className="legend-item" role="listitem">
              <span className="legend-color" style={{ backgroundColor: colors[index] ?? colors[colors.length - 1] }} />
              <span>{labelText}</span>
            </div>
          );
        })}
      </section>
    );
  }

  if (!activeLegend) {
    return null;
  }

  const { labels, ranges } = activeLegend;


  return (
    <section className="legend" aria-label="Legenda klasifikasi nilai setoran" role="list">
      {labels.map((label, index) => (
        <div key={`bin-${index}`} className="legend-item" role="listitem">
          <span className="legend-color" style={{ backgroundColor: colors[index] ?? colors[colors.length - 1] }} />
          <span>
            {publicMode
              ? label
              : (() => {
                  const range = ranges[index];
                  if (!range) {
                    return label;
                  }
                  return `${label} — ${formatRange(range, index, ranges)}`;
                })()}
          </span>
        </div>
      ))}
    </section>
  );
}

