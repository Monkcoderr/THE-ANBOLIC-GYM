"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import MemberForm from "@/components/members/MemberForm";
import LoadingSpinner from "@/components/layout/LoadingSpinner";

function NewMemberInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const initialData = {
    name: searchParams.get("name") || "",
    phone: searchParams.get("phone") || "",
  };
  const leadId = searchParams.get("leadId");

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
        setError(json.error || "Could not create member.");
        setIsSubmitting(false);
        return;
      }
      // Mark the originating lead as converted, if any.
      if (leadId) {
        try {
          await fetch(`/api/leads/${leadId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              convertedToMember: true,
              convertedMemberId: json.data._id,
            }),
          });
        } catch {
          /* non-fatal */
        }
      }
      router.replace(`/members/${json.data._id}`);
    } catch {
      setError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <TopBar title="New member" showBack />
      <div className="px-4 py-4">
        {error && (
          <p className="mb-4 rounded-md bg-error-soft px-4 py-3 text-sm text-error-deep" role="alert">
            {error}
          </p>
        )}
        <MemberForm
          initialData={initialData}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitLabel="Create member"
        />
      </div>
    </>
  );
}

export default function NewMemberPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <NewMemberInner />
    </Suspense>
  );
}
