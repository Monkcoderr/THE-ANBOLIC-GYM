"use client";

import Link from "next/link";
import { Phone, RefreshCw, AlertOctagon, ChevronRight } from "lucide-react";
import StatusBadge from "@/components/dashboard/StatusBadge";
import WhatsAppButton from "@/components/whatsapp/WhatsAppButton";
import { reminderForMember } from "@/lib/whatsapp";
import { cn, formatIndiaPhone } from "@/lib/utils";

function expiryText(member) {
  if (member.status === "expired") {
    const d = member.daysSinceExpiry;
    return d === 0 ? "Expired today" : `Expired ${d} day${d === 1 ? "" : "s"} ago`;
  }
  const d = member.daysUntilExpiry;
  if (d === 0) return "Expires today";
  return `${d} day${d === 1 ? "" : "s"} left`;
}

/**
 * MemberCard — summary card for a member in any list.
 * Props: { member, onRenew, gymName, href }
 */
export default function MemberCard({ member, onRenew, gymName, href }) {
  const canRenew = member.status === "expired" || member.status === "expiring";
  const reminder = reminderForMember(member, gymName);

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-medium text-ink">
              {member.name}
            </h3>
            {member.miaFlagged && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-error px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white"
                title="Missing 7+ days"
              >
                <AlertOctagon className="h-3 w-3" aria-hidden="true" />
                MIA
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-body">
            <Phone className="h-3.5 w-3.5 text-mute" aria-hidden="true" />
            {formatIndiaPhone(member.phone)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={member.status} />
          <span
            className={cn(
              "font-mono text-xs",
              member.status === "expired" ? "text-error-deep" : "text-mute"
            )}
          >
            {expiryText(member)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {canRenew && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRenew?.(member);
            }}
            className="btn-gradient inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-medium transition active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Renew
          </button>
        )}
        <WhatsAppButton
          phone={member.phone}
          message={reminder}
          label="Nudge"
          variant="outline"
        />
        {href && (
          <span className="ml-auto text-mute" aria-hidden="true">
            <ChevronRight className="h-5 w-5" />
          </span>
        )}
      </div>
    </>
  );

  const base =
    "block rounded-md bg-canvas p-4 card-ring transition hover:bg-canvas-soft-2";
  const miaRing = member.miaFlagged ? "ring-1 ring-error/30" : "";

  if (href) {
    return (
      <Link href={href} className={cn(base, miaRing)}>
        {inner}
      </Link>
    );
  }
  return <div className={cn(base, miaRing)}>{inner}</div>;
}
