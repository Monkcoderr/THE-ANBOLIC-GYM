"use client";

import { AlertCircle, RotateCw, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EmptyState — shown when a list has no items.
 */
export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-hairline bg-canvas-soft px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-canvas card-ring">
        <Icon className="h-6 w-6 text-mute" aria-hidden="true" />
      </div>
      <h3 className="text-base font-medium text-ink">{title}</h3>
      {message && <p className="mt-1 max-w-xs text-sm text-body">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * ErrorState — shown when a fetch fails, with a retry button.
 */
export function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-error-soft bg-error-soft/40 px-6 py-12 text-center"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-canvas">
        <AlertCircle className="h-6 w-6 text-error" aria-hidden="true" />
      </div>
      <h3 className="text-base font-medium text-ink">Couldn't load this</h3>
      <p className="mt-1 max-w-xs text-sm text-body">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-gradient mt-5 inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-medium transition active:scale-[0.99]"
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Skeleton — shimmer placeholder block.
 */
export function Skeleton({ className }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden="true" />;
}

/**
 * CardSkeleton — placeholder for a list of cards.
 */
export function CardSkeleton({ count = 3 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md bg-canvas p-4 card-ring">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-4 w-24" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
