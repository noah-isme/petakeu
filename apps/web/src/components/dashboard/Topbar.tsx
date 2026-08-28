import * as Select from "@radix-ui/react-select";
import classNames from "clsx";
import { ChevronDown, Menu, Search, Calendar, ShieldCheck, Sun, Moon, Monitor } from "lucide-react";

import type { ThemeMode } from "../../hooks/useTheme";

interface TopbarProps {
  title: string;
  period: string;
  periods: string[];
  onPeriodChange: (value: string) => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  isMobileSidebarOpen: boolean;
  onOpenCommandPalette?: () => void;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
}

export function Topbar({
  title,
  period,
  periods,
  onPeriodChange,
  onOpenSettings,
  onToggleSidebar,
  isMobileSidebarOpen,
  onOpenCommandPalette,
  theme,
  onToggleTheme
}: TopbarProps) {
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel = theme === "dark" ? "Tema Gelap" : theme === "light" ? "Tema Terang" : "Tema Sistem";

  return (
    <header className="sticky top-0 z-30 flex h-20 w-full items-center justify-between border-b border-slate-100 bg-white/90 px-6 backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-slate-900/90">
      {/* Left: Mobile Toggle & Regional Search Bar */}
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 shadow-xs transition hover:bg-slate-100 hover:text-slate-900 lg:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          onClick={onToggleSidebar}
          aria-label={isMobileSidebarOpen ? "Tutup navigasi" : "Buka navigasi"}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Regional Search Bar — triggers Command Palette */}
        <div className="relative flex-1 hidden sm:flex items-center">
          <Search className="absolute left-4 h-4 w-4 text-slate-400" />
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-full cursor-pointer rounded-full border border-slate-200/80 bg-slate-50/80 py-2.5 pl-11 pr-12 text-left text-sm text-slate-400 outline-none transition hover:border-emerald-500 hover:bg-white focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 font-medium dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-500 dark:hover:border-emerald-500 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
          >
            Cari Wilayah / Provinsi / Kab / Kota...
          </button>
          <kbd className="absolute right-3 inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-400 shadow-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Period Select, Theme Toggle, PostGIS Telemetry & User Profile */}
      <div className="flex items-center gap-3">
        {/* Period Selector */}
        <PeriodSelect value={period} onValueChange={onPeriodChange} options={periods} />

        {/* Theme Toggle */}
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            aria-label={themeLabel}
            title={themeLabel}
          >
            <ThemeIcon className="h-4 w-4" />
          </button>
        )}

        {/* PostGIS Telemetry Status Badge */}
        <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>PostGIS Connected</span>
        </div>

        {/* User Profile Chip */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-100 dark:border-slate-800">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-emerald-700 border-2 border-white shadow-xs flex items-center justify-center text-white dark:border-slate-700">
            <ShieldCheck className="h-5 w-5 text-emerald-200" />
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-bold text-slate-900 leading-tight dark:text-slate-100">Analis Eksekutif</span>
            <span className="text-[11px] text-slate-400 font-medium dark:text-slate-500">BPKAD / Kemendagri</span>
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
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:border-emerald-500 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
        aria-label="Pilih periode"
      >
        <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="z-[9999] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
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
                    ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
