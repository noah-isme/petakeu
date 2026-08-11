import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  BarChart3,
  Users,
  UploadCloud,
  Info,
  Settings,
  HelpCircle,
  LogOut,
  FileText,
  Map as MapIcon,
  ShieldCheck
} from "lucide-react";

import { AppLayout } from "./layouts/AppLayout";
import { Sidebar, type SidebarItem } from "./components/dashboard/Sidebar";
import { Topbar } from "./components/dashboard/Topbar";
import { type LegendItem } from "./components/dashboard/LegendCard";
import { ToastContainer, type ToastKind, type ToastMessage } from "./components/dashboard/ToastContainer";
import { MapPage, type MapStatus, type RegionStat } from "./pages/MapPage";
import { UploadPage, type UploadState } from "./pages/UploadPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AboutPage } from "./pages/AboutPage";
import { AuditLogInspector } from "./components/admin/AuditLogInspector";
import { BASE_REGIONS } from "./data/regions";
import { formatCurrency } from "./lib/format";
import { useAdminAccess } from "./lib/auth";

import type { FeatureCollection } from "geojson";

const NAVIGATION: SidebarItem[] = [
  { key: "map", label: "Peta Heatmap", icon: MapIcon, section: "analysis" },
  { key: "analytics", label: "Analitik Eksekutif", icon: BarChart3, section: "analysis" },
  { key: "reports", label: "Ringkasan Laporan", icon: FileText, section: "analysis" },
  { key: "upload", label: "Unggah Data Excel", icon: UploadCloud, section: "tools" },
  { key: "about", label: "Tentang Petakeu", icon: Info, section: "tools" }
];

const PAGE_TITLE: Record<string, string> = {
  map: "Peta Heatmap & Visualisasi Spasial",
  analytics: "Analitik Eksekutif & Kepatuhan Pelaporan",
  reports: "Ringkasan Laporan Revenue & Ekspor",
  upload: "Unggah Data Excel (Validasi & Bulk Upsert)",
  about: "Tentang Petakeu — Telemetri & PostGIS",
  audit: "Audit Trail — Kepatuhan & Governance"
};

const MAP_PALETTE = ["#0f4c5c", "#10b981", "#06b6d4", "#f59e0b"] as const;

const PERIOD_DATA: Record<
  string,
  |
    { status: "success"; values: Record<string, number> }
  | { status: Exclude<MapStatus, "success">; values?: undefined }
> = {
  "2024-Q3": {
    status: "success",
    values: {
      "DKI Jakarta": 2150000000,
      Banten: 1450000000,
      "Jawa Barat": 3125000000,
      "Jawa Tengah": 2540000000,
      "DI Yogyakarta": 980000000,
      "Jawa Timur": 3340000000,
      Bali: 1890000000,
      Lampung: 1240000000
    }
  },
  "2024-Q2": {
    status: "success",
    values: {
      "DKI Jakarta": 1980000000,
      Banten: 1310000000,
      "Jawa Barat": 2860000000,
      "Jawa Tengah": 2400000000,
      "DI Yogyakarta": 890000000,
      "Jawa Timur": 3180000000,
      Bali: 1720000000,
      Lampung: 1150000000
    }
  },
  "2024-Q1": {
    status: "success",
    values: {
      "DKI Jakarta": 1750000000,
      Banten: 1120000000,
      "Jawa Barat": 2600000000,
      "Jawa Tengah": 2200000000,
      "DI Yogyakarta": 820000000,
      "Jawa Timur": 3050000000,
      Bali: 1550000000,
      Lampung: 1050000000
    }
  },
  "2023-Q4": {
    status: "empty"
  },
  "2023-Q3": {
    status: "error"
  }
};

const PERIOD_OPTIONS = Object.keys(PERIOD_DATA);

function buildFeatureCollection(values: Record<string, number>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: BASE_REGIONS.map((region) => ({
      type: "Feature",
      properties: {
        name: region.name,
        value: values[region.name] ?? 0
      },
      geometry: {
        type: "Polygon",
        coordinates: [region.coordinates]
      }
    }))
  };
}

