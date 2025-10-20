import { randomUUID } from "node:crypto";

import { Region, RegionListParams, RegionSummary, TrendPoint } from "../types/region";
import { AppError } from "../utils/app-error";

export const mockRegions: Region[] = [
  { id: "prov-33", code: "33", name: "Jawa Tengah", level: "province" },
  { id: "prov-31", code: "31", name: "DKI Jakarta", level: "province" },
  { id: "kab-3372", code: "3372", name: "Kota Semarang", level: "regency", parentId: "prov-33" },
  { id: "kab-3315", code: "3315", name: "Kab. Kudus", level: "regency", parentId: "prov-33" },
  { id: "kab-3171", code: "3171", name: "Kota Jakarta Selatan", level: "regency", parentId: "prov-31" }
];

function generateTrend(periods = 6): TrendPoint[] {
  const now = new Date("2025-08-01");
  const points: TrendPoint[] = [];

  for (let i = periods - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setMonth(now.getMonth() - i);
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const amount = Math.round(10_000_000 + Math.random() * 25_000_000);
    points.push({ period, amount });
  }

  return points;
}

export async function listRegions(params: RegionListParams): Promise<Region[]> {
  const { level, parent } = params;

  return mockRegions.filter((region) => {
    if (level && region.level !== level) {
      return false;
    }
    if (parent && region.parentId !== parent) {
      return false;
    }
    return true;
  });
}

export async function getRegionSummary(regionId: string, range?: { from?: string; to?: string }): Promise<RegionSummary> {
  const region = mockRegions.find((item) => item.id === regionId);
  if (!region) {
    throw new AppError("Region not found", 404);
  }

  const trend = generateTrend(range?.to ? 12 : 6);
  const monthlyBreakdown = trend.map((point) => {
    const cut15Amount = point.amount * 0.15;
    return {
      period: point.period,
      amount: point.amount,
      cut15Amount,
      netAmount: point.amount - cut15Amount
    };
  });

  const totalAmount = monthlyBreakdown.reduce((acc, entry) => acc + entry.amount, 0);
  const cut15Amount = totalAmount * 0.15;
  const netAmount = totalAmount - cut15Amount;

  return {
    region,
    totalAmount,
    cut15Amount,
    netAmount,
    trend,
    monthlyBreakdown,
    lastUpdated: new Date().toISOString(),
    reportUrl: `https://object-storage.local/reports/${randomUUID()}.pdf`
  };
}

export const regionService = {
  listRegions,
  getRegionSummary
};
