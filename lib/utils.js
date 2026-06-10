import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names with conditional logic (shadcn convention).
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Strip all non-digit characters from a phone number.
 */
export function digitsOnly(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/** India country calling code. */
export const INDIA_DIAL_CODE = "91";

/**
 * Normalize a phone number to India E.164 digits (no "+") for wa.me links
 * and vCard exports. A bare 10-digit number gets the 91 prefix; numbers
 * that already carry the country code are left as-is.
 */
export function toIndiaWhatsApp(phone) {
  let d = digitsOnly(phone).replace(/^0+/, "");
  if (d.length === 10) return `${INDIA_DIAL_CODE}${d}`;
  if (d.length === 12 && d.startsWith(INDIA_DIAL_CODE)) return d;
  return d;
}

/**
 * Format a stored number for display with a visible +91 prefix.
 */
export function formatIndiaPhone(phone) {
  const wa = toIndiaWhatsApp(phone);
  if (wa.length === 12 && wa.startsWith(INDIA_DIAL_CODE)) {
    return `+91 ${wa.slice(2)}`;
  }
  return phone || "";
}
