"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * PinDots — renders 6 indicator dots.
 * Props:
 *   filledCount: number of filled dots
 *   error: when true, shake the row then call onErrorEnd to reset
 *   onErrorEnd: callback fired after the shake animation completes
 */
export default function PinDots({ filledCount = 0, error = false, onErrorEnd }) {
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => onErrorEnd?.(), 450);
    return () => clearTimeout(t);
  }, [error, onErrorEnd]);

  return (
    <div
      className={cn("flex items-center justify-center gap-3.5", error && "animate-shake")}
      role="status"
      aria-label={`${filledCount} of 6 digits entered`}
    >
      {Array.from({ length: 6 }).map((_, i) => {
        const filled = i < filledCount;
        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "h-3.5 w-3.5 rounded-full border transition-all duration-150",
              error
                ? "border-error bg-error"
                : filled
                ? "border-primary bg-primary scale-110"
                : "border-hairline-strong bg-transparent"
            )}
          />
        );
      })}
    </div>
  );
}
