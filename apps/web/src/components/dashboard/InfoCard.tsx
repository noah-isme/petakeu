interface InfoCardProps {
  regionName: string;
  value: string;
  trend?: string | null;
  description?: string;
}

export function InfoCard({ regionName, value, trend, description }: InfoCardProps) {
  return (
    <div className="rounded-3xl border border-border bg-panel/90 p-4 shadow-card backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Wilayah Aktif</p>
      <h2 className="mt-1 text-2xl font-semibold text-text">{regionName}</h2>
      <p className="mt-3 text-3xl font-bold text-primary">{value}</p>
      {trend ? (
        <p className="mt-2 text-sm font-medium text-emerald-500">{trend}</p>
      ) : (
        <p className="mt-2 text-sm text-muted">Tren akan muncul setelah unggah data terbaru.</p>
      )}
      {description && <p className="mt-4 text-sm text-muted">{description}</p>}
    </div>
  );
}
