import classNames from "clsx";

export interface LegendItem {
  label: string;
  color: string;
  range?: [number, number];
}

interface LegendCardProps {
  items: LegendItem[];
  loading?: boolean;
  onHoverItem?: (item: LegendItem | null) => void;
  activeLabel?: string | null;
}

export function LegendCard({ items, loading = false, onHoverItem, activeLabel }: LegendCardProps) {
  if (loading) {
    return (
      <div className="flex w-full flex-col gap-3 rounded-3xl border border-border bg-panel/90 p-4 shadow-card">
        <div className="h-4 w-1/3 animate-pulse rounded-full bg-border" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-border" />
              <div className="h-3 flex-1 animate-pulse rounded-full bg-border" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-panel/70 p-6 text-sm text-muted shadow-card">
        Legend belum tersedia untuk periode ini.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-panel/90 p-4 shadow-card backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Distribusi Nilai</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onMouseEnter={() => onHoverItem?.(item)}
              onFocus={() => onHoverItem?.(item)}
              onMouseLeave={() => onHoverItem?.(null)}
              onBlur={() => onHoverItem?.(null)}
              className={classNames(
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-medium text-muted transition",
                activeLabel === item.label ? "bg-primary/10 text-primary" : "hover:bg-panel/70"
              )}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: item.color }}
                aria-hidden
              />
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
