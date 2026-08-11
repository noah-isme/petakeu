import { Activity, ArrowDownRight, ArrowUpRight, Landmark, MapPinned, Target, TrendingUp } from "lucide-react";

import { Card } from "../ui/card";
import { cn } from "../../lib/utils";

import { formatAmount, formatNumber, formatPercent, formatPeriod } from "./analytics-utils";

import type { AnalyticsKpis } from "../../types/analytics";


interface KpiCardsProps {
  kpis: AnalyticsKpis;
  period: string | null;
  publicMode?: boolean;
}

function trendClasses(value: number | null) {
  if (value === null) return "border-slate-200 bg-slate-50 text-slate-500";
  return value >= 0
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-rose-200 bg-rose-50 text-rose-800";
}

function TrendIcon({ value }: { value: number | null }) {
  if (value === null) return <Activity className="h-3.5 w-3.5" aria-hidden="true" />;
  return value >= 0 ? (
    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
  ) : (
    <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
  );
}

export function KpiCards({ kpis, period, publicMode = false }: KpiCardsProps) {
  const cards = [
    {
      label: "Total setoran nasional",
      value: formatAmount(kpis.nationalTotal, publicMode),
      helper: formatPeriod(period),
      icon: Landmark,
      tone: "bg-emerald-50 text-emerald-700"
    },
    {
      label: "Pertumbuhan MoM",
      value: formatPercent(kpis.momGrowthPercentage, true),
      helper: "dibanding bulan sebelumnya",
      icon: TrendingUp,
      tone: "bg-sky-50 text-sky-700",
      trend: kpis.momGrowthPercentage
    },
    {
      label: "Cakupan pelaporan aktif",
      value: formatPercent(kpis.activeReportingCoverage),
      helper:
        kpis.reportingSubmitted !== null && kpis.reportingExpected !== null
          ? `${formatNumber(kpis.reportingSubmitted)} dari ${formatNumber(kpis.reportingExpected)} laporan`
          : "Jumlah laporan belum tersedia",
      icon: MapPinned,
      tone: "bg-violet-50 text-violet-700"
    },
    {
      label: "Outlier utama",
      value: publicMode ? "Data terbatas" : kpis.topOutlierRegion?.regionName ?? "—",
      helper:
        kpis.topOutlierRegion?.variancePercentage !== null && kpis.topOutlierRegion?.variancePercentage !== undefined
          ? `Varians ${formatPercent(kpis.topOutlierRegion.variancePercentage, true)}`
          : "Varians belum tersedia",
      icon: Target,
      tone: "bg-amber-50 text-amber-700"
    }
  ];

  return (
    <section aria-labelledby="analytics-kpi-heading">
      <h2 id="analytics-kpi-heading" className="sr-only">
        Indikator kinerja analitik
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="relative overflow-hidden border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{card.label}</p>
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", card.tone)}>
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                </div>
                <p className={cn("mt-4 min-h-9 text-2xl font-extrabold tracking-tight text-slate-900", card.label === "Outlier utama" && "text-lg leading-7")}>
                  {card.value}
                </p>
                <div className="mt-3 flex min-h-6 items-center gap-2 text-xs text-slate-500">
                  {card.trend !== undefined && (
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 font-bold", trendClasses(card.trend))}>
                      <TrendIcon value={card.trend} />
                      {formatPercent(card.trend, true)}
                    </span>
                  )}
                  <span>{card.helper}</span>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-emerald-500/80 via-sky-400/60 to-transparent" aria-hidden="true" />
            </Card>
          );
        })}
      </div>
    </section>
  );
}
