import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw, X } from "lucide-react";

import { useAnalytics } from "../hooks/useAnalytics";
import { useRegions } from "../hooks/useRegions";
import { apiClient } from "../api/client";
import { appConfig } from "../config/app";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  AnalyticsEmptyState,
  AnalyticsErrorState,
  AnalyticsLoadingState
} from "../components/analytics/AnalyticsState";
import { AnalyticsSection } from "../components/analytics/AnalyticsSection";
import { KpiCards } from "../components/analytics/KpiCards";
import { MonthlyTrendChart } from "../components/analytics/MonthlyTrendChart";
import { RegionComparison } from "../components/analytics/RegionComparison";
import { TargetVarianceChart } from "../components/analytics/TargetVarianceChart";
import { hasAnalyticsData, formatAmount, formatPeriod, formatPercent, formatUpdatedAt, normalizeAnalyticsPeriod } from "../components/analytics/analytics-utils";

import type {
  AnalyticsAmountBasis,
  AnalyticsOverview,
  AnalyticsProvinceMetric,
  AnalyticsReportingCell,
  AnalyticsRankingCriterion,
  ReportingStatus
} from "../types/analytics";

interface AnalyticsPageProps {
  period?: string;
}

function statusClasses(status: ReportingStatus): string {
  if (status === "Reporting") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Delayed") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function StatusCell({ cell }: { cell: AnalyticsReportingCell }) {
  return (
    <span className={`inline-flex min-w-20 justify-center rounded-lg border px-2 py-1 text-[11px] font-bold ${statusClasses(cell.status)}`}>
      {cell.status}
    </span>
  );
}

