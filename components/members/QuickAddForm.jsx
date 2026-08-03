"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { computeMemberStatus, formatDisplayDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { Field, inputCls } from "@/components/ui/form";

const LENGTH_PRESETS = [
  { label: "1 Month", days: 30 },
  { label: "2 Months", days: 60 },
  { label: "3 Months", days: 90 },
  { label: "6 Months", days: 180 },
  { label: "1 Year", days: 365 },
];

const STATUS_LABEL = {
  active: { text: "Active", cls: "text-cyan-deep" },
  expiring: { text: "Expiring soon", cls: "text-warning-deep" },
  expired: { text: "Expired", cls: "text-error-deep" },
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * QuickAddForm — fast entry for existing/old members.
 * Works backwards from a known expiry date. Only name, phone and expiry are
 * required; plan length just backfills the recorded start date.
 *
 * Props: { onSubmit(formData), isSubmitting }
 * formData: { name, phone, planDurationDays, planEndDate }
 */
export default function QuickAddForm({ onSubmit, isSubmitting = false }) {
  const nameRef = useRef(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [customMemberId, setCustomMemberId] = useState("");
  const [expiry, setExpiry] = useState(todayInput());
  const [planDurationDays, setPlanDurationDays] = useState(30);
  const [errors, setErrors] = useState({});

  // Live status preview from the typed expiry date.
  const status = expiry ? computeMemberStatus(new Date(expiry)) : null;
  const statusInfo = status ? STATUS_LABEL[status] : null;

  function validate() {
    const e = {};
    if (!name.trim()) e.name = "Name is required.";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) e.phone = "Enter a valid 10-digit phone number.";
    if (!expiry) e.expiry = "Enter the current expiry date.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit?.({
      name: name.trim(),
      phone: phone.replace(/\D/g, ""),
      customMemberId: customMemberId.trim(),
      planDurationDays,
      planEndDate: expiry,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Full name" error={errors.name}>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className={inputCls(errors.name)}
        />
      </Field>

      <Field label="Phone number" error={errors.phone}>
        <div className="flex">
          <span className="inline-flex h-11 select-none items-center rounded-l-sm border border-r-0 border-hairline bg-canvas-soft-2 px-3 text-[15px] font-medium text-body">
            +91
          </span>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            maxLength={10}
            className={cn(inputCls(errors.phone), "rounded-l-none")}
          />
        </div>
      </Field>

      <Field label="Member ID (optional)" error={errors.customMemberId}>
        <input
          type="text"
          value={customMemberId}
          onChange={(e) => setCustomMemberId(e.target.value)}
          placeholder="e.g. GYM-001"
          autoCapitalize="characters"
          className={inputCls(errors.customMemberId)}
        />
      </Field>

      <Field label="Current expiry date" error={errors.expiry}>
        <input
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className={inputCls(errors.expiry)}
        />
        {statusInfo && (
          <p className="mt-1.5 text-sm text-body">
            Will be added as{" "}
            <span className={cn("font-medium", statusInfo.cls)}>
              {statusInfo.text}
            </span>{" "}
            · expires {formatDisplayDate(new Date(expiry))}
          </p>
        )}
      </Field>

      <Field label="Plan length (optional)">
        <div className="flex flex-wrap gap-2">
          {LENGTH_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setPlanDurationDays(p.days)}
              className={cn(
                "h-9 rounded-pill px-4 text-sm font-medium transition",
                planDurationDays === p.days
                  ? "btn-gradient"
                  : "border border-hairline bg-canvas text-ink hover:bg-canvas-soft-2"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-mute">
          Only used to record when they originally started. Doesn&apos;t change
          the expiry above.
        </p>
      </Field>

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-gradient flex h-12 w-full items-center justify-center gap-2 rounded-pill text-base font-medium transition active:scale-[0.99] disabled:opacity-60"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Save &amp; add another
      </button>
    </form>
  );
}
