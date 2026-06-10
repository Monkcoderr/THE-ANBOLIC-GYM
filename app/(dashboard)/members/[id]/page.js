"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import {
  Phone,
  MapPin,
  StickyNote,
  RefreshCw,
  Pencil,
  Trash2,
  CalendarDays,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import StatusBadge from "@/components/dashboard/StatusBadge";
import PaymentHistory from "@/components/members/PaymentHistory";
import RenewalModal from "@/components/members/RenewalModal";
import WhatsAppButton from "@/components/whatsapp/WhatsAppButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ErrorState, CardSkeleton } from "@/components/ui/States";
import { fetcher } from "@/lib/fetcher";
import { reminderForMember } from "@/lib/whatsapp";
import { formatDisplayDate } from "@/lib/dateUtils";
import { formatIndiaPhone } from "@/lib/utils";
import { useGym } from "@/components/layout/GymContext";

export default function MemberDetailPage({ params }) {
  const router = useRouter();
  const { gymName } = useGym();
  const { data, error, isLoading, mutate } = useSWR(
    `/api/members/${params.id}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [renewing, setRenewing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/members/${params.id}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok && json.success) {
        router.replace("/members");
        return;
      }
    } catch {
      /* fallthrough */
    }
    setDeleting(false);
    setConfirmDelete(false);
  }

  const member = data?.member;
  const payments = data?.payments || [];

  return (
    <>
      <TopBar title="Member" showBack />
      <div className="space-y-6 px-4 py-4">
        {isLoading ? (
          <CardSkeleton count={1} />
        ) : error ? (
          <ErrorState
            message={error.status === 404 ? "Member not found." : undefined}
            onRetry={() => mutate()}
          />
        ) : (
          <>
            {/* Profile header */}
            <section className="rounded-lg bg-canvas p-5 card-ring-float">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold tracking-[-0.96px] text-ink">
                    {member.name}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-body">
                    <Phone className="h-4 w-4 text-mute" aria-hidden="true" />
                    {formatIndiaPhone(member.phone)}
                  </p>
                </div>
                <StatusBadge status={member.status} mia={member.miaFlagged} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
                <div>
                  <dt className="flex items-center gap-1 font-mono text-xs uppercase text-mute">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    Expires
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">
                    {formatDisplayDate(member.planEndDate)}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-xs uppercase text-mute">Joined</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">
                    {formatDisplayDate(member.joinDate)}
                  </dd>
                </div>
                {member.address && (
                  <div className="col-span-2">
                    <dt className="flex items-center gap-1 font-mono text-xs uppercase text-mute">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      Address
                    </dt>
                    <dd className="mt-0.5 text-sm text-body">{member.address}</dd>
                  </div>
                )}
                {member.notes && (
                  <div className="col-span-2">
                    <dt className="flex items-center gap-1 font-mono text-xs uppercase text-mute">
                      <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                      Notes
                    </dt>
                    <dd className="mt-0.5 text-sm text-body">{member.notes}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRenewing(true)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-pill bg-primary px-4 text-sm font-medium text-on-primary transition active:scale-[0.98]"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Renew
                </button>
                <WhatsAppButton
                  phone={member.phone}
                  message={reminderForMember(member, gymName)}
                  label="Remind"
                  variant="outline"
                  className="h-10"
                />
                <Link
                  href={`/members/${member._id}/edit`}
                  className="btn-gradient inline-flex h-10 items-center gap-1.5 rounded-pill px-4 text-sm font-medium transition active:scale-[0.98]"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete member"
                  className="inline-flex h-10 items-center gap-1.5 rounded-pill border border-hairline bg-canvas px-4 text-sm font-medium text-error transition active:scale-[0.98]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </section>

            {/* Payment history */}
            <section>
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wide text-mute">
                Payment history
              </h3>
              <PaymentHistory payments={payments} />
            </section>
          </>
        )}
      </div>

      {renewing && member && (
        <RenewalModal
          member={member}
          gymName={gymName}
          onClose={() => setRenewing(false)}
          onSuccess={() => mutate()}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete member?"
        message={`This removes ${member?.name || "this member"} from your lists. Payment history is preserved. This can't be undone here.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
