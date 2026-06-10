"use client";

import { useState } from "react";
import { ChevronDown, IndianRupee, CreditCard, Banknote } from "lucide-react";
import WhatsAppButton from "@/components/whatsapp/WhatsAppButton";
import { formatDisplayDate } from "@/lib/dateUtils";
import { EmptyState } from "@/components/ui/States";
import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PaymentHistory — expandable list of payment records (newest first).
 * Props: { payments }
 */
export default function PaymentHistory({ payments = [] }) {
  const [openId, setOpenId] = useState(null);

  if (!payments.length) {
    return (
      <EmptyState
        icon={Receipt}
        title="No payments yet"
        message="Renewals and payments will appear here."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {payments.map((p) => {
        const open = openId === p._id;
        return (
          <li key={p._id} className="overflow-hidden rounded-md bg-canvas card-ring">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : p._id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-canvas-soft-2"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-base font-medium text-ink">
                  <IndianRupee className="h-4 w-4" aria-hidden="true" />
                  {p.amount}
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-body">
                    {p.paymentMethod === "Cash" ? (
                      <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {p.paymentMethod}
                  </span>
                </p>
                <p className="mt-0.5 font-mono text-xs text-mute">
                  {formatDisplayDate(p.paymentDate)} · {p.planDurationDays} days
                  → {formatDisplayDate(p.newExpiry)}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-mute transition-transform",
                  open && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>
            {open && (
              <div className="border-t border-hairline px-4 py-3">
                {p.receiptText && (
                  <pre className="mb-3 whitespace-pre-wrap break-words rounded-md bg-canvas-soft-2 px-3 py-3 font-mono text-[12px] leading-5 text-ink">
                    {p.receiptText}
                  </pre>
                )}
                <WhatsAppButton
                  phone={p.memberPhone}
                  message={p.receiptText || ""}
                  label="Re-send receipt"
                  variant="outline"
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
