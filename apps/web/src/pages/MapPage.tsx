import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L, { type LeafletMouseEvent } from "leaflet";
import {
  MapPin,
  RefreshCcw,
  Filter,
  ArrowUpRight,
  UploadCloud,
  Download,
  AlertTriangle,
  Trophy,
  ShieldCheck,
  Activity,
  CheckCircle2,
  TrendingUp,
  Landmark,
  Layers as LayersIcon
} from "lucide-react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";

import { InfoCard } from "../components/dashboard/InfoCard";
import { LegendCard, type LegendItem } from "../components/dashboard/LegendCard";
import { formatCurrency } from "../lib/format";

import type { Feature, FeatureCollection } from "geojson";

export type MapStatus = "loading" | "success" | "empty" | "error";

export interface RegionStat {
  name: string;
  value: number;
}

interface MapPageProps {
  status: MapStatus;
  featureCollection: FeatureCollection | null;
  legend: LegendItem[];
  legendHighlight: LegendItem | null;
  activeRegion: RegionStat | null;
  onRegionFocus: (region: RegionStat | null) => void;
  onHoverLegend: (item: LegendItem | null) => void;
  onRetry: () => void;
}

const DEFAULT_CENTER: [number, number] = [-7.1, 109.8];
const DEFAULT_ZOOM = 7;

// FiscalView Ranking Data
const FISCAL_RANKINGS = [
  { region: "Jawa Timur", target: 35000000000000, realization: 28500000000000, percentage: 81.4, yoy: 6.2, rank: 1 },
  { region: "Jawa Barat", target: 38000000000000, realization: 30200000000000, percentage: 79.5, yoy: 5.8, rank: 2 },
  { region: "DKI Jakarta", target: 82000000000000, realization: 64500000000000, percentage: 78.6, yoy: 7.1, rank: 3 },
  { region: "Jawa Tengah", target: 28000000000000, realization: 21800000000000, percentage: 77.8, yoy: 4.9, rank: 4 },
  { region: "Banten", target: 12500000000000, realization: 9600000000000, percentage: 76.8, yoy: 5.2, rank: 5 }
];

// DefisitWatch Watchlist Data
const DEFISIT_WATCHLIST = [
  { region: "Kab. Sampang", irf: 82, category: "Merah", reason: "Deviasi -14% dari target, kas < 1 bln" },
  { region: "Kab. Bangkalan", irf: 76, category: "Merah", reason: "Tren 4 minggu negatif, varians tinggi" },
  { region: "Kab. Bondowoso", irf: 64, category: "Oranye", reason: "Belanja operasional awal tinggi" }
];

