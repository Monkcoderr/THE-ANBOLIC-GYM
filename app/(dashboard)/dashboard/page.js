"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { Plus, Dumbbell } from "lucide-react";
import SearchBar from "@/components/dashboard/SearchBar";
import MIAAlert from "@/components/dashboard/MIAAlert";
import MemberCard from "@/components/dashboard/MemberCard";
import RenewalModal from "@/components/members/RenewalModal";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/ui/States";
import { useMembers } from "@/hooks/useMembers";
import { useGym } from "@/components/layout/GymContext";

function Section({ title, accent, members, gymName, onRenew, innerRef }) {
  if (!members.length) return null;
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

export default function DashboardPage() {
  const { gymName } = useGym();
  const [search, setSearch] = useState("");
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

  return (
    <>
      {/* Hero band with mesh gradient */}
      <header className="relative overflow-hidden border-b border-hairline bg-canvas px-4 pb-5 pt-8">
        <div
          className="mesh-gradient pointer-events-none absolute inset-x-0 top-0 h-32 opacity-[0.18] blur-2xl"
          aria-hidden="true"
        />
        <div className="relative">
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
            onPress={() =>
              expiredRef.current?.scrollIntoView({ behavior: "smooth" })
            }
          />
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
                className="inline-flex h-10 items-center gap-2 rounded-pill bg-primary px-4 text-sm font-medium text-on-primary"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add member
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" message="Try a different search." />
        ) : (
          <div className="space-y-6">
            <Section
              title="Expired"
              accent="bg-error"
              members={expired}
              gymName={gymName}
              onRenew={setRenewing}
              innerRef={expiredRef}
            />
            <Section
              title="Expiring soon"
              accent="bg-warning"
              members={expiring}
              gymName={gymName}
              onRenew={setRenewing}
            />
            <Section
              title="Active"
              accent="bg-cyan-deep"
              members={active}
              gymName={gymName}
              onRenew={setRenewing}
            />
          </div>
        )}
      </div>

      {/* Floating add button */}
      <Link
        href="/members/new"
        aria-label="Add member"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-[var(--shadow-float)] transition active:scale-95"
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
