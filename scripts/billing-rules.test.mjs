/**
 * Acceptance tests for the joining-date billing rule.
 * Runs against the real lib/dateUtils.js used by the app.
 *
 *   node --test scripts/billing-rules.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as pathJoin } from "node:path";
import { format } from "date-fns";
import {
  computeExpiryFromJoin,
  computeInitialExpiry,
  computeJoinDateFromExpiry,
  computeRenewalExpiry,
  deriveBillingMonths,
  durationToMonths,
  getBillingMonthsPaid,
  nextBillingExpiry,
  utcDateOnly,
} from "../lib/dateUtils.js";

const ROOT = pathJoin(dirname(fileURLToPath(import.meta.url)), "..");
// Business dates enter the app as "YYYY-MM-DD" strings, which JS parses as UTC
// midnight — so the tests build their inputs the same way the API receives them.
const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const utc = d;
// Rendered from UTC fields so every assertion reads the calendar day the app
// actually stores, on any machine in any timezone.
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const s = (date) => {
  const x = utcDateOnly(date);
  return `${String(x.getUTCDate()).padStart(2, "0")}-${MONTHS[x.getUTCMonth()]}-${x.getUTCFullYear()}`;
};

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

/* ── Date storage: date-only values at UTC midnight ───────────────────────── */

test("utcDateOnly strips the time and keeps the UTC calendar day", () => {
  // Already UTC midnight — unchanged.
  assert.equal(utcDateOnly(utc("2026-07-06")).toISOString(), "2026-07-06T00:00:00.000Z");
  // A real timestamp mid-day — time stripped, day kept.
  assert.equal(
    utcDateOnly(new Date("2026-07-23T14:02:11.329Z")).toISOString(),
    "2026-07-23T00:00:00.000Z"
  );
  // The form input path: a bare "YYYY-MM-DD" string, exactly what z.coerce.date()
  // produces from the member form and quick-add form.
  assert.equal(utcDateOnly(new Date("2026-07-06")).toISOString(), "2026-07-06T00:00:00.000Z");
  // Late-in-day UTC timestamps must not roll over to the next day.
  assert.equal(
    utcDateOnly(new Date("2026-07-06T23:59:59.999Z")).toISOString(),
    "2026-07-06T00:00:00.000Z"
  );
});

test("utcDateOnly is idempotent", () => {
  const once = utcDateOnly(d("2026-07-06"));
  const twice = utcDateOnly(once);
  assert.equal(once.getTime(), twice.getTime());
});

test("expiry derived from a UTC-midnight joining date is itself UTC midnight", () => {
  for (const months of [1, 2, 3, 6, 12]) {
    const out = computeExpiryFromJoin(utc("2026-07-06"), months);
    assert.equal(
      utcDateOnly(out).toISOString(),
      out.toISOString(),
      `${months}m result must already be UTC midnight, got ${out.toISOString()}`
    );
  }
});

