/**
 * Acceptance tests for the joining-date billing rule.
 * Runs against the real lib/dateUtils.js used by the app.
 *
 *   node --test scripts/billing-rules.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { format } from "date-fns";
import {
  computeExpiryFromJoin,
  computeInitialExpiry,
  computeJoinDateFromExpiry,
  computeRenewalExpiry,
  durationToMonths,
} from "../lib/dateUtils.js";

const d = (iso) => new Date(`${iso}T00:00:00`);
const s = (date) => format(date, "dd-MMM-yyyy");

test("expiry is exactly one calendar month after the joining date", () => {
  // The four acceptance rules, written as dd/mm.
  assert.equal(s(computeExpiryFromJoin(d("2026-05-02"), 1)), "02-Jun-2026");
  assert.equal(s(computeExpiryFromJoin(d("2026-05-15"), 1)), "15-Jun-2026");
  assert.equal(s(computeExpiryFromJoin(d("2026-08-23"), 1)), "23-Sep-2026");
  assert.equal(s(computeExpiryFromJoin(d("2026-09-10"), 1)), "10-Oct-2026");
});

test("a 30-day plan means one calendar month, never 30 days", () => {
  // July has 31 days: a day-count would give 01-Aug, the rule gives 02-Aug.
  assert.equal(s(computeInitialExpiry(d("2026-07-02"), 30)), "02-Aug-2026");
  // February has 28: a day-count would give 03-Mar, the rule gives 01-Mar.
  assert.equal(s(computeInitialExpiry(d("2026-02-01"), 30)), "01-Mar-2026");
});

test("multi-month plans keep the joining day", () => {
  assert.equal(durationToMonths(30), 1);
  assert.equal(durationToMonths(60), 2);
  assert.equal(durationToMonths(90), 3);
  assert.equal(durationToMonths(180), 6);
  assert.equal(durationToMonths(365), 12);
  assert.equal(s(computeInitialExpiry(d("2026-06-02"), 90)), "02-Sep-2026");
  assert.equal(s(computeInitialExpiry(d("2026-07-15"), 365)), "15-Jul-2027");
});

test("end of month clamps to the last valid day, never an invalid date", () => {
  // 31-Jan + 1 month → 28-Feb in a non-leap year, 29-Feb in a leap year.
  assert.equal(s(computeExpiryFromJoin(d("2027-01-31"), 1)), "28-Feb-2027");
  assert.equal(s(computeExpiryFromJoin(d("2028-01-31"), 1)), "29-Feb-2028");
  // 31-Jan + 3 months is a real 31st again — the billing day is not lost.
  assert.equal(s(computeExpiryFromJoin(d("2027-01-31"), 3)), "30-Apr-2027");
  assert.equal(s(computeExpiryFromJoin(d("2027-01-31"), 2)), "31-Mar-2027");
});

test("renewal advances one calendar month and never shifts the billing day", () => {
  const join = d("2026-05-02");
  let expiry = computeInitialExpiry(join, 30);
  const seen = [s(expiry)];
  for (let i = 0; i < 3; i++) {
    // Pay on a deliberately random day — it must not affect the result.
    const payday = new Date(expiry);
    payday.setDate(payday.getDate() - 9);
    expiry = computeRenewalExpiry(join, expiry, 30, payday);
    seen.push(s(expiry));
  }
  assert.deepEqual(seen, ["02-Jun-2026", "02-Jul-2026", "02-Aug-2026", "02-Sep-2026"]);
});

test("renewal is identical whether the member pays early, on time, or late", () => {
  const join = d("2026-08-23");
  const expiry = d("2026-09-23");
  const early = computeRenewalExpiry(join, expiry, 30, d("2026-09-01"));
  const onTime = computeRenewalExpiry(join, expiry, 30, d("2026-09-23"));
  const late = computeRenewalExpiry(join, expiry, 30, d("2026-09-30"));
  assert.equal(s(early), "23-Oct-2026");
  assert.equal(s(onTime), "23-Oct-2026");
  assert.equal(s(late), "23-Oct-2026");
});

test("a clamped billing day is restored on the following renewal", () => {
  const join = d("2027-01-31");
  const feb = computeInitialExpiry(join, 30);
  assert.equal(s(feb), "28-Feb-2027");
  const mar = computeRenewalExpiry(join, feb, 30, d("2027-02-20"));
  assert.equal(s(mar), "31-Mar-2027", "billing day must return to the 31st");
});

test("renewal never shortens the period the member paid for", () => {
  // A record whose expiry is out of step with its joining day (legacy data).
  const join = d("2026-07-06");
  const misaligned = d("2026-09-23");
  const next = computeRenewalExpiry(join, misaligned, 30, d("2026-09-20"));
  assert.ok(
    next > misaligned,
    `expected an expiry after ${s(misaligned)}, got ${s(next)}`
  );
});

test("a badly lapsed member still ends up with a future expiry on the billing day", () => {
  const join = d("2026-01-10");
  const longExpired = d("2026-03-10");
  const today = d("2026-08-08");
  const next = computeRenewalExpiry(join, longExpired, 30, today);
  assert.ok(next > today, `expected a future expiry, got ${s(next)}`);
  assert.equal(next.getDate(), 10, "must still land on the 10th");
});

test("backfilling from a known expiry yields an anchor-consistent joining date", () => {
  const joinDate = computeJoinDateFromExpiry(d("2026-08-20"), 30);
  assert.equal(s(joinDate), "20-Jul-2026");
  // Round-trip: the derived joining date must reproduce the expiry.
  assert.equal(s(computeInitialExpiry(joinDate, 30)), "20-Aug-2026");
});

test("Ranjeet Singh's case: joined 06-Jul, 2 months paid, expiry 06-Sep", () => {
  const join = d("2026-07-06");
  const initial = computeInitialExpiry(join, 30);
  assert.equal(s(initial), "06-Aug-2026");
  // Renewal paid late, on 08-Aug — the receipt date must not move the expiry.
  const renewed = computeRenewalExpiry(join, initial, 30, d("2026-08-08"));
  assert.equal(s(renewed), "06-Sep-2026");
  assert.equal(s(computeExpiryFromJoin(join, 2)), "06-Sep-2026");
});
