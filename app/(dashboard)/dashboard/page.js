"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { Plus, Dumbbell } from "lucide-react";
import SearchBar from "@/components/dashboard/SearchBar";
import MIAAlert from "@/components/dashboard/MIAAlert";
import MemberCard from "@/components/dashboard/MemberCard";
import RenewalModal from "@/components/members/RenewalModal";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/ui/States";
import { useMembers } from "@/hooks/useMembers";
import { useGym } from "@/components/layout/GymContext";

function Section({ title, accent, members, gymName, onRenew, innerRef, emptyLabel }) {
  if (!members.length) {
    return (
      <section ref={innerRef} className="scroll-mt-20">
        <div className="rounded-lg border border-hairline bg-canvas-soft px-4 py-10 text-center">
          <p className="text-sm text-mute">No {emptyLabel || title.toLowerCase()} members.</p>
        </div>
      </section>
    );
  }
  return (
    <section ref={innerRef} className="scroll-mt-20">
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accent}`} aria-hidden="true" />
        <h2 className="font-mono text-xs uppercase tracking-wide text-mute">
          {title} · {members.length}
        </h2>
      </div>
      <ul className="space-y-3">
        {members.map((m) => (
          <li key={m._id}>
            <MemberCard
              member={m}
              gymName={gymName}
              href={`/members/${m._id}`}
              onRenew={onRenew}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

const TABS = [
  { key: "expired", label: "Expired", accent: "bg-error", dot: "bg-error" },
  { key: "expiring", label: "Expiring soon", accent: "bg-warning", dot: "bg-warning" },
  { key: "active", label: "Active", accent: "bg-cyan-deep", dot: "bg-cyan-deep" },
];

export default function DashboardPage() {
  const { gymName } = useGym();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("expired");
  const [renewing, setRenewing] = useState(null);
  const expiredRef = useRef(null);

  const { members, isLoading, isError, mutate } = useMembers({ limit: 1000 });

  const filtered = useMemo(() => {
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.phone.toLowerCase().includes(q)
    );
  }, [members, search]);

  const expired = filtered.filter((m) => m.status === "expired");
  const expiring = filtered.filter((m) => m.status === "expiring");
  const active = filtered.filter((m) => m.status === "active");
  const miaCount = expired.filter((m) => m.miaFlagged).length;

  const counts = { expired: expired.length, expiring: expiring.length, active: active.length };
  const buckets = { expired, expiring, active };
  const current = TABS.find((t) => t.key === tab) || TABS[0];
  const currentMembers = buckets[tab];

  return (
    <>
      {/* Hero band with premium gradient glow */}
      <header className="relative overflow-hidden border-b border-hairline bg-canvas px-4 pb-5 pt-8">
        <div
          className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-36"
          aria-hidden="true"
        />
        <div className="relative">
          <div className="absolute right-0 top-0">
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-on-primary">
              <Dumbbell className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="font-mono text-xs uppercase tracking-wide text-mute">
              {gymName}
            </p>
          </div>
          <h1 className="mt-3 text-[28px] font-semibold leading-9 tracking-[-1.2px] text-ink">
            Your members, at a glance.
          </h1>
        </div>
      </header>

      <div className="space-y-5 px-4 py-4">
        <SearchBar onSearch={setSearch} />

        {!isLoading && !isError && (
          <MIAAlert
            count={miaCount}
            onPress={() => {
              setTab("expired");
              expiredRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        )}

        {/* Status toggle — defaults to Expired so the owner sees churn first */}
        {!isLoading && !isError && members.length > 0 && (
          <div
            role="tablist"
            aria-label="Filter members by status"
            className="grid grid-cols-3 gap-2 rounded-lg border border-hairline bg-canvas-soft p-1"
          >
            {TABS.map((t) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium tracking-[-0.28px] transition ${
                    isActive
                      ? "btn-gradient shadow-[var(--shadow-subtle)]"
                      : "text-body active:bg-canvas"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      isActive ? "bg-white" : t.dot
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{t.label}</span>
                  <span
                    className={`ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-canvas text-ink"
                    }`}
                  >
                    {counts[t.key]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {isLoading ? (
          <CardSkeleton count={5} />
        ) : isError ? (
          <ErrorState onRetry={() => mutate()} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No members yet"
            message="Add your first member to start tracking renewals."
            action={
              <Link
                href="/members/new"
                className="btn-gradient inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-medium"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add member
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" message="Try a different search." />
        ) : (
          <Section
            title={current.label}
            accent={current.accent}
            members={currentMembers}
            gymName={gymName}
            onRenew={setRenewing}
            innerRef={tab === "expired" ? expiredRef : undefined}
            emptyLabel={current.label.toLowerCase()}
          />
        )}
      </div>

      {/* Floating add button */}
      <Link
        href="/members/new"
        aria-label="Add member"
        className="btn-gradient fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full shadow-[var(--shadow-float)] transition active:scale-95"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </Link>

      {renewing && (
        <RenewalModal
          member={renewing}
          gymName={gymName}
          onClose={() => setRenewing(null)}
          onSuccess={() => mutate()}
        />
      )}
    </>
  );
}
