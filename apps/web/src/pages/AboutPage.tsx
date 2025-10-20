export function AboutPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-panel p-10 shadow-card">
        <h2 className="text-2xl font-semibold text-text">Tentang Petakeu</h2>
        <p className="mt-4 text-sm leading-6 text-muted">
          Petakeu membantu pemerintah daerah memvisualisasikan data anggaran dan realisasi secara geografis. Dashboard ini
          dirancang untuk memudahkan analisis lintas wilayah, memantau tren pertumbuhan, serta mengidentifikasi wilayah yang
          membutuhkan perhatian khusus.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-panel/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Transparansi</p>
            <p className="mt-2 text-sm text-muted">
              Dengan visualisasi real-time, pemangku kebijakan dapat mengambil keputusan berbasis data dan meningkatkan
              akuntabilitas publik.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-panel/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Kolaborasi</p>
            <p className="mt-2 text-sm text-muted">
              Data terintegrasi memungkinkan sinkronisasi lintas instansi, sehingga rencana strategis dapat dijalankan lebih
              cepat.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
