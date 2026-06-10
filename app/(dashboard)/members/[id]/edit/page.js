"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import TopBar from "@/components/layout/TopBar";
import MemberForm from "@/components/members/MemberForm";
import { ErrorState, CardSkeleton } from "@/components/ui/States";
import { fetcher } from "@/lib/fetcher";

export default function EditMemberPage({ params }) {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR(
    `/api/members/${params.id}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  async function handleSubmit(formData) {
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/members/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          notes: formData.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSubmitError(json.error || "Could not update member.");
        setIsSubmitting(false);
        return;
      }
      router.replace(`/members/${params.id}`);
    } catch {
      setSubmitError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <TopBar title="Edit member" showBack />
      <div className="px-4 py-4">
        {isLoading ? (
          <CardSkeleton count={1} />
        ) : error ? (
          <ErrorState onRetry={() => mutate()} />
        ) : (
          <>
            {submitError && (
              <p className="mb-4 rounded-md bg-error-soft px-4 py-3 text-sm text-error-deep" role="alert">
                {submitError}
              </p>
            )}
            <MemberForm
              initialData={data.member}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitLabel="Save changes"
              lockPlanFields
            />
            <p className="mt-3 text-center text-xs text-mute">
              To change the plan duration or expiry, use Renew on the member page.
            </p>
          </>
        )}
      </div>
    </>
  );
}
