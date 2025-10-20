import { Area, AreaChart, ResponsiveContainer } from "recharts";

export interface ReportMetric {
  title: string;
  value: string;
  change?: string;
  chartData?: { name: string; value: number }[];
}

interface ReportsPageProps {
  metrics: ReportMetric[];
}

export function ReportsPage({ metrics }: ReportsPageProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => (
        <article
          key={metric.title}
          className="flex flex-col gap-4 rounded-3xl border border-border bg-panel p-6 shadow-card"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{metric.title}</p>
            <p className="mt-2 text-3xl font-bold text-text">{metric.value}</p>
            {metric.change && <p className="text-sm font-medium text-emerald-600">{metric.change}</p>}
          </div>
          {metric.chartData && (
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metric.chartData}>
                  <defs>
                    <linearGradient id={`gradient-${metric.title}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.65} />
                      <stop offset="95%" stopColor="#93c5fd" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill={`url(#gradient-${metric.title})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
