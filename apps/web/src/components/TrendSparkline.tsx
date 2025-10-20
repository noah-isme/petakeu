import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendPoint } from "../types/region";

interface TrendSparklineProps {
  data?: TrendPoint[];
}

export function TrendSparkline({ data }: TrendSparklineProps) {
  if (!data?.length) {
    return <p>Tidak ada data tren.</p>;
  }

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <XAxis dataKey="period" />
          <YAxis tickFormatter={(value) => `Rp ${Number(value).toLocaleString("id-ID")}`} width={120} />
          <Tooltip formatter={(value: number) => `Rp ${value.toLocaleString("id-ID")}`} />
          <Area type="monotone" dataKey="amount" stroke="#2563eb" fill="url(#trend)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
