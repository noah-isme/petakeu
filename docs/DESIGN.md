# UI/UX Design Specification — Petakeu Dashboard

**Document Version:** 1.0.0  
**Target Platform:** Web (React + Vite + Tailwind CSS + Framer Motion + Leaflet + ECharts)  
**Last Updated:** August 2026  
**Status:** Active Specification

---

## 1. Design Philosophy & Principles

Petakeu is an executive-grade spatial & fiscal monitoring platform for regional revenue distributions (_Setoran Pemprov 15%_ and _Net Realisasi 85%_). The user interface is built upon the **Donezo Executive Dashboard** architectural framework, blending aesthetics and UX paradigms from world-class modern software:

1. **Donezo UI Architecture**: An ultra-clean canvas layout utilizing an off-white ambient background (`#f3f4f6`), a rounded layout shell (`#fcfdfe`, `rounded-[32px]`), rounded card containers (`rounded-[24px]`, `#ffffff`), subtle slate borders (`border-slate-100`), deep forest green structural accents (`#044e3a`), and vivid emerald highlights (`#10b981`).
2. **Vercel Dashboard**: Uncluttered, minimalist layout hierarchy prioritizing spatial geometry and financial data over decorative chrome.
3. **Linear**: Micro-interactions, fluid tab switches, spring physics transitions, and precise keyboard shortcuts.
4. **Stripe Dashboard**: High data density without cognitive overload, using strict typographic hierarchy, monospaced tabular numbers, and color-coded status badges.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ Canvas Background (#f3f4f6)                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Main Layout Shell (#fcfdfe, rounded-[32px], border-slate-200/60)         │  │
│  │  ┌──────────────┬─────────────────────────────────────────────────────┐  │  │
│  │  │ Sidebar      │ Topbar Header (Search ⌘K, Telemetry, User Chip)     │  │  │
│  │  │ (256px/64px) ├─────────────────────────────────────────────────────┤  │  │
│  │  │              │ Workspace Grid / Screen Content                     │  │  │
│  │  │              │  ┌────────────────────┐  ┌───────────────────────┐  │  │  │
│  │  │              │  │ StatCard           │  │ AnimatedCard          │  │  │  │
│  │  │              │  │ (white, r-24px)    │  │ (white, r-24px)       │  │  │  │
│  │  │              │  └────────────────────┘  └───────────────────────┘  │  │  │
│  │  └──────────────┴─────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Core Design Principles

- **Data-Dense & Readable**: Present multi-dimensional financial metrics (Gross, 15% Cut, 85% Net, Target vs Actual) side-by-side without visual clutter.
- **Spatial First**: Geospatial visualization (Leaflet choropleth) acts as the anchor experience for regional data exploration.
- **Purposeful Motion**: Animations guide user focus and signify state changes rather than decorative delight.
- **Explicit State Representation**: Never equate zero revenue (`Rp 0`) with missing submission (`NULL`).

---

## 2. Color System

Petakeu employs a color tokens system built on Tailwind CSS color primitives.

### 2.1 Primary & Accent Colors

| Token Name       | Hex Code  | Tailwind Class                   | Application / Usage                                                     |
| :--------------- | :-------- | :------------------------------- | :---------------------------------------------------------------------- |
| `forest-dark`    | `#044e3a` | `bg-[#044e3a]`, `text-[#044e3a]` | Primary brand color, KPI cards, sidebar highlights, primary buttons     |
| `emerald-accent` | `#10b981` | `bg-[#10b981]`, `text-[#10b981]` | Interactive focus states, growth trends, verified badges, active icons  |
| `emerald-light`  | `#ecfdf5` | `bg-[#ecfdf5]`, `bg-emerald-50`  | Active navigation background, light pill containers, subtle hover fills |
| `emerald-border` | `#a7f3d0` | `border-[#a7f3d0]`               | Active card outlines, choropleth hover borders, input focus rings       |

### 2.2 Canvas & Surfaces

| Surface Level         | Hex Code             | Tailwind Equivalent                | Purpose                               |
| :-------------------- | :------------------- | :--------------------------------- | :------------------------------------ |
| **Canvas Background** | `#f3f4f6`            | `bg-slate-100` / `bg-[#f3f4f6]`    | Ambient outer viewport background     |
| **Layout Shell**      | `#fcfdfe`            | `bg-[#fcfdfe] rounded-[32px]`      | Main inner window frame               |
| **Card Container**    | `#ffffff`            | `bg-white rounded-[24px]`          | Standard elevated component container |
| **Overlay / Modal**   | `rgba(15,23,42,0.6)` | `bg-slate-900/60 backdrop-blur-sm` | Dialog and command palette backdrop   |

### 2.3 Semantic Colors

| Semantic State    | Hex Code  | Light Variant (Bg)       | Dark Variant (Text)       | Usage Context                                                     |
| :---------------- | :-------- | :----------------------- | :------------------------ | :---------------------------------------------------------------- |
| **Success**       | `#10b981` | `#ecfdf5` (`emerald-50`) | `#044e3a` (`forest-dark`) | YoY Growth (+%), 100% target achievement, valid file rows         |
| **Warning**       | `#f59e0b` | `#fffbeb` (`amber-50`)   | `#b45309` (`amber-700`)   | DefisitWatch caution, missing optional fields, calculation drift  |
| **Danger**        | `#f43f5e` | `#fff1f2` (`rose-50`)    | `#be123c` (`rose-700`)    | DefisitWatch deficit alert, import validation error, decline (-%) |
| **Info**          | `#0284c7` | `#f0f9ff` (`sky-50`)     | `#0369a1` (`sky-700`)     | System telemetry, neutral status, spatial query metadata          |
| **Purple Accent** | `#8b5cf6` | `#f5f3ff` (`violet-50`)  | `#6d28d9` (`violet-700`)  | RankFin fiscal leaderboard, secondary metric indicators           |

### 2.4 Neutral Palette

- `slate-50` (`#f8fafc`): Table header backgrounds, disabled control fills.
- `slate-100` (`#f1f5f9`): Default card borders (`border-slate-100`), horizontal dividers.
- `slate-300` (`#cbd5e1`): Input borders, inactive step lines.
- `slate-400` (`#94a3b8`): Subtitle text, placeholder text, disabled icons.
- `slate-600` (`#475569`): Secondary body text, table cell subtext.
- `slate-800` (`#1e293b`): Primary headings, card titles, table headers.
- `slate-900` (`#0f172a`): High-contrast text, modal titles, dark badge fills.

---

## 3. Typography

Petakeu uses **Inter** as the primary font family for UI controls, body text, and headings, and **JetBrains Mono** for financial numbers, spatial coordinates, percentages, and telemetry data.

```css
/* Base Font Stacks */
font-sans:
  "Inter",
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Roboto,
  sans-serif;
font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

### 3.1 Type Scale & Hierarchy

| Role                      | Font Size     | Line Height | Weight         | Font Family | Tailwind Class                                         |
| :------------------------ | :------------ | :---------- | :------------- | :---------- | :----------------------------------------------------- |
| **Display Title**         | 30px (`3xl`)  | 36px        | Bold (700)     | `font-sans` | `text-3xl font-bold tracking-tight text-slate-900`     |
| **Section Heading**       | 24px (`2xl`)  | 32px        | Semibold (600) | `font-sans` | `text-2xl font-semibold tracking-tight text-slate-800` |
| **Card Heading**          | 20px (`xl`)   | 28px        | Semibold (600) | `font-sans` | `text-xl font-semibold text-slate-800`                 |
| **Subheading**            | 16px (`base`) | 24px        | Medium (500)   | `font-sans` | `text-base font-medium text-slate-700`                 |
| **Body Text**             | 14px (`sm`)   | 20px        | Regular (400)  | `font-sans` | `text-sm font-normal text-slate-600`                   |
| **Small Label / Caption** | 12px (`xs`)   | 16px        | Medium (500)   | `font-sans` | `text-xs font-medium text-slate-500`                   |
| **KPI Primary Value**     | 24px-30px     | 36px        | Bold (700)     | `font-mono` | `font-mono text-2xl font-bold text-slate-900`          |
| **Table Numeric Cell**    | 13px-14px     | 20px        | Regular/Medium | `font-mono` | `font-mono text-sm tabular-nums text-slate-800`        |

### 3.2 Numeric Formatting Rules

1. **Currency (Indonesian Rupiah)**: Always prefix with `Rp ` followed by dot-separated thousands (`Rp 34.000.000`).
2. **Font Alignment**: Financial numbers in tables **must be right-aligned** (`text-right`) and rendered with `tabular-nums` in `font-mono`.
3. **Setoran Breakdown**: Display both 85% Net and 15% Cut alongside the Gross amount (e.g. `Gross: Rp 100.000.000 | Net 85%: Rp 85.000.000 | Pemprov 15%: Rp 15.000.000`).

---

## 4. Component Library

### 4.1 StatCard Component

Displays high-level KPI summaries with icon containers, trend pill indicators, and background gradient accents.

```tsx
export interface StatCardProps {
  title: string;
  value: string;
  subvalue?: string;
  description?: string;
  icon: React.ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "purple" | "forest";
  trend?: {
    value: number; // e.g. 12.5 for +12.5%
    label?: string; // e.g. "vs bulan lalu"
    isPositive?: boolean;
  };
  className?: string;
}
```

```
┌─────────────────────────────────────────────────────────────────┐
│ [Icon Container]                            [ +12.5% YoY ↑ ]    │
│ Total Realisasi (Gross)                                         │
│ Rp 34.000.000.000                                              │
│ Setoran 85%: Rp 28.900M | Pemprov 15%: Rp 5.100M               │
└─────────────────────────────────────────────────────────────────┘
```

#### Visual Variants

- `forest`: Background `bg-gradient-to-br from-[#044e3a] to-[#022c21]`, text `text-white`, accent `text-emerald-400`. Used for top-level fiscal summary.
- `success`: Background `bg-white`, border `border-slate-100`, icon wrapper `bg-emerald-50 text-[#10b981]`, trend pill `bg-emerald-100 text-[#044e3a]`.
- `warning`: Background `bg-white`, border `border-slate-100`, icon wrapper `bg-amber-50 text-amber-600`, trend pill `bg-amber-100 text-amber-800`.
- `danger`: Background `bg-white`, border `border-slate-100`, icon wrapper `bg-rose-50 text-rose-600`, trend pill `bg-rose-100 text-rose-800`.
- `info`: Background `bg-white`, border `border-slate-100`, icon wrapper `bg-sky-50 text-sky-600`, trend pill `bg-sky-100 text-sky-800`.
- `purple`: Background `bg-white`, border `border-slate-100`, icon wrapper `bg-violet-50 text-violet-600`, trend pill `bg-violet-100 text-violet-800`.

---

### 4.2 AnimatedCard Component

Standard container element with smooth lift micro-animations, border styling, and optional glow effect on hover or focus.

```tsx
export interface AnimatedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean; // Enables -translate-y-1 hover lift
  glow?: boolean; // Enables emerald/slate ambient glow ring
  children: React.ReactNode;
}
```

#### Styling Specifications

- **Default Class**: `rounded-[24px] bg-white border border-slate-100 p-6 shadow-xs transition-all duration-200 ease-out`
- **Hover Lift State**: `hover:-translate-y-1 hover:shadow-md hover:border-slate-200`
- **Glow Variant**: `hover:ring-2 hover:ring-[#10b981]/20 hover:border-[#10b981]/40`

---

### 4.3 Tabs Component

Pill-style navigation element for toggling sub-views without route reload.

```
┌────────────────────────────────────────────────────────┐
│  [ Ringkasan Peta ]   [ Leaderboard ]   [ Missing Data ] │
└────────────────────────────────────────────────────────┘
```

#### Styling & Accessibility

- **Container**: `inline-flex p-1 bg-slate-100/80 backdrop-blur-md rounded-2xl border border-slate-200/50`
- **Tab Trigger (Inactive)**: `px-4 py-2 text-sm font-medium text-slate-600 rounded-xl transition-all hover:text-slate-900`
- **Tab Trigger (Active)**: `px-4 py-2 text-sm font-semibold text-[#044e3a] bg-white shadow-xs rounded-xl`
- **Keyboard Navigation**: Arrow keys (`Left`/`Right`) shift focus; `Space`/`Enter` activates tab. Standard ARIA attributes (`role="tablist"`, `role="tab"`, `aria-selected="true|false"`).

---

### 4.4 Sidebar Navigation

Collapsible vertical sidebar anchored to the left shell boundary. Supports expanded (256px) and collapsed icon-only (64px) states using Framer Motion spring physics.

```
┌───────────────────────────────┐
│ 🗺️ Petakeu Dashboard        │
│ ───────────────────────────── │
│ MODUL ANALISIS                │
│ 📊 Dashboard Utama            │
│ 🏆 Ranking & Leaderboard      │
│ ⚠️ Defisit & Coverage         │
│                               │
│ PENGOLAHAN DATA               │
│ 📥 Import Excel               │
│ 📑 Laporan & Export           │
│ ⚙️ Pengaturan System          │
│ ───────────────────────────── │
│ [ Collapse Sidebar  (←) ]     │
└───────────────────────────────┘
```

#### Sidebar Features

1. **Sections**: Grouped under uppercase subheadings (`MODUL ANALISIS` and `PENGOLAHAN DATA`).
2. **Active Link Indicator**: Left accent bar (`w-1 h-6 bg-[#10b981] rounded-r-full`), background `bg-emerald-50/80`, text `text-[#044e3a] font-semibold`.
3. **Collapsed Tooltips**: When collapsed to 64px, hovering over an icon reveals a floating black tooltip (`bg-slate-900 text-white text-xs px-2 py-1 rounded-md`).
4. **Framer Motion**: Smooth width transition (`width: isCollapsed ? 64 : 256`, `transition: { type: "spring", stiffness: 300, damping: 30 }`).

---

### 4.5 Topbar Component

Anchored to the top of the shell layout (`h-16 border-b border-slate-100 bg-white/80 backdrop-blur-md px-6`).

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔍 Cari Wilayah / Kab (⌘K)   │  📅 Periode: [ Agt 2025 ▼ ]  │ 🟢 PostGIS Active │ 👤 Noah (Admin) │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Topbar Controls

1. **Command Palette Search Trigger (`⌘K`)**: Input-style trigger opening full-screen modal search for provinces, regencies, or fiscal reports.
2. **Period Selector**: Dropdown selector with quick-select options (_Bulan Ini_, _Triwulan II_, _YTD 2025_, _Custom Range_).
3. **PostGIS Telemetry Badge**: Real-time DB status indicator (`bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-mono`). Shows query execution latency (e.g. `PostGIS: 14ms`).
4. **User Profile Chip**: User avatar, display name, and role badge (`Admin Spasial`).

---

## 5. Key Screens Specification

### 5.1 Dashboard Screen (`MapPage.tsx`)

The main dashboard acts as the primary executive workspace, placing the interactive Leaflet map at the center, flanked by key KPI summaries and telemetry widgets.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOPBAR (Search ⌘K, Period Selector, PostGIS Status)                                         │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ KPI QUARTET                                                                                  │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐        │
│ │ Total Realisasi  │ │ Setoran 85%      │ │ Potongan 15%     │ │ Coverage Wilayah │        │
│ │ Rp 34.000.000.000│ │ Rp 28.900.000.000│ │ Rp 5.100.000.000 │ │ 34/34 Provinsi   │        │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘        │
├──────────────────────────────────────────────────────┬───────────────────────────────────────┤
│ INTERACTIVE LEAFLET MAP (Choropleth Mode)             │ SIDE WIDGETS STACK                    │
│ ┌──────────────────────────────────────────────────┐ │ ┌───────────────────────────────────┐ │
│ │ [Map Mode Toggles: Realisasi | 15% | IRF Status] │ │ │ FiscalView Ranking Widget         │ │
│ │                                                  │ │ ├───────────────────────────────────┤ │
│ │   GeoJSON Feature Polygons                       │ │ │ DefisitWatch Alert List           │ │
│ │   (5-Class Quantile Color Shading)              │ │ ├───────────────────────────────────┤ │
│ │                                                  │ │ │ YTD Target Achievement Gauge      │ │
│ │   [Map Legend Card: Rp 0 ───────> Rp 50B+]       │ │ ├───────────────────────────────────┤ │
│ └──────────────────────────────────────────────────┘ │ │ Infrastructure Telemetry          │ │
│                                                      │ └───────────────────────────────────┘ │
└──────────────────────────────────────────────────────┴───────────────────────────────────────┘
```

#### Screen Details

- **KPI Quartet Cards**:
  1. _Total Realisasi (Gross)_: Forest gradient background, total revenue collected across selected period.
  2. _Setoran Bersih 85%_: Emerald success card, net revenue distributed to regional unit.
  3. _Potongan Wajib 15%_: Purple accent card, provincial tax deduction share.
  4. _Coverage Spasial_: Sky info card, number of active spatial regions reporting data.
- **Leaflet Choropleth Map**:
  - Hover tooltip shows region name, province, Gross, Net 85%, Cut 15%, and target achievement percentage.
  - Clicking a region boundary triggers the `RegionDetailPanel` sliding drawer from the right.
- **Side Widgets Stack**:
  - _FiscalView_: Mini leaderboard of top 5 highest performing regencies/cities.
  - _DefisitWatch_: Alarm list of regions failing to meet minimum monthly fiscal thresholds.
  - _YTD Gauge_: Circular radial progress chart showing national target progress.

---

### 5.2 Upload Page (`UploadPage.tsx`)

The Excel data import page handles dirty data cleaning, region alias mapping, and row-level verification.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ UPLOAD DATA SETORAN EXCEL                                                                    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 📁 Drag & drop file Excel (.xlsx / .xls) di sini, atau klik untuk memilih file           │ │
│ │ Ukuran file maksimal: 20MB. Template resmi: template_setoran_petakeu_v2.xlsx             │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                              │
│ PARSING & VALIDATION PROGRESS BAR                                                            │
│ [████████████████████████████████████████████------------------------] 65% Memvalidasi Alias │
│                                                                                              │
│ VALIDATION SUMMARY CARDS                                                                     │
│ ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐               │
│ │ 274 Rows Valid       │   │ 18 Rows Warning      │   │ 4 Rows Error         │               │
│ │ (Siap Diimport)      │   │ (Potensi Typo Name)  │   │ (Format Tidak Valid) │               │
│ └──────────────────────┘   └──────────────────────┘   └──────────────────────┘               │
│                                                                                              │
│ ROW-LEVEL ERROR & WARNING TABLE                                                              │
│ ┌─────┬────────────────┬─────────────────┬──────────────┬──────────────┬───────────────────┐ │
│ │ Baris│ Wilayah Raw   │ Alias Canonical │ Setoran      │ Status       │ Pesan Masalah     │ │
│ ├─────┼────────────────┼─────────────────┼──────────────┼──────────────┼───────────────────┤ │
│ │ #14 │ Banjar Masin   │ Banjarmasin     │ Rp 5.500.000 │ ⚠ Warning    │ Alias auto-mapped │ │
│ │ #42 │ Sul-Tenggara   │ Sulawesi Teng.  │ empty        │ ❌ Error     │ Setoran kosong    │ │
│ └─────┴────────────────┴─────────────────┴──────────────┴──────────────┴───────────────────┘ │
│                                                                                              │
│ [ Batalkan Upload ]                                                [ Konfirmasi Import Data ]│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Upload Lifecycle UX States

1. **Dropzone State**: Active drag border (`border-2 border-dashed border-[#10b981] bg-emerald-50/50`).
2. **Parsing State**: Animated progress bar (`bg-[#10b981] h-2 rounded-full transition-all duration-300`).
3. **Validation Summary**: Color-coded KPI badges summarizing Valid (Green), Warnings (Amber), and Errors (Red).
4. **Row-level Correction**: Direct editable text inputs inside the row error table allowing operators to fix alias mismatches before committing to PostgreSQL.

---

### 5.3 Reports Page (`ReportsPage.tsx`)

Manages asynchronous background PDF/Excel report generation tasks.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ MANAJEMEN LAPORAN & DOKUMEN EXPORT                                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ Filter Tipe Laporan ▼ ]   [ Status: All ▼ ]                      [ + Buat Laporan Baru ]  │
│                                                                                              │
│ REPORT JOBS QUEUE TABLE                                                                      │
│ ┌─────────────────────────────┬───────────┬──────────────┬─────────────┬───────────────────┐ │
│ │ Nama Laporan                │ Tipe      │ Dibuat Pada  │ Status      │ Aksi / Unduh      │ │
│ ├─────────────────────────────┼───────────┼──────────────┼─────────────┼───────────────────┤ │
│ │ Laporan_Realisasi_Q2_2025   │ Excel     │ 10 Aug 14:20 │ 🟢 Selesai  │ [ 📥 Download ]   │ │
│ │ Matriks_Defisit_Provinsi    │ PDF       │ 10 Aug 15:05 │ ⏳ Processing│ [ 🔄 Regenerate ] │ │
│ │ Summary_Setoran_15_Persen   │ PDF       │ 09 Aug 09:12 │ 🔴 Gagal    │ [ ⚠️ Liha Error ] │ │
│ └─────────────────────────────┴───────────┴──────────────┴─────────────┴───────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 5.4 Ranking Screen (`RankFinLeaderboard`)

Interactive leaderboard for sorting, filtering, and evaluating regency/city fiscal performance.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ RANKING FISKAL & ACHIEVEMENTS                                                                │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ FILTERS BAR                                                                                  │
│ Provinsi: [ Kalimantan Tengah ▼ ]   Periode: [ Jan 2025 ─ Jul 2025 ]   Urutkan: [ Realisasi ▼ ]│
│                                                                                              │
│ LEADERBOARD TABLE                                                                            │
│ ┌──────┬──────────────────────┬─────────────┬──────────────┬─────────────┬─────────────────┐ │
│ │ Rank │ Kab / Kota           │ Target      │ Realisasi    │ Capaian (%) │ Selisih (Surplus│ │
│ ├──────┼──────────────────────┼─────────────┼──────────────┼─────────────┼─────────────────┤ │
│ │ 🥇 1 │ Kotawaringin Barat   │ Rp 4.812M   │ Rp 4.002M    │ 83.2% ████░ │ -Rp 810M        │ │
│ │ 🥈 2 │ Palangka Raya        │ Rp 4.740M   │ Rp 3.021M    │ 63.7% ███░░ │ -Rp 1.719M      │ │
│ │ 🥉 3 │ Pulang Pisau         │ Rp 3.120M   │ Rp 1.946M    │ 62.3% ███░░ │ -Rp 1.174M      │ │
│ └──────┴──────────────────────┴─────────────┴──────────────┴─────────────┴─────────────────┘ │
│                                                                                              │
│ [ 📊 Export ke Excel ]                                               [ 📄 Export ke PDF ]   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Ranking Selector Options

- **Rank By Metrics**: Total Revenue (`SUM(gross_amount)`), Monthly Average (`AVG(gross_amount)`), Target Achievement (`actual / target * 100`), Largest Surplus, Largest Deficit.
- **Table Columns**: Rank Badge (1-3 formatted with medals 🥇🥈🥉), Region Name, Target Amount, Actual Revenue, Achievement Progress Bar, Surplus/Deficit Difference.

---

### 5.5 Reporting Matrix Screen

Grid view mapping regions against calendar months to identify missing submissions at a glance.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ MATRIKS PELAPORAN REGIONAL (2025)                                                           │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ WILAYAH        JAN   FEB   MAR   APR   MEI   JUN   JUL   AGU   SEP   OKT   NOV   DES   TOTAL  │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Kab. Kudus      ✅    ✅    ✅    ✅    ✅    ✅    ✅    ⏳    -     -     -     -    Rp 8.2M│
│ Kab. Jepara     ✅    ✅    ⚠️    ✅    ✅    ✅    ✅    ⏳    -     -     -     -    Rp 6.9M│
│ Kab. Blora      ✅    ❌    ❌    ✅    ✅    ❌    ✅    ⏳    -     -     -     -    Rp 3.1M│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
 LEGEND:  ✅ Laporkan (Valid)   ⚠️ Ada Warning   ❌ Missing Submission   ⏳ Pending Periode
```

#### Interactivity

- Clicking any status cell opens a **Monthly Submission Drawer** displaying the exact raw setoran breakdown, file import timestamp, and operator log.

---

### 5.6 Missing Data View

Comprehensive operational view designed for spatial reporting officers to detect missing regional submissions.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ CAKUPAN DATA & MISSING SUBMISSION WATCHLIST                                                   │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ PROVINCIAL COVERAGE SUMMARY                                                                  │
│ ┌──────────────────────┬──────────────┬──────────────┬─────────────────────────────────────┐ │
│ │ Provinsi             │ Terlaporkan  │ Missing      │ Persentase Cakupan                  │ │
│ ├──────────────────────┼──────────────┼──────────────┼─────────────────────────────────────┤ │
│ │ Jawa Tengah          │ 31 / 35      │ 4 Wilayah    │ 88.6% █████████░                    │ │
│ │ Kalimantan Barat     │ 6 / 14       │ 8 Wilayah    │ 42.8% ████░░░░░░                    │ │
│ └──────────────────────┴──────────────┴──────────────┴─────────────────────────────────────┘ │
│                                                                                              │
│ DETIL TIMELINE STATUS SUBMISSION (PER WILAYAH)                                               │
│ Kab. Pekalongan : [ Jan ✅ ] [ Feb ✅ ] [ Mar ❌ ] [ Apr ✅ ] [ Mei ❌ ] [ Jun ❌ ]          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Animation Guidelines

All micro-interactions use Framer Motion and Tailwind CSS transition primitives configured with GPU-accelerated properties (`transform`, `opacity`).

```typescript
// Standard Spring Configuration for Framer Motion
export const TRANSITION_SPRING = {
  type: "spring",
  stiffness: 400,
  damping: 25
};

// Standard Duration Timing
export const TIMINGS = {
  fast: "150ms", // Hover states, button clicks, icon color shifts
  base: "200ms", // Accordion collapses, tab indicators, dropdown popovers
  slow: "300ms" // Modal fades, drawer slides, sidebar expand/collapse
};

// Custom Easing Function
export const EASING_CUBIC = "cubic-bezier(0.4, 0, 0.2, 1)";
```

### Motion Principles

1. **Purposeful**: Animations strictly indicate navigation hierarchy, state changes, or drag operations.
2. **Consistent**: Hover states on all interactive cards use identical `-translate-y-1` lift and shadow expansion.
3. **Performant**: Never animate layout-triggering properties (`width`, `height`, `margin`) on large lists; restrict to CSS `transform` and `opacity`.
4. **Subtle**: Modal overlay fades and drawer slide-ins duration must not exceed 300ms.

---

## 7. Responsive Breakpoints

Petakeu implements a mobile-first responsive architecture designed to adapt cleanly across screen viewports.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  xs (<640px)   │  sm (640px)   │  md (768px)   │  lg (1024px)  │  xl (1280px+)  │
│  Single Col    │  2-Col Cards  │  Tablet Stack │  Desktop Shell│  Ultra-Wide 4k │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Breakpoint Specifications

| Breakpoint | Minimum Width | Layout Adaptation                                                                       |
| :--------- | :------------ | :-------------------------------------------------------------------------------------- |
| `sm`       | `640px`       | KPI Quartet folds into 2x2 grid; table columns truncate non-essential metadata.         |
| `md`       | `768px`       | Leaflet map and side widgets stack vertically; Topbar search condenses to icon.         |
| `lg`       | `1024px`      | Standard desktop layout: 256px sidebar, side-by-side map + side widget stack.           |
| `xl`       | `1280px`      | KPI Quartet rendered in single row; data tables show full metadata (15% cut, YTD, YoY). |
| `2xl`      | `1536px`      | Max-width shell container (`max-w-[1720px] mx-auto`) with high-density metrics view.    |

---

## 8. Accessibility (a11y)

Petakeu adheres to **WCAG 2.1 Level AA** standards.

### 8.1 Focus Rings & Keyboard Navigation

All interactive elements (buttons, inputs, tab triggers, table row action triggers) must display a high-contrast focus ring when navigated via keyboard (`Tab` / `Shift+Tab`):

```css
/* Tailwind Utility Equivalent */
focus:outline-none focus:ring-2 focus:ring-[#10b981] focus:ring-offset-2 focus:ring-offset-white
```

- **Keyboard Shortcuts**:
  - `⌘ + K` or `Ctrl + K`: Open Command Palette Search.
  - `Escape`: Close open drawers, dropdowns, and search modals.
  - `Arrow Keys`: Navigate tab lists and spatial map controls.

### 8.2 Color Contrast Ratios

- Body Text (`text-slate-700` on `#ffffff`): Contrast ratio > `7.1:1` (Exceeds WCAG AA requirement of 4.5:1).
- Muted Text (`text-slate-500` on `#ffffff`): Contrast ratio > `4.6:1`.
- Semantic Badges: Text on light background badges (e.g. `#044e3a` text on `#ecfdf5` background) maintain contrast ratio > `5.2:1`.

---

## 9. Data Visualization Standards

Petakeu uses **Apache ECharts** for analytical charts and **Leaflet** for spatial choropleth maps.

### 9.1 Semantic Chart Colors

- **Positive / Growth**: `#10b981` (Emerald Accent) or `#22c55e`.
- **Negative / Decline**: `#f43f5e` (Rose Danger) or `#ef4444`.
- **Neutral / Telemetry**: `#0284c7` (Sky Info) or `#3b82f6`.
- **Target Line / Benchmark**: `#8b5cf6` (Purple Violet Accent) or dashed `#64748b`.

```
         Monthly Revenue Trend (Line Chart)
Rp 50B ┼                             ╭─-─-─- Actual Revenue
       │                  ╭───╮   ╭──╯
Rp 25B ┼ ── ── ── ── ── ──│───┼───│── ── ──  Target Line
       │         ╭───╮    │   │   │
  Rp 0 ┴─────────┴───┴────┴───┴───┴──────────
        Jan   Feb   Mar   Apr   May   Jun
```

---

### 9.2 Map Choropleth Color Gradient

The choropleth map visualizes revenue distributions using a 5-class quantile color scale:

```
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ Quantile 1   │ Quantile 2   │ Quantile 3   │ Quantile 4   │ Quantile 5   │
│ #eff6ff      │ #bfdbfe      │ #60a5fa      │ #2563eb      │ #1e40af      │
│ Lightest Blue│ Soft Blue    │ Vibrant Blue │ Dark Blue    │ Deep Navy    │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

---

### 9.3 Visual Differentiation: Zero vs. Missing Data

> [!IMPORTANT]
> **Zero Revenue (`Rp 0`) and Missing Submission (`NULL`) MUST NEVER be rendered with identical visual styles.**

```
┌───────────────────────────────────────┬───────────────────────────────────────┐
│ ZERO REVENUE (Valid Submission)      │ MISSING SUBMISSION (Data Not Uploaded)│
├───────────────────────────────────────┼───────────────────────────────────────┤
│ Value: Rp 0                           │ Value: NULL / Missing                 │
│ Badge: Gray Neutral Pill ("Rp 0")     │ Badge: Striped Danger Pill ("Missing")│
│ Table Cell: Slate Text (Rp 0)         │ Table Cell: Muted Red Italic (—)      │
│ Map Fill: Light Neutral Gray (#e2e8f0)│ Map Fill: Diagonal Striped Pattern    │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

---

## 10. Implementation Guide for Developers

### 10.1 Key UI Utility Helper (`cn` Pattern)

All UI components should combine Tailwind classes using `clsx` and `tailwind-merge`:

```typescript
import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 10.2 Recommended Component Directory Structure

```
apps/web/src/
├── components/
│   ├── ui/                   # Reusable primitive UI design tokens & controls
│   │   ├── animated-card.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── stat-card.tsx
│   │   └── tabs.tsx
│   ├── dashboard/            # Executive workspace & map widgets
│   │   ├── InfoCard.tsx
│   │   ├── LegendCard.tsx
│   │   ├── Sidebar.tsx
│   │   ├── ToastContainer.tsx
│   │   └── Topbar.tsx
│   ├── filters/              # Period & Map state controls
│   │   ├── MapModeToggle.tsx
│   │   └── PeriodSelector.tsx
│   ├── admin/                # Upload & report processing components
│   │   ├── ReportJobsList.tsx
│   │   ├── UploadForm.tsx
│   │   └── UploadsTable.tsx
│   ├── MapView.tsx           # Leaflet choropleth engine
│   ├── LeftSidebar.tsx
│   └── RegionDetailPanel.tsx # Spatial drawer panel
├── layouts/
│   ├── AppLayout.tsx         # Outer shell container
│   └── MainLayout.tsx
└── pages/
    ├── MapPage.tsx           # Main Spatial Dashboard
    ├── UploadPage.tsx        # Import & validation workflow
    ├── ReportsPage.tsx       # Export job runner
    └── AdminDashboard.tsx    # Management overview
```

---

_End of Petakeu UI/UX Design Specification._
