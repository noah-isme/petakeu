import * as Select from "@radix-ui/react-select";
import classNames from "clsx";
import { ChevronDown, Menu, Settings, Sparkles, Activity, Download } from "lucide-react";

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
    <header className="sticky top-0 z-30 flex w-full flex-col gap-4 border-b border-slate-800/80 bg-slate-950/80 px-6 py-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/80 text-slate-300 shadow-sm transition hover:border-emerald-500/50 hover:text-white lg:hidden"
            onClick={onToggleSidebar}
            aria-label={isMobileSidebarOpen ? "Tutup navigasi" : "Buka navigasi"}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-400">
                Petakeu Enterprise
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                LIVE CONNECTED
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/80 px-4 text-sm font-semibold text-slate-300 shadow-lg transition hover:border-emerald-500/40 hover:bg-slate-800/80 hover:text-emerald-400"
          >
            <Settings className="h-4 w-4 text-emerald-400" />
            <span className="hidden sm:inline">Pengaturan Sistem</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-t border-slate-800/60 pt-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-slate-300">Periode Data:</span>
          <PeriodSelect value={period} onValueChange={onPeriodChange} options={periods} />
        </div>
        <p className="text-xs font-medium text-slate-400 flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-cyan-400" />
          Heatmap Keuangan Daerah • Pembagian Potongan Wajib 15% Terhitung Otomatis
        </p>
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
        className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:border-emerald-500/50 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        aria-label="Pilih periode"
      >
        <Sparkles className="h-4 w-4 text-emerald-400" />
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="z-50 overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur-2xl"
          position="popper"
          sideOffset={8}
        >
          <Select.Viewport className="p-2 space-y-1">
            {options.map((option) => (
              <Select.Item
                key={option}
                value={option}
                className={classNames(
                  "flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition",
                  option === value
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
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

