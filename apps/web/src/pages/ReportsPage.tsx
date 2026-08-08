import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Download, MapPin, ArrowUpRight, BarChart3 } from "lucide-react";

import { formatCurrency } from "../lib/format";

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  chartData?: { name: string; value: number }[];
}

export function ReportsPage({ metrics }: { metrics: MetricCardProps[] }) {
  const regionalBreakdown = useMemo(
    () => [
      { name: "Jawa Timur", code: "35", total: 3340000000, cut15: 501000000, net85: 2839000000, share: 24.6 },
      { name: "Jawa Barat", code: "32", total: 3125000000, cut15: 468750000, net85: 2656250000, share: 23.0 },
      { name: "DKI Jakarta", code: "31", total: 2150000000, cut15: 322500000, net85: 1827500000, share: 15.8 },
      { name: "Jawa Tengah", code: "33", total: 2540000000, cut15: 381000000, net85: 2159000000, share: 18.7 },
      { name: "Banten", code: "36", total: 1450000000, cut15: 217500000, net85: 1232500000, share: 10.7 },
      { name: "DI Yogyakarta", code: "34", total: 980000000, cut15: 147000000, net85: 833000000, share: 7.2 }
    ],
    []
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header Banner */}
      <div className="rounded-[24px] border border-slate-100 bg-white p-6 shadow-xs transition hover:shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 font-['Outfit']">Analitik Eksekutif</span>
              <h2 className="text-xl font-bold text-slate-900 font-['Outfit']">Ringkasan Laporan & Tren Pendapatan</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Agregasi real-time dari data PostGIS, perhitungan tren multi-kuartal, dan porsi setoran daerah.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              window.print();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition shadow-xs shrink-0"
          >
            <Download className="h-4 w-4 text-emerald-700" />
            <span>Cetak / Ekspor Laporan</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Cards Grid */}
      <div className="grid gap-5 md:grid-cols-3">
        {metrics.map((metric, idx) => (
          <div
            key={metric.title}
            className="group rounded-[24px] border border-slate-100 bg-white p-6 shadow-xs transition-all duration-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-['Outfit']">{metric.title}</span>
              {metric.change && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  <ArrowUpRight className="h-3 w-3 text-emerald-600" />
                  {metric.change}
                </span>
              )}
            </div>
            <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 font-['Outfit']">
              {metric.value}
            </div>

            {/* Sparkline / Chart if present */}
            {metric.chartData && (
              <div className="mt-4 h-24 w-full">
                <ResponsiveContainer width="100%" height={96}>
                  <AreaChart data={metric.chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderColor: "#10b981",
                        borderRadius: "12px",
                        fontSize: "11px",
                        color: "#0f172a"
                      }}
                      formatter={(val: number) => [formatCurrency(val), "Nominal"]}
                    />
                    <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill={`url(#grad-${idx})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Regional Revenue Ranking Table */}
      <section className="rounded-[24px] border border-slate-100 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 border border-cyan-200">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Rincian Realisasi Pendapatan Per Provinsi</h3>
              <p className="text-xs text-slate-500">Peringkat kontribusi setoran daerah dan pembagian potongan 15%</p>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
            PERIODE: 2024-Q3
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/50">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-100/80 text-slate-500 uppercase font-bold">
              <tr>
                <th className="px-5 py-3.5">Kode</th>
                <th className="px-5 py-3.5">Provinsi</th>
                <th className="px-5 py-3.5">Total Realisasi</th>
                <th className="px-5 py-3.5">Potongan Wajib 15%</th>
                <th className="px-5 py-3.5">Setoran Bersih 85%</th>
                <th className="px-5 py-3.5">Porsi Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 text-slate-700 font-medium">
              {regionalBreakdown.map((row) => (
                <tr key={row.code} className="hover:bg-slate-100/50 transition">
                  <td className="px-5 py-3.5 font-mono font-bold text-slate-400">{row.code}</td>
                  <td className="px-5 py-3.5 font-bold text-slate-900">{row.name}</td>
                  <td className="px-5 py-3.5 font-extrabold text-emerald-700">{formatCurrency(row.total)}</td>
                  <td className="px-5 py-3.5 text-amber-800 font-mono">{formatCurrency(row.cut15)}</td>
                  <td className="px-5 py-3.5 text-cyan-800 font-mono">{formatCurrency(row.net85)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${row.share * 3}%` }} />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-slate-500">{row.share}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

