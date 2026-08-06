"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Trash2, RotateCcw, Phone } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/ui/States";
import { fetcher } from "@/lib/fetcher";
import { formatDisplayDate } from "@/lib/dateUtils";
import { formatIndiaPhone } from "@/lib/utils";

export default function DeletedMembersPage() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/members/deleted",
    fetcher,
    { revalidateOnFocus: false }
  );
  // Tracks the id currently being restored + any per-row error message.
  const [restoringId, setRestoringId] = useState(null);
  const [rowError, setRowError] = useState({ id: null, message: "" });

  const members = data?.members || [];

  async function handleRestore(id) {
    setRestoringId(id);
    setRowError({ id: null, message: "" });
    try {
      const res = await fetch(`/api/members/${id}/restore`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.success) {
        await mutate();
      } else {
        setRowError({
          id,
          message: json.error || "Couldn't restore this member.",
        });
      }
    } catch {
      setRowError({ id, message: "Network error. Try again." });
    }
    setRestoringId(null);
  }

  return (
    <>
      <TopBar title="Recently deleted" showBack />
      <div className="space-y-4 px-4 py-4">
        <p className="text-sm text-body">
          Deleted members are kept here so you can undo mistakes. Restoring
          brings back the same details, member ID, and full payment history.
        </p>

        {isLoading ? (
          <CardSkeleton count={3} />
        ) : error ? (
          <ErrorState onRetry={() => mutate()} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title="Nothing deleted"
            message="Members you delete will appear here, ready to restore."
            action={
              <Link
                href="/members"
                className="btn-gradient inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-medium"
              >
                Back to members
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {members.map((m) => (
              <li
                key={m._id}
                className="rounded-lg bg-canvas p-4 card-ring-float"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-ink">
                        {m.name}
                      </h3>
                      {m.customMemberId && (
                        <span className="inline-flex items-center rounded-md bg-link-bg-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-link-deep">
                          #{m.customMemberId}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-body">
                      <Phone className="h-3.5 w-3.5 text-mute" aria-hidden="true" />
                      {formatIndiaPhone(m.phone)}
                    </p>
                    <p className="mt-0.5 text-xs text-mute">
                      Expired plan until {formatDisplayDate(m.planEndDate)}
                    </p>
                  </div>
                  <StatusBadge status={m.status} mia={m.miaFlagged} />
                </div>

                <button
                  type="button"
                  onClick={() => handleRestore(m._id)}
                  disabled={restoringId === m._id}
                  className="btn-gradient mt-3 inline-flex h-10 items-center gap-1.5 rounded-pill px-4 text-sm font-medium transition active:scale-[0.98] disabled:opacity-60"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {restoringId === m._id ? "Restoring…" : "Restore"}
                </button>

                {rowError.id === m._id && rowError.message && (
                  <p className="mt-2 text-sm text-error">{rowError.message}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
