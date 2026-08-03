import { PropsWithChildren, type ReactNode } from "react";

interface AppLayoutProps extends PropsWithChildren {
  sidebar: ReactNode;
  topbar: ReactNode;
}

export function AppLayout({ sidebar, topbar, children }: AppLayoutProps) {
  return (
    <div className="relative flex h-dvh w-screen bg-ambient-grid bg-slate-950 text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-300 overflow-hidden">
      {sidebar}
      <div className="flex h-dvh flex-1 flex-col min-w-0 overflow-hidden">
        {topbar}
        <main className="relative flex-1 overflow-hidden min-w-0">{children}</main>
      </div>
    </div>
  );
}
