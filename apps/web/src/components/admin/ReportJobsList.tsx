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

const currencyFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" });

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
          <th>Format</th>
          <th>Status</th>
          <th>Link</th>
          <th>Kedaluwarsa</th>
          <th>Ringkasan</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.jobId}>
            <td>{job.regionIds.join(", ")}</td>
            <td>{job.period}</td>
            <td>{job.format.toUpperCase()}</td>
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
              {job.expiresAt
                ? new Date(job.expiresAt).getTime() < Date.now()
                  ? "Kadaluarsa"
                  : new Date(job.expiresAt).toLocaleTimeString("id-ID")
                : "—"}
            </td>
            <td>
              <div>{job.summary.totalsByRegion.length} wilayah</div>
              {job.summary.totalsByRegion.length > 0 && (
                <div>
                  Total tertinggi:
                  {" "}
                  {(() => {
                    const topRegion = job.summary.totalsByRegion.reduce((best, current) =>
                      current.total > best.total ? current : best,
                      job.summary.totalsByRegion[0]
                    );
                    return `${currencyFormatter.format(topRegion.total)} (${topRegion.regionName})`;
                  })()}
                </div>
              )}
            </td>
            <td>
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  onRegenerate({
                    period: job.period,
                    regionIds: [...job.regionIds],
                    format: job.format,
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
