"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Users, History } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import SearchBar from "@/components/dashboard/SearchBar";
import MemberCard from "@/components/dashboard/MemberCard";
import RenewalModal from "@/components/members/RenewalModal";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/ui/States";
import { useMembers } from "@/hooks/useMembers";
import { useGym } from "@/components/layout/GymContext";

export default function MembersPage() {
  const { gymName } = useGym();
  const [search, setSearch] = useState("");
  const [renewing, setRenewing] = useState(null);

  // Fetch the full list once (shares SWR cache key with the dashboard) and
  // filter in memory. This matches the product spec's "client-side filter
  // array logic" and avoids a debounced API round-trip + regex DB scan on
  // every keystroke.
  const { members: allMembers, isLoading, isError, mutate } = useMembers({
    limit: 1000,
  });

  const members = useMemo(() => {
    if (!search) return allMembers;
    const q = search.toLowerCase();
    return allMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q) ||
        (m.customMemberId && m.customMemberId.toLowerCase().includes(q))
    );
  }, [allMembers, search]);

  return (
    <>
      <TopBar title="Members" />

      <div className="space-y-4 px-4 py-4">
        <SearchBar onSearch={setSearch} />

        <Link
          href="/members/new"
          className="btn-gradient flex h-12 w-full items-center justify-center gap-2 rounded-pill text-base font-medium shadow-[var(--shadow-subtle)] transition active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add new member
        </Link>

        <Link
          href="/members/quick-add"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-pill border border-hairline bg-canvas text-sm font-medium text-body transition hover:bg-canvas-soft-2 active:scale-[0.98]"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Add old members (by expiry)
        </Link>

        {isLoading ? (
          <CardSkeleton count={5} />
        ) : isError ? (
          <ErrorState onRetry={() => mutate()} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? "No matches" : "No members yet"}
            message={
              search
                ? "Try a different name, phone number, or member ID."
                : "Add your first member to get started."
            }
            action={
              !search && (
                <Link
                  href="/members/new"
                  className="btn-gradient inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-medium"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add member
                </Link>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m._id}>
                <MemberCard
                  member={m}
                  gymName={gymName}
                  href={`/members/${m._id}`}
                  onRenew={setRenewing}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

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
