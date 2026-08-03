import { Fragment } from "react";
import { ChevronLeft, ChevronRight, Layers, type LucideIcon } from "lucide-react";
import classNames from "clsx";

export interface SidebarItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  items: SidebarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function Sidebar({ items, activeKey, onSelect, collapsed, onCollapsedChange }: SidebarProps) {
  return (
    <aside
      className={classNames(
        "group/sidebar relative z-40 flex h-full flex-col border-r border-slate-800/80 bg-slate-950/90 text-slate-100 shadow-2xl backdrop-blur-2xl transition-[width] duration-300",
        collapsed ? "w-20" : "w-72"
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3.5 px-5 py-6 border-b border-slate-800/60">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 via-emerald-500/30 to-teal-900/40 border border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
          <Layers className="h-6 w-6 text-emerald-400" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold tracking-wider text-white">PETAKEU</span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                PRO
              </span>
            </div>
            <span className="text-xs font-medium text-slate-400">Regional Revenue Intelligence</span>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-2 px-3 py-6">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeKey === item.key;

          return (
            <Fragment key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                className={classNames(
                  "group relative flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-emerald-500/25 via-emerald-500/15 to-transparent text-emerald-300 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                    : "text-slate-400 hover:bg-slate-900/90 hover:text-white border border-transparent"
                )}
              >
                <Icon
                  className={classNames(
                    "h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                    isActive ? "text-emerald-400" : "text-slate-400 group-hover:text-white"
                  )}
                />
                {!collapsed && <span>{item.label}</span>}
                
                {/* Active Pill Indicator */}
                {isActive && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                )}

                {/* Collapsed Tooltip */}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-2xl border border-slate-700/80 opacity-0 transition-all duration-200 group-hover:opacity-100 z-50">
                    {item.label}
                  </span>
                )}
              </button>
            </Fragment>
          );
        })}
      </nav>

      {/* Footer Toggle */}
      <div className="border-t border-slate-800/60 p-3">
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 px-4 py-3 text-xs font-semibold text-slate-400 transition hover:border-emerald-500/40 hover:bg-slate-800/80 hover:text-white"
        >
          {!collapsed && <span>Sembunyikan Navigasi</span>}
          {collapsed ? <ChevronRight className="h-4 w-4 text-emerald-400" /> : <ChevronLeft className="h-4 w-4 text-emerald-400" />}
        </button>
      </div>
    </aside>
  );
}
