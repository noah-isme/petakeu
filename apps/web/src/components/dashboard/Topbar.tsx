import * as Select from "@radix-ui/react-select";
import classNames from "clsx";
import { ChevronDown, Menu, Settings } from "lucide-react";

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
    <header className="flex w-full flex-col gap-4 border-b border-border bg-panel/80 px-6 py-4 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-panel text-muted shadow-sm transition hover:border-border/80 hover:text-text lg:hidden"
            onClick={onToggleSidebar}
            aria-label={isMobileSidebarOpen ? "Tutup navigasi" : "Buka navigasi"}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Petakeu Dashboard</p>
            <h1 className="text-2xl font-semibold text-text">{title}</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-panel px-4 text-sm font-semibold text-muted shadow-sm transition hover:border-primary/40 hover:text-primary"
        >
          <Settings className="h-4 w-4" />
          <span>Pengaturan</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span className="font-medium text-text">Periode Analisis</span>
          <PeriodSelect value={period} onValueChange={onPeriodChange} options={periods} />
        </div>
        <p className="text-sm text-muted">
          Visualisasi keuangan regional dengan pembaruan berkala per kuartal.
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
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-4 py-2 text-sm font-semibold text-text shadow-sm transition hover:border-primary/40 hover:text-primary"
        aria-label="Pilih periode"
      >
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="h-4 w-4" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="z-50 overflow-hidden rounded-2xl border border-border bg-panel shadow-card"
          position="popper"
          sideOffset={8}
        >
          <Select.Viewport className="p-2">
            {options.map((option) => (
              <Select.Item
                key={option}
                value={option}
                className={classNames(
                  "flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-medium text-muted transition",
                  option === value ? "bg-primary/10 text-primary" : "hover:bg-panel/70"
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
