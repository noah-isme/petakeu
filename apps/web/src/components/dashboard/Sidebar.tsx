import {
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  BarChart3,
  Trophy,
  AlertTriangle,
  UploadCloud,
  FileText,
  Info,
  ShieldCheck,
  Activity,
  type LucideIcon
} from "lucide-react";
import classNames from "clsx";

export interface SidebarItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  section?: "analysis" | "tools";
}

interface SidebarProps {
  items: SidebarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function Sidebar({ items, activeKey, onSelect, collapsed, onCollapsedChange }: SidebarProps) {
  const analysisItems = items.filter((item) => item.section === "analysis" || !item.section);
  const toolItems = items.filter((item) => item.section === "tools");

  return (
    <aside
      className={classNames(
        "group/sidebar relative z-40 flex h-full flex-col border-r border-slate-200/80 bg-white text-slate-700 shadow-xs transition-all duration-300 select-none",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Petakeu Brand Header */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-100">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
          <MapIcon className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold tracking-tight text-slate-900 font-['Outfit']">PETAKEU</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-800 border border-emerald-200">
                GOVTECH
              </span>
            </div>
            <span className="text-[10px] font-semibold text-slate-400 tracking-tight">Pemasukan Fiskal Daerah</span>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 min-h-0 space-y-5 px-4 py-5 overflow-y-auto scrollbar-none">
        {/* MODUL ANALISIS Section */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 font-['Outfit']">
              MODUL ANALISIS
            </div>
          )}
          <nav className="space-y-1">
            {analysisItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeKey === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  className={classNames(
                    "group relative flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left text-sm font-semibold transition-all duration-200",
                    isActive
                      ? "bg-emerald-50 text-emerald-900 font-bold border border-emerald-200/80 shadow-xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon
                    className={classNames(
                      "h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-105",
                      isActive ? "text-emerald-700" : "text-slate-400 group-hover:text-slate-700"
                    )}
                  />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}

                  {/* Badge */}
                  {!collapsed && item.badge && (
                    <span className="rounded-full bg-amber-500/15 border border-amber-400/40 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                      {item.badge}
                    </span>
                  )}

                  {/* Collapsed Tooltip */}
                  {collapsed && (
                    <span className="pointer-events-none absolute left-full ml-3.5 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xl opacity-0 transition-all duration-200 group-hover:opacity-100 z-50">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ALAT & PENGOLAHAN DATA Section */}
        <div className="space-y-1 pt-3 border-t border-slate-100">
          {!collapsed && (
            <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 font-['Outfit']">
              PENGOLAHAN DATA
            </div>
          )}
          <nav className="space-y-1">
            {toolItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeKey === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  className={classNames(
                    "group relative flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-2.5 text-left text-sm font-semibold transition-all duration-200",
                    isActive
                      ? "bg-emerald-50 text-emerald-900 font-bold border border-emerald-200/80 shadow-xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon
                    className={classNames(
                      "h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-105",
                      isActive ? "text-emerald-700" : "text-slate-400 group-hover:text-slate-700"
                    )}
                  />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}

                  {collapsed && (
                    <span className="pointer-events-none absolute left-full ml-3.5 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xl opacity-0 transition-all duration-200 group-hover:opacity-100 z-50">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* PostGIS Verification Footer Widget */}
        {!collapsed && (
          <div className="relative overflow-hidden rounded-2xl bg-[#044e3a] p-4 text-white shadow-md space-y-3 mt-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur-md">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <h4 className="text-xs font-bold leading-tight font-['Outfit']">Integrasi PostGIS & 15% Cut</h4>
              <p className="text-[11px] text-emerald-100/80 mt-0.5">Potongan otomatis & spatial index 38 Provinsi aktif.</p>
            </div>
            <button
              type="button"
              onClick={() => onSelect("about")}
              className="w-full rounded-xl bg-[#047857] py-2 px-3 text-center text-xs font-bold text-white shadow-xs transition hover:bg-[#065f46] active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Cek Status Sistem</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer Toggle */}
      <div className="border-t border-slate-100 p-3">
        <button
          type="button"
          data-testid="sidebar-toggle-button"
          aria-label="Toggle navigasi"
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-500 transition hover:border-emerald-500/40 hover:bg-slate-100 hover:text-slate-900"
        >
          {!collapsed && <span>Sembunyikan Navigasi</span>}
          {collapsed ? <ChevronRight className="h-4 w-4 text-emerald-700 mx-auto" /> : <ChevronLeft className="h-4 w-4 text-emerald-700" />}
        </button>
      </div>
    </aside>
  );
}

