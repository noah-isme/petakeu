import { ArrowDown, ArrowUp, MapPin } from "lucide-react";

import { AnalyticsSection } from "./AnalyticsSection";
import { formatAmount, formatPercent, percentWidth } from "./analytics-utils";

import type { AnalyticsRegionMetric } from "../../types/analytics";

interface RegionComparisonProps {
  topRegions: AnalyticsRegionMetric[];
  bottomRegions: AnalyticsRegionMetric[];
  publicMode?: boolean;
}

function RegionList({
  title,
  regions,
  publicMode,
  positive
}: {
  title: string;
  regions: AnalyticsRegionMetric[];
  publicMode: boolean;
  positive: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${positive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {positive ? <ArrowUp className="h-4 w-4" aria-hidden="true" /> : <ArrowDown className="h-4 w-4" aria-hidden="true" />}
        </span>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      {regions.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">Peringkat wilayah belum tersedia.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {regions.slice(0, 10).map((region, index) => {
            const achievement = region.achievementPercentage;
            return (
              <li key={`${region.regionId ?? region.regionName}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-extrabold text-slate-600">
                    {region.rank ?? index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                      <p className="truncate text-sm font-bold text-slate-900">{region.regionName}</p>
                      {region.provinceName && <span className="text-[11px] text-slate-400">{region.provinceName}</span>}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-slate-500">
                        {publicMode ? "Capaian" : formatAmount(region.actual, false)}
                      </span>
                      <span className={achievement !== null && achievement >= 100 ? "font-bold text-emerald-700" : "font-bold text-slate-700"}>
                        {formatPercent(achievement)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div className={`h-full rounded-full ${positive ? "bg-emerald-500" : "bg-rose-400"}`} style={{ width: percentWidth(achievement) }} />
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      <span>Varians {formatPercent(region.variancePercentage, true)}</span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function RegionComparison({ topRegions, bottomRegions, publicMode = false }: RegionComparisonProps) {
  return (
    <AnalyticsSection
      title="Perbandingan wilayah teratas dan terbawah"
      description="Peringkat kabupaten/kota berdasarkan capaian terhadap target pada periode terpilih."
      eyebrow="Peringkat"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <RegionList title="Wilayah dengan capaian tertinggi" regions={topRegions} publicMode={publicMode} positive />
        <RegionList title="Wilayah yang perlu perhatian" regions={bottomRegions} publicMode={publicMode} positive={false} />
      </div>
    </AnalyticsSection>
  );
}
