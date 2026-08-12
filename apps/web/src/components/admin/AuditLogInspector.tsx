import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  X
} from "lucide-react";

import { useAuditLogs } from "../../hooks/useAuditLogs";

import type { AuditLogFilters, AuditLogItem } from "../../types/audit";

const PAGE_SIZE = 25;

interface AuditFilterForm {
  event: string;
  action: string;
  resource: string;
  userId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: AuditFilterForm = {
  event: "",
  action: "",
  resource: "",
  userId: "",
  from: "",
  to: ""
};

function normalizeDateTime(value: string): string | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toApiFilters(filters: AuditFilterForm): AuditLogFilters {
  const apiFilters: AuditLogFilters = {};

  if (filters.event.trim()) apiFilters.event = filters.event.trim();
  if (filters.action.trim()) apiFilters.action = filters.action.trim();
  if (filters.resource.trim()) apiFilters.resource = filters.resource.trim();
  if (filters.userId.trim()) apiFilters.userId = filters.userId.trim();

  const from = normalizeDateTime(filters.from);
  const to = normalizeDateTime(filters.to);
  if (from) apiFilters.from = from;
  if (to) apiFilters.to = to;

  return apiFilters;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatDetails(value: Record<string, unknown> | null): string {
  if (!value) return "Tidak ada detail tambahan";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Detail tidak dapat ditampilkan";
  }
}

function statusClass(statusCode: number | null): string {
  if (statusCode === null) return "border-slate-200 bg-slate-50 text-slate-500";
  if (statusCode >= 400) return "border-rose-200 bg-rose-50 text-rose-700";
  if (statusCode >= 300) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusLabel(statusCode: number | null): string {
  if (statusCode === null) return "—";
  if (statusCode >= 400) return `${statusCode} gagal`;
  if (statusCode >= 300) return `${statusCode} redirect`;
  return `${statusCode} berhasil`;
}

function AuditLogRow({ item }: { item: AuditLogItem }) {
  const details = formatDetails(item.details);

  return (
    <tr className="border-t border-slate-100 align-top text-sm text-slate-700">
      <td className="whitespace-nowrap px-4 py-4 text-xs font-medium text-slate-600">
        <time dateTime={item.timestamp}>{formatTimestamp(item.timestamp)}</time>
      </td>
      <td className="min-w-52 px-4 py-4">
        <div className="font-semibold text-slate-900">{item.event}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono uppercase">{item.method}</span>
          <span>{item.action}</span>
        </div>
      </td>
      <td className="min-w-36 px-4 py-4">
        <div className="font-mono text-xs text-slate-700">{item.user_id ?? "Sistem / anonim"}</div>
        {item.ip_address && <div className="mt-1 text-xs text-slate-400">{item.ip_address}</div>}
      </td>
      <td className="min-w-44 px-4 py-4">
        <div className="font-medium text-slate-800">{item.resource ?? "—"}</div>
        {item.resource_id && <div className="mt-1 break-all font-mono text-xs text-slate-500">{item.resource_id}</div>}
      </td>
      <td className="min-w-52 px-4 py-4">
        <code className="break-all text-xs text-slate-600">{item.endpoint}</code>
        {item.request_id && <div className="mt-1 break-all font-mono text-[11px] text-slate-400">req {item.request_id}</div>}
      </td>
      <td className="whitespace-nowrap px-4 py-4">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(item.status_code)}`}>
          {statusLabel(item.status_code)}
        </span>
      </td>
      <td className="px-4 py-4">
        <details className="max-w-64">
          <summary className="cursor-pointer text-xs font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
            Lihat detail
          </summary>
          <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono">{details}</pre>
            {item.user_agent && <p className="break-words border-t border-slate-200 pt-2">{item.user_agent}</p>}
          </div>
        </details>
      </td>
    </tr>
  );
}

export function AuditLogInspector() {
  const [draftFilters, setDraftFilters] = useState<AuditFilterForm>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilterForm>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const query = useAuditLogs({
    ...toApiFilters(appliedFilters),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE
  });

  const items = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((value) => value.length > 0).length,
    [appliedFilters]
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleApply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...draftFilters });
  };

  const handleReset = () => {
    setPage(1);
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const updateFilter = (key: keyof AuditFilterForm, value: string) => {
    setDraftFilters((previous) => ({ ...previous, [key]: value }));
  };

  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, total);

  return (
    <section
      aria-labelledby="audit-log-title"
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      data-testid="audit-log-inspector"
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:px-7 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-700">Enterprise governance</p>
          <h2 id="audit-log-title" className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            Audit trail inspector
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Telusuri aktivitas perubahan dan akses untuk kebutuhan kepatuhan. Filter dikirim sebagai kecocokan tepat sesuai kontrak API audit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-xs transition hover:border-emerald-300 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-60"
          aria-label="Muat ulang log audit"
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          Muat ulang
        </button>
      </div>

      <form onSubmit={handleApply} className="border-b border-slate-100 bg-slate-50/70 px-5 py-5 sm:px-7" aria-label="Filter log audit">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Filter className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            Filter audit
          </div>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800" aria-live="polite">
              {activeFilterCount} filter aktif
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-bold text-slate-600" htmlFor="audit-event">
            Event
            <input
              id="audit-event"
              value={draftFilters.event}
              onChange={(event) => updateFilter("event", event.target.value)}
              placeholder="upload.created"
              className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <label className="text-xs font-bold text-slate-600" htmlFor="audit-action">
            Aksi
            <input
              id="audit-action"
              value={draftFilters.action}
              onChange={(event) => updateFilter("action", event.target.value)}
              placeholder="upload atau export"
              className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <label className="text-xs font-bold text-slate-600" htmlFor="audit-resource">
            Resource
            <input
              id="audit-resource"
              value={draftFilters.resource}
              onChange={(event) => updateFilter("resource", event.target.value)}
              placeholder="upload atau report"
              className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <label className="text-xs font-bold text-slate-600" htmlFor="audit-user-id">
            User ID
            <input
              id="audit-user-id"
              value={draftFilters.userId}
              onChange={(event) => updateFilter("userId", event.target.value)}
              placeholder="UUID atau subject JWT"
              className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <label className="text-xs font-bold text-slate-600" htmlFor="audit-from">
            Dari waktu
            <span className="relative mt-1.5 block">
              <CalendarClock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                id="audit-from"
                type="datetime-local"
                value={draftFilters.from}
                onChange={(event) => updateFilter("from", event.target.value)}
                className="min-h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-normal text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </span>
          </label>
          <label className="text-xs font-bold text-slate-600" htmlFor="audit-to">
            Sampai waktu
            <span className="relative mt-1.5 block">
              <CalendarClock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                id="audit-to"
                type="datetime-local"
                value={draftFilters.to}
                onChange={(event) => updateFilter("to", event.target.value)}
                className="min-h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-normal text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Bersihkan
          </button>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Terapkan filter
          </button>
        </div>
      </form>

      {query.isError && (
        <div className="mx-5 mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:mx-7" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-bold">Log audit tidak dapat dimuat.</p>
            <p className="mt-1 text-rose-700">{query.error instanceof Error ? query.error.message : "Periksa koneksi dan hak akses admin."}</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 font-bold underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              Coba lagi
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel log audit" aria-busy={query.isFetching}>
        <table className="min-w-[1100px] w-full border-collapse text-left">
          <caption className="sr-only">Daftar log audit yang dapat difilter berdasarkan event, aksi, resource, user, dan waktu</caption>
          <thead className="bg-white text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="whitespace-nowrap px-4 py-4" scope="col">Waktu</th>
              <th className="whitespace-nowrap px-4 py-4" scope="col">Event / aksi</th>
              <th className="whitespace-nowrap px-4 py-4" scope="col">User</th>
              <th className="whitespace-nowrap px-4 py-4" scope="col">Resource</th>
              <th className="whitespace-nowrap px-4 py-4" scope="col">Endpoint</th>
              <th className="whitespace-nowrap px-4 py-4" scope="col">Hasil</th>
              <th className="whitespace-nowrap px-4 py-4" scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {query.isPending ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500" role="status">
                  Memuat log audit…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center" role="status">
                  <p className="font-semibold text-slate-700">Tidak ada log yang cocok.</p>
                  <p className="mt-1 text-sm text-slate-500">Coba ubah filter event, user, resource, atau rentang waktu.</p>
                </td>
              </tr>
            ) : (
              items.map((item) => <AuditLogRow key={item.id} item={item} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="text-slate-500" aria-live="polite">
          {query.isFetching && !query.isPending ? "Memperbarui… " : ""}
          Menampilkan <span className="font-bold text-slate-700">{firstResult}–{lastResult}</span> dari <span className="font-bold text-slate-700">{total}</span> log
        </p>
        <nav className="flex items-center gap-2" aria-label="Navigasi halaman audit">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || query.isFetching}
            aria-label="Halaman audit sebelumnya"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-300 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-24 text-center text-xs font-bold text-slate-600">Halaman {page} dari {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || query.isFetching}
            aria-label="Halaman audit berikutnya"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-300 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      </div>
    </section>
  );
}
