import * as Select from "@radix-ui/react-select";
import classNames from "clsx";
import { ChevronDown, Menu, Search, Calendar, ShieldCheck } from "lucide-react";

interface TopbarProps {
  title: string;
  period: string;
  periods: string[];
  onPeriodChange: (value: string) => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  isMobileSidebarOpen: boolean;
}

export function Topbar({
  title,
  period,
  periods,
  onPeriodChange,
  onOpenSettings,
  onToggleSidebar,
  isMobileSidebarOpen
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-20 w-full items-center justify-between border-b border-slate-100 bg-white/90 px-6 backdrop-blur-md transition-colors">
      {/* Left: Mobile Toggle & Regional Search Bar */}
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 shadow-xs transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          onClick={onToggleSidebar}
          aria-label={isMobileSidebarOpen ? "Tutup navigasi" : "Buka navigasi"}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Regional Search Bar */}
        <div className="relative flex-1 hidden sm:flex items-center">
          <Search className="absolute left-4 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari Wilayah / Provinsi / Kab / Kota..."
            className="w-full rounded-full border border-slate-200/80 bg-slate-50/80 py-2.5 pl-11 pr-12 text-sm text-slate-700 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 font-medium"
          />
          <kbd className="absolute right-3 inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-400 shadow-xs">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Period Select, PostGIS Telemetry & User Profile */}
      <div className="flex items-center gap-3">
        {/* Period Selector */}
        <PeriodSelect value={period} onValueChange={onPeriodChange} options={periods} />

        {/* PostGIS Telemetry Status Badge */}
        <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>PostGIS Connected</span>
        </div>

        {/* User Profile Chip */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-100">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-emerald-700 border-2 border-white shadow-xs flex items-center justify-center text-white">
            <ShieldCheck className="h-5 w-5 text-emerald-200" />
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-bold text-slate-900 leading-tight">Analis Eksekutif</span>
            <span className="text-[11px] text-slate-400 font-medium">BPKAD / Kemendagri</span>
          </div>
        </div>
      </div>
    </header>
  );
}

interface PeriodSelectProps {
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
}

function PeriodSelect({ value, options, onValueChange }: PeriodSelectProps) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:border-emerald-500 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        aria-label="Pilih periode anggaran"
      >
        <Calendar className="h-3.5 w-3.5 text-emerald-600" />
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="z-[9999] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          position="popper"
          sideOffset={6}
        >
          <Select.Viewport className="p-1.5 space-y-1">
            {options.map((option) => (
              <Select.Item
                key={option}
                value={option}
                className={classNames(
                  "flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3.5 py-2 text-xs font-bold transition",
                  option === value
                    ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Select.ItemText>{option}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}


