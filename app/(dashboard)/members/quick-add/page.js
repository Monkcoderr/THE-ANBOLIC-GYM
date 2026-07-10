"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { CheckCircle2 } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import QuickAddForm from "@/components/members/QuickAddForm";
import { formatDisplayDate } from "@/lib/dateUtils";

export default function QuickAddPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [added, setAdded] = useState([]); // most-recent first

  async function handleSubmit(formData) {
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Could not add member.");
        setIsSubmitting(false);
        return;
      }
      setAdded((prev) => [
        {
          _id: json.data._id,
          name: json.data.name,
          planEndDate: json.data.planEndDate,
        },
        ...prev,
      ]);
      // Invalidate every cached members list so /members and /dashboard show
      // the new member immediately (no waiting for the 30s dedupe window).
      mutate(
        (key) => typeof key === "string" && key.startsWith("/api/members"),
        undefined,
        { revalidate: true }
      );
      // Reset the form for the next entry.
      setFormKey((k) => k + 1);
      setIsSubmitting(false);
    } catch {
      setError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <TopBar title="Add old members" showBack />
      <div className="px-4 py-4">
        <p className="mb-4 rounded-md bg-canvas-soft-2 px-4 py-3 text-sm text-body">
          Quickly add existing members by their current expiry date. Enter one,
          tap <span className="font-medium text-ink">Save &amp; add another</span>,
          and keep going. Tap Done when finished.
        </p>

        {error && (
          <p
            className="mb-4 rounded-md bg-error-soft px-4 py-3 text-sm text-error-deep"
            role="alert"
          >
            {error}
          </p>
        )}

        {added.length > 0 && (
          <div className="mb-5 flex items-center justify-between rounded-md bg-canvas-soft-2 px-4 py-3">
            <p className="text-sm font-medium text-ink">
              {added.length} member{added.length > 1 ? "s" : ""} added
            </p>
            <button
              type="button"
              onClick={() => router.push("/members")}
              className="btn-gradient inline-flex h-9 items-center rounded-pill px-4 text-sm font-medium"
            >
              Done
            </button>
          </div>
        )}

        <QuickAddForm
          key={formKey}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />

        {added.length > 0 && (
          <ul className="mt-6 space-y-2" aria-label="Recently added">
            {added.map((m) => (
              <li
                key={m._id}
                className="flex items-center gap-2 rounded-md border border-hairline bg-canvas px-3 py-2.5"
              >
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-cyan-deep"
                  aria-hidden="true"
                />
                <span className="flex-1 truncate text-sm font-medium text-ink">
                  {m.name}
                </span>
                <span className="font-mono text-xs text-mute">
                  {formatDisplayDate(new Date(m.planEndDate))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
