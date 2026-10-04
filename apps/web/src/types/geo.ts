export interface QuantileBin {
  index: number;
  min: number;
  max: number;
  label: string;
}

export interface LegendRange {
  /** Omitted by the server for public (non-viewer) requests: ranges carry no rupiah. */
  min?: number;
  max?: number;
  label: string;
}

export interface LegendDefinition {
  method: "quantile";
  bins: number[];
  labels: string[];
  ranges: LegendRange[];
}

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
  geometry?: GeoJSON.Geometry | null;
  properties: ChoroplethFeatureProperties;
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
