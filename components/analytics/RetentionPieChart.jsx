"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = { active: "#29bc9b", churned: "#ee0000" };

/**
 * RetentionPieChart — active vs churned donut with center retention %.
 * Dynamically imported (no SSR).
 * Props: { active, expired }
 */
export default function RetentionPieChart({ active = 0, expired = 0 }) {
  const total = active + expired;
  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-mute">
        No member data yet.
      </div>
    );
  }

  const retentionRate = Math.round((active / total) * 100);
  const data = [
    { name: "Active", value: active, key: "active" },
    { name: "Churned", value: expired, key: "churned" },
  ];

  return (
    <div className="relative h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={64}
            outerRadius={88}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.key} fill={COLORS[d.key]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${value} members`, name]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #ebebeb",
              fontSize: 13,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tracking-[-1px] text-ink">
          {retentionRate}%
        </span>
        <span className="font-mono text-xs uppercase text-mute">Retention</span>
      </div>
    </div>
  );
}