function ProvinceComparison({ data, publicMode }: { data: AnalyticsProvinceMetric[]; publicMode: boolean }) {
  return (
    <AnalyticsSection
      title="Perbandingan antarprovinsi"
      description="Bandingkan capaian, target, dan cakupan kabupaten/kota antarprovinsi pada periode terpilih."
      eyebrow="Lintas provinsi"
    >
      {data.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">Data provinsi belum tersedia.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200" tabIndex={0} aria-label="Tabel perbandingan analitik">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-extrabold">Provinsi</th>
                <th className="px-4 py-3 font-extrabold">Aktual</th>
                <th className="px-4 py-3 font-extrabold">Pencapaian</th>
                <th className="px-4 py-3 font-extrabold">YoY</th>
                <th className="px-4 py-3 font-extrabold">Kepatuhan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((province) => (
                <tr key={province.provinceId ?? province.provinceName} className="text-slate-700">
                  <td className="px-4 py-3 font-bold text-slate-900">{province.provinceName}</td>
                  <td className="px-4 py-3 font-semibold">{formatAmount(province.actual, publicMode)}</td>
                  <td className="px-4 py-3 font-semibold">{formatPercent(province.achievementPercentage)}</td>
                  <td className="px-4 py-3 font-semibold">{formatPercent(province.yoyPercentage, true)}</td>
                  <td className="px-4 py-3 font-semibold">{formatPercent(province.reportingCoverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AnalyticsSection>
  );
}

function YearOverYear({ data, publicMode }: { data: AnalyticsOverview["yoyComparison"]; publicMode: boolean }) {
  return (
    <AnalyticsSection
      title="Perbandingan historis YoY"
      description="Periode berjalan dibandingkan dengan bulan yang sama pada tahun sebelumnya."
      eyebrow="Historis"
    >
      {data.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">Perbandingan historis belum tersedia.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.map((point) => (
            <Card key={`${point.period}-${point.currentActual ?? "na"}`} className="border-slate-200 bg-slate-50/60 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs font-bold text-slate-700">{formatPeriod(point.period)}</p>
                <p className="mt-3 text-xl font-extrabold text-slate-900">{formatPercent(point.growthPercentage, true)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {publicMode ? "Nominal disembunyikan" : `${formatAmount(point.currentActual)} vs ${formatAmount(point.previousActual)}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AnalyticsSection>
  );
}

interface SelectedReportingCell {
  regionId: string | null;
  regionName: string;
  period: string;
  cell: AnalyticsReportingCell;
}

function ReportingMatrix({ data, onSelect }: { data: AnalyticsOverview["reportingMatrix"]; onSelect: (selection: SelectedReportingCell) => void }) {
  return (
    <AnalyticsSection
      title="Matriks kepatuhan pelaporan"
      description="Status pelaporan setiap kabupaten/kota: Reporting, Missing, atau Delayed."
      eyebrow="Kepatuhan"
    >
      {data.regions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">Matriks pelaporan belum tersedia.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200" tabIndex={0} aria-label="Tabel matriks pelaporan">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-4 py-3 font-extrabold">Wilayah</th>
                {data.periods.map((period) => <th key={period} className="px-3 py-3 text-center font-extrabold">{formatPeriod(period)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.regions.slice(0, 514).map((region) => (
                <tr key={region.regionId ?? region.regionName}>
                  <th className="sticky left-0 bg-white px-4 py-3 text-left font-bold text-slate-800">{region.regionName}</th>
                  {data.periods.map((period, index) => {
                    const cell = region.cells.find((item) => item.period === period) ?? region.cells[index];
                    return <td key={`${region.regionId ?? region.regionName}-${period}`} className="px-3 py-2 text-center">{cell ? <button type="button" className="rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40" onClick={() => onSelect({ regionId: region.regionId, regionName: region.regionName, period, cell })} aria-label={`Lihat detail ${region.regionName} ${formatPeriod(period)}`}><StatusCell cell={cell} /></button> : <span className="text-slate-300">—</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AnalyticsSection>
  );
}

function ReportingDetailDrawer({ selection, publicMode, onClose }: { selection: SelectedReportingCell | null; publicMode: boolean; onClose: () => void }) {
  const detailQuery = useQuery({
    queryKey: ["reporting-matrix-detail", selection?.regionId, selection?.period],
    queryFn: () => apiClient.getReportingMatrixDetail(selection?.regionId as string, selection?.period as string),
    enabled: Boolean(selection?.regionId) && !selection?.cell.detail,
    staleTime: 5 * 60 * 1000
  });
  if (!selection) return null;
  const detail = selection.cell.detail ?? detailQuery.data;
  const amount = (value: number | null | undefined) => publicMode ? "Data terbatas" : formatAmount(value ?? null);
  return (
    <aside className="fixed inset-y-0 right-0 z-[60] w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl" aria-label="Detail pelaporan" role="dialog">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">Detail pelaporan</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">{selection.regionName}</h2><p className="mt-1 text-xs text-slate-500">{formatPeriod(selection.period)} · {selection.cell.status}</p></div>
        <Button type="button" variant="outline" size="icon" aria-label="Tutup detail pelaporan" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      {detailQuery.isLoading && !detail && <p className="mt-8 text-sm text-slate-500">Memuat rincian…</p>}
      {detailQuery.isError && !detail && <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Rincian transaksi belum tersedia.</p>}
      {detail && (
        <div className="mt-6 space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            {[["Bruto", detail.grossAmount], ["Share", detail.shareAmount], ["Netto", detail.netAmount], ["Target", detail.targetAmount]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 text-sm font-extrabold text-slate-900">{amount(value as number | null)}</dd></div>)}
          </dl>
          <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-600"><p><strong>File:</strong> {detail.importFilename ?? "—"}</p><p className="mt-1"><strong>Operator:</strong> {detail.importedBy ?? "—"}</p><p className="mt-1"><strong>Waktu:</strong> {detail.importedAt ? formatUpdatedAt(detail.importedAt) : "—"}</p></div>
          {detail.validationFindings.length > 0 && <div><h3 className="text-xs font-extrabold text-slate-900">Temuan validasi</h3><ul className="mt-2 space-y-2">{detail.validationFindings.map((finding, index) => <li key={finding.findingId ?? index} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{finding.message}</li>)}</ul></div>}
        </div>
      )}
    </aside>
  );
}

function AnalyticsFilters({
  from,
  to,
  provinceIds,
  ranking,
  amountBasis,
  provinces,
  onFromChange,
  onToChange,
  onProvinceChange,
  onRankingChange,
  onAmountBasisChange
}: {
  from: string;
  to: string;
  provinceIds: string[];
  ranking: AnalyticsRankingCriterion;
  amountBasis: AnalyticsAmountBasis;
  provinces: Array<{ id: string; name: string }>;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onProvinceChange: (values: string[]) => void;
  onRankingChange: (value: AnalyticsRankingCriterion) => void;
  onAmountBasisChange: (value: AnalyticsAmountBasis) => void;
}) {
  return (
    <section aria-labelledby="analytics-filter-heading" className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h2 id="analytics-filter-heading" className="text-sm font-extrabold text-slate-900">Filter analitik</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-bold text-slate-700">Dari<input type="month" value={from} onChange={(event) => onFromChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-emerald-500" /></label>
        <label className="text-xs font-bold text-slate-700">Sampai<input type="month" value={to} onChange={(event) => onToChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-emerald-500" /></label>
        <label className="text-xs font-bold text-slate-700">Peringkat<select value={ranking} onChange={(event) => onRankingChange(event.target.value as AnalyticsRankingCriterion)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-emerald-500"><option value="total">Total</option><option value="monthly_average">Rata-rata bulanan</option><option value="target_achievement">Pencapaian target</option><option value="growth">Pertumbuhan</option><option value="surplus">Surplus</option><option value="deficit">Defisit</option></select></label>
        <label className="text-xs font-bold text-slate-700">Basis nominal<select value={amountBasis} onChange={(event) => onAmountBasisChange(event.target.value as AnalyticsAmountBasis)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-emerald-500"><option value="gross">Bruto</option><option value="share">Share 15%</option><option value="net">Netto 85%</option></select></label>
        <label className="text-xs font-bold text-slate-700">Provinsi<select multiple value={provinceIds} onChange={(event) => onProvinceChange([...event.target.selectedOptions].map((option) => option.value))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 py-1 text-xs font-medium outline-none focus:border-emerald-500" aria-label="Pilih satu atau beberapa provinsi">{provinces.map((province) => <option key={province.id} value={province.id}>{province.name}</option>)}</select></label>
      </div>
    </section>
  );
}

export function AnalyticsPage({ period }: AnalyticsPageProps) {
  const analyticsPeriod = normalizeAnalyticsPeriod(period);
  const [from, setFrom] = useState(analyticsPeriod ?? "");
  const [to, setTo] = useState(analyticsPeriod ?? "");
  const [provinceIds, setProvinceIds] = useState<string[]>([]);
  const [ranking, setRanking] = useState<AnalyticsRankingCriterion>("total");
  const [amountBasis, setAmountBasis] = useState<AnalyticsAmountBasis>("gross");
  const [selectedCell, setSelectedCell] = useState<SelectedReportingCell | null>(null);
  const provincesQuery = useRegions({ level: "province" });
  const query = useAnalytics({ period: analyticsPeriod, from: from || undefined, to: to || undefined, provinceIds, ranking, amountBasis });
  const publicMode = appConfig.publicMode || query.data?.public === true;
  const filters = <AnalyticsFilters from={from} to={to} provinceIds={provinceIds} ranking={ranking} amountBasis={amountBasis} provinces={provincesQuery.data ?? []} onFromChange={setFrom} onToChange={setTo} onProvinceChange={setProvinceIds} onRankingChange={setRanking} onAmountBasisChange={setAmountBasis} />;

  if (query.isLoading && !query.data) return <AnalyticsLoadingState />;
  if (query.isError && !query.data) {
    return <AnalyticsErrorState message={query.error instanceof Error ? query.error.message : "Layanan analitik tidak merespons."} onRetry={() => void query.refetch()} />;
  }

  const data = query.data;
  if (!data || !hasAnalyticsData(data)) {
    return <div className="mx-auto max-w-[1500px] space-y-5 overflow-y-auto px-4 pb-10 pt-5 sm:px-6 lg:px-8">{filters}<AnalyticsEmptyState publicMode={publicMode} /></div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 overflow-y-auto px-4 pb-10 pt-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-700">Analitik eksekutif</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Kinerja penerimaan daerah</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Tren, target, perbandingan wilayah, dan kepatuhan pelaporan dalam satu tampilan.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{formatPeriod(data.period ?? analyticsPeriod)}</span>
          <span aria-hidden="true">•</span>
          <span>{formatUpdatedAt(data.lastUpdated)}</span>
          <Button type="button" variant="outline" size="icon" aria-label="Muat ulang analitik" onClick={() => void query.refetch()}>
            <RefreshCcw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
          </Button>
        </div>
      </header>

      <KpiCards kpis={data.kpis} period={data.period ?? analyticsPeriod ?? null} publicMode={publicMode} />

      {filters}

      {query.isError && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800" role="status">Data yang tampil adalah hasil terakhir; pembaruan terbaru gagal dimuat.</p>}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <MonthlyTrendChart data={data.monthlyTrend} publicMode={publicMode} />
        <TargetVarianceChart data={data.targetVsActual} publicMode={publicMode} />
      </div>

      <RegionComparison topRegions={data.topRegions} bottomRegions={data.bottomRegions} publicMode={publicMode} />
      <ProvinceComparison data={data.provinceComparison} publicMode={publicMode} />
      <YearOverYear data={data.yoyComparison} publicMode={publicMode} />
      <ReportingMatrix data={data.reportingMatrix} onSelect={setSelectedCell} />
      <ReportingDetailDrawer selection={selectedCell} publicMode={publicMode} onClose={() => setSelectedCell(null)} />
    </div>
  );
}
