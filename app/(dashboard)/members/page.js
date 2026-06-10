"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import SearchBar from "@/components/dashboard/SearchBar";
import MemberCard from "@/components/dashboard/MemberCard";
import RenewalModal from "@/components/members/RenewalModal";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/ui/States";
import { useMembers } from "@/hooks/useMembers";
import { useGym } from "@/components/layout/GymContext";

export default function MembersPage() {
  const router = useRouter();
  const { gymName } = useGym();
  const [search, setSearch] = useState("");
  const [renewing, setRenewing] = useState(null);

  const { members, isLoading, isError, mutate } = useMembers({ search });

  return (
    <>
      <TopBar title="Members" />

      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SearchBar onSearch={setSearch} />
          </div>
          <Link
            href="/members/new"
            aria-label="Add member"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition active:scale-95"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

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
                ? "Try a different name or phone number."
                : "Add your first member to get started."
            }
            action={
              !search && (
                <Link
                  href="/members/new"
                  className="inline-flex h-10 items-center gap-2 rounded-pill bg-primary px-4 text-sm font-medium text-on-primary"
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
