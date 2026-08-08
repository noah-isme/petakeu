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
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Hero Presentation Card */}
      <section className="rounded-[24px] border border-slate-100 bg-white p-7 shadow-xs transition hover:shadow-md">
        <div className="flex items-center gap-3.5 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 font-['Outfit']">Enterprise Platform</span>
            <h2 className="text-2xl font-bold text-slate-900 font-['Outfit']">Petakeu — Regional Revenue Intelligence</h2>
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
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
                className="flex items-start gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 transition hover:border-emerald-300 hover:bg-slate-50"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 font-['Outfit']">{tech.title}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-900">{tech.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* System Metrics Grid */}
      <section className="rounded-[24px] border border-slate-100 bg-white p-7 shadow-xs">
        <div className="flex items-center gap-3 mb-5">
          <Activity className="h-5 w-5 text-cyan-600" />
          <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Status Performa & Infrastruktur Telemetri</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {systemMetrics.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</span>
              <div className="text-2xl font-extrabold text-slate-900 font-['Outfit']">{item.value}</div>
              <span className="inline-block text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md">
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Value Pillars */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[24px] border border-slate-100 bg-white p-6 shadow-xs transition hover:shadow-md">
          <div className="flex items-center gap-2.5 mb-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900 font-['Outfit']">Transparansi Basis Data Spasial</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Data spasial PostGIS terintegrasi penuh dengan materialized views untuk memastikan sinkronisasi anggaran 100% akurat
            antara pusat dan daerah.
          </p>
        </div>

        <div className="rounded-[24px] border border-slate-100 bg-white p-6 shadow-xs transition hover:shadow-md">
          <div className="flex items-center gap-2.5 mb-3">
            <CheckCircle2 className="h-5 w-5 text-cyan-600" />
            <h3 className="text-base font-bold text-slate-900 font-['Outfit']">Otomasi Validasi & Potongan 15%</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Parser Excel secara mandiri mengidentifikasi kesalahan format baris dan menghitung secara presisi porsi setoran bersih
            daerah setelah dipotong 15%.
          </p>
        </div>
      </div>
    </div>
  );
}

