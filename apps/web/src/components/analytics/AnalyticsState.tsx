import { AlertTriangle, Database, LoaderCircle, LockKeyhole, RefreshCcw } from "lucide-react";

import { Button } from "../ui/button";

interface AnalyticsStateProps {
  title: string;
  message: string;
  compact?: boolean;
}

export function AnalyticsSectionEmpty({ title, message, compact = false }: AnalyticsStateProps) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 ${compact ? "p-4" : "p-6"}`}>
      <Database className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="mt-0.5 text-xs leading-5">{message}</p>
      </div>
    </div>
  );
}

export function AnalyticsLoadingState() {
  return (
    <div className="space-y-6" aria-live="polite" aria-busy="true">
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

export function AnalyticsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-950" role="alert">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
          <div>
            <h2 className="font-bold">Data analitik belum dapat dimuat</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-rose-800">
              Tidak ada angka yang ditampilkan sampai layanan tersedia. {message}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" className="shrink-0 border-rose-300 bg-white text-rose-900 hover:bg-rose-100" onClick={onRetry}>
          <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Coba lagi
        </Button>
      </div>
    </div>
  );
}

export function AnalyticsEmptyState({ publicMode = false }: { publicMode?: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm" role="status">
      {publicMode ? (
        <LockKeyhole className="mx-auto h-8 w-8 text-emerald-700" aria-hidden="true" />
      ) : (
        <Database className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
      )}
      <h2 className="mt-4 text-lg font-bold text-slate-900">
        {publicMode ? "Ringkasan publik belum tersedia" : "Belum ada data analitik"}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
        {publicMode
          ? "Periode ini belum memiliki data agregat yang dapat ditampilkan untuk akses publik."
          : "Belum ada hasil laporan untuk periode yang dipilih. Dashboard tidak menggunakan nilai pengganti."}
      </p>
    </div>
  );
}

export function PublicAnalyticsNotice({ message = "Nilai nominal disembunyikan dalam mode publik." }: { message?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950" role="note">
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
      <p className="text-xs leading-5 text-sky-800">{message}</p>
    </div>
  );
}

export function AnalyticsChartLoading() {
  return (
    <div className="flex h-64 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500" aria-live="polite">
      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      Menyiapkan visualisasi…
    </div>
  );
}
