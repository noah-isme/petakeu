import { TrendSparkline } from "./TrendSparkline";

import type { RegionSummary } from "../types/region";

interface RegionDetailPanelProps {
  summary?: RegionSummary;
  isLoading: boolean;
  onDownloadReport?: () => void;
  publicMode?: boolean;
  classificationLabel?: string;
  reportPending?: boolean;
  regionName?: string;
}

function formatCurrency(value: number | undefined, publicMode?: boolean) {
  if (publicMode) {
    return "••••";
  }
  if (typeof value !== "number") {
    return "—";
  }
  return `Rp ${value.toLocaleString("id-ID")}`;
}

export function RegionDetailPanel({
  summary,
  isLoading,
  onDownloadReport,
  publicMode,
  classificationLabel,
  reportPending,
  regionName
}: RegionDetailPanelProps) {
  if (isLoading) {
    return (
      <div className="panel-card">
        <h2>Memuat data wilayah...</h2>
      </div>
    );
  }

  if (publicMode) {
    return (
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2>{regionName ?? "Pilih wilayah"}</h2>
            {classificationLabel && <p>{classificationLabel}</p>}
          </div>
          <span className="badge">Mode Publik</span>
        </div>
        <p>
          Akses publik menampilkan klasifikasi kontribusi tanpa angka detail. Untuk informasi lengkap, silakan masuk sebagai
          pengguna terdaftar.
        </p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="panel-card">
        <h2>Pilih wilayah di peta</h2>
        <p>Klik pada kabupaten/kota untuk melihat detail setoran.</p>
      </div>
    );
  }

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div>
          <h2>{summary.region.name}</h2>
          <p>Kode wilayah: {summary.region.code}</p>
        </div>
        <span className="badge">Potongan 15%</span>
      </div>
      {summary.message && <p className="muted">{summary.message}</p>}
      <div className="panel-metric" aria-live="polite">
        {formatCurrency(summary.totalAmount)}
      </div>
      <p>Total setoran periode terpilih</p>
      <div style={{ marginTop: "1rem" }}>
        <strong>Potongan 15%:</strong> {formatCurrency(summary.cut15Amount)}
      </div>
      <div>
        <strong>Setoran bersih:</strong> {formatCurrency(summary.netAmount)}
      </div>
      <div style={{ marginTop: "1.5rem" }}>
        {summary.trend && summary.trend.length ? (
          <TrendSparkline data={summary.trend} />
        ) : (
          <p className="muted">Data tren belum tersedia.</p>
        )}
      </div>
      <div style={{ marginTop: "1.5rem" }}>
        <h3>Tabel Bulanan</h3>
        <table className="table" aria-label="Rincian setoran bulanan">
          <thead>
            <tr>
              <th>Bulan</th>
              <th>Setoran</th>
              <th>Potongan 15%</th>
              <th>Setoran Bersih</th>
            </tr>
          </thead>
          <tbody>
            {(summary.monthlyBreakdown ?? []).map((row) => (
              <tr key={row.period}>
                <td>{row.period}</td>
                <td>{formatCurrency(row.amount)}</td>
                <td>{formatCurrency(row.cut15Amount)}</td>
                <td>{formatCurrency(row.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: "1rem" }}>
        <button
          className="btn-primary"
          type="button"
          onClick={onDownloadReport}
          disabled={!summary.reportUrl || publicMode || reportPending}
        >
          {reportPending ? "Menyiapkan laporan..." : "Unduh Laporan"}
        </button>
      </div>
      <small style={{ marginTop: "0.75rem" }}>Pembaruan terakhir: {new Date(summary.lastUpdated).toLocaleString("id-ID")}</small>
    </div>
  );
}
