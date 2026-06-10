"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const INTERESTS = ["1M", "2M", "3M", "6M", "Other"];
const SOURCES = [
  { value: "walk-in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];

/**
 * LeadForm — capture a new walk-in lead.
 * Props: { onSubmit, isSubmitting }
 */
export default function LeadForm({ onSubmit, isSubmitting = false }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("1M");
  const [source, setSource] = useState("walk-in");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!name.trim()) e.name = "Name is required.";
    if (phone.replace(/\D/g, "").length < 10)
      e.phone = "Enter a valid 10-digit phone number.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit?.({
      name: name.trim(),
      phone: phone.replace(/\D/g, ""),
      interest,
      source,
      notes: notes.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">Name</label>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Visitor's name"
          className={inputCls(errors.name)}
        />
        {errors.name && <p className="mt-1.5 text-sm text-error">{errors.name}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">Phone</label>
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
        {errors.phone && (
          <p className="mt-1.5 text-sm text-error">{errors.phone}</p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">
          Interested in
        </label>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInterest(i)}
              className={chipCls(interest === i)}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">Source</label>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSource(s.value)}
              className={chipCls(source === s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What did they ask about?"
          className={cn(inputCls(), "h-auto py-2.5")}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary text-base font-medium text-on-primary transition active:scale-[0.99] disabled:opacity-60"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Save lead
      </button>
    </form>
  );
}

function inputCls(error) {
  return cn(
    "h-11 w-full rounded-sm border bg-canvas px-3 text-[15px] text-ink outline-none placeholder:text-mute focus:border-primary",
    error ? "border-error" : "border-hairline"
  );
}

function chipCls(active) {
  return cn(
    "h-9 rounded-pill px-4 text-sm font-medium transition",
    active
      ? "btn-gradient"
      : "border border-hairline bg-canvas text-ink hover:bg-canvas-soft-2"
  );
}
