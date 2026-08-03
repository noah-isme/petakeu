import { Cpu, Database, Globe2, ShieldCheck, Layers, Sparkles, CheckCircle2 } from "lucide-react";

export function AboutPage() {
  const techStack = [
    { title: "Frontend Engine", detail: "React 18 + Vite + Leaflet GeoJSON + Recharts", icon: Globe2 },
    { title: "Geospatial Database", detail: "PostgreSQL / PostGIS (Spatial Index ST_AsGeoJSON)", icon: Database },
    { title: "Backend API Layer", detail: "Node.js + Express + Zod Schema Validation", icon: Cpu },
    { title: "Data Caching", detail: "Redis Cache Layer & Materialized View Aggregations", icon: Layers }
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Hero Presentation Card */}
      <section className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Enterprise Platform</span>
            <h2 className="text-2xl font-extrabold text-white">Petakeu — Regional Revenue Intelligence</h2>
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
                className="flex items-start gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 transition hover:border-emerald-500/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">{tech.title}</h3>
                  <p className="mt-1 text-sm font-semibold text-white">{tech.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Value Pillars */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Transparansi Basis Data Spasial</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Data spasial PostGIS terintegrasi penuh dengan materialized views untuk memastikan sinkronisasi anggaran 100% akurat
            antara pusat dan daerah.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Otomasi Validasi & Potongan 15%</h3>
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

