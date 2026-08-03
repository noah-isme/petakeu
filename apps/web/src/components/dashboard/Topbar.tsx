import * as Select from "@radix-ui/react-select";
import classNames from "clsx";
import { ChevronDown, Menu, Settings, Sparkles } from "lucide-react";

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
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-slate-950/90 px-6 backdrop-blur-2xl transition-colors">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/80 text-slate-300 shadow-sm transition hover:border-emerald-500/50 hover:text-white lg:hidden"
          onClick={onToggleSidebar}
          aria-label={isMobileSidebarOpen ? "Tutup navigasi" : "Buka navigasi"}
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black tracking-tight text-white font-['Outfit']">{title}</h1>
          <div className="h-4 w-px bg-slate-800 hidden sm:block" />
          <PeriodSelect value={period} onValueChange={onPeriodChange} options={periods} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span>PostGIS Connected</span>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/80 px-3.5 text-xs font-bold text-slate-300 shadow-lg transition hover:border-emerald-500/40 hover:bg-slate-800/80 hover:text-emerald-400 active:scale-95"
        >
          <Settings className="h-3.5 w-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Pengaturan</span>
        </button>
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
        className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/90 px-3 py-1.5 text-xs font-bold text-slate-200 shadow-md transition hover:border-emerald-500/50 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        aria-label="Pilih periode"
      >
        <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="z-[9999] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur-2xl"
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
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
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
