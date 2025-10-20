import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { UploadForm } from "../components/admin/UploadForm";
import { UploadsTable } from "../components/admin/UploadsTable";
import { ReportJobsList } from "../components/admin/ReportJobsList";
import { useReportJobs } from "../hooks/useReportJobs";
import { useUploads } from "../hooks/useUploads";
import { apiClient } from "../api/client";

import type { ReportRequest } from "../types/report";

const defaultReportPayload: ReportRequest = {
  period: "2025-08",
  regionIds: ["prov-33"],
  format: "pdf"
};

export function AdminDashboard() {
  const [reportPayload, setReportPayload] = useState<ReportRequest>(defaultReportPayload);
  const [message, setMessage] = useState<string | null>(null);
  const uploadsQuery = useUploads();
  const reportJobsQuery = useReportJobs();
  const queryClient = useQueryClient();

  const handleUploaded = (uploadId: string) => {
    setMessage(`File diterima. ID antrean: ${uploadId}`);
  };

  const handleReportSubmit = async () => {
    setMessage(null);
    if (!reportPayload.regionIds.length) {
      setMessage("Masukkan minimal satu wilayah untuk laporan.");
      return;
    }
    if (!reportPayload.period) {
      setMessage("Pilih periode laporan.");
      return;
    }
    try {
      const job = await apiClient.createReport(reportPayload);
      setMessage(`Laporan dalam antrean. ID job: ${job.jobId}`);
      queryClient.invalidateQueries({ queryKey: ["report-jobs"] }).catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal mengirim permintaan laporan");
    }
  };

  const handleRegenerate = async (request: ReportRequest) => {
    try {
      const job = await apiClient.createReport(request);
      setMessage(`Permintaan regenerasi dikirim. ID job: ${job.jobId}`);
      queryClient.invalidateQueries({ queryKey: ["report-jobs"] }).catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal mengirim permintaan regenerasi");
    }
  };

  return (
    <div className="admin-dashboard">
      <section className="card">
        <h2>Unggah Excel Bulanan</h2>
        <p>Gunakan template standar (kode_daerah, nama_daerah, periode, setoran). Sistem akan memvalidasi dan mem-parsing otomatis.</p>
        <UploadForm onUploaded={handleUploaded} />
      </section>

      <section className="card">
        <h2>Laporan Otomatis</h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
          <label>
            ID Wilayah (pisahkan dengan koma)
            <input
              type="text"
              value={reportPayload.regionIds.join(", ")}
              onChange={(event) =>
                setReportPayload((prev) => ({
                  ...prev,
                  regionIds: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                }))
              }
            />
          </label>
          <label>
            Periode
            <input
              type="month"
              value={reportPayload.period}
              onChange={(event) => setReportPayload((prev) => ({ ...prev, period: event.target.value }))}
            />
          </label>
          <label>
            Format
            <select
              value={reportPayload.format}
              onChange={(event) =>
                setReportPayload((prev) => ({ ...prev, format: event.target.value as ReportRequest["format"] }))
              }
            >
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
            </select>
          </label>
          <button className="btn-primary" type="button" onClick={handleReportSubmit}>
            Generate
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Riwayat Unggahan</h2>
        {uploadsQuery.isError && <p className="upload-error">Gagal memuat riwayat unggahan.</p>}
        {uploadsQuery.isLoading ? <p>Memuat riwayat unggahan…</p> : <UploadsTable uploads={uploadsQuery.data ?? []} />}
      </section>

      <section className="card">
        <h2>Job Laporan</h2>
        {reportJobsQuery.isError && <p className="upload-error">Gagal memuat job laporan.</p>}
        {reportJobsQuery.isLoading ? (
          <p>Memuat daftar job laporan…</p>
        ) : (
          <ReportJobsList jobs={reportJobsQuery.data ?? []} onRegenerate={handleRegenerate} />
        )}
      </section>

      {message && (
        <section className="card" role="status" aria-live="polite">
          <strong>Status:</strong> {message}
        </section>
      )}
    </div>
  );
}
