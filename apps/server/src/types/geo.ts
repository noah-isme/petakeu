export interface ChoroplethFeatureProperties {
  regionId: string;
  name: string;
  totalAmount: number;
  cut15Amount: number;
  trendSparkline: number[];
  centroid: [number, number];
  quantileIndex: number;
}

export interface ChoroplethFeature {
  type: "Feature";
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
  properties: ChoroplethFeatureProperties;
}

export interface ChoroplethResponse {
  type: "FeatureCollection";
  features: ChoroplethFeature[];
  metadata: {
    period: string;
    legend: number[];
    classification: "quantile";
  };
}
