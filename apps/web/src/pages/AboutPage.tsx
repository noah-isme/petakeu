import { Cpu, Database, Globe2, ShieldCheck, Layers, Sparkles, CheckCircle2, Activity } from "lucide-react";

export function AboutPage() {
  const techStack = [
    { title: "Frontend Engine", detail: "React 18 + Vite + Leaflet GeoJSON + Recharts", icon: Globe2 },
    { title: "Geospatial Database", detail: "PostgreSQL / PostGIS (Spatial Index ST_AsGeoJSON)", icon: Database },
    { title: "Backend API Layer", detail: "Node.js + Express + Zod Schema Validation", icon: Cpu },
    { title: "Data Caching", detail: "Redis Cache Layer & Materialized View Aggregations", icon: Layers }
  ];

  const systemMetrics = [
    { label: "PostGIS Spatial Latency", value: "24 ms", status: "Optimal" },
    { label: "15% Cut Engine Precision", value: "100.00%", status: "Verified" },
    { label: "Redis Cache Hit Rate", value: "99.4%", status: "Active" },
    { label: "GeoJSON Payload Compression", value: "gzip (28 KB)", status: "Fast" }
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      {/* Hero Presentation Card */}
      <section className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-2xl transition hover:border-emerald-500/30">
        <div className="flex items-center gap-3.5 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-900/30 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 font-['Outfit']">Enterprise Platform</span>
            <h2 className="text-2xl font-black text-white font-['Outfit']">Petakeu — Regional Revenue Intelligence</h2>
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Petakeu adalah platform internal tingkat eksekutif untuk memantau, memvisualisasikan, dan menganalisis realisasi
          pendapatan daerah seluruh Indonesia melalui peta interaktif choropleth, validasi berkas Excel otomatis, dan
          perhitungan potongan wajib 15% secara real-time.
        </p>

        {/* Architecture Grid */}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {techStack.map((tech) => {
            const Icon = tech.icon;
            return (
              <div
                key={tech.title}
                className="flex items-start gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 transition hover:border-emerald-500/40 hover:bg-slate-950/90"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-900/30 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Outfit']">{tech.title}</h3>
                  <p className="mt-1 text-sm font-semibold text-white">{tech.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* System Metrics Grid */}
      <section className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="h-5 w-5 text-cyan-400" />
          <h3 className="text-lg font-black text-white font-['Outfit']">Status Performa & Infrastruktur Telemetri</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {systemMetrics.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</span>
              <div className="text-2xl font-black text-white font-['Outfit']">{item.value}</div>
              <span className="inline-block text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Value Pillars */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl transition hover:border-emerald-500/40">
          <div className="flex items-center gap-2.5 mb-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white font-['Outfit']">Transparansi Basis Data Spasial</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Data spasial PostGIS terintegrasi penuh dengan materialized views untuk memastikan sinkronisasi anggaran 100% akurat
            antara pusat dan daerah.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl transition hover:border-cyan-500/40">
          <div className="flex items-center gap-2.5 mb-3">
            <CheckCircle2 className="h-5 w-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white font-['Outfit']">Otomasi Validasi & Potongan 15%</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Parser Excel secara mandiri mengidentifikasi kesalahan format baris dan menghitung secara presisi porsi setoran bersih
            daerah setelah dipotong 15%.
          </p>
        </div>
      </div>
    </div>
  );
}
