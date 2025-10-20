import type { Feature, Polygon } from "geojson";

import type { Region } from "../../types/region";

export interface RegionGeoFeature extends Feature<Polygon> {
  properties: {
    id: string;
    name: string;
  };
}

const provinceRegions: Region[] = [
  { id: "prov-31", code: "31", name: "DKI Jakarta", level: "province" },
  { id: "prov-32", code: "32", name: "Jawa Barat", level: "province" },
  { id: "prov-33", code: "33", name: "Jawa Tengah", level: "province" },
  { id: "prov-35", code: "35", name: "Jawa Timur", level: "province" },
  { id: "prov-51", code: "51", name: "Bali", level: "province" },
  { id: "prov-73", code: "73", name: "Sulawesi Selatan", level: "province" }
];

const regencyRegions: Region[] = [
  { id: "city-jakarta", code: "3171", name: "DKI Jakarta", level: "regency", parentId: "prov-31" },
  { id: "city-bandung", code: "3273", name: "Kota Bandung", level: "regency", parentId: "prov-32" },
  { id: "city-semarang", code: "3374", name: "Kota Semarang", level: "regency", parentId: "prov-33" },
  { id: "city-surabaya", code: "3578", name: "Kota Surabaya", level: "regency", parentId: "prov-35" },
  { id: "city-denpasar", code: "5171", name: "Kota Denpasar", level: "regency", parentId: "prov-51" },
  { id: "city-makassar", code: "7371", name: "Kota Makassar", level: "regency", parentId: "prov-73" }
];

const regionGeometries: Record<string, RegionGeoFeature> = {
  "city-jakarta": {
    type: "Feature",
    properties: { id: "city-jakarta", name: "DKI Jakarta" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [106.7, -6.05],
          [107.0, -6.05],
          [107.0, -6.4],
          [106.7, -6.4],
          [106.7, -6.05]
        ]
      ]
    }
  },
  "city-bandung": {
    type: "Feature",
    properties: { id: "city-bandung", name: "Kota Bandung" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [107.55, -6.8],
          [107.75, -6.8],
          [107.75, -7.05],
          [107.55, -7.05],
          [107.55, -6.8]
        ]
      ]
    }
  },
  "city-semarang": {
    type: "Feature",
    properties: { id: "city-semarang", name: "Kota Semarang" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [110.3, -6.8],
          [110.55, -6.8],
          [110.55, -7.1],
          [110.3, -7.1],
          [110.3, -6.8]
        ]
      ]
    }
  },
  "city-surabaya": {
    type: "Feature",
    properties: { id: "city-surabaya", name: "Kota Surabaya" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [112.6, -7.15],
          [112.85, -7.15],
          [112.85, -7.35],
          [112.6, -7.35],
          [112.6, -7.15]
        ]
      ]
    }
  },
  "city-denpasar": {
    type: "Feature",
    properties: { id: "city-denpasar", name: "Kota Denpasar" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [115.15, -8.55],
          [115.3, -8.55],
          [115.3, -8.75],
          [115.15, -8.75],
          [115.15, -8.55]
        ]
      ]
    }
  }
  // city-makassar intentionally has no geometry to simulate missing boundary scenario
};

export const regions: Region[] = [...provinceRegions, ...regencyRegions];

export function getRegionGeometry(regionId: string): RegionGeoFeature | undefined {
  return regionGeometries[regionId];
}
