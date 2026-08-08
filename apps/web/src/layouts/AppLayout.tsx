import { PropsWithChildren, type ReactNode } from "react";

interface AppLayoutProps extends PropsWithChildren {
  sidebar: ReactNode;
  topbar: ReactNode;
}

export function AppLayout({ sidebar, topbar, children }: AppLayoutProps) {
  return (
    <div className="relative flex h-dvh w-screen bg-[#f3f4f6] text-slate-800 selection:bg-emerald-500/20 selection:text-emerald-900 overflow-hidden p-2 sm:p-4 lg:p-5">
      <div className="relative flex h-full w-full rounded-[24px] sm:rounded-[32px] bg-[#fcfdfe] border border-slate-200/70 shadow-xl overflow-hidden min-w-0">
        {sidebar}
        <div className="flex h-full flex-1 flex-col min-w-0 overflow-hidden bg-[#fafbfc]">
          {topbar}
          <main className="relative flex-1 overflow-y-auto min-w-0 p-4 sm:p-6 lg:p-7">{children}</main>
        </div>
      </div>
    </div>
  );
}
