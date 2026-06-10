"use client";

import { useState } from "react";
import { Plus, UserPlus, Flame } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import LeadCard from "@/components/leads/LeadCard";
import LeadForm from "@/components/leads/LeadForm";
import BottomSheet from "@/components/ui/BottomSheet";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/ui/States";
import { useLeads } from "@/hooks/useLeads";
import { useGym } from "@/components/layout/GymContext";

export default function LeadsPage() {
  const { gymName } = useGym();
  const { leads, isLoading, isError, mutate } = useLeads();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const hotLeads = leads.filter((l) => (l.hoursOld ?? 0) >= 48);
  const normalLeads = leads.filter((l) => (l.hoursOld ?? 0) < 48);

  async function handleCreate(formData) {
    setIsSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.error || "Could not save lead.");
        setIsSubmitting(false);
        return;
      }
      setSheetOpen(false);
      setIsSubmitting(false);
      mutate();
    } catch {
      setFormError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id) {
    try {
      await fetch(`/api/leads/${id}`, { method: "DELETE" });
      mutate();
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <TopBar title="Leads" />

      <div className="space-y-5 px-4 py-4">
        <button
          type="button"
          onClick={() => {
            setFormError("");
            setSheetOpen(true);
          }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-primary text-sm font-medium text-on-primary transition active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add lead
        </button>

        {isLoading ? (
          <CardSkeleton count={3} />
        ) : isError ? (
          <ErrorState onRetry={() => mutate()} />
        ) : leads.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No leads yet"
            message="Capture walk-in inquiries here and convert them to members."
          />
        ) : (
          <div className="space-y-6">
            {hotLeads.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Flame className="h-4 w-4 text-warning" aria-hidden="true" />
                  <h2 className="font-mono text-xs uppercase tracking-wide text-warning-deep">
                    Needs follow-up · {hotLeads.length}
                  </h2>
                </div>
                <ul className="space-y-3">
                  {hotLeads.map((l) => (
                    <li key={l._id}>
                      <LeadCard lead={l} gymName={gymName} onDelete={handleDelete} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {normalLeads.length > 0 && (
              <section>
                {hotLeads.length > 0 && (
                  <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-mute">
                    Recent · {normalLeads.length}
                  </h2>
                )}
                <ul className="space-y-3">
                  {normalLeads.map((l) => (
                    <li key={l._id}>
                      <LeadCard lead={l} gymName={gymName} onDelete={handleDelete} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => !isSubmitting && setSheetOpen(false)}
        title="New lead"
        dismissable={!isSubmitting}
      >
        {formError && (
          <p className="mb-4 rounded-md bg-error-soft px-4 py-3 text-sm text-error-deep" role="alert">
            {formError}
          </p>
        )}
        <LeadForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </BottomSheet>
    </>
  );
}
