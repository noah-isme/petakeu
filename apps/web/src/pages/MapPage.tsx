import { useCallback, useEffect, useMemo, useRef } from "react";
import L, { type LeafletMouseEvent } from "leaflet";
import { Compass, Info, RefreshCcw, Layers, MapPin } from "lucide-react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";

import { LegendItem } from "../components/dashboard/LegendCard";
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
  onRegionFocus: (region: RegionStat | null) => void;
  onRetry: () => void;
}

const DEFAULT_CENTER: [number, number] = [-6.5, 108];
const DEFAULT_ZOOM = 6;

export function MapPage({
  status,
  featureCollection,
  legend,
  legendHighlight,
  onRegionFocus,
  onRetry
}: MapPageProps) {
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

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
      const value = (feature.properties?.value as number) ?? 0;
      const inRange = legendHighlight?.range
        ? value >= legendHighlight.range[0] && value <= legendHighlight.range[1]
        : true;
      pathLayer.setStyle({
        fillColor: getColor(value),
        color: inRange ? "#34d399" : "#0f172a",
        weight: inRange ? 2 : 1,
        fillOpacity: legendHighlight ? (inRange ? 0.9 : 0.25) : 0.8,
        opacity: 0.95
      });
    });
  }, [legendHighlight, legend, getColor]);

  useEffect(() => {
    if (status !== "success" || regionLookup.size === 0) {
      onRegionFocus(null);
      return;
    }
    const sorted = [...regionLookup.values()].sort((a, b) => b.value - a.value);
    if (sorted[0]) {
      onRegionFocus(sorted[0]);
    }
  }, [status, regionLookup, onRegionFocus]);

  if (status === "loading") {
    return (
      <div className="relative h-[calc(100vh-180px)] min-h-[550px] w-full rounded-3xl border border-slate-800/80 bg-slate-950 p-8 shadow-2xl backdrop-blur-2xl">
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
      <div className="relative flex h-[calc(100vh-180px)] min-h-[550px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/80 p-10 text-center shadow-2xl">
        <MapPin className="h-12 w-12 text-slate-500 mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Belum Ada Data Peta</h3>
        <p className="max-w-md text-sm font-medium text-slate-400">
          Tidak ditemukan catatan realisasi pendapatan untuk periode ini. Silakan unggah data Excel atau pilih periode lain.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-[calc(100vh-180px)] min-h-[550px] w-full flex-col items-center justify-center gap-4 rounded-3xl border border-rose-500/30 bg-rose-950/20 p-10 text-center shadow-2xl">
        <div className="h-12 w-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
          <RefreshCcw className="h-6 w-6" />
        </div>
        <p className="text-xl font-extrabold text-rose-400">Terjadi Kendala Memuat Layer Map</p>
        <p className="max-w-md text-sm text-slate-400">
          Gagal mengambil koordinat spasial dan data agregasi dari server. Silakan hubungkan kembali koneksi data.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-rose-500"
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
          fillOpacity: 0.95
        });
        pathLayer
          .bindTooltip(
            `<div class="p-1">
              <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">${name}</div>
              <div class="text-sm font-extrabold text-white">${formatCurrency(value)}</div>
              <div class="text-[10px] text-slate-300 mt-1 border-t border-slate-700/60 pt-1">Sorot untuk detail komprehensif</div>
            </div>`,
            {
              direction: "top",
              offset: L.point(0, -12),
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
        onRegionFocus(null);
        const baseValue = (feature.properties?.value as number) ?? 0;
        pathLayer.setStyle({
          weight: 1.5,
          color: "#34d399",
          fillColor: getColor(baseValue),
          fillOpacity: legendHighlight ? 0.8 : 0.85
        });
      }
    });
  };

  return (
    <div className="relative h-[calc(100vh-180px)] min-h-[550px] w-full overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950 shadow-2xl">
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
            weight: 1.5,
            color: "#34d399",
            fillOpacity: legendHighlight ? 0.8 : 0.85,
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

      {/* Floating Glass Guidance Bar */}
      <div className="pointer-events-none absolute left-6 top-6 z-[1000] hidden items-center gap-2.5 rounded-2xl border border-slate-700/80 bg-slate-900/85 px-4 py-3 text-xs font-semibold text-slate-200 shadow-2xl backdrop-blur-xl md:flex">
        <Compass className="h-4 w-4 text-emerald-400 animate-spin-slow" />
        <span>Gunakan mouse untuk hover / zoom wilayah & melihat pembagian setoran daerah</span>
      </div>
    </div>
  );
}

