"use client";

import { useState } from "react";
import { Download, Loader2, Info } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { toIndiaWhatsApp } from "@/lib/utils";
import { format } from "date-fns";

/**
 * BroadcastVCF — exports active members as a .vcf file for WhatsApp broadcasts.
 * Props: { gymName }
 */
export default function BroadcastVCF({ gymName }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    setLoading(true);
    setError("");
    setDone(false);
    try {
      const data = await fetcher("/api/members?status=active&limit=1000");
      const members = data.members || [];
      if (!members.length) {
        setError("No active members to export.");
        setLoading(false);
        return;
      }

      const vcf = members
        .map(
          (m) =>
            `BEGIN:VCARD\nVERSION:3.0\nFN:${m.name} (${gymName})\nTEL;TYPE=CELL:+${toIndiaWhatsApp(
              m.phone
            )}\nEND:VCARD`
        )
        .join("\n");

      const blob = new Blob([vcf], { type: "text/vcard" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${gymName}-active-${format(new Date(), "yyyy-MM-dd")}.vcf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDone(true);
    } catch (e) {
      setError(e.message || "Export failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg bg-canvas p-5 card-ring">
      <h3 className="text-base font-medium text-ink">Broadcast contacts</h3>
      <p className="mt-1 text-sm text-body">
        Export every active member as a phone-book file for WhatsApp broadcasts.
      </p>
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-primary text-sm font-medium text-on-primary transition active:scale-[0.99] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        Export contacts to phonebook
      </button>

      {error && (
        <p className="mt-3 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      {done && (
        <div className="mt-3 flex gap-2 rounded-md bg-link-bg-soft/60 px-3 py-2.5 text-sm text-link-deep">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            File downloaded! In WhatsApp: New Broadcast → Add Recipients → select
            contacts from this file to send bulk messages.
          </p>
        </div>
      )}
    </div>
  );
}