test("the billing rule is timezone independent", () => {
  // The same joining date must yield the same expiry regardless of the
  // machine's timezone. Run the real module in child processes under
  // deliberately extreme zones (UTC+14, UTC-11, IST, UTC).
  const script =
    "import('./lib/dateUtils.js').then(({computeExpiryFromJoin,utcDateOnly})=>" +
    "console.log(utcDateOnly(computeExpiryFromJoin(new Date('2026-07-06T00:00:00.000Z'),1)).toISOString()))";
  const results = {};
  for (const tz of ["UTC", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Niue"]) {
    results[tz] = execFileSync(process.execPath, ["-e", script], {
      cwd: ROOT,
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    }).trim();
  }
  const unique = [...new Set(Object.values(results))];
  assert.equal(
    unique.length,
    1,
    `expected one answer across all timezones, got ${JSON.stringify(results)}`
  );
  assert.equal(unique[0], "2026-08-06T00:00:00.000Z");
});

/* ── Guards against the specific regressions that caused this incident ────── */

test("a business date is never silently defaulted to the current date", () => {
  const model = readFileSync(pathJoin(ROOT, "models/Member.js"), "utf8");
  assert.doesNotMatch(
    model,
    /joinDate:\s*\{[^}]*default:\s*Date\.now/,
    "joinDate must not default to Date.now — that discards the real joining date"
  );
  const createRoute = readFileSync(pathJoin(ROOT, "app/api/members/route.js"), "utf8");
  assert.doesNotMatch(
    createRoute,
    /planStartDate\s*=\s*parsed\.data\.planStartDate\s*\|\|\s*new Date\(\)/,
    "the create route must require an explicit joining date"
  );
});

test("the renewal route never writes joinDate", () => {
  const renewRoute = readFileSync(
    pathJoin(ROOT, "app/api/members/renew/[id]/route.js"),
    "utf8"
  );
  assert.doesNotMatch(
    renewRoute,
    /member\.joinDate\s*=/,
    "renewals must never overwrite the authoritative joining date"
  );
});

test("no business-date write uses local startOfDay", () => {
  // startOfDay is fine for 'is this member expired today' comparisons, but must
  // never be used to build a value that gets stored.
  for (const file of [
    "app/api/members/route.js",
    "app/api/members/renew/[id]/route.js",
    "app/api/members/[id]/route.js",
  ]) {
    const src = readFileSync(pathJoin(ROOT, file), "utf8");
    const offenders = src
      .split("\n")
      .filter((l) => /(?:joinDate|planStartDate|planEndDate)\s*[:=][^=].*startOfDay/.test(l));
    assert.deepEqual(offenders, [], `${file} stores a local startOfDay value`);
  }
});

/* ── THE FINALIZED RENEWAL RULE ────────────────────────────────────────────
 *
 * The joining date fixes the billing day for life. The payment date is a
 * transaction date and nothing more: it may never become the billing anchor,
 * and it may never move the billing day. The next expiry always follows the
 * member's existing cycle.
 *
 * One exception: if the calculated expiry has already passed by the time the
 * member pays, advance by whole billing cycles until it is in the future. The
 * billing DAY still never moves.
 * ─────────────────────────────────────────────────────────────────────────── */

test("early, on-time and late payments all produce the same next expiry", () => {
  // Joined 05/06, currently expires 05/07 — billing day is the 5th, forever.
  const join = d("2026-06-05");
  const expiry = d("2026-07-05");
  const paydays = {
    "early    29/06": "2026-06-29",
    "on time  05/07": "2026-07-05",
    "late     15/07": "2026-07-15",
  };
  for (const [label, payday] of Object.entries(paydays)) {
    assert.equal(
      s(computeRenewalExpiry(join, expiry, 30, d(payday))),
      "05-Aug-2026",
      `${label} must give 05-Aug-2026`
    );
  }
});

test("a late payment inside the cycle keeps the billing day and costs the member days", () => {
  // Billing day 20, expired 20/07, pays 08/08 → 20/08. The member knowingly
  // receives only 08/08–20/08; paying late is not rewarded with a fresh month.
  const next = computeRenewalExpiry(d("2026-06-20"), d("2026-07-20"), 30, d("2026-08-08"));
  assert.equal(s(next), "20-Aug-2026");
});

test("a very late payment advances whole cycles until the expiry is in the future", () => {
  // Billing day 01, expired 01/07, pays 08/08. The rule gives 01/08, which has
  // already passed, so it advances exactly one cycle to 01/09 — never to 08/09.
  const next = computeRenewalExpiry(d("2026-06-01"), d("2026-07-01"), 30, d("2026-08-08"));
  assert.equal(s(next), "01-Sep-2026");
});

test("an extremely late payment still lands on the billing day", () => {
  // Same member paying on 01/12: cycles advance 01/08 → … → 01/12, and because
  // an expiry equal to the payment date is worth nothing, on to 01/01.
  const next = computeRenewalExpiry(d("2026-06-01"), d("2026-07-01"), 30, d("2026-12-01"));
  assert.equal(s(next), "01-Jan-2027");
  assert.equal(utcDateOnly(next).getUTCDate(), 1, "billing day must still be the 1st");
});

test("the payment date can never become the billing day", () => {
  const join = d("2026-06-05");
  const expiry = d("2026-07-05");
  const forbidden = [
    ["2026-07-15", "15-Aug-2026"],
    ["2026-07-15", "15-Sep-2026"],
    ["2026-06-29", "29-Jul-2026"],
    ["2026-06-29", "29-Aug-2026"],
  ];
  for (const [payday, banned] of forbidden) {
    const next = computeRenewalExpiry(join, expiry, 30, d(payday));
    assert.notEqual(s(next), banned, `paying ${payday} must never produce ${banned}`);
    assert.equal(
      utcDateOnly(next).getUTCDate(),
      5,
      `paying ${payday} must leave the billing day on the 5th, got ${s(next)}`
    );
  }
});

test("the billing-day calculation cannot see a clock", () => {
  // Structural guarantee: nextBillingExpiry takes no payment date and no `now`,
  // so no clock value can reach the anchor arithmetic.
  assert.equal(
    nextBillingExpiry.length,
    3,
    "nextBillingExpiry must accept exactly (joinDate, currentExpiry, planDurationDays)"
  );
  assert.equal(s(nextBillingExpiry(d("2026-06-05"), d("2026-07-05"), 30)), "05-Aug-2026");
  assert.equal(s(nextBillingExpiry(d("2026-08-23"), d("2026-09-23"), 30)), "23-Oct-2026");
  assert.equal(s(nextBillingExpiry(d("2026-06-05"), d("2026-06-05"), 90)), "05-Sep-2026");
});

test("the result is identical for every payment date within the cycle", () => {
  // Whenever the rule's answer is already in the future, `now` is irrelevant —
  // 40 different payment dates spanning six weeks must agree exactly.
  const join = d("2026-08-23");
  const expiry = d("2026-09-23");
  const answers = new Set();
  for (let i = 0; i < 40; i++) {
    const payday = new Date(Date.UTC(2026, 8, 1 + i));
    answers.add(s(computeRenewalExpiry(join, expiry, 30, payday)));
  }
  assert.deepEqual([...answers], ["23-Oct-2026"], `got ${[...answers].join(", ")}`);
});

test("multiple renewals preserve the original billing day forever", () => {
  // Billing day 5. Every payment lands on a deliberately different day.
  const join = d("2026-06-05");
  let expiry = d("2026-07-05");
  const paydays = ["2026-06-29", "2026-08-01", "2026-09-05", "2026-10-10", "2026-11-30"];
  const chain = [s(expiry)];
  for (const payday of paydays) {
    expiry = computeRenewalExpiry(join, expiry, 30, d(payday));
    chain.push(s(expiry));
  }
  assert.deepEqual(chain, [
    "05-Jul-2026",
    "05-Aug-2026",
    "05-Sep-2026",
    "05-Oct-2026",
    "05-Nov-2026",
    "05-Dec-2026",
  ]);
});

test("multi-month plans follow the same billing anchor", () => {
  const join = d("2026-06-05");
  assert.equal(s(nextBillingExpiry(join, d("2026-06-05"), 90)), "05-Sep-2026");
  assert.equal(s(nextBillingExpiry(join, d("2026-09-05"), 90)), "05-Dec-2026");
  assert.equal(s(nextBillingExpiry(join, d("2026-06-05"), 365)), "05-Jun-2027");
  // A late payer on a 3-month plan advances by whole 3-month cycles.
  assert.equal(
    s(computeRenewalExpiry(join, d("2026-03-05"), 90, d("2026-08-08"))),
    "05-Sep-2026"
  );
});

/* ── Lapsed members ───────────────────────────────────────────────────────── */

test("a lapsed member's expiry advances by whole cycles, never from the payment date", () => {
  // Paid up to 10-Mar, returns on 08-Aug and buys one month. The rule walks
  // 10-Apr … 10-Aug; 10-Aug is the first date after the payment date.
  const join = d("2026-01-10");
  const next = computeRenewalExpiry(join, d("2026-03-10"), 30, d("2026-08-08"));
  assert.equal(s(next), "10-Aug-2026");
  assert.equal(utcDateOnly(next).getUTCDate(), 10, "billing day must still be the 10th");
  assert.equal(deriveBillingMonths(join, next), 7);
});

test("a lapsed member on a longer plan advances by that plan's cycle length", () => {
  const join = d("2026-01-10");
  const lapsed = d("2026-03-10");
  const today = d("2026-08-08");
  // 3-month cycles: 10-Jun is past, 10-Sep is the first future date.
  assert.equal(s(computeRenewalExpiry(join, lapsed, 90, today)), "10-Sep-2026");
  // A 12-month cycle clears the payment date on the first step.
  assert.equal(s(computeRenewalExpiry(join, lapsed, 365, today)), "10-Mar-2027");
});

test("a member who lapsed less than a month keeps their billing day", () => {
  // Expired 5 days ago: the new expiry is the next billing date, unchanged from
  // an on-time renewal, so short lapses never shift the cycle.
  const join = d("2026-01-06");
  const next = computeRenewalExpiry(join, d("2026-08-06"), 30, d("2026-08-11"));
  assert.equal(s(next), "06-Sep-2026");
});

test("an expiry that drifted off the billing day is pulled back into line", () => {
  // A real record: joined 22-Jul, expiry hand-edited to 24-Aug. The renewal
  // returns the member to the 22nd instead of granting a whole free month.
  const join = d("2026-07-22");
  const next = computeRenewalExpiry(join, d("2026-08-24"), 30, d("2026-08-08"));
  assert.equal(s(next), "22-Sep-2026");
  assert.ok(next > d("2026-08-24"), "must still add time");
  assert.equal(deriveBillingMonths(join, next), 2);
});

test("a drifted expiry is realigned to the billing day, not extended", () => {
  // Billing day 1st, expiry drifted forward to 28-Feb — the member already
  // holds 27 days they were not billed for. The renewal returns them to the
  // 1st; it must not hand them a further whole month on top.
  const next = computeRenewalExpiry(d("2026-01-01"), d("2026-02-28"), 30, d("2026-02-20"));
  assert.equal(s(next), "01-Mar-2026");
  assert.ok(next > d("2026-02-28"), "a renewal must always add time");
});

/* ── Billing months are derived, never stored ─────────────────────────────── */

test("deriveBillingMonths recovers the month count from a stored expiry", () => {
  assert.equal(deriveBillingMonths(d("2026-07-22"), d("2026-08-22")), 1);
  assert.equal(deriveBillingMonths(d("2026-07-22"), d("2026-09-22")), 2);
  assert.equal(deriveBillingMonths(d("2026-07-15"), d("2027-07-15")), 12);
  // The expiry equalling the joining date is zero months, not a billing period.
  assert.equal(deriveBillingMonths(d("2026-07-22"), d("2026-07-22")), null);
});

test("deriveBillingMonths refuses an expiry that is off the billing day", () => {
  // The two production records whose expiry sits 1–2 days past the billing day.
  assert.equal(deriveBillingMonths(d("2026-07-22"), d("2026-08-24")), null);
  assert.equal(deriveBillingMonths(d("2026-07-22"), d("2026-08-23")), null);
  // Missing inputs are reported the same way, never guessed.
  assert.equal(deriveBillingMonths(null, d("2026-08-22")), null);
  assert.equal(deriveBillingMonths(d("2026-07-22"), null), null);
});

test("deriveBillingMonths handles a clamped month-end expiry", () => {
  // 31-Jan + 1 month clamps to 28-Feb, and the scan finds that exact date.
  assert.equal(deriveBillingMonths(d("2027-01-31"), d("2027-02-28")), 1);
  assert.equal(deriveBillingMonths(d("2027-01-31"), d("2027-03-31")), 2);
  // 31-Mar is unreachable from 28-Feb by whole months (28-Mar, 28-Apr, …).
  assert.equal(deriveBillingMonths(d("2027-02-28"), d("2027-03-31")), null);
});

test("getBillingMonthsPaid reads a member record, ISO strings included", () => {
  // The shape the client actually receives: JSON-serialised dates.
  assert.equal(
    getBillingMonthsPaid({
      joinDate: "2026-07-22T00:00:00.000Z",
      planEndDate: "2026-09-22T00:00:00.000Z",
    }),
    2
  );
  // A legacy record with no joining date falls back to the plan start.
  assert.equal(
    getBillingMonthsPaid({
      planStartDate: "2026-07-22T00:00:00.000Z",
      planEndDate: "2026-08-22T00:00:00.000Z",
    }),
    1
  );
  assert.equal(getBillingMonthsPaid(null), null);
  assert.equal(getBillingMonthsPaid({ planEndDate: "2026-08-22T00:00:00.000Z" }), null);
});

test("every renewal result is itself on the billing day", () => {
  // Whatever the starting record looks like, the answer must be a date the
  // joining anchor can reproduce — that is what keeps the cycle self-correcting.
  const join = d("2027-01-31");
  const starts = [d("2027-02-28"), d("2027-03-15"), d("2026-11-30"), d("2027-04-30")];
  for (const start of starts) {
    for (const days of [30, 90, 365]) {
      const next = computeRenewalExpiry(join, start, days, d("2027-03-01"));
      assert.ok(
        deriveBillingMonths(join, next) !== null,
        `renewing ${s(start)} by ${days}d gave ${s(next)}, which is off the billing day`
      );
      assert.ok(next > start, `renewing ${s(start)} by ${days}d must add time`);
    }
  }
});

test("no stored billingMonths field was introduced", () => {
  // The count is a function of joinDate + planEndDate. Storing a second copy
  // would let it drift on any hand-edited date, so the schema must stay clean.
  const model = readFileSync(pathJoin(ROOT, "models/Member.js"), "utf8");
  assert.doesNotMatch(model, /billingMonths/, "billingMonths must remain derived");
  for (const file of [
    "app/api/members/route.js",
    "app/api/members/renew/[id]/route.js",
    "app/api/members/[id]/route.js",
  ]) {
    const src = readFileSync(pathJoin(ROOT, file), "utf8");
    assert.doesNotMatch(src, /billingMonths\s*[:=]/, `${file} must not persist the count`);
  }
});

test("the renewal sheet previews the expiry with the API's own calculation", () => {
  // If the sheet computed the date differently, the admin could confirm one
  // expiry and the server could store another.
  const sheet = readFileSync(pathJoin(ROOT, "components/members/RenewalModal.jsx"), "utf8");
  assert.match(sheet, /computeRenewalExpiry/);
  const renewRoute = readFileSync(
    pathJoin(ROOT, "app/api/members/renew/[id]/route.js"),
    "utf8"
  );
  assert.match(renewRoute, /computeRenewalExpiry/);
});

test("computeRenewalExpiry does not mutate its inputs", () => {
  const join = utc("2026-07-06");
  const expiry = utc("2026-08-06");
  const joinBefore = join.getTime();
  const expiryBefore = expiry.getTime();
  computeRenewalExpiry(join, expiry, 30, utc("2026-08-01"));
  assert.equal(join.getTime(), joinBefore, "joining date must not be mutated");
  assert.equal(expiry.getTime(), expiryBefore, "expiry must not be mutated");
});

test("expiry computation is stable when re-applied (migration idempotency)", () => {
  // Re-deriving an expiry from an already-correct record must be a no-op.
  const join = utc("2026-07-06");
  const first = utcDateOnly(computeExpiryFromJoin(join, 2));
  const second = utcDateOnly(computeExpiryFromJoin(join, 2));
  assert.equal(first.getTime(), second.getTime());
  assert.equal(first.toISOString(), "2026-09-06T00:00:00.000Z");
});
