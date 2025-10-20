import { addMonths, format } from "date-fns";

import { regions } from "./regions";

export interface PaymentRecord {
  regionId: string;
  period: string;
  amount: number;
}

export interface ScenarioDataset {
  key: string;
  payments: PaymentRecord[];
  warnings?: string[];
  defaultPeriod: string;
}

const PERIOD_START = new Date("2024-09-01T00:00:00Z");
const PERIODS = Array.from({ length: 12 }, (_, index) => format(addMonths(PERIOD_START, index), "yyyy-MM"));

const baseSeries: Record<string, number[]> = {
  "city-jakarta": [80, 82, 84, 85, 87, 88, 90, 92, 93, 95, 97, 100].map((value) => value * 1_000_000),
  "city-bandung": [38, 39, 40, 41, 42, 43, 43.5, 44, 45, 45.5, 46, 47].map((value) => value * 1_000_000),
  "city-semarang": [32, 33, 34, 34.5, 35, 36, 37, 37.5, 38, 38.5, 39, 40].map((value) => value * 1_000_000),
  "city-surabaya": [58, 59, 60, 61, 62, 63, 64, 64.5, 65, 66, 67, 68].map((value) => value * 1_000_000),
  "city-denpasar": [18, 18.5, 19, 19.5, 20, 20.5, 21, 21.5, 22, 22.5, 23, 24].map((value) => value * 1_000_000),
  "city-makassar": [28, 28.5, 29, 29.5, 30, 30.5, 31, 31.5, 32, 32.5, 33, 34].map((value) => value * 1_000_000)
};

function applySpike(series: Record<string, number[]>) {
  const result: Record<string, number[]> = {};
  for (const [regionId, values] of Object.entries(series)) {
    result[regionId] = [...values];
  }
  // Index 11 corresponds to 2025-08 in PERIODS array
  const spikeIndex = PERIODS.length - 1;
  result["city-surabaya"][spikeIndex] = 155_000_000;
  result["city-jakarta"][spikeIndex] = 180_000_000;
  return result;
}

function buildRecords(series: Record<string, number[]>): PaymentRecord[] {
  const records: PaymentRecord[] = [];
  for (const [regionId, values] of Object.entries(series)) {
    values.forEach((amount, index) => {
      records.push({
        regionId,
        period: PERIODS[index],
        amount
      });
    });
  }
  return records;
}

const scenarioCache = new Map<string, ScenarioDataset>();

function createScenario(key: string): ScenarioDataset {
  switch (key) {
    case "spike": {
      const records = buildRecords(applySpike(baseSeries));
      return {
        key: "spike",
        payments: records,
        defaultPeriod: PERIODS[PERIODS.length - 1]
      };
    }
    case "missing-geometry": {
      const records = buildRecords(baseSeries);
      return {
        key: "missing-geometry",
        payments: records,
        warnings: [
          "Makassar tidak memiliki boundary spasial, data diabaikan dari peta namun tetap tersedia dalam ringkasan."
        ],
        defaultPeriod: PERIODS[PERIODS.length - 1]
      };
    }
    case "normal":
    default: {
      const records = buildRecords(baseSeries);
      return {
        key: "normal",
        payments: records,
        defaultPeriod: PERIODS[PERIODS.length - 1]
      };
    }
  }
}

export function getScenarioDataset(key: string): ScenarioDataset {
  if (!scenarioCache.has(key)) {
    scenarioCache.set(key, createScenario(key));
  }
  return scenarioCache.get(key)!;
}

export function getPaymentsByRegion(dataset: ScenarioDataset, regionId: string) {
  return dataset.payments.filter((record) => record.regionId === regionId);
}

export function getPaymentsByPeriod(dataset: ScenarioDataset, period: string) {
  return dataset.payments.filter((record) => record.period === period);
}

export function getPeriods(dataset?: ScenarioDataset) {
  if (dataset) {
    return Array.from(new Set(dataset.payments.map((record) => record.period))).sort();
  }
  return [...PERIODS];
}

export const allRegions = regions;
