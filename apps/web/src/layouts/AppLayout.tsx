import { PropsWithChildren, type ReactNode } from "react";

interface AppLayoutProps extends PropsWithChildren {
  sidebar: ReactNode;
  topbar: ReactNode;
  rightPanel?: ReactNode;
}

export function AppLayout({ sidebar, topbar, rightPanel, children }: AppLayoutProps) {
  return (
    <div className="relative flex min-h-dvh bg-slate-950 text-slate-100 transition-colors">
      {sidebar}
      <div className="flex min-h-dvh flex-1 flex-col">
        {topbar}
        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8 lg:py-8">{children}</div>
          {rightPanel && (
            <aside className="w-full border-t border-slate-800/80 bg-slate-950/90 px-6 py-6 backdrop-blur-2xl lg:w-[380px] lg:border-l lg:border-t-0 lg:px-8">
              <div className="sticky top-24 space-y-4">{rightPanel}</div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

