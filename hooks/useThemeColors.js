"use client";

import { useState, useEffect } from "react";

const VARS = {
  ink: "--color-ink",
  body: "--color-body",
  mute: "--color-mute",
  hairline: "--color-hairline",
  canvas: "--color-canvas",
  canvasSoft2: "--color-canvas-soft-2",
  primary: "--color-primary",
  onPrimary: "--color-on-primary",
  error: "--color-error",
  cyanDeep: "--color-cyan-deep",
};

function read() {
  if (typeof window === "undefined") return {};
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const [key, varName] of Object.entries(VARS)) {
    out[key] = cs.getPropertyValue(varName).trim() || undefined;
  }
  return out;
}

/**
 * useThemeColors — resolves design-token colors and re-reads them whenever
 * the .dark class on <html> changes, so charts stay in sync with the theme.
 */
export function useThemeColors() {
  const [colors, setColors] = useState({});

  useEffect(() => {
    setColors(read());
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}
