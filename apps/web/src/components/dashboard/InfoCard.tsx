import { ArrowUpRight, Building2, Calculator, Percent, Sparkles, TrendingUp } from "lucide-react";

interface InfoCardProps {
  regionName: string;
  value: string;
  trend?: string | null;
  description?: string;
  rawAmount?: number;
}

export function InfoCard({ regionName, value, trend, description, rawAmount }: InfoCardProps) {
  // Calculate 15% mandatory regional cut if raw numeric value is available
  const parsedValue = rawAmount ?? (typeof value === "string" ? parseFloat(value.replace(/[^0-9]/g, "")) : 0);
  const cut15 = Math.round(parsedValue * 0.15);
  const netAmount = Math.round(parsedValue * 0.85);

  const formatIDR = (num: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);

  return (
    <div className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:border-emerald-500/40">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Wilayah Dipilih</p>
            <h2 className="text-xl font-bold tracking-tight text-white">{regionName}</h2>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
          <TrendingUp className="h-3.5 w-3.5" />
          Aktif
        </span>
      </div>

      {/* Main Revenue Amount */}
      <div className="mt-4 space-y-1">
        <p className="text-xs font-semibold text-slate-400">Total Nominal Pemasukan Realisasi</p>
        <div className="text-3xl font-extrabold text-white tracking-tight drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]">
          {value}
        </div>
      </div>

      {/* Financial Split Cards (15% Cut Rule) */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <Percent className="h-3.5 w-3.5 text-amber-400" />
            <span>Potongan Wajib 15%</span>
          </div>
          <p className="mt-1 text-sm font-bold text-amber-300">
            {parsedValue > 0 ? formatIDR(cut15) : "Rp 0"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <Calculator className="h-3.5 w-3.5 text-cyan-400" />
            <span>Setoran Bersih 85%</span>
          </div>
          <p className="mt-1 text-sm font-bold text-cyan-300">
            {parsedValue > 0 ? formatIDR(netAmount) : "Rp 0"}
          </p>
        </div>
      </div>

      {/* Trend Indicator */}
      {trend ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300">
          <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{trend}</span>
        </div>
      ) : (
        <p className="mt-3 text-xs font-medium text-slate-400">
          Tren perbandingan kuartal akan otomatis dihitung saat filter berubah.
        </p>
      )}

      {description && <p className="mt-3 text-xs text-slate-400 leading-relaxed">{description}</p>}
    </div>
  );
}

