import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AnalyticsSection } from "./AnalyticsSection";
import { PublicAnalyticsNotice } from "./AnalyticsState";
import { formatAmount, formatPercent, percentWidth } from "./analytics-utils";

import type { AnalyticsTargetActualPoint } from "../../types/analytics";

interface TargetVarianceChartProps {
  data: AnalyticsTargetActualPoint[];
  publicMode?: boolean;
}

export function TargetVarianceChart({ data, publicMode = false }: TargetVarianceChartProps) {
  const chartData = data.slice(0, 12);

  return (
    <AnalyticsSection
      title="Target versus aktual dan varians"
      description="Selisih realisasi terhadap target membantu menemukan wilayah yang melampaui atau tertinggal dari rencana."
      eyebrow="Target"
    >
      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">
          Data target dan realisasi belum tersedia.
        </div>
      ) : publicMode ? (
        <div className="space-y-4">
          <PublicAnalyticsNotice />
          <div className="space-y-3">
            {chartData.map((item, index) => (
              <div key={`${item.regionId ?? item.regionName}-${index}`}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-slate-700">{item.regionName}</span>
                  <span className="shrink-0 font-bold text-slate-800">{formatPercent(item.achievementPercentage)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: percentWidth(item.achievementPercentage) }} />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">Varians {formatPercent(item.variancePercentage, true)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-80 w-full" role="img" aria-label="Grafik perbandingan target dan realisasi wilayah">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 4 }} barGap={4}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => formatAmount(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis type="category" dataKey="regionName" width={112} tickLine={false} axisLine={false} tick={{ fill: "#475569", fontSize: 11 }} />
              <Tooltip
                formatter={(value, name) => [formatAmount(Number(value)), name === "actual" ? "Realisasi" : "Target"]}
                contentStyle={{ borderRadius: 14, borderColor: "#cbd5e1", fontSize: 12 }}
              />
              <Bar dataKey="target" name="target" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                {chartData.map((item, index) => <Cell key={`target-${item.regionId ?? item.regionName}-${index}`} fill="#c4b5fd" />)}
              </Bar>
              <Bar dataKey="actual" name="actual" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsSection>
  );
}
