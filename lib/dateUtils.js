import {
  startOfDay,
  addDays,
  addMonths,
  subMonths,
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
 * Date-only business values
 *
 * Membership dates (joining date, plan start, expiry) are CALENDAR DAYS, not
 * moments in time. They are stored at UTC midnight — "2026-07-06T00:00:00.000Z"
 * — which is the convention every existing record in this database follows.
 *
 * Every write of a business date must go through utcDateOnly(). Never use
 * startOfDay() to build a stored value: startOfDay works in the machine's local
 * timezone, so on an IST machine it produces 18:30 UTC the PREVIOUS day, and
 * the production server (UTC) then reads back the wrong calendar day and the
 * wrong billing day. startOfDay remains correct for "is this member expired
 * today" comparisons, which are evaluated and discarded in one place.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Normalise any Date to a date-only value at UTC midnight, stripping the time
 * while keeping the UTC calendar day.
 *
 *   2026-07-06T00:00:00.000Z → unchanged (idempotent)
 *   2026-07-23T14:02:11.329Z → 2026-07-23T00:00:00.000Z
 *
 * UTC fields are used deliberately, so the result never depends on the
 * machine's timezone. Every business date entering the app is already a UTC
 * instant: the forms submit "YYYY-MM-DD" and `z.coerce.date()` parses a bare
 * date string as UTC midnight. Note that a Date built from local parts —
 * `new Date(2026, 6, 6)` or `new Date("2026-07-06T00:00:00")` — is a different
 * instant and must not be fed to this function; use a "YYYY-MM-DD" string.
 */
export function utcDateOnly(date) {
  const d = new Date(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

/**
 * True when a stored value is already a clean UTC-midnight date-only value.
 * Used by the migration to detect records carrying a stray time component.
 */
export function isUtcDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
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
 *
 * Works in UTC so the result is identical on every machine.
 */
function applyAnchorDay(date, anchorDay) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay)));
}

/**
 * Add (or subtract) whole calendar months in UTC, clamping the day to the last
 * day of the target month. Deliberately not date-fns addMonths: that operates
 * on local time, so a daylight-saving transition between the two dates shifts
 * the result by an hour and silently changes the stored calendar day.
 */
function addUtcMonths(date, months) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month + months, Math.min(day, lastDay)));
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
 * Every other expiry helper is defined in terms of this one. The result is
 * always a date-only value at UTC midnight, ready to store.
 */
export function computeExpiryFromJoin(joinDate, totalMonths) {
  const join = utcDateOnly(joinDate);
  const anchorDay = join.getUTCDate();
  const months = Math.max(0, Math.round(Number(totalMonths) || 0));
  return applyAnchorDay(addUtcMonths(join, months), anchorDay);
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
  const end = utcDateOnly(planEndDate);
  const anchorDay = end.getUTCDate();
  return applyAnchorDay(
    addUtcMonths(end, -durationToMonths(planDurationDays)),
    anchorDay
  );
}

/**
 * THE billing rule, with no notion of "now".
 *
 *   next expiry = current expiry + N calendar months, on the billing day
 *
 * The payment date is deliberately NOT a parameter, so it is structurally
 * impossible for it to influence the billing day. Paying early, on time or late
 * therefore produces exactly the same answer:
 *
 *   join 05-Jun, expiry 05-Jul, paid 29-Jun / 05-Jul / 15-Jul → 05-Aug
 *
 * A late payer receives less usable membership (15-Jul → 05-Aug is 21 days for
 * a month's fee). That is intended: the billing day is fixed, and paying late
 * is not rewarded with a fresh full month.
 *
 * The result is always strictly after `currentExpiry` — adding a whole month
 * lands in a later month, and the billing day is at least the 1st of it — so a
 * renewal can never shorten a membership.
 */
export function nextBillingExpiry(joinDate, currentExpiry, planDurationDays) {
  const anchorDay = utcDateOnly(joinDate).getUTCDate();
  const months = durationToMonths(planDurationDays);
  return applyAnchorDay(
    addUtcMonths(utcDateOnly(currentExpiry), months),
    anchorDay
  );
}

/**
 * The renewal expiry actually stored: the billing rule above, plus the one
 * exception for a member who has lapsed beyond a full cycle.
 *
 * If the rule's answer has already passed by the time the member pays, it is
 * advanced by WHOLE BILLING CYCLES until it is in the future. The billing day
 * never moves, and the payment date is never used as an anchor:
 *
 *   billing day 01, expiry 01-Jul, paid 08-Aug → 01-Aug has passed → 01-Sep
 *   billing day 01, expiry 01-Jul, paid 01-Dec → … → 01-Jan
 *
 * `asOf` is consulted ONLY by that guard. It cannot reach the anchor
 * arithmetic, which lives in the clock-free function above — so whenever the
 * rule's answer is already in the future, this function is fully deterministic
 * and `asOf` has no effect whatsoever.
 */
export function computeRenewalExpiry(
  joinDate,
  currentExpiry,
  planDurationDays,
  asOf = new Date()
) {
  const anchorDay = utcDateOnly(joinDate).getUTCDate();
  const months = durationToMonths(planDurationDays);
  const today = utcDateOnly(asOf);

  let next = nextBillingExpiry(joinDate, currentExpiry, planDurationDays);
  let guard = 0;
  // An expiry on the payment date itself is worth nothing, hence `<=`.
  while (next <= today && guard < 1200) {
    next = applyAnchorDay(addUtcMonths(next, months), anchorDay);
    guard += 1;
  }

  return next;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Billing months — DERIVED, never stored
 *
 * The number of whole billing months a member has paid for since joining is a
 * function of two values the record already holds:
 *
 *     planEndDate === computeExpiryFromJoin(joinDate, billingMonths)
 *
 * so it is computed on demand rather than kept in a field. A stored counter
 * would be a second copy of the same fact, free to drift out of step with the
 * expiry on any hand-edited date or joining-date correction; a derived one
 * cannot. Returning null is meaningful: it says this record's expiry does not
 * sit on its billing day, which is exactly what the audit script reports on.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * The whole number of billing months between a joining date and a stored
 * expiry, or null when no whole number of months lands exactly on it.
 *
 *   join 22-Jul-2026, expiry 22-Sep-2026 → 2
 *   join 22-Jul-2026, expiry 24-Aug-2026 → null  (off the billing day)
 *
 * Expiries grow monotonically with the month count, so the scan stops as soon
 * as it overshoots.
 */
export function deriveBillingMonths(joinDate, planEndDate, maxMonths = 600) {
  if (!joinDate || !planEndDate) return null;
  const target = utcDateOnly(planEndDate).getTime();
  for (let months = 1; months <= maxMonths; months += 1) {
    const t = computeExpiryFromJoin(joinDate, months).getTime();
    if (t === target) return months;
    if (t > target) return null;
  }
  return null;
}

/**
 * Convenience wrapper for a member record: the months they have paid for since
 * joining, or null when the record's expiry is off its billing day.
 */
export function getBillingMonthsPaid(member) {
  if (!member) return null;
  return deriveBillingMonths(
    member.joinDate || member.planStartDate,
    member.planEndDate
  );
}

export {
  addDays,
  addMonths,
  subMonths,
  startOfDay,
  differenceInDays,
  differenceInHours,
};
