"use client";

import { useState, useEffect, useCallback } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PinPad — 3x4 numeric keypad. Auto-fires onComplete(pin) at 6 digits.
 * Props:
 *   onComplete(pin): called when 6 digits entered
 *   loading: disables input while a request is in flight
 *   resetKey: change this value to clear the entered PIN (e.g. on error)
 *   onChange(length): optional, reports current length for PinDots
 */
export default function PinPad({ onComplete, loading = false, resetKey, onChange }) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    setPin("");
  }, [resetKey]);

  useEffect(() => {
    onChange?.(pin.length);
    if (pin.length === 6) {
      onComplete?.(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const press = useCallback(
    (digit) => {
      if (loading) return;
      setPin((p) => (p.length >= 6 ? p : p + digit));
    },
    [loading]
  );

  const backspace = useCallback(() => {
    if (loading) return;
    setPin((p) => p.slice(0, -1));
  }, [loading]);

  // Hardware keyboard support
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace") backspace();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [press, backspace]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

  return (
    <div className="grid grid-cols-3 gap-3" aria-label="PIN keypad">
      {keys.map((k, idx) => {
        if (k === "") return <div key={idx} aria-hidden="true" />;
        if (k === "back") {
          return (
            <button
              key={idx}
              type="button"
              onClick={backspace}
              disabled={loading}
              aria-label="Delete last digit"
              className={cn(
                "flex h-16 items-center justify-center rounded-lg bg-canvas text-ink card-ring",
                "transition active:scale-95 active:bg-canvas-soft-2 disabled:opacity-40",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
              )}
            >
              <Delete className="h-6 w-6" aria-hidden="true" />
            </button>
          );
        }
        return (
          <button
            key={idx}
            type="button"
            onClick={() => press(k)}
            disabled={loading}
            aria-label={`Digit ${k}`}
            className={cn(
              "flex h-16 items-center justify-center rounded-lg bg-canvas text-2xl font-medium text-ink card-ring",
              "transition active:scale-95 active:bg-canvas-soft-2 disabled:opacity-40",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
            )}
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}
