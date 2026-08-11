import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AnalyticsSection } from "./AnalyticsSection";
import { PublicAnalyticsNotice } from "./AnalyticsState";
import { formatAmount, formatPeriod } from "./analytics-utils";

import type { AnalyticsTrendPoint } from "../../types/analytics";

interface MonthlyTrendChartProps {
  data: AnalyticsTrendPoint[];
  publicMode?: boolean;
}

export function MonthlyTrendChart({ data, publicMode = false }: MonthlyTrendChartProps) {
  return (
    <AnalyticsSection
      title="Tren pendapatan bulanan"
      description="Perbandingan realisasi setoran dengan baseline target pada setiap periode yang tersedia."
      eyebrow="Tren"
    >
      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">
          Data tren bulanan belum tersedia untuk periode ini.
        </div>
      ) : publicMode ? (
        <PublicAnalyticsNotice message="Grafik nominal disembunyikan dalam mode publik. Metrik agregat yang aman akan tetap ditampilkan oleh API." />
      ) : (
        <div className="h-72 w-full" role="img" aria-label="Grafik tren realisasi dan target pendapatan bulanan">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="analytics-actual-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="period" tickFormatter={formatPeriod} tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis tickFormatter={(value) => formatAmount(Number(value))} tickLine={false} axisLine={false} width={84} tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip
                labelFormatter={(label) => formatPeriod(String(label))}
                formatter={(value, name) => [formatAmount(Number(value)), name === "actual" ? "Realisasi" : "Target"]}
                contentStyle={{ borderRadius: 14, borderColor: "#cbd5e1", fontSize: 12 }}
              />
              <Legend formatter={(value) => (value === "actual" ? "Realisasi" : "Target")} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="actual" stroke="#059669" strokeWidth={2.5} fill="url(#analytics-actual-fill)" connectNulls />
              <Line type="monotone" dataKey="target" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 5" dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsSection>
  );
}
