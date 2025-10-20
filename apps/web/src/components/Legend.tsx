import type { LegendDefinition, LegendRange } from "../types/geo";

interface LegendProps {
  legend?: LegendDefinition;
  publicMode?: boolean;
}

const colors = ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];

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

export function Legend({ legend, publicMode }: LegendProps) {
  if (!legend) {
    return null;
  }

  const { labels, ranges } = legend;

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
