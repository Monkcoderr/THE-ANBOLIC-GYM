/**
 * Renewal invariants — what must be TRUE of a renewal outcome under the
 * finalized billing policy.
 *
 * ── The policy ───────────────────────────────────────────────────────────
 * The joining date fixes the billing day for life. The payment date is a
 * transaction date and never an anchor. The next expiry follows the member's
 * existing cycle, and if that date has already passed it advances by whole
 * billing cycles until it is in the future.
 *
 * ── Why coverage LENGTH is deliberately not checked ──────────────────────
 * A member who pays late receives less usable membership, and that is an
 * INTENTIONAL business consequence of the fixed billing day — not an error.
 * A member whose expiry was the 20th, paying on the 8th of the next month,
 * correctly receives 20th-minus-8th days for a full month's fee. A member
 * paying the day before their billing day correctly receives one day.
 *
 * The previous heuristic flagged anything outside 16–46 days of coverage, which
 * under this policy reports 17 perfectly correct records as anomalies. Coverage
 * length is therefore reported as information only, never as a warning.
 *
 * What IS suspicious is a renewal that breaks the structure of the rule: one
 * that fails to add time, lands in the past, misses the billing day, or skips
 * further ahead than the catch-up rule allows. Those indicate corrupt data or a
 * regression in the calculation, and those are what this module detects.
 */

import {
  computeRenewalExpiry,
  nextBillingExpiry,
  deriveBillingMonths,
  utcDateOnly,
} from "../lib/dateUtils.js";

/** Every invariant this module can report, with a human-readable meaning. */
export const INVARIANTS = {
  "NO-ANCHOR": "no joining date and no plan start date to anchor billing to",
  "NO-EXPIRY": "no current expiry to renew from",
  "NOT-LATER": "the renewal does not move the expiry forward at all",
  "IN-PAST": "the renewal lands on or before today, so the member stays expired",
  "OFF-BILLING-DAY": "the renewal does not land on the member's billing day",
  "OVER-ADVANCED": "the renewal skips further ahead than the catch-up rule allows",
};

/**
 * Independently re-derive the expiry a renewal should produce, using only the
 * clock-free rule plus the documented catch-up. Deliberately does NOT call
 * computeRenewalExpiry, so comparing the two is a real cross-check rather than
 * a tautology.
 */
export function expectedRenewalExpiry(
  joinDate,
  currentExpiry,
  planDurationDays,
  asOf = new Date()
) {
  const today = utcDateOnly(asOf);
  let expiry = nextBillingExpiry(joinDate, currentExpiry, planDurationDays);
  let guard = 0;
  while (expiry <= today && guard < 1200) {
    expiry = nextBillingExpiry(joinDate, expiry, planDurationDays);
    guard += 1;
  }
  return expiry;
}

/**
 * Check a member's next renewal against the policy's structural invariants.
 *
 * @param member  { joinDate, planStartDate, planEndDate }
 * @param options { planDurationDays = 30, asOf = new Date() }
 * @returns { violations: string[], next, expected, coverageDays, cyclesAdvanced }
 *          `violations` is empty for a correct record, whatever its coverage.
 */
export function checkRenewalInvariants(member = {}, options = {}) {
  const { planDurationDays = 30, asOf = new Date() } = options;
  const anchor = member.joinDate || member.planStartDate || null;
  const violations = [];

  if (!anchor) violations.push("NO-ANCHOR");
  if (!member.planEndDate) violations.push("NO-EXPIRY");
  if (violations.length) {
    return {
      violations,
      next: null,
      expected: null,
      coverageDays: null,
      cyclesAdvanced: null,
    };
  }

  const today = utcDateOnly(asOf);
  const currentExpiry = utcDateOnly(member.planEndDate);
  const next = computeRenewalExpiry(anchor, member.planEndDate, planDurationDays, asOf);
  const expected = expectedRenewalExpiry(anchor, member.planEndDate, planDurationDays, asOf);

  if (!(next > currentExpiry)) violations.push("NOT-LATER");
  if (!(next > today)) violations.push("IN-PAST");
  if (deriveBillingMonths(anchor, next) === null) violations.push("OFF-BILLING-DAY");
  if (next.getTime() !== expected.getTime()) violations.push("OVER-ADVANCED");

  // Informational only. Coverage runs from the later of today and the current
  // expiry — a lapsed member's dead months are not membership they can use.
  const from = currentExpiry > today ? currentExpiry : today;
  const coverageDays = Math.round((next - from) / 86400000);

  // How many extra whole cycles the catch-up rule had to add.
  let cyclesAdvanced = 0;
  let walk = nextBillingExpiry(anchor, member.planEndDate, planDurationDays);
  while (walk < next && cyclesAdvanced < 1200) {
    walk = nextBillingExpiry(anchor, walk, planDurationDays);
    cyclesAdvanced += 1;
  }

  return { violations, next, expected, coverageDays, cyclesAdvanced };
}

export default checkRenewalInvariants;
