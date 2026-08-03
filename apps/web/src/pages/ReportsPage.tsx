import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, FileText, Download, Calendar, DollarSign, MapPin, ArrowUpRight, BarChart3, Filter } from "lucide-react";
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
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-7 shadow-2xl backdrop-blur-2xl transition hover:border-emerald-500/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-900/30 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 font-['Outfit']">Analitik Eksekutif</span>
              <h2 className="text-xl font-black text-white font-['Outfit']">Ringkasan Laporan & Tren Pendapatan</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                Agregasi real-time dari data PostGIS, perhitungan tren multi-kuartal, dan porsi setoran daerah.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              window.print();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-emerald-500/40 hover:text-emerald-300 transition shadow-lg shrink-0"
          >
            <Download className="h-4 w-4 text-emerald-400" />
            <span>Cetak / Ekspor Laporan</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Cards Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {metrics.map((metric, idx) => (
          <div
            key={metric.title}
            className="group rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 font-['Outfit']">{metric.title}</span>
              {metric.change && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                  <ArrowUpRight className="h-3 w-3" />
                  {metric.change}
                </span>
              )}
            </div>
            <div className="mt-3 text-3xl font-black tracking-tight text-white font-['Outfit'] drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]">
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
                        backgroundColor: "#0f172a",
                        borderColor: "#10b981",
                        borderRadius: "12px",
                        fontSize: "11px",
                        color: "#fff"
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
      <section className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white font-['Outfit']">Rincian Realisasi Pendapatan Per Provinsi</h3>
              <p className="text-xs text-slate-400">Peringkat kontribusi setoran daerah dan pembagian potongan 15%</p>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
            PERIODE: 2024-Q3
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/80">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 uppercase font-bold">
              <tr>
                <th className="px-5 py-4">Kode</th>
                <th className="px-5 py-4">Provinsi</th>
                <th className="px-5 py-4">Total Realisasi</th>
                <th className="px-5 py-4">Potongan Wajib 15%</th>
                <th className="px-5 py-4">Setoran Bersih 85%</th>
                <th className="px-5 py-4">Porsi Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
              {regionalBreakdown.map((row) => (
                <tr key={row.code} className="hover:bg-slate-900/60 transition">
                  <td className="px-5 py-4 font-mono font-bold text-slate-400">{row.code}</td>
                  <td className="px-5 py-4 font-bold text-white">{row.name}</td>
                  <td className="px-5 py-4 font-extrabold text-emerald-400">{formatCurrency(row.total)}</td>
                  <td className="px-5 py-4 text-amber-300 font-mono">{formatCurrency(row.cut15)}</td>
                  <td className="px-5 py-4 text-cyan-300 font-mono">{formatCurrency(row.net85)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${row.share * 3}%` }} />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-slate-400">{row.share}%</span>
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
