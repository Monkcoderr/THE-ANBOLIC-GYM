"use client";

import BottomSheet from "@/components/ui/BottomSheet";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * ConfirmDialog — destructive-action confirmation. Never uses window.confirm.
 * Props: { open, title, message, confirmLabel, onConfirm, onCancel, loading }
 */
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
}) {
  return (
    <BottomSheet open={open} onClose={onCancel} title={title} dismissable={!loading}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error-soft">
          <AlertTriangle className="h-5 w-5 text-error-deep" aria-hidden="true" />
        </div>
        <p className="pt-1 text-[15px] leading-6 text-body">{message}</p>
      </div>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="btn-gradient h-11 flex-1 rounded-pill text-sm font-medium transition active:scale-[0.99] disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-pill bg-error text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {confirmLabel}
        </button>
      </div>
    </BottomSheet>
  );
}
