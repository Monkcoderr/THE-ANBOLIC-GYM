"use client";

import { useState, useCallback } from "react";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import PinPad from "@/components/auth/PinPad";
import PinDots from "@/components/auth/PinDots";

const STEPS = {
  current: {
    title: "Enter current PIN",
    hint: "Confirm it's you before setting a new PIN.",
  },
  new: {
    title: "Create new PIN",
    hint: "Choose a new 6-digit PIN.",
  },
  confirm: {
    title: "Confirm new PIN",
    hint: "Re-enter your new PIN to confirm.",
  },
};

/**
 * ChangePinSheet — stepped flow to reset the app PIN.
 * Steps: verify current PIN → enter new PIN → confirm new PIN → submit.
 * Props: { open, onClose }
 */
export default function ChangePinSheet({ open, onClose }) {
  const [step, setStep] = useState("current");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [filled, setFilled] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const clearPad = useCallback(() => {
    setFilled(0);
    setResetKey((k) => k + 1);
  }, []);

  const triggerError = useCallback(
    (msg) => {
      setError(msg);
      setShake(true);
      clearPad();
    },
    [clearPad]
  );

  function resetAll() {
    setStep("current");
    setCurrentPin("");
    setNewPin("");
    setError("");
    setShake(false);
    setSubmitting(false);
    setDone(false);
    clearPad();
  }

  function handleClose() {
    if (submitting) return;
    resetAll();
    onClose?.();
  }

  async function submit(verifiedCurrent, finalNew) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPin: verifiedCurrent,
          newPin: finalNew,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        // If the current PIN was wrong, send the user back to step 1.
        if (json.code === "WRONG_PIN") {
          setStep("current");
          setCurrentPin("");
          setNewPin("");
          triggerError(json.error || "Current PIN is incorrect");
        } else {
          triggerError(json.error || "Could not change PIN");
        }
        setSubmitting(false);
        return;
      }

      setDone(true);
      setSubmitting(false);
    } catch {
      triggerError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const handleComplete = useCallback(
    (pin) => {
      if (step === "current") {
        setCurrentPin(pin);
        setStep("new");
        clearPad();
      } else if (step === "new") {
        setNewPin(pin);
        setStep("confirm");
        clearPad();
      } else if (step === "confirm") {
        if (pin !== newPin) {
          setStep("new");
          setNewPin("");
          triggerError("PINs don't match. Try again.");
          return;
        }
        if (pin === currentPin) {
          setStep("new");
          setNewPin("");
          triggerError("New PIN must be different from the current one.");
          return;
        }
        submit(currentPin, pin);
      }
    },
    [step, newPin, currentPin, clearPad, triggerError]
  );

  const meta = STEPS[step];

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title="Change PIN"
      dismissable={!submitting}
    >
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
          <p className="text-lg font-semibold tracking-[-0.4px] text-ink">
            PIN updated
          </p>
          <p className="text-sm text-body">
            Your new PIN is now active. Use it the next time you log in.
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="mt-2 h-11 w-full rounded-full bg-primary px-4 text-base font-medium text-on-primary transition active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <div className="flex flex-col items-center gap-1 text-center">
            <ShieldCheck className="h-7 w-7 text-mute" aria-hidden="true" />
            <p className="text-base font-semibold tracking-[-0.4px] text-ink">
              {meta.title}
            </p>
            <p className="text-sm text-body">{meta.hint}</p>
          </div>

          <PinDots
            filledCount={filled}
            error={shake}
            onErrorEnd={() => setShake(false)}
          />

          {error && (
            <p
              role="alert"
              className="-mt-1 text-sm font-medium text-error"
            >
              {error}
            </p>
          )}

          <div className="w-full max-w-xs">
            <PinPad
              onComplete={handleComplete}
              onChange={setFilled}
              loading={submitting}
              resetKey={`${step}-${resetKey}`}
            />
          </div>

          {submitting && (
            <p className="text-sm text-mute">Updating PIN…</p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