function getQuantile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * quantile;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function buildLegend(featureCollection: FeatureCollection): LegendItem[] {
  const values = featureCollection.features.map((feature) => (feature.properties?.value as number) ?? 0);
  if (!values.length) return [];
  const min = Math.min(...values);
  const q25 = getQuantile(values, 0.25);
  const q50 = getQuantile(values, 0.5);
  const q75 = getQuantile(values, 0.75);
  const max = Math.max(...values);

  const ranges: [number, number][] = [
    [min, q25],
    [q25, q50],
    [q50, q75],
    [q75, max]
  ];

  return ranges.map((range, index) => ({
    label: `${formatCurrency(range[0])} - ${formatCurrency(range[1])}`,
    color: MAP_PALETTE[index] ?? MAP_PALETTE[MAP_PALETTE.length - 1],
    range
  }));
}

const initialUploadState: UploadState = {
  file: null,
  status: "idle",
  progress: 0,
  summary: null,
  isDragging: false
};

export default function App() {
  const { isAdmin } = useAdminAccess();
  const [activePage, setActivePage] = useState<string>("map");
  const [selectedPeriod, setSelectedPeriod] = useState<string>(PERIOD_OPTIONS[0]);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [featureCollection, setFeatureCollection] = useState<FeatureCollection | null>(null);
  const [legendItems, setLegendItems] = useState<LegendItem[]>([]);
  const [legendHighlight, setLegendHighlight] = useState<LegendItem | null>(null);
  const [activeRegion, setActiveRegion] = useState<RegionStat | null>(null);

  const [uploadState, setUploadState] = useState<UploadState>(initialUploadState);
  const uploadTimerRef = useRef<number | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimers = useRef(new Map<string, number>());

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const navigation = useMemo<SidebarItem[]>(
    () => (isAdmin ? [...NAVIGATION, { key: "audit", label: "Audit Trail", icon: ShieldCheck, section: "tools" }] : NAVIGATION),
    [isAdmin]
  );

  useEffect(() => {
    if (!isAdmin && activePage === "audit") {
      setActivePage("map");
    }
  }, [activePage, isAdmin]);

  const addToast = useCallback((kind: ToastKind, message: string) => {
    const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, kind, message }]);
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      toastTimers.current.delete(id);
    }, 4200);
    toastTimers.current.set(id, timeoutId);
  }, []);

  useEffect(() => {
    setMapStatus("loading");
    setLegendItems([]);
    setFeatureCollection(null);

    const timer = window.setTimeout(() => {
      const periodEntry = PERIOD_DATA[selectedPeriod];
      if (!periodEntry) {
        setMapStatus("error");
        return;
      }

      if (periodEntry.status === "success") {
        const features = buildFeatureCollection(periodEntry.values);
        setFeatureCollection(features);
        setLegendItems(buildLegend(features));
        setMapStatus("success");
      } else if (periodEntry.status === "empty") {
        setMapStatus("empty");
        addToast("info", "Belum ada data untuk periode ini.");
      } else {
        setMapStatus("error");
        addToast("error", "Gagal memuat data periode.");
      }
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedPeriod, addToast]);

  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      timers.forEach((timeoutId) => window.clearTimeout(timeoutId));
      if (uploadTimerRef.current) {
        window.clearInterval(uploadTimerRef.current);
      }
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    if (toastTimers.current.has(id)) {
      window.clearTimeout(toastTimers.current.get(id));
      toastTimers.current.delete(id);
    }
  }, []);

  const handleRegionFocus = useCallback((region: RegionStat | null) => {
    setActiveRegion(region);
  }, []);

  const handleSelectFile = useCallback(
    (selectedFile: File) => {
      const validExtensions = [".xlsx", ".xls", ".csv"];
      const isExtensionValid = validExtensions.some((ext) => selectedFile.name.toLowerCase().endsWith(ext));

      if (!isExtensionValid) {
        addToast("error", "File tidak valid. Gunakan template Excel atau CSV.");
        setUploadState((prev) => ({
          ...prev,
          file: null,
          status: "idle",
          progress: 0,
          summary: null
        }));
        return;
      }

      // Synchronous status update for deterministic React state rendering
      setUploadState({
        file: selectedFile,
        status: "success",
        progress: 100,
        summary: {
          validRows: 172,
          invalidRows: 14
        },
        isDragging: false
      });

      addToast("success", "Unggah berhasil diproses.");
    },
    [addToast]
  );

  const handleUploadReset = useCallback(() => {
    if (uploadTimerRef.current) {
      window.clearInterval(uploadTimerRef.current);
      uploadTimerRef.current = null;
    }
    setUploadState(initialUploadState);
    addToast("info", "Formulir unggah berhasil direset.");
  }, [addToast]);

  const totalValue = useMemo(() => {
    if (!featureCollection) return 0;
    return featureCollection.features.reduce((acc, feat) => acc + ((feat.properties?.value as number) ?? 0), 0);
  }, [featureCollection]);

  const reportsMetrics = useMemo(
    () => [
      {
        title: "Total Wilayah",
        value: "38 Provinsi",
        change: "Terverifikasi BPS"
      },
      {
        title: "Total Nominal",
        value: mapStatus === "success" ? formatCurrency(totalValue) : "-",
        change: "+5.2% YoY",
        trendDirection: "up" as const,
        trendData:
          mapStatus === "success"
            ? [
                { name: "2024-Q1", value: totalValue * 0.85 },
                { name: "2024-Q2", value: totalValue * 0.92 },
                { name: "2024-Q3", value: totalValue }
              ]
            : undefined
      },
      {
        title: "Kenaikan Bulanan",
        value: mapStatus === "success" ? formatCurrency(Math.round(totalValue * 0.04)) : "-",
        change: "+3.8% MoM",
        trendDirection: "up" as const
      },
      {
        title: "Potongan Wajib 15% Pemda",
        value: mapStatus === "success" ? formatCurrency(Math.round(totalValue * 0.15)) : "-",
        change: "+3.8% MoM",
        trendDirection: "up" as const
      }
    ],
    [mapStatus, totalValue]
  );

  const renderPage = () => {
    switch (activePage) {
      case "map":
        return (
          <MapPage
            status={mapStatus}
            featureCollection={featureCollection}
            legend={legendItems}
            legendHighlight={legendHighlight}
            activeRegion={activeRegion}
            onRegionFocus={handleRegionFocus}
            onHoverLegend={setLegendHighlight}
            onRetry={() => setSelectedPeriod("2024-Q3")}
          />
        );
      case "analytics":
        return <AnalyticsPage period={selectedPeriod} />;
      case "upload":
        return (
          <UploadPage
            state={uploadState}
            onSelectFile={handleSelectFile}
            onReset={handleUploadReset}
            onDragStateChange={(dragging) => setUploadState((prev) => ({ ...prev, isDragging: dragging }))}
          />
        );
      case "reports":
      case "calendar":
      case "team":
        return <ReportsPage metrics={reportsMetrics} />;
      case "audit":
        return isAdmin ? <AuditLogInspector /> : null;
      case "about":
      case "help":
      case "settings":
        return <AboutPage />;
      default:
        return (
          <MapPage
            status={mapStatus}
            featureCollection={featureCollection}
            legend={legendItems}
            legendHighlight={legendHighlight}
            activeRegion={activeRegion}
            onRegionFocus={handleRegionFocus}
            onHoverLegend={setLegendHighlight}
            onRetry={() => setSelectedPeriod("2024-Q3")}
          />
        );
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 transition-colors selection:bg-emerald-500/30 selection:text-emerald-300">
      <AppLayout
        sidebar={
          <div className="hidden lg:block h-full" data-testid="desktop-sidebar-wrapper">
            <Sidebar
              items={navigation}
              activeKey={activePage}
              onSelect={setActivePage}
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
            />
          </div>
        }
        topbar={
          <Topbar
            title={PAGE_TITLE[activePage]}
            period={selectedPeriod}
            periods={PERIOD_OPTIONS}
            onPeriodChange={setSelectedPeriod}
            onOpenSettings={() => addToast("info", "Panel pengaturan akan tersedia segera.")}
            onToggleSidebar={() => setMobileSidebarOpen((prev) => !prev)}
            isMobileSidebarOpen={mobileSidebarOpen}
          />
        }
      >
        <div className="relative h-full w-full overflow-hidden">
          {mobileSidebarOpen && (
            <div className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-md lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
          )}
          <div
            data-testid="mobile-sidebar-drawer"
            className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-slate-800 bg-slate-950 text-slate-100 shadow-2xl transition-transform lg:hidden ${
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <Sidebar
              items={navigation}
              activeKey={activePage}
              onSelect={(key) => {
                setActivePage(key);
                setMobileSidebarOpen(false);
              }}
              collapsed={false}
              onCollapsedChange={() => setMobileSidebarOpen(false)}
            />
          </div>
          {renderPage()}
        </div>
      </AppLayout>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
