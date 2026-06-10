"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function formatRupee(value) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
  return `₹${value}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const { totalAmount, paymentCount } = payload[0].payload;
  return (
    <div className="rounded-md bg-primary px-3 py-2 text-on-primary shadow-[var(--shadow-modal)]">
      <p className="font-mono text-xs text-white/70">{label}</p>
      <p className="text-sm font-medium">₹{totalAmount.toLocaleString("en-IN")}</p>
      <p className="text-xs text-white/70">
        {paymentCount} payment{paymentCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/**
 * RevenueBarChart — monthly revenue. Dynamically imported (no SSR).
 * Props: { data: [{ month, totalAmount, paymentCount }] }
 */
export default function RevenueBarChart({ data = [] }) {
  if (!data.length) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-mute">
        No revenue recorded yet.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#ebebeb" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#888888" }}
            tickLine={false}
            axisLine={{ stroke: "#ebebeb" }}
          />
          <YAxis
            tickFormatter={formatRupee}
            tick={{ fontSize: 11, fill: "#888888" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f5f5f5" }} />
          <Bar dataKey="totalAmount" fill="#171717" radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
