import { useCallback, useEffect, useMemo, useRef } from "react";
import L, { type LeafletMouseEvent } from "leaflet";
import { RefreshCcw } from "lucide-react";
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
      return legend[0]?.color ?? "#bfdbfe";
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
        color: inRange ? "#0b4a6f" : "#1e3a5f",
        weight: inRange ? 1.5 : 1,
        fillOpacity: legendHighlight ? (inRange ? 0.85 : 0.2) : 0.75,
        opacity: 0.9
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
      <div className="relative h-full min-h-[520px] rounded-3xl border border-border bg-panel p-6 shadow-card">
        <div className="flex h-full animate-pulse flex-col gap-4">
          <div className="h-7 w-1/3 rounded-full bg-border" />
          <div className="h-10 w-1/2 rounded-2xl bg-border/70" />
          <div className="flex flex-1 flex-col gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 rounded-2xl bg-border/60" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="relative flex h-full min-h-[520px] items-center justify-center rounded-3xl border border-dashed border-border bg-panel p-10 text-center shadow-card">
        <p className="max-w-lg text-base font-medium text-muted">
          Belum ada data untuk periode ini. Silakan unggah data baru untuk melihat visualisasi di peta.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full min-h-[520px] flex-col items-center justify-center gap-4 rounded-3xl border border-rose-200/60 bg-rose-500/10 p-10 text-center shadow-card">
        <p className="text-lg font-semibold text-rose-600">Terjadi kendala saat memuat data</p>
        <p className="max-w-md text-sm text-rose-500">
          Kami tidak dapat memuat peta untuk periode ini. Coba lagi untuk melakukan pemanggilan ulang sumber data.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-rose-500"
        >
          <RefreshCcw className="h-4 w-4" />
          <span>Coba Lagi</span>
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
        pathLayer.setStyle({ weight: 2.5, color: "#0b4a6f", fillOpacity: 0.95 });
        pathLayer
          .bindTooltip(`<strong>${name}</strong><br />${formatCurrency(value)}`, {
            direction: "top",
            offset: L.point(0, -10),
            opacity: 1,
            sticky: true,
            className: "rounded-xl border border-border bg-panel px-3 py-2 text-xs font-semibold text-text shadow-card"
          })
          .openTooltip(event.latlng);
        onRegionFocus({ name, value });
      },
      mouseout: () => {
        pathLayer.closeTooltip();
        onRegionFocus(null);
        const baseValue = (feature.properties?.value as number) ?? 0;
        pathLayer.setStyle({
          weight: 1.5,
          color: "#0b4a6f",
          fillColor: getColor(baseValue),
          fillOpacity: legendHighlight ? 0.75 : 0.85
        });
      }
    });
  };

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden rounded-3xl border border-border bg-panel shadow-card">
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
            color: "#0b4a6f",
            fillOpacity: legendHighlight ? 0.75 : 0.85,
            opacity: 0.9
          })}
          onEachFeature={handleEachFeature}
          ref={(layer) => {
            if (layer) {
              geoJsonRef.current = layer as unknown as L.GeoJSON;
            }
          }}
        />
      </MapContainer>
      <div className="pointer-events-none absolute inset-x-6 top-6 hidden rounded-2xl border border-border bg-panel/80 px-4 py-3 text-sm font-medium text-muted shadow-card backdrop-blur md:block">
        Sorot wilayah untuk melihat detail anggaran.
      </div>
    </div>
  );
}
