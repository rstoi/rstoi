"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

export type DreTrendPoint = {
  period: string;
  netRevenue: number;
  ebitda: number;
  contributionMargin: number;
};

export function DreTrendChart({ data }: { data: DreTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="var(--muted)" />
        <YAxis tick={{ fontSize: 12 }} stroke="var(--muted)" />
        <Tooltip
          formatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="netRevenue" name="Receita líquida" stroke="#16213e" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#4b2e83" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="contributionMargin" name="Margem de contribuição" stroke="#b0266f" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
