export type RegionLevel = "province" | "regency";

export interface Region {
  id: string;
  code: string;
  name: string;
  level: RegionLevel;
  parentId?: string;
}

export interface RegionListParams {
  level?: RegionLevel;
  parent?: string;
}

export interface TrendPoint {
  period: string;
  amount: number;
}

export interface RegionSummary {
  region: Region;
  totalAmount: number;
  cut15Amount: number;
  netAmount: number;
  trend: TrendPoint[];
  monthlyBreakdown: Array<{
    period: string;
    amount: number;
    cut15Amount: number;
    netAmount: number;
  }>;
  lastUpdated: string;
  reportUrl?: string;
}
