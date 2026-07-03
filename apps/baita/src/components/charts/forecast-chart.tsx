"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ForecastChartPoint = { date: string; closingBalance: number };

export function ForecastChart({ data }: { data: ForecastChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4b2e83" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#4b2e83" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted)" />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" />
        <Tooltip
          formatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }}
        />
        <ReferenceLine y={0} stroke="#b3261e" strokeDasharray="4 4" />
        <Area type="monotone" dataKey="closingBalance" stroke="#4b2e83" fill="url(#forecastFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
