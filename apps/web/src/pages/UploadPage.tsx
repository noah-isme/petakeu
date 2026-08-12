import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Save,
  UploadCloud,
  X
} from "lucide-react";

import { apiClient } from "../api/client";
import { useUpload, useUploadRows } from "../hooks/useUploads";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

import type { StagedUploadRow, UploadRowPatch, UploadStatus } from "../types/upload";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PAGE_SIZE = 25;

function statusLabel(status: UploadStatus | "idle"): string {
  switch (status) {
    case "queued":
      return "Dalam antrean";
    case "processing":
    case "parsing":
      return "Mem-parsing berkas";
    case "parsed":
      return "Berkas diparsing";
    case "awaiting_confirmation":
      return "Menunggu konfirmasi";
    case "committing":
      return "Menyimpan data";
    case "persisted":
    case "confirmed":
      return "Tersimpan";
    case "cancelled":
      return "Dibatalkan";
    case "failed":
      return "Gagal diproses";
    default:
      return "Siap mengunggah";
  }
}

function isExcel(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls");
}

function asNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(/\./g, "").replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function stepClasses(active: boolean, complete: boolean): string {
  if (active) return "border-emerald-600 bg-emerald-600 text-white";
  if (complete) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-white text-slate-500";
}

function findingClasses(severity: "error" | "warning" | "info"): string {
  if (severity === "error") return "border-rose-200 bg-rose-50 text-rose-800";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function RowInput({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: "text" | "month" | "number";
}) {
  return (
    <label className="block min-w-32">
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
      />
    </label>
  );
}

function UploadSteps({ status, hasRows }: { status: UploadStatus | "idle"; hasRows: boolean }) {
  const review = hasRows || status === "awaiting_confirmation";
  const confirmed = status === "persisted" || status === "confirmed";
  return (
    <ol aria-label="Tahapan unggah" className="grid grid-cols-4 gap-2">
      {([
        ["1", "Unggah", status !== "idle" || false],
        ["2", "Parse", review || status === "parsed" || confirmed],
        ["3", "Tinjau", review || confirmed],
        ["4", "Konfirmasi", confirmed]
      ] as const).map(([number, label, complete], index) => {
        const active = (!review && index === 0) || (review && !confirmed && index === 2) || confirmed && index === 3;
        return (
          <li key={label} className="flex items-center gap-2 text-xs font-bold">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${stepClasses(active, Boolean(complete))}`}>
              {complete && !active ? <Check className="h-4 w-4" aria-hidden="true" /> : number}
            </span>
            <span className={active ? "text-emerald-700" : "text-slate-600"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function UploadPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showFindings, setShowFindings] = useState(false);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, UploadRowPatch>>({});
  const [aliasStatus, setAliasStatus] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [confirmedLocally, setConfirmedLocally] = useState(false);
  const [cancelledLocally, setCancelledLocally] = useState(false);

  const uploadQuery = useUpload(uploadId);
  const rowsQuery = useUploadRows(uploadId, page, PAGE_SIZE);
  const status = uploadQuery.data?.status ?? "queued";
  const rows = useMemo(() => rowsQuery.data?.data ?? [], [rowsQuery.data?.data]);

  const uploadMutation = useMutation({
    mutationFn: (selectedFile: File) => {
      const formData = new FormData();
      formData.append("file", selectedFile);
      return apiClient.uploadFile(formData);
    },
    onSuccess: (result, selectedFile) => {
      setFile(selectedFile);
      setUploadId(result.uploadId);
      setPage(1);
      setMessage(`Berkas ${selectedFile.name} diterima. Menunggu hasil parsing…`);
      void queryClient.invalidateQueries({ queryKey: ["uploads"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Gagal mengunggah berkas.")
  });

  const updateRowMutation = useMutation({
    mutationFn: ({ row, patch }: { row: StagedUploadRow; patch: UploadRowPatch }) =>
      apiClient.updateUploadRow(uploadId as string, row.rowId, { ...patch, revision: row.revision }),
    onSuccess: () => {
      setMessage("Perubahan baris disimpan dan validasi dijalankan ulang.");
      void queryClient.invalidateQueries({ queryKey: ["upload-rows", uploadId] });
      void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Gagal memperbarui baris.")
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiClient.confirmUpload(uploadId as string, { acknowledgedFindingIds: [...acknowledged] }),
    onSuccess: (result) => {
      setConfirmedLocally(true);
      setMessage(`Konfirmasi berhasil. ${result.persistedRows ?? rowsQuery.data?.meta.total ?? 0} baris tersimpan.`);
      void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] });
      void queryClient.invalidateQueries({ queryKey: ["uploads"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Gagal mengonfirmasi unggahan.")
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.cancelUpload(uploadId as string),
    onSuccess: () => {
      setCancelledLocally(true);
      setMessage("Unggahan dibatalkan dan tidak ada baris yang disimpan.");
      void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] });
      void queryClient.invalidateQueries({ queryKey: ["uploads"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Gagal membatalkan unggahan.")
  });

  const hasRows = rows.length > 0 || (rowsQuery.data?.meta.total ?? 0) > 0;
  const allFindings = useMemo(() => rows.flatMap((row) => row.findings), [rows]);
  const blockingErrors = allFindings.filter((finding) => finding.severity === "error");
  const warnings = allFindings.filter((finding) => finding.severity === "warning");
  const missingWarningAcknowledgements = warnings.filter((finding) => !finding.acknowledged && !acknowledged.has(finding.findingId));
  const canConfirm = Boolean(uploadId) && hasRows && blockingErrors.length === 0 && missingWarningAcknowledgements.length === 0 && !confirmMutation.isPending;

  const selectFile = (selectedFile: File | undefined) => {
    if (!selectedFile) return;
    if (!isExcel(selectedFile)) {
      setMessage("Format tidak didukung. Gunakan file Excel .xlsx atau .xls.");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setMessage("Ukuran file melebihi batas 10 MB.");
      return;
    }
    setMessage(null);
    setFile(selectedFile);
    uploadMutation.mutate(selectedFile);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const reset = () => {
    setFile(null);
    setUploadId(null);
    setPage(1);
    setDrafts({});
    setAcknowledged(new Set());
    setShowFindings(false);
    setConfirmedLocally(false);
    setCancelledLocally(false);
    setMessage(null);
  };

  const draftFor = (row: StagedUploadRow): UploadRowPatch => drafts[row.rowId] ?? {};
  const patchDraft = (row: StagedUploadRow, field: keyof UploadRowPatch, value: string) => {
    const numeric = ["grossAmount", "shareAmount", "netAmount", "targetAmount"].includes(field);
    setDrafts((current) => ({
      ...current,
      [row.rowId]: {
        ...current[row.rowId],
        [field]: numeric ? asNumberOrNull(value) : value || null
      }
    }));
  };

  const saveDraft = (row: StagedUploadRow) => {
    const patch = draftFor(row);
    if (Object.keys(patch).length === 0) return;
    updateRowMutation.mutate({ row, patch });
    setDrafts((current) => {
      const next = { ...current };
      delete next[row.rowId];
      return next;
    });
  };

  const downloadTemplate = async () => {
    try {
      const blob = await apiClient.downloadUploadTemplate();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "template-laporan-petakeu.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template belum dapat diunduh.");
    }
  };

  const saveAlias = async (row: StagedUploadRow) => {
    if (!row.regionId || !row.regionName) return;
    try {
      await apiClient.createRegionAlias({ alias: row.regionName, regionId: row.regionId });
      setAliasStatus((current) => ({ ...current, [row.rowId]: "Alias tersimpan." }));
    } catch (error) {
      setAliasStatus((current) => ({
        ...current,
        [row.rowId]: error instanceof Error ? error.message : "Alias belum dapat disimpan."
      }));
    }
  };

  const parsing = uploadMutation.isPending || (!confirmedLocally && !cancelledLocally && (status === "queued" || status === "processing" || status === "parsing" || status === "committing" || (Boolean(uploadId) && rowsQuery.isLoading && !hasRows)));
  const confirmed = confirmedLocally || status === "persisted" || status === "confirmed";

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-12">
      <Card className="border-slate-200/80 bg-white shadow-sm">
        <CardHeader className="gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700">
              <UploadCloud className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">Otomasi validasi</p>
              <CardTitle className="mt-1 text-xl text-slate-900">Unggah laporan keuangan</CardTitle>
              <p className="mt-1 text-xs font-medium text-slate-500">Unggah → Parse → Tinjau → Koreksi → Konfirmasi. File asli tetap disimpan sebagai bukti audit.</p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={() => void downloadTemplate()} className="gap-2">
            <Download className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            Download template Excel
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <UploadSteps status={confirmed ? "confirmed" : status} hasRows={hasRows} />

          {!uploadId && (
            <label
              htmlFor="upload-file"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`block cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition ${
                dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50/70 hover:border-emerald-300 hover:bg-emerald-50/50"
              }`}
            >
              <FileSpreadsheet className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-slate-800">Tarik berkas Excel ke area ini</p>
              <p className="mt-1 text-xs text-slate-500">Gunakan .xlsx atau .xls, maksimal 10 MB.</p>
              <span className="mt-4 inline-flex rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white">Pilih berkas</span>
              <input ref={inputRef} id="upload-file" type="file" accept=".xlsx,.xls" onChange={onInputChange} className="sr-only" />
            </label>
          )}

          {uploadId && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-500">Berkas aktif</p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-extrabold text-slate-900"><FileSpreadsheet className="h-4 w-4 text-emerald-600" aria-hidden="true" />{file?.name ?? uploadId}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">ID: {uploadId}</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600" role="status" aria-live="polite">
                  {parsing && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" aria-hidden="true" />}
                  {statusLabel(confirmed ? "confirmed" : status)}
                </div>
              </div>
              {parsing && <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-500" /></div>}
              {uploadQuery.isError && <p className="mt-3 text-xs text-amber-700">Detail status belum tersedia; menunggu tabel hasil parsing.</p>}
              {rowsQuery.isError && !parsing && <p className="mt-3 text-xs text-rose-700" role="alert">Gagal memuat baris hasil parsing. Coba muat ulang.</p>}
            </div>
          )}

          {message && <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700" role="status" aria-live="polite">{message}</p>}
        </CardContent>
      </Card>

      {uploadId && !parsing && !confirmed && !cancelledLocally && status !== "cancelled" && (
        <Card className="border-slate-200/80 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-700">Review staging</p>
                <CardTitle className="mt-1 text-lg text-slate-900">Tinjau dan koreksi baris</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Error harus diperbaiki. Warning perlu diakui sebelum commit atomik.</p>
              </div>
              <div className="flex gap-2 text-xs font-bold">
                <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">{blockingErrors.length} error</span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">{warnings.length} warning</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasRows && <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Belum ada baris hasil parsing.</p>}
            {hasRows && (
              <>
                <div className="overflow-x-auto rounded-2xl border border-slate-200" tabIndex={0} aria-label="Tabel baris unggahan">
                  <table className="w-full min-w-[1250px] text-left text-xs">
                    <caption className="sr-only">Baris staging hasil parsing upload</caption>
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Baris</th>
                        <th className="px-3 py-3">Kode / nama wilayah</th>
                        <th className="px-3 py-3">Provinsi</th>
                        <th className="px-3 py-3">Periode</th>
                        <th className="px-3 py-3">Bruto</th>
                        <th className="px-3 py-3">Share</th>
                        <th className="px-3 py-3">Netto</th>
                        <th className="px-3 py-3">Target</th>
                        <th className="px-3 py-3">Validasi</th>
                        <th className="px-3 py-3">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row) => {
                        const draft = draftFor(row);
                        const rowHasError = row.findings.some((finding) => finding.severity === "error");
                        return (
                          <tr key={row.rowId} className={rowHasError ? "bg-rose-50/30 align-top" : "align-top"}>
                            <td className="px-3 py-3 font-mono font-bold text-slate-500">{row.rowNumber}</td>
                            <td className="px-3 py-3">
                              <p className="font-mono text-[11px] text-slate-500">{row.regionCode ?? "—"}</p>
                              <RowInput label={`Nama wilayah baris ${row.rowNumber}`} value={draft.regionName ?? row.regionName} onChange={(value) => patchDraft(row, "regionName", value)} />
                              {row.findings.some((finding) => finding.column?.toLowerCase().includes("region") || finding.code?.toLowerCase().includes("region")) && (
                                <button type="button" className="mt-1 text-[10px] font-bold text-cyan-700 underline" onClick={() => void saveAlias(row)}>
                                  Simpan sebagai alias
                                </button>
                              )}
                              {aliasStatus[row.rowId] && <p className="mt-1 text-[10px] text-slate-500">{aliasStatus[row.rowId]}</p>}
                            </td>
                            <td className="px-3 py-3"><RowInput label={`Provinsi baris ${row.rowNumber}`} value={draft.province ?? row.province} onChange={(value) => patchDraft(row, "province", value)} /></td>
                            <td className="px-3 py-3"><RowInput label={`Periode baris ${row.rowNumber}`} type="month" value={draft.period ?? row.period} onChange={(value) => patchDraft(row, "period", value)} /></td>
                            <td className="px-3 py-3"><RowInput label={`Nominal bruto baris ${row.rowNumber}`} type="number" value={draft.grossAmount ?? row.grossAmount} onChange={(value) => patchDraft(row, "grossAmount", value)} /></td>
                            <td className="px-3 py-3"><RowInput label={`Share baris ${row.rowNumber}`} type="number" value={draft.shareAmount ?? row.shareAmount} onChange={(value) => patchDraft(row, "shareAmount", value)} /></td>
                            <td className="px-3 py-3"><RowInput label={`Nominal netto baris ${row.rowNumber}`} type="number" value={draft.netAmount ?? row.netAmount} onChange={(value) => patchDraft(row, "netAmount", value)} /></td>
                            <td className="px-3 py-3"><RowInput label={`Target baris ${row.rowNumber}`} type="number" value={draft.targetAmount ?? row.targetAmount} onChange={(value) => patchDraft(row, "targetAmount", value)} /></td>
                            <td className="max-w-72 px-3 py-3">
                              {row.findings.length === 0 ? <span className="text-emerald-700">Valid</span> : <div className="space-y-1">{row.findings.map((finding) => <p key={finding.findingId} className={`rounded-lg border px-2 py-1 text-[10px] ${findingClasses(finding.severity)}`}>{finding.message}</p>)}</div>}
                            </td>
                            <td className="px-3 py-3">
                              <Button type="button" size="sm" variant="outline" className="gap-1" disabled={updateRowMutation.isPending || Object.keys(draft).length === 0} onClick={() => saveDraft(row)}>
                                <Save className="h-3.5 w-3.5" aria-hidden="true" />Simpan
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">Menampilkan {rows.length} dari {rowsQuery.data?.meta.total ?? rows.length} baris.</p>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
                    <span className="text-xs font-bold text-slate-600">Halaman {page} / {rowsQuery.data?.meta.totalPages ?? 1}</span>
                    <Button type="button" variant="outline" size="sm" aria-label="Halaman berikutnya" disabled={page >= (rowsQuery.data?.meta.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
                  </div>
                </div>

                {warnings.length > 0 && (
                  <fieldset className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <legend className="px-1 text-xs font-extrabold text-amber-900">Akui warning sebelum konfirmasi</legend>
                    {warnings.map((warning) => (
                      <label key={warning.findingId} className="flex items-start gap-2 text-xs text-amber-900">
                        <input type="checkbox" checked={warning.acknowledged || acknowledged.has(warning.findingId)} disabled={warning.acknowledged} onChange={(event) => setAcknowledged((current) => { const next = new Set(current); if (event.target.checked) next.add(warning.findingId); else next.delete(warning.findingId); return next; })} className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500" />
                        <span>{warning.message}</span>
                      </label>
                    ))}
                  </fieldset>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 underline" onClick={() => setShowFindings((value) => !value)}>
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />{showFindings ? "Sembunyikan rincian validasi" : "Lihat Baris Error"}
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="gap-2" disabled={cancelMutation.isPending || confirmMutation.isPending} onClick={() => cancelMutation.mutate()}><X className="h-4 w-4" aria-hidden="true" />Batalkan</Button>
                    <Button type="button" className="gap-2 bg-emerald-700 hover:bg-emerald-800" disabled={!canConfirm} onClick={() => confirmMutation.mutate()}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Konfirmasi & simpan</Button>
                  </div>
                </div>
                {showFindings && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-extrabold text-slate-900">Rincian Baris Tidak Valid</h3><ul className="mt-3 space-y-2">{allFindings.length ? allFindings.map((finding) => <li key={finding.findingId} className={`rounded-lg border px-3 py-2 text-xs ${findingClasses(finding.severity)}`}>{finding.message}</li>) : <li className="text-xs text-slate-500">Tidak ada temuan validasi.</li>}</ul></div>}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {confirmed && (
        <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-emerald-700" aria-hidden="true" /><div><h2 className="text-lg font-extrabold text-emerald-900">Validasi Berkas Berhasil</h2><p className="mt-1 text-xs text-emerald-800">Data sudah dikonfirmasi dan siap dipakai untuk analitik.</p></div></div>
            <Button type="button" variant="outline" className="gap-2" onClick={reset}><RefreshCw className="h-4 w-4" aria-hidden="true" />Unggah Berkas Baru</Button>
          </CardContent>
        </Card>
      )}

      {(cancelledLocally || status === "cancelled") && (
        <Card className="border-slate-200 bg-slate-50 shadow-sm"><CardContent className="flex items-center justify-between gap-4 p-6"><p className="flex items-center gap-2 text-sm font-bold text-slate-700"><X className="h-5 w-5" aria-hidden="true" />Unggahan dibatalkan.</p><Button type="button" variant="outline" onClick={reset}>Unggah Berkas Baru</Button></CardContent></Card>
      )}
    </div>
  );
}
