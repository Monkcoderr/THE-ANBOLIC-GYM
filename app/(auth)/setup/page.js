"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Dumbbell } from "lucide-react";
import PinPad from "@/components/auth/PinPad";
import PinDots from "@/components/auth/PinDots";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState("name"); // name | create | confirm
  const [gymName, setGymName] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [pinLen, setPinLen] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  // If an admin already exists, leave setup.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/check", { cache: "no-store" });
        const json = await res.json();
        if (json?.data?.adminExists) router.replace("/login");
      } catch {
        /* ignore */
      }
    })();
  }, [router]);

  function handleNameSubmit(e) {
    e.preventDefault();
    if (gymName.trim().length < 2) {
      setError("Gym name must be at least 2 characters.");
      return;
    }
    setError("");
    setStep("create");
    setPinLen(0);
    setResetKey((k) => k + 1);
  }

  function handleCreatePin(pin) {
    setFirstPin(pin);
    setStep("confirm");
    setPinLen(0);
    setResetKey((k) => k + 1);
    setError("");
  }

  async function handleConfirmPin(pin) {
    if (pin !== firstPin) {
      setError("PINs don't match. Let's try again.");
      setShake(true);
      setFirstPin("");
      setStep("create");
      setPinLen(0);
      setResetKey((k) => k + 1);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gymName: gymName.trim(), pin }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Setup failed. Please try again.");
        setShake(true);
        setStep("create");
        setFirstPin("");
        setPinLen(0);
        setResetKey((k) => k + 1);
        setLoading(false);
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas-soft px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-on-primary">
            <Dumbbell className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="font-mono text-xs uppercase tracking-wide text-mute">
            {step === "name" ? "Welcome" : `Setting up ${gymName}`}
          </p>
          <h1 className="mt-2 text-[32px] font-semibold leading-10 tracking-[-1.28px] text-ink">
            {step === "name" && "Let's set up your gym."}
            {step === "create" && "Create a 6-digit PIN."}
            {step === "confirm" && "Confirm your PIN."}
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-body">
            {step === "name" &&
              "This is your private owner console. No member logins, ever."}
            {step === "create" &&
              "You'll use this PIN to unlock the app. Keep it safe."}
            {step === "confirm" && "Re-enter the PIN to make sure it matches."}
          </p>
        </div>

        {step === "name" ? (
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="gymName"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Gym name
              </label>
              <input
                id="gymName"
                type="text"
                autoFocus
                value={gymName}
                onChange={(e) => setGymName(e.target.value)}
                placeholder="The Anabolic Gym"
                className="h-12 w-full rounded-sm border border-hairline bg-canvas px-3 text-base text-ink outline-none placeholder:text-mute focus:border-primary"
              />
              {error && <p className="mt-2 text-sm text-error">{error}</p>}
            </div>
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary text-base font-medium text-on-primary transition active:scale-[0.99]"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <div className="space-y-8">
            <PinDots
              filledCount={pinLen}
              error={shake}
              onErrorEnd={() => setShake(false)}
            />
            {error && (
              <p className="text-center text-sm text-error" role="alert">
                {error}
              </p>
            )}
            <PinPad
              onComplete={step === "create" ? handleCreatePin : handleConfirmPin}
              onChange={setPinLen}
              loading={loading}
              resetKey={resetKey}
            />
            {step === "confirm" && (
              <button
                type="button"
                onClick={() => {
                  setStep("create");
                  setFirstPin("");
                  setPinLen(0);
                  setResetKey((k) => k + 1);
                  setError("");
                }}
                className="mx-auto block text-sm text-link"
              >
                Start over
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
