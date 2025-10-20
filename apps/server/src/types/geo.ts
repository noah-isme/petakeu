export interface ChoroplethFeatureProperties {
  regionId: string;
  name: string;
  centroid: [number, number];
  classIndex: number;
  classLabel: string;
  value?: number;
  normalizedValue?: number;
  sparkline?: number[];
}

export interface ChoroplethFeature {
  type: "Feature";
  id: string;
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
  properties: ChoroplethFeatureProperties;
}

export interface QuantileBin {
  index: number;
  min: number;
  max: number;
  label: string;
}

export interface LegendRange {
  min: number;
  max: number;
  label: string;
}

export interface LegendDefinition {
  method: "quantile";
  bins: number[];
  labels: string[];
  ranges: LegendRange[];
}

export interface ChoroplethResponse {
  type: "FeatureCollection";
  features: ChoroplethFeature[];
  metadata: {
    period: string;
    legend: LegendDefinition;
    public: boolean;
    warnings?: string[];
    scenario?: string;
  };
}
