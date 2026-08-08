import {
  startOfDay,
  addDays,
  addMonths,
  subMonths,
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
 * THE JOINING DATE IS THE SINGLE SOURCE OF TRUTH for every expiry date.
 *
 * A member's billing day is permanently the day-of-month of their joining
 * date, and an expiry is always that day, a whole number of CALENDAR MONTHS
 * later — never a fixed number of days:
 *
 *   join 02-May → 02-Jun     join 15-May → 15-Jun
 *   join 23-Aug → 23-Sep     join 10-Sep → 10-Oct
 *
 * Plan lengths are still stored in days for backwards compatibility, but are
 * interpreted as whole billing months (30d ≈ 1 month, 365d ≈ 12 months).
 * Paying early or late never moves the billing day.
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
 * month when the target day doesn't exist:
 *   31-Jan + 1 month → 28-Feb (29-Feb in a leap year), never an invalid 31-Feb.
 * Clamping is presentational only — the billing day itself is never lost,
 * because every calculation re-derives it from the joining date.
 */
function applyAnchorDay(date, anchorDay) {
  const d = new Date(date);
  const maxDay = getDaysInMonth(d);
  return setDate(d, Math.min(anchorDay, maxDay));
}

/**
 * THE canonical expiry calculation: the expiry of a member who has paid for
 * `totalMonths` whole billing months since joining.
 *
 *   computeExpiryFromJoin('2026-05-02', 1) → 02-Jun-2026
 *   computeExpiryFromJoin('2026-08-23', 1) → 23-Sep-2026
 *   computeExpiryFromJoin('2026-01-31', 1) → 28-Feb-2026  (clamped)
 *   computeExpiryFromJoin('2026-01-31', 2) → 31-Mar-2026  (billing day restored)
 *
 * Every other expiry helper is defined in terms of this one.
 */
export function computeExpiryFromJoin(joinDate, totalMonths) {
  const join = new Date(joinDate);
  const anchorDay = getDate(join);
  const months = Math.max(0, Math.round(Number(totalMonths) || 0));
  return applyAnchorDay(addMonths(join, months), anchorDay);
}

/**
 * Initial expiry when a member is first created.
 *   join 05-Feb-2026 + 30-day plan → 05-Mar-2026
 */
export function computeInitialExpiry(joinDate, planDurationDays) {
  return computeExpiryFromJoin(joinDate, durationToMonths(planDurationDays));
}

/**
 * Reverse of computeInitialExpiry — derive the joining date of an existing
 * member who is being backfilled from a known expiry date. Subtracting whole
 * calendar months (not days) keeps the joining day equal to the expiry day, so
 * the record is anchor-consistent the moment it is created.
 *   expiry 20-Aug-2026, 30-day plan → join 20-Jul-2026
 */
export function computeJoinDateFromExpiry(planEndDate, planDurationDays) {
  const end = new Date(planEndDate);
  const anchorDay = getDate(end);
  return applyAnchorDay(subMonths(end, durationToMonths(planDurationDays)), anchorDay);
}

/**
 * Next expiry on renewal: the current billing date advanced by the plan length
 * in whole calendar months, always landing back on the joining day.
 *
 *   02-May → 02-Jun → 02-Jul → 02-Aug      (30-day plans, paid any day)
 *   23-Aug → 23-Sep → 23-Oct → 23-Nov
 *
 * The payment date is never an input — renewing early or late cannot move the
 * billing day. Two guards protect the member:
 *
 *  1. The result can never fall short of `currentExpiry + N months`, so a
 *     record whose expiry is out of step with its joining day (legacy data, or
 *     a hand-edited date) can never silently shorten a paid-for period.
 *  2. A member who lapsed for longer than the purchased period still ends up
 *     with a future expiry, advanced in whole months so the billing day holds.
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

  // The period the member just paid for. The answer may never be earlier.
  const minimum = startOfDay(addMonths(new Date(currentExpiry), months));

  let next = applyAnchorDay(
    addMonths(new Date(currentExpiry), months),
    anchorDay
  );

  let guard = 0;
  while (startOfDay(next) < minimum && guard < 1200) {
    next = applyAnchorDay(addMonths(next, months), anchorDay);
    guard += 1;
  }
  while (startOfDay(next) <= today && guard < 1200) {
    next = applyAnchorDay(addMonths(next, months), anchorDay);
    guard += 1;
  }

  return next;
}

export {
  addDays,
  addMonths,
  subMonths,
  startOfDay,
  differenceInDays,
  differenceInHours,
};
