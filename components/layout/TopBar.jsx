"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical, LogOut, KeyRound } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import ChangePinSheet from "@/components/auth/ChangePinSheet";

/**
 * TopBar — page title, optional back button, and a menu with logout.
 * Props: { title, showBack }
 */
export default function TopBar({ title, showBack = false }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    router.replace("/login");
  }

  return (
    <>
    <header
      className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-hairline bg-canvas/95 px-4 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex min-w-0 items-center gap-1">
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-ink transition hover:bg-canvas-soft-2"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
        )}
        <h1 className="truncate text-lg font-semibold tracking-[-0.6px] text-ink">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-ink transition hover:bg-canvas-soft-2"
        >
          <MoreVertical className="h-5 w-5" aria-hidden="true" />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute right-0 top-11 z-20 w-44 animate-fade-in overflow-hidden rounded-md bg-canvas py-1 shadow-[var(--shadow-modal)]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setChangePinOpen(true);
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink transition hover:bg-canvas-soft-2"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Change PIN
              </button>
              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-error transition hover:bg-canvas-soft-2 disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </>
        )}
        </div>
      </div>
    </header>
    <ChangePinSheet
      open={changePinOpen}
      onClose={() => setChangePinOpen(false)}
    />
    </>
  );
}
