import { useState } from "react";
import { ArrowUpRight, Building2, Calculator, ChevronDown, ChevronUp, Percent, TrendingUp } from "lucide-react";

interface InfoCardProps {
  regionName: string;
  value: string;
  trend?: string | null;
  description?: string;
  rawAmount?: number;
}

export function InfoCard({ regionName, value, trend, description, rawAmount }: InfoCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Calculate 15% mandatory regional cut
  const parsedValue = rawAmount ?? (typeof value === "string" ? parseFloat(value.replace(/[^0-9]/g, "")) : 0);
  const cut15 = Math.round(parsedValue * 0.15);
  const netAmount = Math.round(parsedValue * 0.85);

  const formatIDR = (num: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);

  return (
    <div className="glass-panel-glow w-full max-w-sm rounded-3xl p-5 shadow-2xl transition-all duration-300">
      {/* Card Header with Collapse Toggle */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-['Outfit']">Wilayah Dipilih</p>
            <h2 className="text-lg font-black tracking-tight text-white font-['Outfit'] truncate max-w-[180px]">{regionName}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
            <TrendingUp className="h-3 w-3" />
            Aktif
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-xl border border-slate-800 bg-slate-900/80 p-1.5 text-slate-400 hover:text-white transition"
            aria-label={collapsed ? "Buka rincian" : "Tutup rincian"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Main Realization Amount in JetBrains Mono */}
          <div className="mt-4 space-y-1 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Realisasi Anggaran</p>
            <div className="text-2xl font-black text-white tracking-tight font-['JetBrains_Mono'] drop-shadow-[0_0_20px_rgba(16,185,129,0.25)]">
              {value}
            </div>
          </div>

          {/* Financial Split Cards (15% Cut Rule) */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3 transition hover:border-amber-500/50">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300">
                <Percent className="h-3 w-3 text-amber-400" />
                <span>Potongan 15%</span>
              </div>
              <p className="mt-1 text-xs font-bold text-amber-200 font-['JetBrains_Mono']">
                {parsedValue > 0 ? formatIDR(cut15) : "Rp 0"}
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-3 transition hover:border-cyan-500/50">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-300">
                <Calculator className="h-3 w-3 text-cyan-400" />
                <span>Setoran 85%</span>
              </div>
              <p className="mt-1 text-xs font-bold text-cyan-200 font-['JetBrains_Mono']">
                {parsedValue > 0 ? formatIDR(netAmount) : "Rp 0"}
              </p>
            </div>
          </div>

          {/* Trend Indicator */}
          {trend && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
              <span>{trend}</span>
            </div>
          )}

          {description && (
            <p className="mt-3 text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2.5">
              {description}
            </p>
          )}
        </>
      )}
    </div>
  );
}
