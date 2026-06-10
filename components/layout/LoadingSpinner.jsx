import { Loader2 } from "lucide-react";

/**
 * Full-screen centered loading indicator.
 * Used during auth checks and initial data loads.
 */
export default function LoadingSpinner({ label = "Loading" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-canvas-soft"
    >
      <Loader2 className="h-7 w-7 animate-spin text-mute" aria-hidden="true" />
      <span className="font-mono text-xs text-mute">{label}</span>
    </div>
  );
}
