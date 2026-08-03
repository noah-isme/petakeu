import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileText, Download, Sparkles, TrendingUp, Calendar, CheckCircle2, ShieldCheck, Printer } from "lucide-react";

export interface ReportMetric {
  title: string;
  value: string;
  change?: string;
  chartData?: { name: string; value: number }[];
}

interface ReportsPageProps {
  metrics: ReportMetric[];
}

export function ReportsPage({ metrics }: ReportsPageProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const handleGenerateReport = (type: string) => {
    setIsGenerating(true);
    setDownloadSuccess(null);
    setTimeout(() => {
      setIsGenerating(false);
      setDownloadSuccess(`Laporan Eksekutif ${type} (Q3 2024) Berhasil Diunduh.`);
    }, 1500);
  };

  const recentReports = [
    { title: "Ringkasan Eksekutif Pendapatan Daerah Q3 2024", date: "03 Aug 2026", size: "3.2 MB", format: "PDF" },
    { title: "Rincian Potongan Wajib 15% Kabupaten/Kota", date: "01 Aug 2026", size: "1.8 MB", format: "XLSX" },
    { title: "Audit Trail Unggahan Excel Bulanan", date: "28 Jul 2026", size: "940 KB", format: "PDF" }
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">Pusat Laporan & Analisis Keuangan</h2>
            <p className="text-xs text-slate-400">
              Generasi laporan otomatis PDF/Excel untuk direksi dan instansi pemerintah daerah.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => handleGenerateReport("PDF")}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 shadow-lg hover:from-emerald-400 hover:to-teal-400 transition disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            <span>{isGenerating ? "Menyiapkan PDF..." : "Cetak PDF Eksekutif"}</span>
          </button>
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => handleGenerateReport("Excel")}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-emerald-500/50 hover:text-white transition"
          >
            <Download className="h-4 w-4 text-emerald-400" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {downloadSuccess && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-xs font-bold text-emerald-300 shadow-xl">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <span>{downloadSuccess}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <article
            key={metric.title}
            className="flex flex-col justify-between gap-5 rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl transition hover:border-emerald-500/40"
          >
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">{metric.title}</p>
              <p className="mt-2 text-3xl font-extrabold text-white tracking-tight">{metric.value}</p>
              {metric.change && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>{metric.change}</span>
                </div>
              )}
            </div>

            {metric.chartData && (
              <div className="h-32 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metric.chartData}>
                    <defs>
                      <linearGradient id={`gradient-${metric.title.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                        borderColor: "rgba(16, 185, 129, 0.3)",
                        borderRadius: "12px",
                        color: "#fff",
                        fontSize: "12px"
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#10b981"
                      strokeWidth={3}
                      fill={`url(#gradient-${metric.title.replace(/\s+/g, "")})`}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>
        ))}
      </div>

      {/* Generated Reports Table */}
      <section className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-emerald-400" />
          Arsip Laporan Terjadwal
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="px-5 py-3.5">Nama Dokumen Laporan</th>
                <th className="px-5 py-3.5">Tanggal Generasi</th>
                <th className="px-5 py-3.5">Ukuran Berkas</th>
                <th className="px-5 py-3.5">Format</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {recentReports.map((rep, idx) => (
                <tr key={idx} className="hover:bg-slate-900/50 transition">
                  <td className="px-5 py-4 font-bold text-white">{rep.title}</td>
                  <td className="px-5 py-4 text-slate-400">{rep.date}</td>
                  <td className="px-5 py-4 font-mono text-slate-400">{rep.size}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                      {rep.format}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleGenerateReport(rep.format)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Unduh</span>
                    </button>
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

