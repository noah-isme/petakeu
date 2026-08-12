import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { AppLayout } from "./layouts/AppLayout";
import { Sidebar, type SidebarItem } from "./components/dashboard/Sidebar";
import { Topbar } from "./components/dashboard/Topbar";
import { type LegendItem } from "./components/dashboard/LegendCard";
import { ToastContainer, type ToastKind, type ToastMessage } from "./components/dashboard/ToastContainer";
import { MapPage, type MapStatus, type RegionStat } from "./pages/MapPage";
import { UploadPage } from "./pages/UploadPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AboutPage } from "./pages/AboutPage";
import { AuditLogInspector } from "./components/admin/AuditLogInspector";
import { BASE_REGIONS } from "./data/regions";
import { formatCurrency } from "./lib/format";
import { useAdminAccess, type UserRole } from "./lib/auth";
import { APP_ROUTES, canAccessRoute, getRouteByKey, getRouteByPath, type AppRouteDefinition, type AppRouteKey } from "./config/routes";

import type { FeatureCollection } from "geojson";

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

interface RouteGateProps {
  route: AppRouteDefinition;
  role: UserRole | null;
  children: ReactNode;
}

function ForbiddenRoute({ route }: Pick<RouteGateProps, "route">) {
  const location = useLocation();

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start justify-center gap-4 rounded-3xl border border-rose-200 bg-white p-8 shadow-sm" aria-labelledby="forbidden-route-title">
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-rose-700">Akses terbatas</p>
      <h1 id="forbidden-route-title" className="text-2xl font-bold tracking-tight text-slate-900">
        Anda tidak memiliki akses ke halaman ini
      </h1>
      <p className="text-sm leading-6 text-slate-600">
        Halaman <span className="font-semibold">{route.label}</span> membutuhkan peran {route.minimumRole} atau lebih tinggi. Minta akses dari administrator jika Anda perlu membuka halaman ini.
      </p>
      <Link to={{ pathname: "/map", search: location.search }} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800">
        Kembali ke peta
      </Link>
    </section>
  );
}

function RouteGate({ route, role, children }: RouteGateProps) {
  return canAccessRoute(role, route) ? <>{children}</> : <ForbiddenRoute route={route} />;
}

function RootRedirect() {
  const location = useLocation();
  return <Navigate replace to={{ pathname: "/map", search: location.search }} />;
}

export default function App() {
  const { role } = useAdminAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPeriod = useMemo(() => {
    const period = searchParams.get("period");
    return period && PERIOD_DATA[period] ? period : PERIOD_OPTIONS[0];
  }, [searchParams]);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [featureCollection, setFeatureCollection] = useState<FeatureCollection | null>(null);
  const [legendItems, setLegendItems] = useState<LegendItem[]>([]);
  const [legendHighlight, setLegendHighlight] = useState<LegendItem | null>(null);
  const [activeRegion, setActiveRegion] = useState<RegionStat | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimers = useRef(new Map<string, number>());

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mobileSidebarTriggerRef = useRef<HTMLElement | null>(null);
  const previousRole = useRef<UserRole | null>(role);
  const activeRoute = getRouteByPath(location.pathname);
  const activePage: AppRouteKey = activeRoute?.key ?? "map";
  const navigation = useMemo<SidebarItem[]>(
    () =>
      APP_ROUTES.filter((route) => canAccessRoute(role, route)).map((route) => ({
        key: route.key,
        label: route.label,
        icon: route.icon,
        section: route.section
      })),
    [role]
  );

  useEffect(() => {
    const period = searchParams.get("period");
    if (period && !PERIOD_DATA[period]) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("period", PERIOD_OPTIONS[0]);
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const updatePeriod = useCallback(
    (period: string) => {
      if (!PERIOD_DATA[period]) return;
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("period", period);
      setSearchParams(nextParams);
    },
    [searchParams, setSearchParams]
  );

  const navigateToRoute = useCallback(
    (key: string) => {
      const route = APP_ROUTES.find((candidate) => candidate.key === key);
      if (!route || !canAccessRoute(role, route)) return;
      setMobileSidebarOpen(false);
      navigate({ pathname: route.path, search: location.search });
    },
    [location.search, navigate, role]
  );

  useEffect(() => {
    if (mobileSidebarOpen) {
      const firstControl = document.querySelector<HTMLElement>(
        '[data-testid="mobile-sidebar-drawer"] a, [data-testid="mobile-sidebar-drawer"] button'
      );
      firstControl?.focus();
      return;
    }

    mobileSidebarTriggerRef.current?.focus();
    mobileSidebarTriggerRef.current = null;
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    const roleChanged = previousRole.current !== role;
    previousRole.current = role;
    if (!roleChanged || !activeRoute || canAccessRoute(role, activeRoute)) return;

    navigate({ pathname: "/map", search: location.search }, { replace: true });
  }, [activeRoute, location.search, navigate, role]);

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

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 transition-colors selection:bg-emerald-500/30 selection:text-emerald-300">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-emerald-700 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Lewati ke konten utama
      </a>
      <AppLayout
        sidebar={
          <div className="hidden lg:block h-full" data-testid="desktop-sidebar-wrapper">
            <Sidebar
              items={navigation}
              activeKey={activePage}
              onSelect={navigateToRoute}
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
            />
          </div>
        }
        topbar={
          <Topbar
            title={activeRoute?.title ?? getRouteByKey("map").title}
            period={selectedPeriod}
            periods={PERIOD_OPTIONS}
            onPeriodChange={updatePeriod}
            onOpenSettings={() => addToast("info", "Panel pengaturan akan tersedia segera.")}
            onToggleSidebar={() => {
              if (!mobileSidebarOpen && document.activeElement instanceof HTMLElement) {
                mobileSidebarTriggerRef.current = document.activeElement;
              }
              setMobileSidebarOpen((prev) => !prev);
            }}
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
              onSelect={navigateToRoute}
              collapsed={false}
              onCollapsedChange={() => setMobileSidebarOpen(false)}
            />
          </div>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route
              path="/map"
              element={
                <RouteGate route={getRouteByKey("map")} role={role}>
                  <MapPage
                    status={mapStatus}
                    featureCollection={featureCollection}
                    legend={legendItems}
                    legendHighlight={legendHighlight}
                    activeRegion={activeRegion}
                    onRegionFocus={handleRegionFocus}
                    onHoverLegend={setLegendHighlight}
                    onRetry={() => updatePeriod("2024-Q3")}
                  />
                </RouteGate>
              }
            />
            <Route
              path="/analytics"
              element={
                <RouteGate route={getRouteByKey("analytics")} role={role}>
                  <AnalyticsPage period={selectedPeriod} />
                </RouteGate>
              }
            />
            <Route
              path="/reports"
              element={
                <RouteGate route={getRouteByKey("reports")} role={role}>
                  <ReportsPage metrics={reportsMetrics} />
                </RouteGate>
              }
            />
            <Route
              path="/uploads"
              element={
                <RouteGate route={getRouteByKey("upload")} role={role}>
                  <UploadPage />
                </RouteGate>
              }
            />
            <Route
              path="/about"
              element={
                <RouteGate route={getRouteByKey("about")} role={role}>
                  <AboutPage />
                </RouteGate>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <RouteGate route={getRouteByKey("audit")} role={role}>
                  <AuditLogInspector />
                </RouteGate>
              }
            />
            <Route path="*" element={<Navigate replace to={{ pathname: "/map", search: location.search }} />} />
          </Routes>
        </div>
      </AppLayout>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
