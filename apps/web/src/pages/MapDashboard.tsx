import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { MapView } from "../components/MapView";
import { Legend } from "../components/Legend";
import { RegionDetailPanel } from "../components/RegionDetailPanel";
import { PeriodSelector } from "../components/filters/PeriodSelector";
import { MapModeToggle } from "../components/filters/MapModeToggle";
import { LeftSidebar } from "../components/LeftSidebar";
import { useChoropleth } from "../hooks/useChoropleth";
import { useRegionSummary } from "../hooks/useRegionSummary";
import { apiClient } from "../api/client";
import { appConfig } from "../config/app";
import { buildUrl } from "../config/api";
import { ChoroplethResponse } from "../types/geo";
import { RegionSummary } from "../types/region";

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

interface RankingItem {
  regionId: string;
  regionName: string;
  target: number;
  realization: number;
  percentage: number;
  yoy: number;
  rank: number;
}

interface SurplusDeficitItem {
  regionId: string;
  regionName: string;
  surplus: number;
  deficit: number;
  ytd: number;
}

interface LeagueItem {
  regionId: string;
  regionName: string;
  score: number;
  tier: "gold" | "silver" | "bronze";
  rank: number;
  badges: string[];
}

interface WatchlistItem {
  regionId: string;
  regionName: string;
  irf: number;
  category: "red" | "orange" | "green";
  topReason: string;
}

interface RegionDetail {
  regionId: string;
  regionName: string;
  irf: number;
  category: "red" | "orange" | "green";
  reasons: string[];
  projection: {
    target: number[];
    realization: number[];
    kas: number[];
  };
}

type TabType = "overview" | "fiscal" | "rankfin" | "defisitwatch";

const classificationLabels = ["Sangat Rendah", "Rendah", "Sedang", "Tinggi", "Sangat Tinggi"];

