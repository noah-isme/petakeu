import type { AnalyticsOverview } from "../../types/analytics";

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 1
});

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1
});

export function formatAmount(value: number | null, publicMode = false): string {
  if (publicMode) return "Data terbatas";
  if (value === null || !Number.isFinite(value)) return "—";
  return idrFormatter.format(value);
}

export function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return numberFormatter.format(value);
}

export function formatPercent(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${numberFormatter.format(value)}%`;
}

export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "Periode tidak tersedia";
  const match = /^(\d{4})-(\d{2})/.exec(period);
  if (!match) return period;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(date.getTime())) return period;

  return new Intl.DateTimeFormat("id-ID", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function normalizeAnalyticsPeriod(period: string | undefined): string | undefined {
  if (!period) return undefined;

  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!quarter) return period;

  return `${quarter[1]}-${String(Number(quarter[2]) * 3).padStart(2, "0")}`;
}

export function formatUpdatedAt(value: string | null): string {
  if (!value) return "Pembaruan terakhir tidak tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function percentWidth(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "0%";
  return `${Math.max(0, Math.min(100, value))}%`;
}

export function hasAnalyticsData(data: AnalyticsOverview): boolean {
  const hasKpi = Object.entries(data.kpis).some(([key, value]) => {
    if (key === "topOutlierRegion") return value !== null;
    return value !== null;
  });

  return (
    hasKpi ||
    data.monthlyTrend.length > 0 ||
    data.topRegions.length > 0 ||
    data.bottomRegions.length > 0 ||
    data.targetVsActual.length > 0 ||
    data.provinceComparison.length > 0 ||
    data.yoyComparison.length > 0 ||
    data.reportingMatrix.regions.length > 0
  );
}
