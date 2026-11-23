"use client";
// The 3 charts on /business (Recharts). Data and labels come from BusinessView.

import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Fmt = (n: number) => string;

export function DailySalesChart({ data, taka, day, label }: { data: { day: string; sales: number }[]; taka: Fmt; day: (d: string) => string; label: string }) {
  return (
    <div role="img" aria-label={label} className="h-[230px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#F1F5F9" vertical={false} />
          <XAxis dataKey="day" tickFormatter={day} tick={{ fontSize: 12, fill: "#64748B" }} minTickGap={24} />
          <YAxis tickFormatter={taka} tick={{ fontSize: 12, fill: "#64748B" }} width={84} />
          <Tooltip formatter={(v) => taka(Number(v))} labelFormatter={(d) => day(String(d))} />
          <Area type="monotone" dataKey="sales" stroke="#16A34A" strokeWidth={3} fill="#DCFCE7" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Horizontal bars with the amount at the end (expense breakdown, top 5 products).
export function BarList({ data, color, taka, label }: { data: { name: string; value: number }[]; color: string; taka: Fmt; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height: 44 * data.length + 10 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 90, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 15, fill: "#0F172A" }} />
          <Bar dataKey="value" fill={color} radius={999} barSize={14} background={{ fill: "#F1F5F9", radius: 999 }} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" formatter={(v) => taka(Number(v))} style={{ fontSize: 15, fontWeight: 700, fill: "#0F172A" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
