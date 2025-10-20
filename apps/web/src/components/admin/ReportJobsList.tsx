import type { ReportJob, ReportRequest } from "../../types/report";

interface ReportJobsListProps {
  jobs: ReportJob[];
  onRegenerate: (job: ReportRequest) => void;
}

const statusLabels: Record<ReportJob["status"], string> = {
  queued: "Dalam antrean",
  processing: "Diproses",
  completed: "Selesai",
  failed: "Gagal"
};

export function ReportJobsList({ jobs, onRegenerate }: ReportJobsListProps) {
  if (!jobs.length) {
    return <p>Belum ada permintaan laporan.</p>;
  }

  return (
    <table className="table" aria-label="Daftar job laporan">
      <thead>
        <tr>
          <th>Wilayah</th>
          <th>Periode</th>
          <th>Tipe</th>
          <th>Status</th>
          <th>Link</th>
          <th>Kedaluwarsa</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.jobId}>
            <td>{job.regionId}</td>
            <td>
              {job.periodFrom} → {job.periodTo}
            </td>
            <td>{job.type.toUpperCase()}</td>
            <td>
              <span className={`status-pill status-${job.status}`}>{statusLabels[job.status]}</span>
            </td>
            <td>
              {job.downloadUrl ? (
                <a href={job.downloadUrl} target="_blank" rel="noreferrer" aria-label={`Unduh laporan ${job.jobId}`}>
                  Unduh
                </a>
              ) : (
                "—"
              )}
            </td>
            <td>
              {job.expired
                ? "Kadaluarsa"
                : job.expiresAt
                ? new Date(job.expiresAt).toLocaleTimeString("id-ID")
                : "—"}
            </td>
            <td>
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  onRegenerate({
                    regionId: job.regionId,
                    periodFrom: job.periodFrom,
                    periodTo: job.periodTo,
                    type: job.type
                  })
                }
              >
                Regenerate
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
