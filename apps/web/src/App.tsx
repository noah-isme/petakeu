import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Info, Map as MapIcon, UploadCloud } from "lucide-react";

import { AppLayout } from "./layouts/AppLayout";
import { Sidebar, type SidebarItem } from "./components/dashboard/Sidebar";
import { Topbar } from "./components/dashboard/Topbar";
import { LegendCard, type LegendItem } from "./components/dashboard/LegendCard";
import { InfoCard } from "./components/dashboard/InfoCard";
import { ToastContainer, type ToastKind, type ToastMessage } from "./components/dashboard/ToastContainer";
import { MapPage, type MapStatus, type RegionStat } from "./pages/MapPage";
import { UploadPage, type UploadState } from "./pages/UploadPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AboutPage } from "./pages/AboutPage";
import { BASE_REGIONS } from "./data/regions";
import { formatCurrency } from "./lib/format";

import type { FeatureCollection } from "geojson";

const NAVIGATION: SidebarItem[] = [
  { key: "map", label: "Peta", icon: MapIcon },
  { key: "upload", label: "Unggah", icon: UploadCloud },
  { key: "reports", label: "Laporan", icon: FileText },
  { key: "about", label: "Tentang", icon: Info }
];

const PAGE_TITLE: Record<string, string> = {
  map: "Peta Keuangan",
  upload: "Unggah Data",
  reports: "Ringkasan Laporan",
  about: "Tentang Petakeu"
};

