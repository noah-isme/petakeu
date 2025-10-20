import { Fragment } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
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
        "group/sidebar relative z-40 flex h-full flex-col border-r border-border/40 bg-slate-950 text-slate-100 transition-[width] duration-300",
        collapsed ? "w-20" : "w-72"
      )}
    >
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <span className="text-lg font-semibold">Rp</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Petakeu</span>
            <span className="text-lg font-semibold text-white">Peta Keuangan</span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeKey === item.key;

          return (
            <Fragment key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(item.key)}
              className={classNames(
                "group relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition",
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold opacity-0 shadow-lg ring-1 ring-slate-700 transition group-hover:opacity-100">
                  {item.label}
                </span>
              )}
            </button>
          </Fragment>
        );
      })}
      </nav>

      <div className="border-t border-white/5 px-3 py-4">
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
        >
          {!collapsed && <span>Sembunyikan menu</span>}
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
