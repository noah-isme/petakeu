import {
  BarChart3,
  FileEdit,
  FileText,
  Info,
  Map as MapIcon,
  ShieldCheck,
  UploadCloud,
  type LucideIcon
} from "lucide-react";

import type { UserRole } from "../lib/auth";

/** Stable page identifiers used by the sidebar, route guards, and page titles. */
export type AppRouteKey = "map" | "analytics" | "reports" | "upload" | "about" | "audit" | "report-builder";

export interface AppRouteDefinition {
  key: AppRouteKey;
  path: string;
  label: string;
  title: string;
  icon: LucideIcon;
  section: "analysis" | "tools";
  /** Minimum role required by the corresponding backend surface. */
  minimumRole: UserRole;
}

/**
 * Keep this list as the single source of truth for page URLs, navigation copy,
 * titles, and the minimum backend role for each surface.
 */
export const APP_ROUTES: readonly AppRouteDefinition[] = [
  {
    key: "map",
    path: "/map",
    label: "Peta Heatmap",
    title: "Peta Heatmap & Visualisasi Spasial",
    icon: MapIcon,
    section: "analysis",
    minimumRole: "public"
  },
  {
    key: "analytics",
    path: "/analytics",
    label: "Analitik Eksekutif",
    title: "Analitik Eksekutif & Kepatuhan Pelaporan",
    icon: BarChart3,
    section: "analysis",
    minimumRole: "viewer"
  },
  {
    key: "reports",
    path: "/reports",
    label: "Ringkasan Laporan",
    title: "Ringkasan Laporan Revenue & Ekspor",
    icon: FileText,
    section: "analysis",
    minimumRole: "viewer"
  },
  {
    key: "upload",
    path: "/uploads",
    label: "Unggah Data Excel",
    title: "Unggah Data Excel (Validasi & Bulk Upsert)",
    icon: UploadCloud,
    section: "tools",
    minimumRole: "operator"
  },
  {
    key: "about",
    path: "/about",
    label: "Tentang Petakeu",
    title: "Tentang Petakeu — Telemetri & PostGIS",
    icon: Info,
    section: "tools",
    minimumRole: "public"
  },
  {
    key: "audit",
    path: "/admin/audit",
    label: "Audit Trail",
    title: "Audit Trail — Kepatuhan & Governance",
    icon: ShieldCheck,
    section: "tools",
    minimumRole: "admin"
  },
  {
    key: "report-builder",
    path: "/admin/report-builder",
    label: "Report Builder",
    title: "Report Template Builder",
    icon: FileEdit,
    section: "tools",
    minimumRole: "admin"
  }
] as const;

const ROLE_LEVEL: Readonly<Record<UserRole, number>> = Object.freeze({
  public: 0,
  viewer: 1,
  operator: 2,
  admin: 3
});

export function getRouteByKey(key: AppRouteKey): AppRouteDefinition {
  return APP_ROUTES.find((route) => route.key === key) ?? APP_ROUTES[0];
}

export function getRouteByPath(pathname: string): AppRouteDefinition | undefined {
  return APP_ROUTES.find((route) => route.path === pathname);
}

/**
 * Missing role means the host has not supplied a JWT yet. Public UI builds
 * still render the non-admin shell so MSW/local previews remain usable; once a
 * role is known, this check follows the same hierarchy as the API middleware.
 * Admin surfaces always require an explicit admin role.
 */
export function hasMinimumRouteRole(role: UserRole | null, minimumRole: UserRole): boolean {
  if (minimumRole === "public") return true;
  if (role === null) return minimumRole !== "admin";
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimumRole];
}

export function canAccessRoute(role: UserRole | null, route: AppRouteDefinition): boolean {
  return hasMinimumRouteRole(role, route.minimumRole);
}
