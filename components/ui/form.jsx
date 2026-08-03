import { cn } from "@/lib/utils";

/**
 * Shared form primitives used across the member / lead / quick-add forms.
 * Keeping these in one place removes three near-identical copies and keeps the
 * input chrome consistent with the design system.
 */

/** Labelled field wrapper with an optional inline error message. */
export function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-sm text-error">{error}</p>}
    </div>
  );
}

/** Canonical text-input classes (40px, hairline border, error state). */
export function inputCls(error) {
  return cn(
    "h-11 w-full rounded-sm border bg-canvas px-3 text-[15px] text-ink outline-none placeholder:text-mute focus:border-primary",
    error ? "border-error" : "border-hairline"
  );
}
