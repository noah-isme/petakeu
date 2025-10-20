export interface BaseRegion {
  name: string;
  coordinates: [number, number][];
}

export const BASE_REGIONS: BaseRegion[] = [
  {
    name: "DKI Jakarta",
    coordinates: [
      [106.6, -6.3],
      [107.05, -6.3],
      [107.05, -5.95],
      [106.6, -5.95],
      [106.6, -6.3]
    ]
  },
  {
    name: "Banten",
    coordinates: [
      [105.8, -6.8],
      [106.8, -6.8],
      [106.8, -5.7],
      [105.8, -5.7],
      [105.8, -6.8]
    ]
  },
  {
    name: "Jawa Barat",
    coordinates: [
      [106.3, -7.8],
      [109.0, -7.8],
      [109.0, -5.5],
      [106.3, -5.5],
      [106.3, -7.8]
    ]
  },
  {
    name: "Jawa Tengah",
    coordinates: [
      [108.6, -7.8],
      [111.7, -7.8],
      [111.7, -5.5],
      [108.6, -5.5],
      [108.6, -7.8]
    ]
  },
  {
    name: "DI Yogyakarta",
    coordinates: [
      [110.1, -8.1],
      [110.8, -8.1],
      [110.8, -7.5],
      [110.1, -7.5],
      [110.1, -8.1]
    ]
  },
  {
    name: "Jawa Timur",
    coordinates: [
      [111.0, -8.5],
      [114.5, -8.5],
      [114.5, -5.4],
      [111.0, -5.4],
      [111.0, -8.5]
    ]
  }
];
