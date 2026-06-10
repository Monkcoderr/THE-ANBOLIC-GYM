import {
  startOfDay,
  addDays,
  differenceInDays,
  differenceInHours,
  format,
} from "date-fns";

/**
 * Compute a member's status based on their plan end date.
 * - expired: planEndDate is before the start of today
 * - expiring: planEndDate is within the next 3 days (inclusive)
 * - active: everyone else
 */
export function computeMemberStatus(planEndDate) {
  const today = startOfDay(new Date());
  const end = new Date(planEndDate);
  const threeDaysLater = addDays(today, 3);

  if (end < today) return "expired";
  if (end <= threeDaysLater) return "expiring";
  return "active";
}

/**
 * Days remaining until expiry (positive) or days since expiry (negative).
 */
export function getDaysUntilExpiry(planEndDate) {
  const today = startOfDay(new Date());
  const end = startOfDay(new Date(planEndDate));
  return differenceInDays(end, today);
}

/**
 * A member is "MIA" (missing in action) when expired for 7 or more days.
 */
export function isMIAMember(planEndDate) {
  const today = startOfDay(new Date());
  const end = startOfDay(new Date(planEndDate));
  if (end >= today) return false;
  return differenceInDays(today, end) >= 7;
}

/**
 * Number of days a member has been expired (0 if not expired).
 */
export function getDaysSinceExpiry(planEndDate) {
  const today = startOfDay(new Date());
  const end = startOfDay(new Date(planEndDate));
  const diff = differenceInDays(today, end);
  return diff > 0 ? diff : 0;
}

/**
 * Hours since a given date (used for lead freshness).
 */
export function getHoursOld(date) {
  return differenceInHours(new Date(), new Date(date));
}

/**
 * Format a date as "10-Jun-2026".
 */
export function formatDisplayDate(date) {
  return format(new Date(date), "dd-MMM-yyyy");
}

/**
 * Format a date as "Jun 2026".
 */
export function getMonthLabel(date) {
  return format(new Date(date), "MMM yyyy");
}

export { addDays, startOfDay, differenceInDays, differenceInHours };
