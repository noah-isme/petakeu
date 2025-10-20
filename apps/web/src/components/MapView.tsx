import { useMemo } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip } from "react-leaflet";

import type { LeafletMouseEvent } from "leaflet";
import type { GeoJsonObject } from "geojson";
import type { ChoroplethFeature, ChoroplethResponse } from "../types/geo";

interface MapViewProps {
  choropleth?: ChoroplethResponse;
  onRegionSelect?: (regionId: string) => void;
  selectedRegionId?: string;
  mode: "choropleth" | "heat";
  publicMode?: boolean;
}

const colors = ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];

function getFillColor(index: number) {
  return colors[index] ?? colors[colors.length - 1];
}

type LeafletFeatureTarget = {
  feature?: {
    properties?: {
      regionId?: string;
    };
  };
};

export function MapView({ choropleth, onRegionSelect, selectedRegionId, mode, publicMode }: MapViewProps) {
  const geoJsonData = useMemo(() => choropleth ?? null, [choropleth]);
  const periodKey = choropleth?.metadata.period ?? "default";
  const features = useMemo(
    () => (choropleth?.features ?? []).filter((feature): feature is ChoroplethFeature => Boolean(feature.geometry)),
    [choropleth]
  );

  return (
    <MapContainer center={[-6.2, 106.8]} zoom={6} className="map-container" aria-label="Peta setoran daerah">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {geoJsonData && features.length > 0 && (
        <GeoJSON
          key={`${periodKey}-${mode}`}
          data={{
            ...geoJsonData,
            features
          } as unknown as GeoJsonObject}
          style={(feature) => {
            const properties = feature?.properties as ChoroplethResponse["features"][number]["properties"] | undefined;
            const regionId = properties?.regionId;
            const classIndex = properties?.classIndex ?? 0;
            const isSelected = regionId && regionId === selectedRegionId;
            return {
              fillColor: getFillColor(classIndex),
              weight: isSelected ? 2.5 : 0.8,
              opacity: mode === "heat" ? 0.6 : 1,
              color: isSelected ? "#0f172a" : "#475569",
              dashArray: isSelected ? "4" : "1",
              fillOpacity: mode === "heat" ? 0.25 : isSelected ? 0.7 : 0.5
            };
          }}
            eventHandlers={{
              click: (event: LeafletMouseEvent) => {
                const propagated = event.propagatedFrom as LeafletFeatureTarget | undefined;
                const source = event.sourceTarget as LeafletFeatureTarget | undefined;
                const feature = propagated?.feature ?? source?.feature;
                const regionId = feature?.properties?.regionId;
                if (regionId && onRegionSelect) {
                  onRegionSelect(regionId);
                }
              }
            }}
        />
      )}
      {mode === "heat" &&
        features.map((feature) => {
          const [lng, lat] = feature.properties.centroid;
          const intensity = feature.properties.classIndex + 1;
          return (
            <CircleMarker
              key={`heat-${feature.properties.regionId}`}
              center={[lat, lng]}
              radius={10 + intensity * 3}
              pathOptions={{
                fillColor: getFillColor(feature.properties.classIndex),
                fillOpacity: 0.45,
                color: "#1d4ed8",
                weight: 0.5
              }}
              eventHandlers={{
                click: () => onRegionSelect?.(feature.properties.regionId)
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1} sticky>
                <strong>{feature.properties.name}</strong>
                {feature.properties.classLabel && (
                  <span>
                    <br />Kelas: {feature.properties.classLabel}
                  </span>
                )}
                {!publicMode && feature.properties.value !== undefined && (
                  <span>
                    <br />Rp {feature.properties.value.toLocaleString("id-ID")}
                  </span>
                )}
              </Tooltip>
            </CircleMarker>
          );
        })}
    </MapContainer>
  );
}