export function MapPage({
  status,
  featureCollection,
  legend,
  legendHighlight,
  activeRegion,
  onRegionFocus,
  onHoverLegend,
  onRetry
}: MapPageProps) {
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const [selectedQuickRegion, setSelectedQuickRegion] = useState<string | null>(null);

  const regionLookup = useMemo(() => {
    if (!featureCollection) return new Map<string, RegionStat>();
    return new Map(
      featureCollection.features.map((feature) => [
        feature.properties?.name as string,
        {
          name: feature.properties?.name as string,
          value: feature.properties?.value as number
        }
      ])
    );
  }, [featureCollection]);

  const getColor = useCallback(
    (value: number) => {
      for (const item of legend) {
        if (!item.range) continue;
        const [min, max] = item.range;
        if (value >= min && value <= max) {
          return item.color;
        }
        if (value >= min && item === legend[legend.length - 1]) {
          return item.color;
        }
      }
      return legend[0]?.color ?? "#0f4c5c";
    },
    [legend]
  );

  useEffect(() => {
    const layer = geoJsonRef.current;
    if (!layer) return;
    layer.eachLayer((leafletLayer) => {
      const pathLayer = leafletLayer as L.Path & { feature?: Feature };
      const feature = pathLayer.feature as Feature;
      const name = (feature.properties?.name as string) ?? "";
      const value = (feature.properties?.value as number) ?? 0;

      const isSelected = selectedQuickRegion ? name === selectedQuickRegion : false;
      const inRange = legendHighlight?.range
        ? value >= legendHighlight.range[0] && value <= legendHighlight.range[1]
        : true;

      pathLayer.setStyle({
        fillColor: getColor(value),
        color: isSelected ? "#0284c7" : inRange ? "#059669" : "#64748b",
        weight: isSelected ? 3.5 : inRange ? 2 : 1,
        fillOpacity: isSelected ? 0.85 : legendHighlight ? (inRange ? 0.75 : 0.2) : 0.65,
        opacity: 0.95
      });
    });
  }, [legendHighlight, legend, getColor, selectedQuickRegion]);

  useEffect(() => {
    if (status !== "success" || regionLookup.size === 0) {
      onRegionFocus(null);
      return;
    }
    if (selectedQuickRegion && regionLookup.has(selectedQuickRegion)) {
      onRegionFocus(regionLookup.get(selectedQuickRegion)!);
      return;
    }
    const sorted = [...regionLookup.values()].sort((a, b) => b.value - a.value);
    if (sorted[0]) {
      onRegionFocus(sorted[0]);
    }
  }, [status, regionLookup, onRegionFocus, selectedQuickRegion]);

  const handleEachFeature = (feature: Feature, layer: L.Layer) => {
    const pathLayer = layer as L.Path & { feature?: Feature };
    const name = (feature.properties?.name as string) ?? "";
    const value = (feature.properties?.value as number) ?? 0;

    pathLayer.on({
      mouseover: (event: LeafletMouseEvent) => {
        pathLayer.setStyle({
          weight: 3,
          color: "#0284c7",
          fillOpacity: 0.85
        });
        pathLayer
          .bindTooltip(
            `<div class="p-1.5">
              <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 font-['Outfit']">${name}</div>
              <div class="text-sm font-extrabold text-slate-900 font-['JetBrains_Mono'] mt-0.5">${formatCurrency(value)}</div>
              <div class="text-[10px] text-slate-500 mt-1 border-t border-slate-200 pt-1">Klik / sorot untuk rincian potongan 15%</div>
            </div>`,
            {
              direction: "top",
              offset: L.point(0, -10),
              opacity: 1,
              sticky: true,
              className: "leaflet-popup-content-wrapper"
            }
          )
          .openTooltip(event.latlng);
        onRegionFocus({ name, value });
      },
      mouseout: () => {
        pathLayer.closeTooltip();
        if (selectedQuickRegion !== name) {
          onRegionFocus(null);
        }
        const baseValue = (feature.properties?.value as number) ?? 0;
        pathLayer.setStyle({
          weight: selectedQuickRegion === name ? 3.5 : 2,
          color: selectedQuickRegion === name ? "#0284c7" : "#059669",
          fillColor: getColor(baseValue),
          fillOpacity: legendHighlight ? 0.75 : 0.65
        });
      }
    });
  };

  const regionNames = Array.from(regionLookup.keys());

  return (
    <div className="space-y-6">
      {/* Petakeu Executive Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-['Outfit']">
            Dashboard Intelligence Fiskal Daerah
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Monitoring realisasi penerimaan fiskal daerah, setoran 85% Himbara, dan potongan wajib 15% Pemda secara real-time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (window.location.hash = "#upload")}
            className="rounded-full bg-[#044e3a] hover:bg-[#033b2c] text-white px-5 py-2.5 text-sm font-semibold shadow-xs transition active:scale-95 flex items-center gap-2"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Unggah Excel Data</span>
          </button>
          <button
            type="button"
            onClick={() => (window.location.hash = "#reports")}
            className="rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-5 py-2.5 text-sm font-semibold shadow-xs transition active:scale-95 flex items-center gap-2"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>Ekspor Laporan</span>
          </button>
        </div>
      </div>

      {/* Row 1: 4 Financial KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Total Realisasi Nominal (Dark Green Highlight) */}
        <div className="relative overflow-hidden rounded-[24px] bg-[#044e3a] p-5 text-white shadow-md flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-100/90">Total Realisasi Nominal</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
              aria-label="Detail Realisasi Nominal"
            >
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div>
            <span className="text-3xl font-extrabold tracking-tight font-['Outfit']">Rp 16.840 M</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#066149] px-2.5 py-0.5 text-[11px] font-bold text-emerald-200 border border-emerald-400/20">
              <span>+5.2%</span>
              <span>YoY</span>
            </span>
            <span className="text-xs text-emerald-100/80 font-medium">Kenaikan dibanding tahun lalu</span>
          </div>
        </div>

        {/* Card 2: Setoran Bersih 85% Himbara */}
        <div className="rounded-[24px] bg-white border border-slate-100 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">Setoran Bersih (85%)</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition"
              aria-label="Detail Setoran Bersih"
            >
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div>
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-['Outfit']">Rp 14.314 M</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
              <span>Verified</span>
            </span>
            <span className="text-xs text-slate-500 font-medium">Distribusi RKUD Himbara</span>
          </div>
        </div>

        {/* Card 3: Potongan Wajib 15% Pemda */}
        <div className="rounded-[24px] bg-white border border-slate-100 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">Potongan Wajib (15%)</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition"
              aria-label="Detail Potongan 15%"
            >
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div>
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-['Outfit']">Rp 2.526 M</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 border border-cyan-200 px-2.5 py-0.5 text-[11px] font-bold text-cyan-800">
              <span>Auto-Cut</span>
            </span>
            <span className="text-xs text-slate-500 font-medium">Presisi kalkulasi 100%</span>
          </div>
        </div>

        {/* Card 4: Total Wilayah Spasial */}
        <div className="rounded-[24px] bg-white border border-slate-100 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">Total Wilayah Spasial</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition"
              aria-label="Detail Wilayah Spasial"
            >
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div>
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-['Outfit']">38 Provinsi</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              514 Kab / Kota
            </span>
          </div>
        </div>
      </div>

      {/* Row 2 & 3: Main 3-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left / Main Section (6 Columns) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Card A: Peta Heatmap Realisasi Spasial (Leaflet Choropleth Map) */}
          <div className="rounded-[24px] bg-white border border-slate-100 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-['Outfit']">Peta Heatmap Realisasi Spasial</h2>
                <p className="text-xs text-slate-400 font-medium">Visualisasi distribusif pendapatan & potongan 15% Pemda.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  PostGIS Quantile
                </span>
              </div>
            </div>

            {/* Interactive Leaflet Map Container */}
            <div className="relative h-[320px] w-full rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-50">
              {status === "loading" && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/80 backdrop-blur-xs">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
                    <span className="text-xs font-bold text-slate-600">Memuat Peta Spasial...</span>
                  </div>
                </div>
              )}

              {status === "empty" && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/90 p-6 text-center">
                  <MapPin className="h-8 w-8 text-amber-500 mb-2" />
                  <p className="text-sm font-bold text-slate-800">Belum Ada Data Peta</p>
                </div>
              )}

              {status === "error" && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/90 p-6 text-center">
                  <RefreshCcw className="h-8 w-8 text-rose-500 mb-2" />
                  <p className="text-sm font-bold text-rose-600">Gagal Memuat Layer Map</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-2 rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-rose-500"
                  >
                    Muat Ulang
                  </button>
                </div>
              )}

              {featureCollection && (
                <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" zoomControl={false}>
                  <TileLayer
                    attribution="&copy; <a href='https://carto.com/attributions'>CartoDB</a>"
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  />
                  <GeoJSON
                    key={legendHighlight?.label ?? "default"}
                    data={featureCollection}
                    style={(feature) => ({
                      fillColor: getColor((feature?.properties?.value as number) ?? 0),
                      weight: 2,
                      color: "#059669",
                      fillOpacity: legendHighlight ? 0.75 : 0.65,
                      opacity: 0.95
                    })}
                    onEachFeature={handleEachFeature}
                    ref={(layer) => {
                      if (layer) {
                        geoJsonRef.current = layer as unknown as L.GeoJSON;
                      }
                    }}
                  />
                </MapContainer>
              )}

              {/* Floating Top-Right Info HUD */}
              <div className="absolute top-3 right-3 z-20 pointer-events-auto max-w-[240px]">
                <InfoCard
                  regionName={activeRegion?.name ?? "-"}
                  value={activeRegion ? formatCurrency(activeRegion.value) : "-"}
                  rawAmount={activeRegion?.value}
                  trend={status === "success" ? "+3.8% MoM" : null}
                />
              </div>

              {/* Floating Bottom-Right Legend HUD */}
              <div className="absolute bottom-3 right-3 z-20 pointer-events-auto max-w-[200px]">
                <LegendCard
                  items={legend}
                  loading={false}
                  onHoverItem={onHoverLegend}
                  activeLabel={legendHighlight?.label ?? null}
                />
              </div>
            </div>

            {/* Quick Region Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 scrollbar-none">
              <span className="text-xs font-bold text-slate-500 shrink-0 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5 text-emerald-600" />
                <span>Filter Wilayah:</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedQuickRegion(null);
                  onRegionFocus(null);
                }}
                className={`rounded-full px-3 py-1 text-xs font-bold transition shrink-0 ${
                  selectedQuickRegion === null
                    ? "bg-[#044e3a] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Semua Wilayah
              </button>
              {regionNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setSelectedQuickRegion(name);
                    const reg = regionLookup.get(name);
                    if (reg) onRegionFocus(reg);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition shrink-0 ${
                    selectedQuickRegion === name
                      ? "bg-[#044e3a] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Card B: FiscalView Ranking Table */}
          <div className="rounded-[24px] bg-white border border-slate-100 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-['Outfit']">Peringkat Realisasi Penerimaan (FiscalView)</h2>
                <p className="text-xs text-slate-400 font-medium">Tabel ranking realisasi vs target per provinsi.</p>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                Top 5 Daerah
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-medium text-slate-600">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-y border-slate-100">
                  <tr>
                    <th className="px-3 py-2.5">Peringkat</th>
                    <th className="px-3 py-2.5">Provinsi</th>
                    <th className="px-3 py-2.5">Target (IDR)</th>
                    <th className="px-3 py-2.5">Realisasi (IDR)</th>
                    <th className="px-3 py-2.5">% Capai</th>
                    <th className="px-3 py-2.5">YoY %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {FISCAL_RANKINGS.map((row) => (
                    <tr key={row.region} className="hover:bg-slate-50/80 transition">
                      <td className="px-3 py-2.5 font-bold text-slate-900">#{row.rank}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{row.region}</td>
                      <td className="px-3 py-2.5 text-slate-500">{formatCurrency(row.target)}</td>
                      <td className="px-3 py-2.5 font-bold text-emerald-800">{formatCurrency(row.realization)}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 border border-emerald-200">
                          {row.percentage}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-emerald-700 font-semibold">+{row.yoy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Middle Section (3 Columns) */}
        <div className="lg:col-span-3 space-y-5">
          {/* Card C: DefisitWatch Early Warning */}
          <div className="rounded-[24px] bg-white border border-slate-100 p-5 shadow-xs flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-['Outfit']">DefisitWatch</h2>
              </div>
              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                3 Alert
              </span>
            </div>

            <div className="space-y-2.5">
              {DEFISIT_WATCHLIST.map((item) => (
                <div key={item.region} className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{item.region}</span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                        item.category === "Merah"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      IRF {item.irf}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">{item.reason}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => alert("Membuka detail modul DefisitWatch")}
              className="w-full rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 border border-amber-300 py-2.5 px-4 text-xs font-bold transition active:scale-95 flex items-center justify-center gap-2"
            >
              <TrendingUp className="h-4 w-4 text-amber-700" />
              <span>Lihat Detail Watchlist</span>
            </button>
          </div>

          {/* Card D: Capaian Aggregat Target Nasional */}
          <div className="rounded-[24px] bg-white border border-slate-100 p-5 shadow-xs flex flex-col items-center text-center justify-between space-y-4">
            <div className="w-full text-left">
              <h2 className="text-lg font-bold text-slate-900 font-['Outfit']">Capaian Realisasi YTD</h2>
              <p className="text-xs text-slate-400 font-medium">Persentase agregat target pendapatan tahunan.</p>
            </div>

            {/* Gauge Chart SVG */}
            <div className="relative flex flex-col items-center justify-center py-2">
              <svg className="w-44 h-24" viewBox="0 0 100 50">
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                <path
                  d="M 10 50 A 40 40 0 0 1 78 14"
                  fill="none"
                  stroke="#044e3a"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
              </svg>
              <div className="mt-[-28px]">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-['Outfit']">74.2%</span>
                <p className="text-[11px] text-slate-400 font-semibold">Tercapai dari Pagu</p>
              </div>
            </div>

            {/* Status Legend */}
            <div className="flex items-center justify-center gap-3 pt-2 text-[10px] font-bold text-slate-600 border-t border-slate-100 w-full">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#044e3a]" />
                Tercapai
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                On Track
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                Deviasi
              </span>
            </div>
          </div>
        </div>

        {/* Right Section (3 Columns) */}
        <div className="lg:col-span-3 space-y-5">
          {/* Card E: RankFin Liga Kinerja Finansial */}
          <div className="rounded-[24px] bg-white border border-slate-100 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-slate-900 font-['Outfit']">RankFin Liga</h2>
              </div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold text-amber-800">
                Gold Tier
              </span>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-amber-800 font-['Outfit']">Top Transparency</span>
                <h4 className="text-xs font-bold text-slate-900">Pemprov Jawa Timur</h4>
                <p className="text-[11px] text-slate-500">Skor 92.4 • SLAs upload &lt; H+1</p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-emerald-800 font-['Outfit']">Fast Starter Badge</span>
                <h4 className="text-xs font-bold text-slate-900">Pemprov DKI Jakarta</h4>
                <p className="text-[11px] text-slate-500">Skor 89.1 • Target Q1 capai 32%</p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-cyan-800 font-['Outfit']">Steady Climber</span>
                <h4 className="text-xs font-bold text-slate-900">Pemprov Jawa Barat</h4>
                <p className="text-[11px] text-slate-500">Skor 86.8 • 3 Bulan konsisten naik</p>
              </div>
            </div>
          </div>

          {/* Card F: Telemetri PostGIS & Cache Status */}
          <div className="relative overflow-hidden rounded-[24px] bg-[#044e3a] p-5 text-white shadow-md flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-100/90">Infrastruktur Telemetri</span>
              <Activity className="h-4 w-4 text-emerald-300 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs border-b border-emerald-700/60 pb-1.5">
                <span className="text-emerald-200">PostGIS Spatial Latency</span>
                <span className="font-bold text-white font-['JetBrains_Mono']">24 ms</span>
              </div>
              <div className="flex justify-between items-center text-xs border-b border-emerald-700/60 pb-1.5">
                <span className="text-emerald-200">Redis Cache Hit Rate</span>
                <span className="font-bold text-white font-['JetBrains_Mono']">99.4%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-emerald-200">15% Cut Precision</span>
                <span className="font-bold text-emerald-300 font-['JetBrains_Mono']">100.00%</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="w-full rounded-xl bg-white/10 hover:bg-white/20 py-2 px-3 text-center text-xs font-bold text-white transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <RefreshCcw className="h-3.5 w-3.5 text-emerald-300" />
              <span>Refresh Materialized View</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


