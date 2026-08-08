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
    <div className="bg-white border border-slate-200/80 w-full max-w-sm rounded-3xl p-5 shadow-lg transition-all duration-300">
      {/* Card Header with Collapse Toggle */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-xs">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 font-['Outfit']">Wilayah Dipilih</p>
            <h2 className="text-base font-black tracking-tight text-slate-900 font-['Outfit'] truncate max-w-[180px]">{regionName}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <TrendingUp className="h-3 w-3" />
            Aktif
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-xl border border-slate-200 bg-slate-50 p-1.5 text-slate-500 hover:text-slate-900 transition"
            aria-label={collapsed ? "Buka rincian" : "Tutup rincian"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Main Realization Amount */}
          <div className="mt-4 space-y-1 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Realisasi Anggaran</p>
            <div className="text-xl font-black text-slate-900 tracking-tight font-['JetBrains_Mono']">
              {value}
            </div>
          </div>

          {/* Financial Split Cards (15% Cut Rule) */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3 transition hover:border-amber-300">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800">
                <Percent className="h-3 w-3 text-amber-600" />
                <span>Potongan 15%</span>
              </div>
              <p className="mt-1 text-xs font-bold text-amber-900 font-['JetBrains_Mono']">
                {parsedValue > 0 ? formatIDR(cut15) : "Rp 0"}
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50/60 p-3 transition hover:border-cyan-300">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-800">
                <Calculator className="h-3 w-3 text-cyan-600" />
                <span>Setoran 85%</span>
              </div>
              <p className="mt-1 text-xs font-bold text-cyan-900 font-['JetBrains_Mono']">
                {parsedValue > 0 ? formatIDR(netAmount) : "Rp 0"}
              </p>
            </div>
          </div>

          {/* Trend Indicator */}
          {trend && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
              <span>{trend}</span>
            </div>
          )}

          {description && (
            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-2.5">
              {description}
            </p>
          )}
        </>
      )}
    </div>
  );
}

