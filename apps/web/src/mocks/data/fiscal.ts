import { regions } from "./regions";

// Mock data for FiscalView, RankFin, and DefisitWatch

export interface RankingItem {
  regionId: string;
  regionName: string;
  target: number;
  realization: number;
  percentage: number;
  yoy: number;
  rank: number;
}

export interface SurplusDeficitItem {
  regionId: string;
  regionName: string;
  surplus: number;
  deficit: number;
  ytd: number;
}

export interface AlertItem {
  id: string;
  regionId: string;
  regionName: string;
  date: string;
  type: string;
  riskLevel: "red" | "orange" | "green";
  message: string;
  status: "active" | "resolved";
}

export interface LeagueItem {
  regionId: string;
  regionName: string;
  score: number;
  tier: "gold" | "silver" | "bronze";
  rank: number;
  badges: string[];
}

export interface BadgeItem {
  id: string;
  code: string;
  name: string;
  description: string;
}

export interface WatchlistItem {
  regionId: string;
  regionName: string;
  irf: number;
  category: "red" | "orange" | "green";
  topReason: string;
}

// Mock ranking data
export const mockRanking: RankingItem[] = regions.map((region, index) => ({
  regionId: region.id,
  regionName: region.name,
  target: Math.floor(Math.random() * 1000000000) + 500000000,
  realization: Math.floor(Math.random() * 1000000000) + 400000000,
  percentage: Math.floor(Math.random() * 100) + 50,
  yoy: Math.floor(Math.random() * 20) - 10,
  rank: index + 1
})).sort((a, b) => a.rank - b.rank);

// Mock surplus-deficit data
export const mockSurplusDeficit: SurplusDeficitItem[] = regions.map(region => ({
  regionId: region.id,
  regionName: region.name,
  surplus: Math.floor(Math.random() * 200000000) - 100000000,
  deficit: Math.floor(Math.random() * 200000000) - 100000000,
  ytd: Math.floor(Math.random() * 1000000000)
}));

// Mock alerts
export const mockAlerts: AlertItem[] = [
  {
    id: "1",
    regionId: "city-surabaya",
    regionName: "Surabaya",
    date: "2025-10-17",
    type: "deviation",
    riskLevel: "red",
    message: "Deviasi -12% dari target bulan berjalan",
    status: "active"
  },
  {
    id: "2",
    regionId: "city-jakarta",
    regionName: "Jakarta",
    date: "2025-10-16",
    type: "deficit",
    riskLevel: "orange",
    message: "Defisit meningkat 15% dari bulan lalu",
    status: "active"
  }
];

// Mock league data for RankFin
export const mockLeague: LeagueItem[] = regions.map((region, index) => {
  const rand = Math.random();
  const tier: "gold" | "silver" | "bronze" = rand > 0.7 ? "gold" : rand > 0.4 ? "silver" : "bronze";
  return {
    regionId: region.id,
    regionName: region.name,
    score: Math.floor(Math.random() * 100),
    tier,
    rank: index + 1,
    badges: ["Fast Starter", "Steady Climber"]
  };
}).sort((a, b) => a.rank - b.rank);

// Mock badges
export const mockBadges: BadgeItem[] = [
  { id: "1", code: "fast-starter", name: "Fast Starter", description: "Q1 capai ≥ 30%" },
  { id: "2", code: "steady-climber", name: "Steady Climber", description: "3 bulan berturut-turut naik" },
  { id: "3", code: "efficiency-hero", name: "Efficiency Hero", description: "Rasio belanja modal tinggi dengan realisasi tepat waktu" },
  { id: "4", code: "top-transparency", name: "Top Transparency", description: "Publikasi data rutin" }
];

// Mock watchlist for DefisitWatch
export const mockWatchlist: WatchlistItem[] = regions.slice(0, 10).map(region => ({
  regionId: region.id,
  regionName: region.name,
  irf: Math.floor(Math.random() * 100),
  category: Math.random() > 0.6 ? "red" : Math.random() > 0.3 ? "orange" : "green",
  topReason: "Gap target norm tinggi"
}));

// Helper functions
export function getRanking(jenis: string, period: string, top: number = 20): RankingItem[] {
  return mockRanking.slice(0, top);
}

export function getSurplusDeficit(_periode: string): SurplusDeficitItem[] {
  return mockSurplusDeficit;
}

export function getAlerts(level?: string): AlertItem[] {
  if (level) {
    return mockAlerts.filter(alert => alert.riskLevel === level);
  }
  return mockAlerts;
}

export function getLeague(_periode: string): LeagueItem[] {
  return mockLeague;
}

export function getBadges(regionId: string): BadgeItem[] {
  return mockBadges.filter(badge => mockLeague.find(l => l.regionId === regionId)?.badges.includes(badge.name));
}

export function getWatchlist(_periode: string): WatchlistItem[] {
  return mockWatchlist;
}

export function getRegionDetail(regionId: string) {
  // Mock detail for a region
  return {
    regionId,
    regionName: regions.find(r => r.id === regionId)?.name || "",
    irf: Math.floor(Math.random() * 100),
    category: "red" as const,
    reasons: ["Gap target norm", "Tren negatif", "Kas tipis"],
    projection: {
      target: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
      realization: [90, 180, 270, 350, 430, 510, 590, 670, 750, 830, 910, 990],
      kas: [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0, -5]
    }
  };
}