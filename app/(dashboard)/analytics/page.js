"use client";

import dynamic from "next/dynamic";
import { Users, UserCheck, UserX, Sparkles } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import BroadcastVCF from "@/components/whatsapp/BroadcastVCF";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useGym } from "@/components/layout/GymContext";

const RevenueBarChart = dynamic(
  () => import("@/components/analytics/RevenueBarChart"),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> }
);
const RetentionPieChart = dynamic(
  () => import("@/components/analytics/RetentionPieChart"),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> }
);

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-md bg-canvas p-4 card-ring">
      <div className={`flex h-8 w-8 items-center justify-center rounded-md ${accent}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.96px] text-ink">
        {value}
      </p>
      <p className="font-mono text-xs uppercase text-mute">{label}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { gymName } = useGym();
  const { analytics, isLoading, isError, mutate } = useAnalytics();

  const stats = analytics?.memberStats || {
    total: 0,
    active: 0,
    expiring: 0,
    expired: 0,
    newThisMonth: 0,
  };

  return (
    <>
      <TopBar title="Analytics" />

      <div className="space-y-6 px-4 py-4">
        {isError ? (
          <ErrorState onRetry={() => mutate()} />
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))
              ) : (
                <>
                  <StatCard
                    icon={Users}
                    label="Total"
                    value={stats.total}
                    accent="bg-canvas-soft-2 text-ink"
                  />
                  <StatCard
                    icon={UserCheck}
                    label="Active"
                    value={stats.active}
                    accent="bg-[#aaffec]/50 text-cyan-deep"
                  />
                  <StatCard
                    icon={UserX}
                    label="Expired"
                    value={stats.expired}
                    accent="bg-error-soft text-error-deep"
                  />
                  <StatCard
                    icon={Sparkles}
                    label="New this month"
                    value={stats.newThisMonth}
                    accent="bg-link-bg-soft text-link-deep"
                  />
                </>
              )}
            </div>

            {/* Revenue chart */}
            <section className="rounded-lg bg-canvas p-5 card-ring">
              <h2 className="mb-1 text-base font-medium text-ink">
                Monthly revenue
              </h2>
              <p className="mb-3 font-mono text-xs uppercase text-mute">
                Last 6 months
              </p>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <RevenueBarChart data={analytics?.monthlyRevenue || []} />
              )}
            </section>

            {/* Retention chart */}
            <section className="rounded-lg bg-canvas p-5 card-ring">
              <h2 className="mb-1 text-base font-medium text-ink">
                Retention
              </h2>
              <p className="mb-3 font-mono text-xs uppercase text-mute">
                Active vs churned
              </p>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <RetentionPieChart
                  active={stats.active + stats.expiring}
                  expired={stats.expired}
                />
              )}
            </section>

            {/* Broadcast export */}
            <BroadcastVCF gymName={gymName} />
          </>
        )}
      </div>
    </>
  );
}
