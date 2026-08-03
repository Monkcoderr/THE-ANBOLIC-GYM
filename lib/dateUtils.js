import {
  startOfDay,
  addDays,
  addMonths,
  setDate,
  getDate,
  getDaysInMonth,
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
 * Number of days a member has been expired (0 if not expired).
 */
export function getDaysSinceExpiry(planEndDate) {
  const today = startOfDay(new Date());
  const end = startOfDay(new Date(planEndDate));
  const diff = differenceInDays(today, end);
  return diff > 0 ? diff : 0;
}

/**
 * Length of the "new member" window, in days. Used by decorateMember to flag
 * recently-joined members; the day-math itself is inlined there so the whole
 * member batch shares a single start-of-day computation.
 */
export const NEW_MEMBER_WINDOW_DAYS = 30;

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

/* ─────────────────────────────────────────────────────────────────────────
 * Anchor-based (joining-date) billing cycle
 *
 * A member's renewal day is permanently fixed to the day-of-month of their
 * joining date. Every expiry therefore always falls on that same calendar day
 * — paying early or late never shifts the renewal day. Plan lengths are
 * expressed in days for backwards compatibility but are treated as whole
 * billing months (30 days ≈ 1 month, 365 days ≈ 12 months) so the cycle can be
 * anchored to a fixed day of the month.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Convert a plan length in days into whole billing months (minimum 1).
 * 30→1, 60→2, 90→3, 180→6, 365→12.
 */
export function durationToMonths(planDurationDays) {
  const days = Number(planDurationDays) || 0;
  return Math.max(1, Math.round(days / 30));
}

/**
 * Force a date onto a given day-of-month, clamping to the last day of the
 * month when the target day doesn't exist (e.g. the 31st in February).
 */
function applyAnchorDay(date, anchorDay) {
  const d = new Date(date);
  const maxDay = getDaysInMonth(d);
  return setDate(d, Math.min(anchorDay, maxDay));
}

/**
 * Initial expiry when a member is first created, anchored to the day-of-month
 * of their joining date.
 *   join 05-Feb-2025 + 1 month → 05-Mar-2025
 */
export function computeInitialExpiry(joinDate, planDurationDays) {
  const anchorDay = getDate(new Date(joinDate));
  const months = durationToMonths(planDurationDays);
  return applyAnchorDay(addMonths(new Date(joinDate), months), anchorDay);
}

/**
 * Next expiry on renewal, anchored to the joining day-of-month.
 *
 * The new expiry is always the current expiry advanced by the plan length in
 * whole months, snapped back to the joining anchor day. This keeps the renewal
 * day fixed regardless of when payment is actually made:
 *   - active/expiring:  currentExpiry + N months  (paying early/late is ignored)
 *   - recently expired: currentExpiry + N months  (e.g. 05-Jul + 1mo → 05-Aug,
 *                       even if paid on the 25th — never 25-Aug)
 *
 * As a safety net for members who lapsed for longer than the purchased period,
 * the cycle is advanced in whole-month steps until the expiry is in the future,
 * so a renewal never lands in the past.
 */
export function computeRenewalExpiry(
  joinDate,
  currentExpiry,
  planDurationDays,
  now = new Date()
) {
  const anchorDay = getDate(new Date(joinDate));
  const months = durationToMonths(planDurationDays);
  const today = startOfDay(now);

  let next = applyAnchorDay(
    addMonths(new Date(currentExpiry), months),
    anchorDay
  );

  // Safety net: never return an already-expired date for badly-lapsed members.
  let guard = 0;
  while (startOfDay(next) <= today && guard < 1200) {
    next = applyAnchorDay(addMonths(next, months), anchorDay);
    guard += 1;
  }

  return next;
}

export { addDays, addMonths, startOfDay, differenceInDays, differenceInHours };
