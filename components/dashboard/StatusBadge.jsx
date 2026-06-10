import { cn } from "@/lib/utils";

const STYLES = {
  active: {
    label: "Active",
    dot: "bg-cyan-deep",
    text: "text-cyan-deep",
    bg: "bg-cyan/15",
  },
  expiring: {
    label: "Expiring",
    dot: "bg-warning",
    text: "text-warning-deep",
    bg: "bg-warning-soft",
  },
  expired: {
    label: "Expired",
    dot: "bg-error",
    text: "text-error-deep",
    bg: "bg-error-soft",
  },
};

/**
 * StatusBadge — small pill showing computed member status.
 */
export default function StatusBadge({ status = "active", mia = false }) {
  const s = STYLES[status] || STYLES.active;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        s.bg,
        s.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden="true" />
      {mia ? "MIA" : s.label}
    </span>
  );
}
