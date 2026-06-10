"use client";

import { AlertOctagon, ChevronRight } from "lucide-react";

/**
 * MIAAlert — banner shown when members have been missing 7+ days.
 * Props: { count, onPress }
 */
export default function MIAAlert({ count = 0, onPress }) {
  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={onPress}
      className="flex w-full items-center gap-3 rounded-md bg-error-soft px-4 py-3 text-left transition active:scale-[0.99]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error text-white">
        <AlertOctagon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-error-deep">
          {count} member{count === 1 ? "" : "s"} missing 7+ days
        </p>
        <p className="text-xs text-error-deep/80">
          Tap to reach out before they leave.
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-error-deep" aria-hidden="true" />
    </button>
  );
}
