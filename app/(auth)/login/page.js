"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, Lock } from "lucide-react";
import PinPad from "@/components/auth/PinPad";
import PinDots from "@/components/auth/PinDots";

export default function LoginPage() {
  const router = useRouter();
  const [gymName, setGymName] = useState("");
  const [pinLen, setPinLen] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/check", { cache: "no-store" });
        const json = await res.json();
        if (!json?.data?.adminExists) {
          router.replace("/setup");
          return;
        }
        setGymName(json.data.gymName || "your gym");
      } catch {
        setGymName("your gym");
      }
    })();
  }, [router]);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        setLockedUntil(0);
        setError("");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  async function handleLogin(pin) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        router.replace("/dashboard");
        return;
      }
      if (res.status === 429) {
        setLockedUntil(Date.now() + 15 * 60 * 1000);
        setError("Too many attempts. Locked for 15 minutes.");
      } else {
        setError("Wrong PIN. Try again.");
      }
      setShake(true);
      setPinLen(0);
      setResetKey((k) => k + 1);
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
      setPinLen(0);
      setResetKey((k) => k + 1);
    }
  }

  const locked = lockedUntil > 0 && countdown > 0;
  const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
  const ss = String(countdown % 60).padStart(2, "0");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas-soft px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-on-primary">
            <Dumbbell className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="font-mono text-xs uppercase tracking-wide text-mute">
            {gymName}
          </p>
          <h1 className="mt-2 text-[32px] font-semibold leading-10 tracking-[-1.28px] text-ink">
            Enter your PIN.
          </h1>
        </div>

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

          {locked ? (
            <div className="flex flex-col items-center gap-3 rounded-lg bg-error-soft px-4 py-6 text-center">
              <Lock className="h-6 w-6 text-error-deep" aria-hidden="true" />
              <p className="text-sm text-error-deep">
                Try again in{" "}
                <span className="font-mono font-medium">
                  {mm}:{ss}
                </span>
              </p>
            </div>
          ) : (
            <PinPad
              onComplete={handleLogin}
              onChange={setPinLen}
              loading={loading}
              resetKey={resetKey}
            />
          )}
        </div>
      </div>
    </main>
  );
}
