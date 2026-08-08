import { ChangeEvent, DragEvent, useState } from "react";
import { CheckCircle2, FileDown, UploadCloud, AlertCircle, FileSpreadsheet, RefreshCw, Sparkles } from "lucide-react";

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
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Page Title Header Banner */}
      <div className="rounded-[24px] border border-slate-100 bg-white p-6 shadow-xs transition hover:shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 font-['Outfit']">Otomasi Validasi</span>
              <h2 className="text-xl font-bold text-slate-900 font-['Outfit']">Unggah Berkas Laporan Keuangan (Excel / CSV)</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Sistem akan memvalidasi skema baris, mengecek kode wilayah PostGIS, dan menghitung potongan 15% secara otomatis.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const csvContent = "data:text/csv;charset=utf-8,kode_daerah,nama_daerah,periode,setoran\n3100,DKI Jakarta,2024-Q3,2150000000\n";
              const encodedUri = encodeURI(csvContent);
              const link = document.createElement("a");
              link.setAttribute("href", encodedUri);
              link.setAttribute("download", "template_laporan_petakeu.csv");
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition shadow-xs shrink-0"
          >
            <FileDown className="h-4 w-4 text-emerald-700" />
            <span>Download Template CSV</span>
          </button>
        </div>
      </div>

      {/* Main Drag and Drop Upload Card */}
      <section className="rounded-[24px] border border-slate-100 bg-white p-8 shadow-xs">
        <div className="mx-auto max-w-3xl">
          <label
            htmlFor="file-upload"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative block cursor-pointer rounded-[24px] border-2 border-dashed p-10 text-center transition-all duration-300 ${
              state.isDragging
                ? "border-emerald-500 bg-emerald-50/50 shadow-md scale-[1.01]"
                : "border-slate-300/80 bg-slate-50/60 hover:border-emerald-500 hover:bg-slate-50"
            }`}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                <FileSpreadsheet className="h-8 w-8 text-emerald-700" />
                <Sparkles className="absolute -top-1.5 -right-1.5 h-4 w-4 text-amber-500 animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold tracking-tight text-slate-900 font-['Outfit']">
                  Tarik berkas Excel / CSV ke area ini atau klik untuk mencari
                </p>
                <p className="text-xs font-medium text-slate-500">
                  Ekstensi yang didukung: <span className="font-mono font-bold text-emerald-700">.xlsx, .xls, .csv</span> (Maksimal 25MB per file)
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#044e3a] hover:bg-[#033b2c] px-6 py-2.5 text-xs font-bold text-white shadow-xs transition active:scale-95">
                <UploadCloud className="h-4 w-4" />
                Pilih Berkas Komputer
              </div>
            </div>
            <input
              id="file-upload"
              name="file-upload"
              data-testid="file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onClick={(e) => {
                (e.target as HTMLInputElement).value = "";
              }}
              onChange={handleInputChange}
            />
          </label>

          {/* Active File Processing Bar */}
          {state.file && (
            <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-slate-900 font-bold text-xs">{state.file.name}</p>
                    <p className="text-[11px] font-mono text-slate-400">Ukuran: {(state.file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                  {state.status === "success" ? "Validasi Selesai" : state.status === "uploading" ? `Proses: ${state.progress}%` : "Persiapan"}
                </span>
              </div>

              {state.status === "uploading" && (
                <div className="space-y-2">
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 p-0.5">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                      style={{ width: `${state.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                    <span>Memeriksa koordinat BPS PostGIS...</span>
                    <span>{state.progress}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Validation Result Summary Box */}
      {state.summary && state.status === "success" && (
        <section className="rounded-[24px] border border-emerald-200 bg-emerald-50/50 p-6 shadow-xs">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 border border-emerald-300">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Validasi Berkas Berhasil</h3>
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold text-emerald-700">{state.summary.validRows + state.summary.invalidRows} baris</span> ({state.summary.validRows} valid) berhasil diproses ke database PostGIS,{" "}
                  <span className="font-bold text-amber-700">{state.summary.invalidRows} baris peringatan</span> terdeteksi.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowErrorTable(!showErrorTable)}
                className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition"
              >
                <AlertCircle className="h-4 w-4" />
                {showErrorTable ? "Sembunyikan Detail Error" : "Lihat Baris Error"}
              </button>
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-2 rounded-full bg-[#044e3a] hover:bg-[#033b2c] px-5 py-2 text-xs font-bold text-white shadow-xs transition active:scale-95"
              >
                <RefreshCw className="h-4 w-4" />
                Unggah Berkas Baru
              </button>
            </div>
          </div>

          {/* Drilldown Error Rows Table */}
          {showErrorTable && (
            <div className="mt-6 border-t border-emerald-200 pt-5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 font-['Outfit']">Rincian Baris Tidak Valid</h4>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase font-bold">
                    <tr>
                      <th className="px-5 py-3">No. Baris Excel</th>
                      <th className="px-5 py-3">Kode Wilayah</th>
                      <th className="px-5 py-3">Keterangan Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {mockErrorRows.map((err) => (
                      <tr key={err.row} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-3 font-mono text-amber-800 font-bold">Baris #{err.row}</td>
                        <td className="px-5 py-3 font-mono">{err.regionCode}</td>
                        <td className="px-5 py-3 text-rose-700">{err.error}</td>
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

