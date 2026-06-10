"use client";

import { useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { addDays, formatDisplayDate } from "@/lib/dateUtils";
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

/**
 * MemberForm — create/edit a member.
 * Props: { initialData, onSubmit, isSubmitting, submitLabel, lockPlanFields }
 */
export default function MemberForm({
  initialData = {},
  onSubmit,
  isSubmitting = false,
  submitLabel = "Save member",
  lockPlanFields = false,
}) {
  const [name, setName] = useState(initialData.name || "");
  const [phone, setPhone] = useState(initialData.phone || "");
  const [planDurationDays, setPlanDurationDays] = useState(
    initialData.planDurationDays || 30
  );
  const [customDuration, setCustomDuration] = useState("");
  const [planStartDate, setPlanStartDate] = useState(
    initialData.planStartDate
      ? new Date(initialData.planStartDate).toISOString().slice(0, 10)
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
      return addDays(new Date(planStartDate), effectiveDuration);
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
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit?.({
      name: name.trim(),
      phone: phone.replace(/\D/g, ""),
      planDurationDays: effectiveDuration,
      planStartDate,
      address: address.trim(),
      notes: notes.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Full name" error={errors.name}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rahul Sharma"
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
            placeholder="9876543210"
            maxLength={10}
            className={cn(inputCls(errors.phone), "rounded-l-none")}
          />
        </div>
      </Field>

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
                      ? "bg-primary text-on-primary"
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
        className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary text-base font-medium text-on-primary transition active:scale-[0.99] disabled:opacity-60"
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
