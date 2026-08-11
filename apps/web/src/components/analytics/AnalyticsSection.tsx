
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";

import type { ReactNode } from "react";

interface AnalyticsSectionProps {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AnalyticsSection({
  title,
  description,
  eyebrow,
  action,
  children,
  className
}: AnalyticsSectionProps) {
  return (
    <Card className={cn("border-slate-200/80 bg-white shadow-sm", className)}>
      <CardHeader className="gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div>
          {eyebrow && <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>}
          <CardTitle className="mt-1 text-lg font-bold tracking-tight text-slate-900">{title}</CardTitle>
          {description && <CardDescription className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}
