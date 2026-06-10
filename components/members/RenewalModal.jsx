"use client";

import { useState, useMemo } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import ReceiptGenerator from "@/components/members/ReceiptGenerator";
import { addDays, formatDisplayDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

const PRESETS = [30, 60, 90, 180, 365];
const PRESET_LABELS = { 30: "1M", 60: "2M", 90: "3M", 180: "6M", 365: "1Y" };

/**
 * RenewalModal — collect payment + duration, renew, then show the receipt.
 * Props: { member, gymName, onSuccess, onClose }
 */
export default function RenewalModal({ member, gymName, onSuccess, onClose }) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [duration, setDuration] = useState(30);
  const [customDuration, setCustomDuration] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);

  const effectiveDuration = customDuration
    ? parseInt(customDuration, 10)
    : duration;

  const newExpiry = useMemo(() => {
    if (!effectiveDuration || effectiveDuration <= 0) return null;
    const base =
      member.status === "expired" ? new Date() : new Date(member.planEndDate);
    return addDays(base, effectiveDuration);
  }, [effectiveDuration, member.status, member.planEndDate]);

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!effectiveDuration || effectiveDuration <= 0) {
      setError("Choose a plan duration.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/members/renew/${member._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          paymentMethod,
          planDurationDays: effectiveDuration,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Renewal failed.");
        setIsSubmitting(false);
        return;
      }
      setReceipt(json.data.receiptText);
      setIsSubmitting(false);
    } catch {
      setError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  }

  function finish() {
    onSuccess?.();
    onClose?.();
  }

  return (
    <BottomSheet
      open
      onClose={isSubmitting ? undefined : onClose}
      title={receipt ? "Payment recorded" : `Renew — ${member.name}`}
      dismissable={!isSubmitting}
    >
      {receipt ? (
        <div className="space-y-5">
          <div className="flex items-center gap-2 rounded-md bg-cyan/15 px-4 py-3 text-cyan-deep">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            <p className="text-sm font-medium">
              Renewed until {formatDisplayDate(newExpiry)}
            </p>
          </div>
          <ReceiptGenerator receiptText={receipt} phone={member.phone} />
          <button
            type="button"
            onClick={finish}
            className="h-12 w-full rounded-pill bg-primary text-base font-medium text-on-primary transition active:scale-[0.99]"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              Amount (₹)
            </label>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1500"
              className="h-12 w-full rounded-sm border border-hairline bg-canvas px-3 text-base text-ink outline-none placeholder:text-mute focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              Payment method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {["Cash", "UPI"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={cn(
                    "h-11 rounded-sm text-sm font-medium transition",
                    paymentMethod === m
                      ? "btn-gradient"
                      : "border border-hairline bg-canvas text-ink hover:bg-canvas-soft-2"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              Plan duration
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDuration(d);
                    setCustomDuration("");
                  }}
                  className={cn(
                    "h-9 rounded-pill px-4 text-sm font-medium transition",
                    !customDuration && duration === d
                      ? "btn-gradient"
                      : "border border-hairline bg-canvas text-ink hover:bg-canvas-soft-2"
                  )}
                >
                  +{PRESET_LABELS[d]}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              placeholder="Custom days"
              className="mt-2 h-11 w-full rounded-sm border border-hairline bg-canvas px-3 text-[15px] text-ink outline-none placeholder:text-mute focus:border-primary"
            />
          </div>

          {newExpiry && (
            <div className="rounded-md bg-canvas-soft-2 px-4 py-3">
              <p className="font-mono text-xs uppercase tracking-wide text-mute">
                New expiry
              </p>
              <p className="mt-0.5 text-base font-medium text-ink">
                {formatDisplayDate(newExpiry)}
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary text-base font-medium text-on-primary transition active:scale-[0.99] disabled:opacity-60"
          >
            {isSubmitting && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Confirm renewal
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