export function MapDashboard() {
  const [period, setPeriod] = useState("2025-08");
  const [selectedRegionId, setSelectedRegionId] = useState<string | undefined>();
  const [mode, setMode] = useState<"choropleth" | "heat">("choropleth");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [reportPending, setReportPending] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Fiscal data
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [surplusDeficit, setSurplusDeficit] = useState<SurplusDeficitItem[]>([]);

  // RankFin data
  const [league, setLeague] = useState<LeagueItem[]>([]);

  // DefisitWatch data
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<RegionDetail | null>(null);

  const [loading, setLoading] = useState(false);

  const queryClient = useQueryClient();
  const { publicMode } = appConfig;

  const {
    data: choropleth,
    isLoading: isChoroplethLoading,
    isError: isChoroplethError
  } = useChoropleth(period);

  const {
    data: regionSummary,
    isLoading: isSummaryLoading
  } = useRegionSummary(
    {
      regionId: selectedRegionId,
      from: "2025-03",
      to: period
    },
    { enabled: !publicMode }
  );

  useEffect(() => {
    if (!selectedRegionId && (choropleth as ChoroplethResponse)?.features?.length) {
      setSelectedRegionId((choropleth as ChoroplethResponse).features[0].properties.regionId);
    }
  }, [choropleth, selectedRegionId]);

  useEffect(() => {
    const fetchDataForTab = async (tab: TabType) => {
      if (tab === "overview") return;

      setLoading(true);
      try {
        if (tab === "fiscal") {
          const rankingUrl = buildUrl(`/rank?jenis=pendapatan&period=${period}&top=20`);
          const surplusUrl = buildUrl(`/surplus-defisit?periode=${period}`);
          const [rankingRes, surplusRes] = await Promise.all([
            fetchJson<{ data: RankingItem[] }>(rankingUrl),
            fetchJson<{ data: SurplusDeficitItem[] }>(surplusUrl)
          ]);
          setRanking(rankingRes.data);
          setSurplusDeficit(surplusRes.data);
        } else if (tab === "rankfin") {
          const leagueUrl = buildUrl(`/rankfin/league?periode=${period}`);
          const res = await fetchJson<{ data: LeagueItem[] }>(leagueUrl);
          setLeague(res.data);
        } else if (tab === "defisitwatch") {
          const watchlistUrl = buildUrl(`/defisitwatch/watchlist?periode=${period}`);
          const res = await fetchJson<{ data: WatchlistItem[] }>(watchlistUrl);
          setWatchlist(res.data);
        }
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDataForTab(activeTab);
  }, [period, activeTab]);

  const fetchRegionDetail = async (regionId: string) => {
    try {
      const detailUrl = buildUrl(`/defisitwatch/daerah/${regionId}/penjelasan`);
      const res = await fetchJson<{ data: RegionDetail }>(detailUrl);
      setSelectedRegion(res.data);
    } catch (error) {
      console.error("Failed to fetch region detail", error);
    }
  };

  const legendStops = useMemo(() => (choropleth as ChoroplethResponse)?.metadata?.legend ?? [], [choropleth]);
  const selectedFeature = (choropleth as ChoroplethResponse)?.features?.find((feature) => feature.properties.regionId === selectedRegionId);
  const warnings = (choropleth as ChoroplethResponse)?.metadata?.warnings ?? [];
  const classificationLabel = selectedFeature
    ? `Kelas ${selectedFeature.properties.quantileIndex + 1} · ${classificationLabels[selectedFeature.properties.quantileIndex] ?? ""}`
    : undefined;

  const handleDownloadReport = async () => {
    if (!regionSummary || publicMode) return;
    setReportPending(true);
    try {
      const jobId = await apiClient.createReport({
        regionId: (regionSummary as RegionSummary).region.id,
        periodFrom: "2025-01",
        periodTo: period,
        type: "pdf"
      });
      setStatusMessage(`Laporan dalam antrean. ID job: ${jobId}`);
      queryClient.invalidateQueries({ queryKey: ["report-jobs"] }).catch(() => undefined);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Gagal membuat laporan");
    } finally {
      setReportPending(false);
    }
  };

  useEffect(() => {
    setStatusMessage(null);
  }, [period, selectedRegionId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "gold": return "bg-yellow-400";
      case "silver": return "bg-gray-400";
      case "bronze": return "bg-orange-600";
      default: return "bg-gray-200";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "red": return "bg-red-500";
      case "orange": return "bg-orange-500";
      case "green": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  const getCategoryText = (category: string) => {
    switch (category) {
      case "red": return "Merah";
      case "orange": return "Orange";
      case "green": return "Hijau";
      default: return "Unknown";
    }
  };

  const sidebarItems = [
    { id: "overview" as TabType, label: "Peta Keuangan", description: "Visualisasi Setoran", icon: "map" },
    { id: "fiscal" as TabType, label: "Dashboard Keuangan", description: "KPI & Ranking", icon: "chart" },
    { id: "rankfin" as TabType, label: "RankFin", description: "Gamifikasi Kinerja", icon: "trophy" },
    { id: "defisitwatch" as TabType, label: "DefisitWatch", description: "Early Warning", icon: "alert" }
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Left Sidebar */}
      <div className="flex-shrink-0">
        <LeftSidebar
          activeTab={activeTab}
          onTabChange={(tabId) => setActiveTab(tabId as TabType)}
          items={sidebarItems}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-gray-900 truncate">
                {sidebarItems.find(item => item.id === activeTab)?.label}
              </h1>
              <p className="text-sm text-gray-600 mt-1 truncate">
                {sidebarItems.find(item => item.id === activeTab)?.description}
              </p>
            </div>
            <div className="flex items-center space-x-4 ml-4 flex-shrink-0">
              <PeriodSelector value={period} onChange={setPeriod} />
              {activeTab === "overview" && (
                <MapModeToggle mode={mode} onChange={setMode} />
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6 space-y-6">
            {/* Overview Tab - Original Map Dashboard */}
            {activeTab === "overview" && (
              <>
                <section className="map-card bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                  <div className="map-wrapper" aria-busy={isChoroplethLoading}>
                    {isChoroplethLoading && <div className="map-overlay">Memuat peta…</div>}
                    {isChoroplethError && <div className="map-overlay error">Gagal memuat data peta.</div>}
                    <MapView
                      choropleth={choropleth as ChoroplethResponse}
                      selectedRegionId={selectedRegionId}
                      onRegionSelect={setSelectedRegionId}
                      mode={mode}
                      publicMode={publicMode}
                    />
                  </div>
                  <Legend stops={legendStops} />
                </section>
                {warnings.length > 0 && (
                  <div className="alert-warning bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6" role="status" aria-live="assertive">
                    <strong className="text-yellow-800">Perhatian:</strong>
                    <ul className="mt-2 text-yellow-700">
                      {warnings.map((warning: string) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <RegionDetailPanel
                  summary={regionSummary as RegionSummary}
                  isLoading={isSummaryLoading && !publicMode}
                  onDownloadReport={handleDownloadReport}
                  publicMode={publicMode}
                  classificationLabel={classificationLabel}
                  reportPending={reportPending}
                  regionName={selectedFeature?.properties.name}
                />
                {statusMessage && (
                  <div className="status-banner bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6" role="status" aria-live="polite">
                    {statusMessage}
                  </div>
                )}
              </>
            )}

            {/* Fiscal Tab */}
            {activeTab === "fiscal" && (
              <div className="space-y-6">
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Memuat data...</p>
                  </div>
                ) : (
                  <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center">
                          <div className="p-3 bg-green-100 rounded-lg">
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                          </div>
                          <div className="ml-4">
                            <h3 className="text-lg font-semibold text-gray-900">Total Realisasi</h3>
                            <p className="text-2xl font-bold text-green-600">
                              {formatCurrency(ranking.reduce((sum, item) => sum + item.realization, 0))}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center">
                          <div className="p-3 bg-blue-100 rounded-lg">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </div>
                          <div className="ml-4">
                            <h3 className="text-lg font-semibold text-gray-900">Rata-rata Capai</h3>
                            <p className="text-2xl font-bold text-blue-600">
                              {ranking.length > 0 ? (ranking.reduce((sum, item) => sum + item.percentage, 0) / ranking.length).toFixed(1) : 0}%
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center">
                          <div className="p-3 bg-purple-100 rounded-lg">
                            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                          </div>
                          <div className="ml-4">
                            <h3 className="text-lg font-semibold text-gray-900">Surplus/Defisit Total</h3>
                            <p className="text-2xl font-bold text-purple-600">
                              {formatCurrency(surplusDeficit.reduce((sum, item) => sum + item.surplus - item.deficit, 0))}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Map and Ranking */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Map Placeholder */}
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h2 className="text-xl font-semibold mb-4 text-gray-900">Peta Surplus/Defisit</h2>
                        <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                          <div className="text-center">
                            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                            <p className="text-gray-500">Peta akan ditampilkan di sini</p>
                          </div>
                        </div>
                      </div>

                      {/* Ranking Table */}
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h2 className="text-xl font-semibold mb-4 text-gray-900">Ranking Penerimaan</h2>
                        <div className="overflow-x-auto">
                          <table className="min-w-full table-auto">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Daerah</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Realisasi</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">% Capai</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">YoY %</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {ranking.slice(0, 10).map((item) => (
                                <tr key={item.regionId} className="hover:bg-gray-50">
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                        <span className="text-sm font-medium text-blue-600">{item.rank}</span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.regionName}</td>
                                  <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatCurrency(item.target)}</td>
                                  <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatCurrency(item.realization)}</td>
                                  <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-medium text-green-600">{item.percentage}%</td>
                                  <td className={`px-4 py-4 whitespace-nowrap text-sm text-right font-medium ${
                                    item.yoy >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {item.yoy >= 0 ? '+' : ''}{item.yoy}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Export Button */}
                    <div className="text-center">
                      <button
                        className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Ekspor ke Excel/PDF
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* RankFin Tab */}
            {activeTab === "rankfin" && (
              <div className="space-y-6">
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Memuat data...</p>
                  </div>
                ) : (
                  <>
                    {/* League Tiers */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Gold */}
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center mb-4">
                          <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
                            <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">Gold League</h2>
                            <p className="text-sm text-gray-600">Prestasi Tertinggi</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {league.filter(item => item.tier === "gold").map((item) => (
                            <div key={item.regionId} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                              <div className="flex items-center">
                                <div className="w-8 h-8 bg-yellow-200 rounded-full flex items-center justify-center mr-3">
                                  <span className="text-sm font-medium text-yellow-800">{item.rank}</span>
                                </div>
                                <span className="font-medium text-gray-900">{item.regionName}</span>
                              </div>
                              <span className="text-sm font-medium text-yellow-700">Score: {item.score}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Silver */}
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center mb-4">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
                            <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">Silver League</h2>
                            <p className="text-sm text-gray-600">Prestasi Baik</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {league.filter(item => item.tier === "silver").map((item) => (
                            <div key={item.regionId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="flex items-center">
                                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                                  <span className="text-sm font-medium text-gray-800">{item.rank}</span>
                                </div>
                                <span className="font-medium text-gray-900">{item.regionName}</span>
                              </div>
                              <span className="text-sm font-medium text-gray-700">Score: {item.score}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bronze */}
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center mb-4">
                          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                            <svg className="w-6 h-6 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">Bronze League</h2>
                            <p className="text-sm text-gray-600">Perlu Perbaikan</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {league.filter(item => item.tier === "bronze").map((item) => (
                            <div key={item.regionId} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
                              <div className="flex items-center">
                                <div className="w-8 h-8 bg-orange-200 rounded-full flex items-center justify-center mr-3">
                                  <span className="text-sm font-medium text-orange-800">{item.rank}</span>
                                </div>
                                <span className="font-medium text-gray-900">{item.regionName}</span>
                              </div>
                              <span className="text-sm font-medium text-orange-700">Score: {item.score}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Full Ranking Table */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                      <h2 className="text-xl font-bold mb-4 text-gray-900">Ranking Lengkap</h2>
                      <div className="overflow-x-auto">
                        <table className="min-w-full table-auto">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Daerah</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Badges</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {league.map((item) => (
                              <tr key={item.regionId} className="hover:bg-gray-50">
                                <td className="px-4 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                      item.tier === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                                      item.tier === 'silver' ? 'bg-gray-100 text-gray-800' :
                                      'bg-orange-100 text-orange-800'
                                    }`}>
                                      {item.rank}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.regionName}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-center">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    item.tier === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                                    item.tier === 'silver' ? 'bg-gray-100 text-gray-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    <span className={`w-2 h-2 rounded-full mr-1.5 ${
                                      item.tier === 'gold' ? 'bg-yellow-400' :
                                      item.tier === 'silver' ? 'bg-gray-400' :
                                      'bg-orange-400'
                                    }`}></span>
                                    {item.tier.charAt(0).toUpperCase() + item.tier.slice(1)}
                                  </span>
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">{item.score}</td>
                                <td className="px-4 py-4 whitespace-nowrap">
                                  <div className="flex flex-wrap gap-1">
                                    {item.badges.map((badge, index) => (
                                      <span key={index} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                        {badge}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Share Button */}
                    <div className="text-center">
                      <button
                        className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                        </svg>
                        Bagikan Ranking
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* DefisitWatch Tab */}
            {activeTab === "defisitwatch" && (
              <div className="space-y-6">
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Memuat data...</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Watchlist */}
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center mb-6">
                          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mr-3">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">Watchlist Risiko</h2>
                            <p className="text-sm text-gray-600">Daerah dengan potensi defisit</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {watchlist.map((item) => (
                            <div
                              key={item.regionId}
                              className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors duration-200 border-l-4"
                              style={{ borderLeftColor: item.category === 'red' ? '#ef4444' : item.category === 'orange' ? '#f97316' : '#22c55e' }}
                              onClick={() => fetchRegionDetail(item.regionId)}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-gray-900">{item.regionName}</h3>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  item.category === 'red' ? 'bg-red-100 text-red-800' :
                                  item.category === 'orange' ? 'bg-orange-100 text-orange-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {getCategoryText(item.category)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-600">IRF: <span className="font-medium">{item.irf}</span></p>
                                <p className="text-sm text-gray-500">{item.topReason}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Region Detail */}
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        {selectedRegion ? (
                          <>
                            <div className="flex items-center mb-6">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 ${
                                selectedRegion.category === 'red' ? 'bg-red-100' :
                                selectedRegion.category === 'orange' ? 'bg-orange-100' :
                                selectedRegion.category === 'green' ? 'bg-green-100' :
                                'bg-green-100'
                              }`}>
                                <svg className={`w-6 h-6 ${
                                  selectedRegion.category === 'red' ? 'text-red-600' :
                                  selectedRegion.category === 'orange' ? 'text-orange' :
                                  'text-green-600'
                                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div>
                                <h2 className="text-xl font-bold text-gray-900">Detail {selectedRegion.regionName}</h2>
                                <p className="text-sm text-gray-600">Analisis risiko defisit</p>
                              </div>
                            </div>
                            <div className="space-y-4 mb-6">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                  <div className="text-sm text-gray-600">IRF Score</div>
                                  <div className="text-2xl font-bold text-gray-900">{selectedRegion.irf}</div>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                  <div className="text-sm text-gray-600">Kategori</div>
                                  <div className={`text-lg font-bold ${
                                    selectedRegion.category === 'red' ? 'text-red-600' :
                                    selectedRegion.category === 'orange' ? 'text-orange-600' :
                                    'text-green-600'
                                  }`}>
                                    {getCategoryText(selectedRegion.category)}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mb-6">
                              <h3 className="font-semibold text-gray-900 mb-3">Alasan Utama Risiko:</h3>
                              <ul className="space-y-2">
                                {selectedRegion.reasons.map((reason, index) => (
                                  <li key={index} className="flex items-start">
                                    <svg className="w-5 h-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-sm text-gray-700">{reason}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Simple Chart Placeholder */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                              <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="font-semibold text-gray-900 mb-3">Proyeksi Target vs Realisasi</h3>
                                <div className="h-32 bg-white rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
                                  <p className="text-sm text-gray-500">Grafik akan ditampilkan di sini</p>
                                </div>
                              </div>
                              <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="font-semibold text-gray-900 mb-3">Saldo Kas</h3>
                                <div className="h-32 bg-white rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
                                  <p className="text-sm text-gray-500">Grafik kas akan ditampilkan di sini</p>
                                </div>
                              </div>
                            </div>

                            <button
                              className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
                            >
                              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                              Kirim Peringatan
                            </button>
                          </>
                        ) : (
                          <div className="h-full flex items-center justify-center py-12">
                            <div className="text-center">
                              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <h3 className="text-lg font-medium text-gray-900 mb-2">Pilih Daerah</h3>
                              <p className="text-gray-500">Klik daerah dari watchlist untuk melihat detail risiko</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Test Alert Button */}
                    <div className="text-center">
                      <button
                        className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.914 4.914L9 9m0 0l-5 5h5V9z" />
                        </svg>
                        Test Kirim Alert
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
