import { ChangeEvent, DragEvent } from "react";
import { CheckCircle2, FileDown, UploadCloud } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-panel p-10 shadow-card">
        <div className="mx-auto max-w-2xl text-center">
          <label
            htmlFor="file-upload"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative block cursor-pointer rounded-3xl border-2 border-dashed ${
              state.isDragging ? "border-primary bg-primary/10" : "border-border bg-panel/80"
            } p-10 transition hover:border-primary hover:bg-primary/10`}
          >
            <div className="flex flex-col items-center gap-4 text-muted">
              <div className="rounded-full bg-primary/10 p-4 text-primary">
                <UploadCloud className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-text">Tarik file Excel ke sini atau klik untuk unggah</p>
                <p className="text-sm text-muted">Format yang didukung: .xlsx, .xls, atau .csv dengan header kolom standar.</p>
              </div>
              <div className="rounded-full border border-border bg-panel px-4 py-2 text-sm font-semibold text-primary shadow-sm">Pilih file</div>
            </div>
            <input id="file-upload" name="file-upload" type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={handleInputChange} />
          </label>
          {state.file && (
            <div className="mt-8 space-y-3 text-left">
              <div className="flex items-center justify-between rounded-2xl border border-border bg-panel/80 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-text">{state.file.name}</p>
                  <p className="text-xs text-muted">Ukuran {Math.round(state.file.size / 1024)} KB</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wide">
                  {state.status === "success" ? "Selesai" : state.status === "uploading" ? `${state.progress}%` : "Menunggu"}
                </span>
              </div>
              {state.status === "uploading" && (
                <div className="h-2 overflow-hidden rounded-full bg-border/60">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${state.progress}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {state.summary && state.status === "success" && (
        <section className="rounded-3xl border border-emerald-200/60 bg-emerald-500/10 p-8 shadow-card">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-500">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-emerald-700">Data berhasil divalidasi</h3>
                <p className="text-sm text-emerald-600">
                  {state.summary.validRows} baris siap dipetakan. {state.summary.invalidRows} baris perlu diperbaiki.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-panel px-4 py-2 text-sm font-semibold text-emerald-600 shadow-sm hover:border-emerald-400"
              >
                <FileDown className="h-4 w-4" />
                Unduh error.csv
              </button>
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
              >
                Unggah lagi
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
