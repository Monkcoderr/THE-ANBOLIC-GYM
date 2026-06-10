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
