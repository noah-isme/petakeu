import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L, { type LeafletMouseEvent } from "leaflet";
import { Compass, RefreshCcw, MapPin, Filter, Layers as LayersIcon } from "lucide-react";
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
        color: isSelected ? "#38bdf8" : inRange ? "#34d399" : "#0f172a",
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

  if (status === "loading") {
    return (
      <div className="relative h-full w-full bg-slate-950 p-8">
        <div className="flex h-full animate-pulse flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="h-8 w-1/4 rounded-2xl bg-slate-800/80" />
            <div className="h-8 w-1/6 rounded-2xl bg-slate-800/80" />
          </div>
          <div className="flex-1 rounded-3xl bg-slate-900/60" />
        </div>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center bg-slate-950/90 p-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-900 text-slate-400 border border-slate-800 mb-4 shadow-xl">
          <MapPin className="h-8 w-8 text-amber-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2 font-['Outfit']">Belum Ada Data Peta</h3>
        <p className="max-w-md text-xs font-medium text-slate-400 leading-relaxed">
          Tidak ditemukan catatan realisasi pendapatan untuk periode ini. Silakan unggah data Excel atau pilih periode lain.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-950 p-10 text-center">
        <div className="h-16 w-16 rounded-3xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.3)]">
          <RefreshCcw className="h-8 w-8" />
        </div>
        <p className="text-xl font-black text-rose-400 font-['Outfit']">Terjadi Kendala Memuat Layer Map</p>
        <p className="max-w-md text-xs text-slate-400 leading-relaxed">
          Gagal mengambil koordinat spasial dan data agregasi dari server. Silakan hubungkan kembali koneksi data.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-500 px-6 py-3 text-xs font-bold text-white shadow-xl transition hover:from-rose-500 hover:to-rose-400 active:scale-95"
        >
          <RefreshCcw className="h-4 w-4" />
          <span>Muat Ulang Data Peta</span>
        </button>
      </div>
    );
  }

  if (!featureCollection) {
    return null;
  }

  const handleEachFeature = (feature: Feature, layer: L.Layer) => {
    const pathLayer = layer as L.Path & { feature?: Feature };
    const name = (feature.properties?.name as string) ?? "";
    const value = (feature.properties?.value as number) ?? 0;

    pathLayer.on({
      mouseover: (event: LeafletMouseEvent) => {
        pathLayer.setStyle({
          weight: 3,
          color: "#06b6d4",
          fillOpacity: 0.85
        });
        pathLayer
          .bindTooltip(
            `<div class="p-1.5">
              <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 font-['Outfit']">${name}</div>
              <div class="text-sm font-extrabold text-white font-['JetBrains_Mono'] mt-0.5">${formatCurrency(value)}</div>
              <div class="text-[10px] text-slate-400 mt-1 border-t border-slate-700/60 pt-1">Klik / sorot untuk rincian potongan 15%</div>
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
          color: selectedQuickRegion === name ? "#38bdf8" : "#10b981",
          fillColor: getColor(baseValue),
          fillOpacity: legendHighlight ? 0.75 : 0.65
        });
      }
    });
  };

  const regionNames = Array.from(regionLookup.keys());

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" zoomControl={false}>
        <TileLayer
          attribution="&copy; <a href='https://carto.com/attributions'>CartoDB</a> &amp; <a href='https://www.openstreetmap.org/copyright'>OSM</a>"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <GeoJSON
          key={legendHighlight?.label ?? "default"}
          data={featureCollection}
          style={(feature) => ({
            fillColor: getColor((feature?.properties?.value as number) ?? 0),
            weight: 2,
            color: "#10b981",
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

      {/* Floating Top-Right Executive Info Card HUD */}
      <div className="absolute top-4 right-4 z-20 pointer-events-auto">
        <InfoCard
          regionName={activeRegion?.name ?? "-"}
          value={activeRegion ? formatCurrency(activeRegion.value) : "-"}
          rawAmount={activeRegion?.value}
          trend={status === "success" ? "+3.8% dibanding kuartal lalu" : null}
          description="Nilai mencerminkan total realisasi anggaran pada periode terpilih."
        />
      </div>

      {/* Floating Bottom-Right Quantile Legend HUD */}
      <div className="absolute bottom-16 right-4 z-20 pointer-events-auto">
        <LegendCard
          items={legend}
          loading={false}
          onHoverItem={onHoverLegend}
          activeLabel={legendHighlight?.label ?? null}
        />
      </div>

      {/* Floating Bottom-Left Quick Region Filter Pills */}
      <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-auto max-w-[calc(100%-380px)]">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/90 p-1.5 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-slate-300">
            <Filter className="h-3.5 w-3.5 text-emerald-400" />
            <span>Fokus Wilayah:</span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto max-w-[550px] scrollbar-none">
            <button
              type="button"
              onClick={() => {
                setSelectedQuickRegion(null);
                onRegionFocus(null);
              }}
              className={`rounded-xl px-3 py-1 text-[11px] font-bold transition ${
                selectedQuickRegion === null
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/80"
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
                className={`rounded-xl px-3 py-1 text-[11px] font-bold whitespace-nowrap transition ${
                  selectedQuickRegion === name
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/80"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Floating Guidance Bar */}
        <div className="hidden lg:flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/90 px-4 py-2 text-xs font-semibold text-slate-300 shadow-2xl backdrop-blur-2xl">
          <Compass className="h-4 w-4 text-emerald-400 animate-spin-slow" />
          <span>Gunakan mouse untuk hover / zoom wilayah & melihat pembagian setoran daerah</span>
        </div>
      </div>
    </div>
  );
}
