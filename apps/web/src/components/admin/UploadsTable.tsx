import type { UploadRecord } from "../../types/upload";

interface UploadsTableProps {
  uploads: UploadRecord[];
}

export function UploadsTable({ uploads }: UploadsTableProps) {
  if (!uploads.length) {
    return <p>Belum ada unggahan. Mulai dengan unggah file Excel bulanan.</p>;
  }

  return (
    <table className="table" aria-label="Riwayat unggahan Excel">
      <thead>
        <tr>
          <th>Nama File</th>
          <th>ID Unggahan</th>
          <th>Status</th>
          <th>Error</th>
          <th>Dibuat</th>
          <th>Ringkasan</th>
          <th>File</th>
          <th>Hash</th>
          <th>Detail Error</th>
        </tr>
      </thead>
      <tbody>
        {uploads.map((upload) => (
          <tr key={upload.uploadId}>
            <td>{upload.filename}</td>
            <td>{upload.uploadId}</td>
            <td>
              <span className={`status-pill status-${upload.status}`}>{upload.status}</span>
            </td>
            <td>{upload.errorCount}</td>
            <td>{new Date(upload.createdAt).toLocaleString("id-ID")}</td>
            <td>
              {upload.summary ? (
                <div>
                  <div>{upload.summary.validRows} valid / {upload.summary.totalRows} baris</div>
                  <div>
                    Total: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(upload.summary.totalAmount)}
                  </div>
                </div>
              ) : (
                "—"
              )}
            </td>
            <td>
              {upload.fileUrl ? (
                <a href={upload.fileUrl} target="_blank" rel="noreferrer">
                  Unduh
                </a>
              ) : (
                "—"
              )}
            </td>
            <td>{upload.hash ? <code>{upload.hash.slice(0, 8)}…</code> : "—"}</td>
            <td>
              {upload.errors && upload.errors.length > 0 ? (
                <details>
                  <summary>Lihat</summary>
                  <ul>
                    {upload.errors.map((error, index) => (
                      <li key={`${upload.uploadId}-err-${index}`}>
                        Baris {error.row}, Kolom {error.column}: {error.message}
                      </li>
                    ))}
                  </ul>
                  {upload.errorFilePath && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <a href={upload.errorFilePath} target="_blank" rel="noreferrer">
                        Unduh error.csv
                      </a>
                    </div>
                  )}
                </details>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
