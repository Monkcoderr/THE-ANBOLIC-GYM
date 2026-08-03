"use client";

import { useState, useMemo, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { computeInitialExpiry, formatDisplayDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "1 Month", days: 30 },
  { label: "2 Months", days: 60 },
  { label: "3 Months", days: 90 },
  { label: "6 Months", days: 180 },
  { label: "1 Year", days: 365 },
];

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

/** "05" → "5th", for the fixed renewal-day hint. */
function ordinalDay(isoDate) {
  const day = new Date(isoDate).getDate();
  if (!day) return "";
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * MemberForm — create/edit a member.
 * Props: { initialData, onSubmit, isSubmitting, submitLabel, lockPlanFields, editJoinDate, autoGenerateId }
 * When autoGenerateId is true (new-member flow), the Member ID field is
 * prefilled with the next sequential ID from the server and can be overridden.
 */
export default function MemberForm({
  initialData = {},
  onSubmit,
  isSubmitting = false,
  submitLabel = "Save member",
  lockPlanFields = false,
  editJoinDate = false,
  autoGenerateId = false,
}) {
  const [name, setName] = useState(initialData.name || "");
  const [phone, setPhone] = useState(initialData.phone || "");
  const [customMemberId, setCustomMemberId] = useState(
    initialData.customMemberId || ""
  );
  // Server-suggested next ID (auto-generate flow only). Tracked so we can tell
  // the API whether the admin kept the suggestion or typed their own value.
  const [suggestedId, setSuggestedId] = useState("");
  const [idLoading, setIdLoading] = useState(false);

  useEffect(() => {
    // Only for brand-new members that don't already carry an ID.
    if (!autoGenerateId || initialData.customMemberId) return;
    let cancelled = false;
    setIdLoading(true);
    fetch("/api/members/next-id")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.success) return;
        const nextId = json.data?.nextId || "";
        setSuggestedId(nextId);
        // Prefill only if the admin hasn't already started typing an ID.
        setCustomMemberId((cur) => (cur ? cur : nextId));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIdLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerateId]);
  const [planDurationDays, setPlanDurationDays] = useState(
    initialData.planDurationDays || 30
  );
  const [customDuration, setCustomDuration] = useState("");
  const [planStartDate, setPlanStartDate] = useState(
    initialData.planStartDate
      ? new Date(initialData.planStartDate).toISOString().slice(0, 10)
      : todayInput()
  );
  const [joinDate, setJoinDate] = useState(
    initialData.joinDate
      ? new Date(initialData.joinDate).toISOString().slice(0, 10)
      : todayInput()
  );
  const [address, setAddress] = useState(initialData.address || "");
  const [notes, setNotes] = useState(initialData.notes || "");
  const [errors, setErrors] = useState({});

  const effectiveDuration = customDuration
    ? parseInt(customDuration, 10)
    : planDurationDays;

  const endPreview = useMemo(() => {
    if (!effectiveDuration || effectiveDuration <= 0) return null;
    try {
      // Expiry is anchored to the joining day-of-month, not raw day count.
      return computeInitialExpiry(new Date(planStartDate), effectiveDuration);
    } catch {
      return null;
    }
  }, [planStartDate, effectiveDuration]);

  function validate() {
    const e = {};
    if (!name.trim()) e.name = "Name is required.";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) e.phone = "Enter a valid 10-digit phone number.";
    if (!lockPlanFields && (!effectiveDuration || effectiveDuration <= 0))
      e.duration = "Choose a plan duration.";
    if (editJoinDate && !joinDate) e.joinDate = "Joining date is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      name: name.trim(),
      phone: phone.replace(/\D/g, ""),
      customMemberId: customMemberId.trim(),
      // True when the admin kept the server-suggested ID unedited, so the API
      // may safely auto-advance the number on a concurrent collision.
      autoAssignId:
        autoGenerateId &&
        suggestedId !== "" &&
        customMemberId.trim() === suggestedId,
      planDurationDays: effectiveDuration,
      planStartDate,
      address: address.trim(),
      notes: notes.trim(),
    };
    // Joining date is only editable on the edit screen; it's the permanent
    // billing anchor every future renewal is calculated from.
    if (editJoinDate) payload.joinDate = joinDate;
    onSubmit?.(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Full name" error={errors.name}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder=""
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
            placeholder=""
            maxLength={10}
            className={cn(inputCls(errors.phone), "rounded-l-none")}
          />
        </div>
      </Field>

      <Field
        label={autoGenerateId ? "Member ID" : "Member ID (optional)"}
        error={errors.customMemberId}
      >
        <input
          type="text"
          value={customMemberId}
          onChange={(e) => setCustomMemberId(e.target.value)}
          placeholder={idLoading ? "Generating…" : "e.g. GYM-001"}
          autoCapitalize="characters"
          className={inputCls(errors.customMemberId)}
        />
        <p className="mt-1.5 text-xs text-mute">
          {autoGenerateId
            ? "Auto-filled with the next available ID. Edit if needed — it must be unique."
            : "A unique ID for this member. Shown on their card and searchable."}
        </p>
      </Field>

      {editJoinDate && (
        <Field label="Joining date" error={errors.joinDate}>
          <input
            type="date"
            value={joinDate}
            onChange={(e) => setJoinDate(e.target.value)}
            className={inputCls(errors.joinDate)}
          />
          <p className="mt-1.5 text-xs text-mute">
            Sets the fixed monthly renewal day
            {joinDate
              ? ` (the ${ordinalDay(joinDate)} of each month)`
              : ""}
            . Every future renewal is anchored to this date, whatever day
            payment is made.
          </p>
        </Field>
      )}

      {!lockPlanFields && (
        <>
          <Field label="Plan duration" error={errors.duration}>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => {
                    setPlanDurationDays(p.days);
                    setCustomDuration("");
                  }}
                  className={cn(
                    "h-9 rounded-pill px-4 text-sm font-medium transition",
                    !customDuration && planDurationDays === p.days
                      ? "btn-gradient"
                      : "border border-hairline bg-canvas text-ink hover:bg-canvas-soft-2"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              placeholder="Custom days"
              className={cn(inputCls(), "mt-2")}
            />
          </Field>

          <Field label="Plan start date">
            <input
              type="date"
              value={planStartDate}
              onChange={(e) => setPlanStartDate(e.target.value)}
              className={inputCls()}
            />
          </Field>

          {endPreview && (
            <div className="rounded-md bg-canvas-soft-2 px-4 py-3">
              <p className="font-mono text-xs uppercase tracking-wide text-mute">
                Plan ends
              </p>
              <p className="mt-0.5 text-base font-medium text-ink">
                {formatDisplayDate(endPreview)}
              </p>
            </div>
          )}
        </>
      )}

      <Field label="Address (optional)">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Area, city"
          className={inputCls()}
        />
      </Field>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Goals, preferences, health notes…"
          className={cn(inputCls(), "h-auto py-2.5")}
        />
      </Field>

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-gradient flex h-12 w-full items-center justify-center gap-2 rounded-pill text-base font-medium transition active:scale-[0.99] disabled:opacity-60"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </button>
    </form>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-sm text-error">{error}</p>}
    </div>
  );
}

function inputCls(error) {
  return cn(
    "h-11 w-full rounded-sm border bg-canvas px-3 text-[15px] text-ink outline-none placeholder:text-mute focus:border-primary",
    error ? "border-error" : "border-hairline"
  );
}
