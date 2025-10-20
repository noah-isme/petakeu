interface LegendProps {
  stops: Array<number | string>;
}

const colors = ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];

function formatLabel(index: number, stops: Array<number | string>) {
  if (typeof stops[index] === "string") {
    return String(stops[index]);
  }

  const numericStops = stops as number[];
  const format = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
  if (index === 0) {
    return `≤ ${format(numericStops[0])}`;
  }
  if (index === numericStops.length - 1) {
    const prev = numericStops[numericStops.length - 2] ?? numericStops[0];
    return `> ${format(prev)}`;
  }
  const lower = numericStops[index - 1] ?? 0;
  const upper = numericStops[index];
  return `${format(lower)} – ${format(upper)}`;
}

export function Legend({ stops }: LegendProps) {
  if (!stops || !stops.length) {
    return null;
  }

  return (
    <section className="legend" aria-label="Legenda klasifikasi nilai setoran" role="list">
      {stops.map((stop, index) => (
        <div key={`${typeof stop === "string" ? stop : `stop-${index}`}`} className="legend-item" role="listitem">
          <span className="legend-color" style={{ backgroundColor: colors[index] ?? colors[colors.length - 1] }} />
          <span>{formatLabel(index, stops)}</span>
        </div>
      ))}
    </section>
  );
}
