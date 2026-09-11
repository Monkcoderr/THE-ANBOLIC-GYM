"use client";

import { useState } from "react";
import {
  Ban,
  Banknote,
  ChevronDown,
  CreditCard,
  Download,
  IndianRupee,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import WhatsAppButton from "@/components/whatsapp/WhatsAppButton";
import { formatDisplayDate } from "@/lib/dateUtils";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/utils";

const ACTION_CLS =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-pill border border-hairline bg-canvas px-3 text-sm font-medium text-ink transition hover:bg-canvas-soft-2 active:scale-[0.98]";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function billFileName(payment) {
  const date = new Date(payment.paymentDate).toISOString().slice(0, 10);
  return `bill-${date}-rs${payment.amount}.txt`;
}

/** Download the receipt as a plain-text file (same Blob approach as the VCF export). */
function downloadBill(payment) {
  const blob = new Blob([payment.receiptText || ""], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = billFileName(payment);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Open the receipt in a small window and trigger the browser print dialog. */
function printBill(payment) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><title>Bill</title>` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>body{margin:24px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;` +
      `white-space:pre-wrap;word-break:break-word;color:#171717}</style></head><body>` +
      `${escapeHtml(payment.receiptText || "")}</body></html>`
  );
  w.document.close();
  w.focus();
  w.print();
}

/**
 * PaymentHistory — expandable list of bills (newest first) with bill actions.
 *
 * Props: { payments, onVoid, onRenewAgain }
 *
 * Voided bills stay in the list, visually struck through, with their audit
 * details (when, why, and what was restored) so the history remains complete
 * while the money no longer counts anywhere.
 */
export default function PaymentHistory({
  payments = [],
  onVoid,
  onRenewAgain,
}) {
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
        const voided = p.status === "voided";
        return (
          <li
            key={p._id}
            className={cn(
              "overflow-hidden rounded-md card-ring",
              voided ? "bg-canvas-soft" : "bg-canvas"
            )}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : p._id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-canvas-soft-2"
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    "flex flex-wrap items-center gap-x-1 gap-y-1 text-base font-medium",
                    voided ? "text-mute" : "text-ink"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      voided && "line-through"
                    )}
                  >
                    <IndianRupee className="h-4 w-4" aria-hidden="true" />
                    {p.amount}
                  </span>
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-body">
                    {p.paymentMethod === "Cash" ? (
                      <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {p.paymentMethod}
                  </span>
                  {voided && (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-error-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error-deep">
                      <Ban className="h-3 w-3" aria-hidden="true" />
                      Voided
                    </span>
                  )}
                </p>
                <p
                  className={cn(
                    "mt-0.5 font-mono text-xs",
                    voided ? "text-mute line-through" : "text-mute"
                  )}
                >
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
                {voided && (
                  <div className="mb-3 rounded-md bg-error-soft/50 px-3 py-2.5 text-xs text-error-deep">
                    <p className="font-medium">
                      Voided
                      {p.voidedAt
                        ? ` on ${formatDisplayDate(p.voidedAt)}`
                        : ""}{" "}
                      — not counted in revenue or reports.
                    </p>
                    {p.voidReason && (
                      <p className="mt-1">Reason: {p.voidReason}</p>
                    )}
                    <p className="mt-1">
                      {p.revertedTo?.appliedToMember && p.revertedTo?.planEndDate
                        ? `Membership was restored to expire ${formatDisplayDate(
                            p.revertedTo.planEndDate
                          )}.`
                        : "The membership was left unchanged."}
                    </p>
                  </div>
                )}

                {p.receiptText && (
                  <pre className="mb-3 whitespace-pre-wrap break-words rounded-md bg-canvas-soft-2 px-3 py-3 font-mono text-[12px] leading-5 text-ink">
                    {p.receiptText}
                  </pre>
                )}

                {/* Bill actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {!voided && (
                    <WhatsAppButton
                      phone={p.memberPhone}
                      message={p.receiptText || ""}
                      label="Re-send receipt"
                      variant="outline"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => printBill(p)}
                    className={ACTION_CLS}
                  >
                    <Printer className="h-4 w-4" aria-hidden="true" />
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadBill(p)}
                    className={ACTION_CLS}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download
                  </button>
                  {!voided && onVoid && (
                    <button
                      type="button"
                      onClick={() => onVoid(p)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-pill border border-hairline bg-canvas px-3 text-sm font-medium text-error transition hover:bg-error-soft/40 active:scale-[0.98]"
                    >
                      <Ban className="h-4 w-4" aria-hidden="true" />
                      Delete bill
                    </button>
                  )}
                  {onRenewAgain && (
                    <button
                      type="button"
                      onClick={onRenewAgain}
                      className="btn-gradient inline-flex h-9 items-center justify-center gap-1.5 rounded-pill px-3 text-sm font-medium transition active:scale-[0.98]"
                    >
                      {voided ? (
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      )}
                      {voided ? "Generate again" : "Renew again"}
                    </button>
                  )}
                </div>

                {!voided && !p.canVoid && p.voidBlockedReason && (
                  <p className="mt-2 text-xs text-mute">
                    {p.voidBlockedReason}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
