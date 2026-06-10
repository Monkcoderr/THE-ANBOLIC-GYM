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
import { useThemeColors } from "@/hooks/useThemeColors";

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
  const c = useThemeColors();
  const ink = c.ink || "#171717";
  const hairline = c.hairline || "#ebebeb";
  const mute = c.mute || "#888888";
  const hover = c.canvasSoft2 || "#f5f5f5";

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
          <CartesianGrid vertical={false} stroke={hairline} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: mute }}
            tickLine={false}
            axisLine={{ stroke: hairline }}
          />
          <YAxis
            tickFormatter={formatRupee}
            tick={{ fontSize: 11, fill: mute }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: hover }} />
          <Bar dataKey="totalAmount" fill={ink} radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
