export interface ChoroplethFeatureProperties {
  regionId: string;
  name: string;
  centroid: [number, number];
  quantileIndex: number;
  classLabel?: string;
  totalAmount?: number;
  cut15Amount?: number;
  trendSparkline?: number[];
}

export interface ChoroplethFeature {
  type: "Feature";
  geometry?: GeoJSON.Geometry | null;
  properties: ChoroplethFeatureProperties;
}

export interface ChoroplethResponse {
  type: "FeatureCollection";
  features: ChoroplethFeature[];
  metadata: {
    period: string;
    legend: Array<number | string>;
    classification: "quantile";
    warnings?: string[];
    scenario?: string;
    public?: boolean;
  };
}
