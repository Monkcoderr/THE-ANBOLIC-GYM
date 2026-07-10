"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, X, Share, Plus } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed-at";
// Re-surface the prompt this many days after a dismissal.
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes navigator.standalone instead of display-mode.
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as Mac — detect touch to catch it.
  const iPadOS =
    /macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  return iOSDevice || iPadOS;
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * InstallPrompt — captures the browser `beforeinstallprompt` event and shows a
 * branded install banner with an Install button (Android/Chrome/Edge). On iOS
 * Safari — which never fires that event — it shows manual "Add to Home Screen"
 * instructions instead. Hidden when already installed or recently dismissed.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e) => {
      // Prevent the mini-infobar and keep the event so we can trigger it later.
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — show manual instructions instead.
    if (isIOS() && !isStandalone()) {
      setIosHelp(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setVisible(false);
      } else {
        dismiss();
      }
    } catch {
      dismiss();
    } finally {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt, dismiss]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div className="relative w-full max-w-md animate-slide-up rounded-2xl border border-hairline bg-canvas p-4 shadow-[var(--shadow-modal)]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-hairline text-mute transition hover:bg-canvas-soft-2"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
            <Download className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tracking-[-0.4px] text-ink">
              Install ANABOLIC GYM
            </p>

            {iosHelp ? (
              <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-body">
                Tap
                <Share className="inline h-4 w-4 text-link" aria-hidden="true" />
                <span className="font-medium text-ink">Share</span>, then
                <Plus className="inline h-4 w-4 text-link" aria-hidden="true" />
                <span className="font-medium text-ink">Add to Home Screen</span>.
              </p>
            ) : (
              <p className="mt-1 text-sm text-body">
                Add to your home screen for full-screen, one-tap access.
              </p>
            )}

            {!iosHelp && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-on-primary transition active:scale-[0.98]"
                >
                  Install app
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex h-9 items-center justify-center rounded-full px-3 text-sm font-medium text-body transition hover:bg-canvas-soft-2"
                >
                  Not now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
