import { useState } from "react";
import classNames from "clsx";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";

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
  const [collapsed, setCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="glass-panel-glow w-full max-w-sm rounded-3xl p-4 shadow-2xl">
        <div className="h-4 w-1/3 animate-pulse rounded-full bg-slate-800" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="h-3 w-3 animate-pulse rounded-full bg-slate-800" />
              <div className="h-3 flex-1 animate-pulse rounded-full bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return null;
  }

  return (
    <div className="glass-panel-glow w-full max-w-sm rounded-3xl p-4 shadow-2xl transition-all duration-300">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-400" />
          <p className="text-xs font-black uppercase tracking-wider text-slate-200 font-['Outfit']">Skala Kuantil Pendapatan</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 tracking-wider">
            QUANTILES
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-xl border border-slate-800 bg-slate-900/80 p-1 text-slate-400 hover:text-white transition"
            aria-label={collapsed ? "Buka legend" : "Tutup legend"}
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
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
                    "flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold transition-all duration-200 border",
                    isActive
                      ? "bg-emerald-500/20 text-white border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-[1.02]"
                      : "text-slate-300 bg-slate-950/60 border-slate-800/80 hover:bg-slate-900 hover:text-white hover:border-slate-700"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-3.5 w-3.5 rounded-full shadow-lg shrink-0 border border-white/30"
                      style={{
                        background: item.color,
                        boxShadow: `0 0 10px ${item.color}90`
                      }}
                      aria-hidden
                    />
                    <span className="tracking-tight truncate font-['JetBrains_Mono'] text-[11px]">{item.label}</span>
                  </div>
                  <span className="text-[10px] font-extrabold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    Q{idx + 1}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
