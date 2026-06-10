"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import WhatsAppButton from "@/components/whatsapp/WhatsAppButton";

/**
 * ReceiptGenerator — renders a formatted receipt with copy + WhatsApp send.
 * Props: { receiptText, phone }
 */
export default function ReceiptGenerator({ receiptText, phone }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(receiptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-4">
      <pre className="whitespace-pre-wrap break-words rounded-md bg-primary px-4 py-4 font-mono text-[13px] leading-5 text-on-primary">
        {receiptText}
      </pre>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-pill border border-hairline bg-canvas text-sm font-medium text-ink transition active:scale-[0.99]"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-cyan-deep" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy
            </>
          )}
        </button>
        <WhatsAppButton
          phone={phone}
          message={receiptText}
          label="Send via WhatsApp"
          variant="solid"
          className="h-11 flex-1"
        />
      </div>
    </div>
  );
}
