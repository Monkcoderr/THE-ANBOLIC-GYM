"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Phone,
  Clock,
  ArrowRightCircle,
  Trash2,
  Flame,
  Tag,
} from "lucide-react";
import WhatsAppButton from "@/components/whatsapp/WhatsAppButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { leadFollowUpMessage } from "@/lib/whatsapp";
import { cn, formatIndiaPhone } from "@/lib/utils";

function ageText(hours) {
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const SOURCE_LABELS = {
  "walk-in": "Walk-in",
  referral: "Referral",
  social: "Social",
  other: "Other",
};

/**
 * LeadCard — a single lead with convert / info / delete actions.
 * Props: { lead, gymName, onDelete }
 */
export default function LeadCard({ lead, gymName, onDelete }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hoursOld = lead.hoursOld ?? 0;
  const needsFollowUp = hoursOld >= 48 && !lead.convertedToMember;

  function convert() {
    const qs = new URLSearchParams({
      name: lead.name || "",
      phone: lead.phone || "",
      leadId: lead._id,
    });
    if (lead.interest) qs.set("interest", lead.interest);
    router.push(`/members/new?${qs.toString()}`);
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete?.(lead._id);
    setDeleting(false);
    setConfirm(false);
  }

  return (
    <div
      className={cn(
        "rounded-md bg-canvas p-4 card-ring",
        needsFollowUp && "ring-1 ring-warning/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-medium text-ink">
              {lead.name}
            </h3>
            {needsFollowUp && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning-deep">
                <Flame className="h-3 w-3" aria-hidden="true" />
                Follow up
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-body">
            <Phone className="h-3.5 w-3.5 text-mute" aria-hidden="true" />
            {formatIndiaPhone(lead.phone)}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-mute">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {ageText(hoursOld)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs text-body">
        <span className="inline-flex items-center gap-1 rounded-full bg-canvas-soft px-2 py-0.5">
          <Tag className="h-3 w-3" aria-hidden="true" />
          {SOURCE_LABELS[lead.source] || "Walk-in"}
        </span>
        {lead.interest && (
          <span className="inline-flex items-center rounded-full bg-canvas-soft px-2 py-0.5">
            {lead.interest}
          </span>
        )}
      </div>

      {lead.notes && (
        <p className="mt-2 text-sm text-body">{lead.notes}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={convert}
          className="btn-gradient inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-medium transition active:scale-[0.98]"
        >
          <ArrowRightCircle className="h-4 w-4" aria-hidden="true" />
          Convert
        </button>
        <WhatsAppButton
          phone={lead.phone}
          message={leadFollowUpMessage(lead.name, gymName)}
          label="Follow up"
          variant="outline"
        />
        <button
          type="button"
          onClick={() => setConfirm(true)}
          aria-label="Delete lead"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-error transition hover:bg-canvas-soft-2"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Delete lead?"
        message={`Remove ${lead.name} from your leads. This can't be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