const MAP_PALETTE = ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"] as const;

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
      "Jawa Timur": 3340000000
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
      "Jawa Timur": 3180000000
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
      "Jawa Timur": 3050000000
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
    color: MAP_PALETTE[index + 1] ?? MAP_PALETTE[MAP_PALETTE.length - 1],
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
      } else {
        setMapStatus(periodEntry.status);
      }
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedPeriod]);

  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      timers.forEach((timeoutId) => window.clearTimeout(timeoutId));
      if (uploadTimerRef.current) {
        window.clearInterval(uploadTimerRef.current);
      }
    };
  }, []);

  const addToast = useCallback((kind: ToastKind, message: string) => {
    const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, kind, message }]);
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      toastTimers.current.delete(id);
    }, 4200);
    toastTimers.current.set(id, timeoutId);
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timeoutId = toastTimers.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      toastTimers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (mapStatus === "error") {
      addToast("error", "Gagal memuat data peta. Silakan coba lagi.");
    } else if (mapStatus === "empty") {
      addToast("info", "Belum ada data untuk periode ini.");
    }
  }, [mapStatus, addToast]);

  useEffect(() => {
    if (mapStatus !== "success") {
      setLegendHighlight(null);
    }
  }, [mapStatus]);

  const handleSelectFile = useCallback(
    (file: File) => {
      const allowedExtensions = [".xlsx", ".xls", ".csv"];
      const isAllowed = allowedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension));

      if (!isAllowed) {
        setUploadState({ ...initialUploadState, status: "error" });
        addToast("error", "File tidak valid. Gunakan template Excel atau CSV.");
        return;
      }

      if (uploadTimerRef.current) {
        window.clearInterval(uploadTimerRef.current);
      }

      setUploadState({
        file,
        status: "uploading",
        progress: 5,
        summary: null,
        isDragging: false
      });

      let progress = 5;
      const interval = window.setInterval(() => {
        progress = Math.min(progress + Math.floor(Math.random() * 20), 100);
        setUploadState((prev) => ({ ...prev, progress }));
        if (progress >= 100) {
          window.clearInterval(interval);
          setUploadState((prev) => ({
            ...prev,
            status: "success",
            summary: {
              validRows: 186,
              invalidRows: 12
            },
            progress: 100
          }));
          addToast("success", "Unggah berhasil diproses.");
        }
      }, 450);

      uploadTimerRef.current = interval;
    },
    [addToast]
  );

  const handleUploadReset = useCallback(() => {
    if (uploadTimerRef.current) {
      window.clearInterval(uploadTimerRef.current);
    }
    setUploadState(initialUploadState);
  }, []);

  const mapTopRegion = useMemo(() => {
    if (!featureCollection) return null;
    const regions = featureCollection.features.map((feature) => ({
      name: feature.properties?.name as string,
      value: (feature.properties?.value as number) ?? 0
    }));
    return regions.sort((a, b) => b.value - a.value)[0] ?? null;
  }, [featureCollection]);

  const totalValue = useMemo(() => {
    if (!featureCollection) return 0;
    return featureCollection.features.reduce((sum, feature) => sum + ((feature.properties?.value as number) ?? 0), 0);
  }, [featureCollection]);

  const handleRegionFocus = useCallback(
    (region: RegionStat | null) => {
      if (region) {
        setActiveRegion(region);
        return;
      }
      if (mapTopRegion) {
        setActiveRegion(mapTopRegion);
      }
    },
    [mapTopRegion]
  );

  useEffect(() => {
    if (mapTopRegion) {
      setActiveRegion(mapTopRegion);
    }
  }, [mapTopRegion]);

  const reportsMetrics = useMemo(
    () => [
      {
        title: "Total Wilayah",
        value: featureCollection?.features.length ? `${featureCollection.features.length} provinsi` : "-",
        change: mapStatus === "success" ? "+2 wilayah dibanding Q2" : undefined
      },
      {
        title: "Total Nominal",
        value: totalValue ? formatCurrency(totalValue) : "-",
        change: mapStatus === "success" ? "+6.2% YoY" : undefined,
        chartData:
          mapStatus === "success"
            ? [
                { name: "2023-Q4", value: 5400000000 },
                { name: "2024-Q1", value: 5800000000 },
                { name: "2024-Q2", value: 6120000000 },
                { name: "2024-Q3", value: totalValue }
              ]
            : undefined
      },
      {
        title: "Kenaikan Bulanan",
        value: mapStatus === "success" ? formatCurrency(Math.round(totalValue * 0.04)) : "-",
        change: mapStatus === "success" ? "Stabil" : undefined
      }
    ],
    [featureCollection, mapStatus, totalValue]
  );

  const rightPanelContent = useMemo(() => {
    if (activePage !== "map") {
      return null;
    }

    return (
      <div className="space-y-4">
        <InfoCard
          regionName={activeRegion?.name ?? "-"}
          value={activeRegion ? formatCurrency(activeRegion.value) : "-"}
          trend={mapStatus === "success" ? "+3.8% dibanding kuartal lalu" : null}
          description="Nilai mencerminkan total realisasi anggaran pada periode terpilih."
        />
        <LegendCard
          items={legendItems}
          loading={mapStatus === "loading"}
          onHoverItem={setLegendHighlight}
          activeLabel={legendHighlight?.label ?? null}
        />
      </div>
    );
  }, [activePage, activeRegion, mapStatus, legendItems, legendHighlight]);

  const renderPage = () => {
    switch (activePage) {
      case "map":
        return (
          <MapPage
            status={mapStatus}
            featureCollection={featureCollection}
            legend={legendItems}
            legendHighlight={legendHighlight}
            onRegionFocus={handleRegionFocus}
            onRetry={() => setSelectedPeriod("2024-Q3")}
          />
        );
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
        return <ReportsPage metrics={reportsMetrics} />;
      case "about":
        return <AboutPage />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-dvh bg-bg text-text transition-colors">
      <AppLayout
        sidebar={
          <div className="hidden lg:block">
            <Sidebar
              items={NAVIGATION}
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
        rightPanel={rightPanelContent}
      >
        <div className="relative">
          {mobileSidebarOpen && (
            <div className="fixed inset-0 z-40 bg-text/70 backdrop-blur-sm lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
          )}
          <div
            className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-border/40 bg-slate-950 text-slate-100 shadow-xl transition-transform lg:hidden ${
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <Sidebar
              items={NAVIGATION}
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
