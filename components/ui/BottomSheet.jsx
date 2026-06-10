"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * BottomSheet — mobile-first slide-up modal anchored to the bottom.
 * Props: { open, onClose, title, children, dismissable }
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  dismissable = true,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && dismissable) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Dialog"}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-black/40"
        onClick={() => dismissable && onClose?.()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={cn(
          "relative z-10 w-full max-w-md animate-slide-up rounded-t-2xl bg-canvas p-5 shadow-[var(--shadow-modal)]",
          "sm:rounded-2xl sm:p-6",
          "max-h-[92vh] overflow-y-auto"
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline-strong/40 sm:hidden" />
        {(title || dismissable) && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-[-0.6px] text-ink">
              {title}
            </h2>
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline text-mute transition hover:bg-canvas-soft-2"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
