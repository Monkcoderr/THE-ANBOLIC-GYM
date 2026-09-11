"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { formatDisplayDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

const STATUS_LABEL = {
  active: "Active",
  expiring: "Expiring soon",
  expired: "Expired",
};

/**
 * VoidBillSheet — confirmation for deleting (voiding) an incorrect bill.
 *
 * Spells out exactly what the reversal will do before asking the admin to
 * confirm, using the preview the SERVER computed, so what is shown here is what
 * the void route will write.
 *
 * Two modes:
 *  • Reversible bill (`payment.canVoid`) — voids the bill AND restores the
 *    membership to the state it was in before this payment.
 *  • Blocked bill — a newer renewal exists, or the membership changed outside
 *    the renewal flow. The membership is left alone and only the financial
 *    record is voided, so revenue is corrected without corrupting anything.
 *
 * Props: { open, payment, memberId, memberName, onClose, onVoided }
 */
export default function VoidBillSheet({
  open,
  payment,
  memberId,
  memberName,
  onClose,
  onVoided,
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!payment) return null;

  const canRevert = !!payment.canVoid;
  const preview = payment.voidPreview;

  function close() {
    if (submitting) return;
    setReason("");
    setError("");
    onClose?.();
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/members/${memberId}/payments/${payment._id}/void`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reason.trim(),
            // Blocked bills are voided financially only — never guess at a
            // membership revert the server refused.
            voidOnly: !canRevert,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.error || "Could not void this bill. Nothing was changed.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      setReason("");
      onVoided?.(json.data);
    } catch {
      setError("Network error. Nothing was changed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="Delete this bill?"
      dismissable={!submitting}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error-soft">
            <AlertTriangle
              className="h-5 w-5 text-error-deep"
              aria-hidden="true"
            />
          </div>
          <p className="pt-1 text-[15px] leading-6 text-body">
            {canRevert ? (
              <>
                This will void the ₹{payment.amount} bill for{" "}
                <span className="font-medium text-ink">{memberName}</span> and
                reverse the membership changes it made.
              </>
            ) : (
              <>
                This will void the ₹{payment.amount} bill for{" "}
                <span className="font-medium text-ink">{memberName}</span> so it
                no longer counts toward revenue.
              </>
            )}
          </p>
        </div>

        {/* What will change — from the server's own preview. */}
        {canRevert && preview ? (
          <div className="rounded-md border border-hairline bg-canvas-soft px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-wide text-mute">
              The membership goes back to
            </p>
            <div className="mt-2 flex items-center gap-2 text-[15px] font-medium text-ink">
              <span className="text-mute line-through">
                {formatDisplayDate(preview.expiryFrom)}
              </span>
              <ArrowRight className="h-4 w-4 text-mute" aria-hidden="true" />
              <span>{formatDisplayDate(preview.expiryTo)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 border-t border-hairline pt-3 text-sm">
              <dt className="text-mute">Plan length</dt>
              <dd className="text-right font-medium text-ink">
                {preview.planDurationDays} days
              </dd>
              <dt className="text-mute">Status becomes</dt>
              <dd className="text-right font-medium text-ink">
                {STATUS_LABEL[preview.status] || preview.status}
              </dd>
            </dl>
            <p className="mt-3 text-xs text-mute">
              The joining date and every earlier bill stay exactly as they are.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md bg-warning-soft px-4 py-3">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-warning-deep"
              aria-hidden="true"
            />
            <div className="text-sm text-warning-deep">
              <p className="font-medium">The membership will not be changed.</p>
              <p className="mt-1">
                {payment.voidBlockedReason ||
                  "This bill can't be reversed on its own."}{" "}
                The expiry date stays as it is now, and only the money is
                removed from your revenue.
              </p>
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="voidReason"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            Reason (optional)
          </label>
          <textarea
            id="voidReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Wrong amount, wrong plan, wrong date…"
            className="w-full rounded-sm border border-hairline bg-canvas px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-mute focus:border-primary"
          />
          <p className="mt-1.5 text-xs text-mute">
            Kept with the voided bill for your records.
          </p>
        </div>

        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="h-11 flex-1 rounded-pill border border-hairline bg-canvas text-sm font-medium text-ink transition active:scale-[0.99] disabled:opacity-50"
          >
            Keep bill
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className={cn(
              "flex h-11 flex-1 items-center justify-center gap-2 rounded-pill bg-error text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-50"
            )}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Ban className="h-4 w-4" aria-hidden="true" />
            )}
            {canRevert ? "Delete & revert" : "Void bill only"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
