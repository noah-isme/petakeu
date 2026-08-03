import classNames from "clsx";
import { Layers } from "lucide-react";

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
      <div className="flex w-full flex-col gap-3 rounded-3xl border border-slate-800/80 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl">
        <div className="h-4 w-1/3 animate-pulse rounded-full bg-slate-800" />
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="h-4 w-4 animate-pulse rounded-full bg-slate-800" />
              <div className="h-3 flex-1 animate-pulse rounded-full bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-800/80 bg-slate-900/60 p-6 text-sm text-slate-400 shadow-2xl backdrop-blur-xl">
        Legend belum tersedia untuk periode ini.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-800/80 bg-slate-900/85 p-5 shadow-2xl backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Skala Kuantil Pendapatan</p>
        </div>
        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
          QUANTILES
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item, idx) => {
          const isActive = activeLabel === item.label;
          return (
            <li key={item.label}>
              <button
                type="button"
                onMouseEnter={() => onHoverItem?.(item)}
                onFocus={() => onHoverItem?.(item)}
                onMouseLeave={() => onHoverItem?.(null)}
                onBlur={() => onHoverItem?.(null)}
                className={classNames(
                  "flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all duration-200 border",
                  isActive
                    ? "bg-slate-800/90 text-white border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                    : "text-slate-300 bg-slate-950/40 border-slate-800/60 hover:bg-slate-800/60 hover:text-white hover:border-slate-700"
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3.5 w-3.5 rounded-full shadow-md shrink-0 border border-white/20"
                    style={{
                      background: item.color,
                      boxShadow: `0 0 10px ${item.color}80`
                    }}
                    aria-hidden
                  />
                  <span>{item.label}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Q{idx + 1}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

