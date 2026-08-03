import { ChangeEvent, DragEvent, useState } from "react";
import { CheckCircle2, FileDown, UploadCloud, AlertCircle, FileSpreadsheet, RefreshCw, Layers, ShieldCheck } from "lucide-react";

export interface UploadSummary {
  validRows: number;
  invalidRows: number;
}

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadState {
  file: File | null;
  status: UploadStatus;
  progress: number;
  summary: UploadSummary | null;
  isDragging: boolean;
}

interface UploadPageProps {
  state: UploadState;
  onSelectFile: (file: File) => void;
  onReset: () => void;
  onDragStateChange: (dragging: boolean) => void;
}

export function UploadPage({ state, onSelectFile, onReset, onDragStateChange }: UploadPageProps) {
  const [showErrorTable, setShowErrorTable] = useState(false);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    onDragStateChange(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onSelectFile(file);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    onDragStateChange(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    onDragStateChange(false);
  };

  const mockErrorRows = [
    { row: 14, regionCode: "3302", error: "Format tanggal tidak valid ('2024/13/01')" },
    { row: 28, regionCode: "3305", error: "Nilai nominal negatif atau mengandung teks" },
    { row: 42, regionCode: "9900", error: "Kode wilayah BPS tidak terdaftar di database PostGIS" }
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Page Title Header */}
      <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Unggah Berkas Laporan Keuangan (Excel / CSV)</h2>
            <p className="text-xs text-slate-400">
              Sistem akan memvalidasi skema baris, mengecek kode wilayah PostGIS, dan menghitung potongan 15% secara otomatis.
            </p>
          </div>
        </div>
      </div>

      {/* Main Drag and Drop Upload Card */}
      <section className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-2xl">
        <div className="mx-auto max-w-3xl">
          <label
            htmlFor="file-upload"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative block cursor-pointer rounded-3xl border-2 border-dashed p-12 text-center transition-all duration-300 ${
              state.isDragging
                ? "border-emerald-400 bg-emerald-500/15 shadow-[0_0_30px_rgba(16,185,129,0.25)] scale-[1.01]"
                : "border-slate-700/80 bg-slate-950/60 hover:border-emerald-500/50 hover:bg-slate-900/60"
            }`}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-900/40 text-emerald-400 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <FileSpreadsheet className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <p className="text-lg font-extrabold tracking-tight text-white">
                  Tarik berkas Excel / CSV ke area ini atau klik untuk mencari
                </p>
                <p className="text-xs font-medium text-slate-400">
                  Ekstensi yang didukung: <span className="font-mono text-emerald-400">.xlsx, .xls, .csv</span> (Maksimal 25MB per file)
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-2.5 text-xs font-bold text-emerald-300 shadow-lg transition hover:bg-emerald-500/20">
                <UploadCloud className="h-4 w-4 text-emerald-400" />
                Pilih Berkas Komputer
              </div>
            </div>
            <input
              id="file-upload"
              name="file-upload"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={handleInputChange}
            />
          </label>

          {/* Active File Processing Bar */}
          {state.file && (
            <div className="mt-6 space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl">
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                  <div>
                    <p className="text-white font-bold">{state.file.name}</p>
                    <p className="text-[10px] text-slate-400">Ukuran: {(state.file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-3 py-1 text-[11px] font-bold text-emerald-300 uppercase">
                  {state.status === "success" ? "Validasi Selesai" : state.status === "uploading" ? `Proses: ${state.progress}%` : "Persiapan"}
                </span>
              </div>

              {state.status === "uploading" && (
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300 shadow-[0_0_10px_#10b981]"
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Validation Result Summary Box */}
      {state.summary && state.status === "success" && (
        <section className="rounded-3xl border border-emerald-500/40 bg-emerald-950/20 p-8 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Validasi Berkas Berhasil</h3>
                <p className="mt-1 text-xs text-slate-300">
                  <span className="font-bold text-emerald-400">{state.summary.validRows} baris</span> berhasil diproses ke database PostGIS,{" "}
                  <span className="font-bold text-amber-400">{state.summary.invalidRows} baris peringatan</span> terdeteksi.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowErrorTable(!showErrorTable)}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
              >
                <AlertCircle className="h-4 w-4" />
                {showErrorTable ? "Sembunyikan Detail Error" : "Lihat Baris Error"}
              </button>
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition shadow-lg"
              >
                <RefreshCw className="h-4 w-4" />
                Unggah Berkas Baru
              </button>
            </div>
          </div>

          {/* Drilldown Error Rows Table */}
          {showErrorTable && (
            <div className="mt-6 border-t border-slate-800/80 pt-6">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Rincian Baris Tidak Valid</h4>
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/80">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3">No. Baris Excel</th>
                      <th className="px-4 py-3">Kode Wilayah</th>
                      <th className="px-4 py-3">Keterangan Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {mockErrorRows.map((err) => (
                      <tr key={err.row} className="hover:bg-slate-900/50 transition">
                        <td className="px-4 py-3 font-mono text-amber-400">Baris #{err.row}</td>
                        <td className="px-4 py-3 font-mono">{err.regionCode}</td>
                        <td className="px-4 py-3 text-rose-300">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

