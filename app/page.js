"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/layout/LoadingSpinner";

/**
 * Root redirector.
 * - No admin yet → /setup
 * - Admin exists → /dashboard (middleware enforces auth → /login if needed)
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/check", { cache: "no-store" });
        const json = await res.json();
        if (!active) return;
        if (json?.data?.adminExists) {
          router.replace("/dashboard");
        } else {
          router.replace("/setup");
        }
      } catch {
        if (active) router.replace("/login");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  return <LoadingSpinner label="Starting Gym Manager Pro" />;
}
