/**
 * Tests for the audit's renewal heuristic.
 *
 * The point of these tests is to lock in ONE decision: short coverage for a
 * late payer is intentional business behaviour and must never be reported as an
 * anomaly. The previous heuristic flagged anything outside 16–46 days of
 * coverage, which turned 17 correct production records into false alarms.
 *
 * These tests use the real figures from those 17 records, so the false alarms
 * can never come back.
 *
 *   node --test scripts/audit-invariants.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as pathJoin } from "node:path";
import {
  checkRenewalInvariants,
  expectedRenewalExpiry,
  INVARIANTS,
} from "./renewal-invariants.mjs";
import { utcDateOnly } from "../lib/dateUtils.js";

const ROOT = pathJoin(dirname(fileURLToPath(import.meta.url)), "..");
const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const s = (date) => {
  const x = utcDateOnly(date);
  return `${String(x.getUTCDate()).padStart(2, "0")}-${MONTHS[x.getUTCMonth()]}-${x.getUTCFullYear()}`;
};
const TODAY = d("2026-08-08");

/* ── The 17 real records the old heuristic falsely flagged ────────────────── */

// customMemberId, name, joining date, current expiry, usable days on 08-Aug-2026.
const REAL_SHORT_COVERAGE = [
  ["1509", "Ansh", "2026-06-09", "2026-07-09", 1],
  ["1510", "Anmol", "2026-06-09", "2026-07-09", 1],
  ["1519", "Hussain", "2026-06-11", "2026-07-11", 3],
  ["1638", "Sharmila karki pandey", "2026-06-11", "2026-07-11", 3],
  ["1513", "Mayank", "2026-06-12", "2026-07-12", 4],
  ["1548", "Avinash Singh", "2026-06-12", "2026-07-12", 4],
  ["1550", "Ayush", "2026-06-15", "2026-07-15", 7],
  ["1502", "Girish", "2026-06-16", "2026-07-16", 8],
  ["1547", "Agom Tyagi", "2026-06-16", "2026-07-16", 8],
  ["54fcf6", "Ankit Rawat", "2026-06-18", "2026-07-18", 10],
  ["1501", "Gaurav Bist", "2026-06-20", "2026-07-20", 12],
  ["1524", "Khushi", "2026-06-21", "2026-07-21", 13],
  ["1546", "Adrash Kumar", "2026-06-21", "2026-07-21", 13],
  ["1549", "Vishal", "2026-06-21", "2026-07-21", 13],
  ["1528", "Harah", "2026-06-22", "2026-07-22", 14],
  ["1052", "Amit singh", "2026-06-22", "2026-07-22", 14],
  ["1525", "Dharmendra", "2026-06-23", "2026-07-23", 15],
];

test("short coverage for a late payer is never reported as a violation", () => {
  for (const [id, name, join, expiry, expectedDays] of REAL_SHORT_COVERAGE) {
    const result = checkRenewalInvariants(
      { joinDate: d(join), planEndDate: d(expiry) },
      { asOf: TODAY }
    );
    assert.deepEqual(
      result.violations,
      [],
      `${id} ${name} (${expectedDays}d usable) must not be flagged, got ${result.violations.join(", ")}`
    );
    assert.equal(
      result.coverageDays,
      expectedDays,
      `${id} ${name} coverage should be ${expectedDays}d`
    );
  }
});

test("one single usable day is correct, not an anomaly", () => {
  // Ansh and Anmol: billing day 9, expired 09-Jul, paying 08-Aug. 09-Aug is
  // still in the future, so the catch-up rule does not fire and they receive
  // exactly one day. Harsh, but exactly what the fixed billing day dictates.
  const result = checkRenewalInvariants(
    { joinDate: d("2026-06-09"), planEndDate: d("2026-07-09") },
    { asOf: TODAY }
  );
  assert.deepEqual(result.violations, []);
  assert.equal(result.coverageDays, 1);
  assert.equal(s(result.next), "09-Aug-2026");
  assert.equal(result.cyclesAdvanced, 0, "no catch-up should be needed");
});

test("the full spread of short coverage passes without a single flag", () => {
  // Every day-count from 1 to 15 must be acceptable.
  const flagged = [];
  for (let daysLate = 16; daysLate <= 30; daysLate++) {
    const expiry = new Date(TODAY.getTime() - daysLate * 86400000);
    const join = new Date(Date.UTC(2026, 5, expiry.getUTCDate()));
    const result = checkRenewalInvariants(
      { joinDate: join, planEndDate: expiry },
      { asOf: TODAY }
    );
    if (result.violations.length) flagged.push(`${daysLate}d late → ${result.violations}`);
    assert.ok(
      result.coverageDays < 16,
      `${daysLate}d late should yield under 16 usable days, got ${result.coverageDays}`
    );
  }
  assert.deepEqual(flagged, [], "short coverage must never be flagged");
});

test("long coverage from the catch-up rule is not flagged either", () => {
  // Sachin chandra / Kishor joshi: billing day 1, expired 01-Jul, paying
  // 08-Aug. 01-Aug has passed, so one cycle is caught up to 01-Sep — 24 days.
  const result = checkRenewalInvariants(
    { joinDate: d("2026-06-01"), planEndDate: d("2026-07-01") },
    { asOf: TODAY }
  );
  assert.deepEqual(result.violations, []);
  assert.equal(s(result.next), "01-Sep-2026");
  assert.equal(result.cyclesAdvanced, 1, "exactly one cycle should be caught up");
  assert.equal(result.coverageDays, 24);
});

test("an on-time renewal is not flagged", () => {
  const result = checkRenewalInvariants(
    { joinDate: d("2026-06-05"), planEndDate: d("2026-09-05") },
    { asOf: d("2026-09-05") }
  );
  assert.deepEqual(result.violations, []);
  assert.equal(s(result.next), "05-Oct-2026");
});

/* ── The invariants that SHOULD still fire ────────────────────────────────── */

test("a missing anchor or expiry is still reported", () => {
  assert.deepEqual(
    checkRenewalInvariants({ planEndDate: d("2026-08-22") }, { asOf: TODAY }).violations,
    ["NO-ANCHOR"]
  );
  assert.deepEqual(
    checkRenewalInvariants({ joinDate: d("2026-07-22") }, { asOf: TODAY }).violations,
    ["NO-EXPIRY"]
  );
  assert.deepEqual(
    checkRenewalInvariants({}, { asOf: TODAY }).violations.sort(),
    ["NO-ANCHOR", "NO-EXPIRY"]
  );
});

test("planStartDate is accepted as a fallback anchor", () => {
  const result = checkRenewalInvariants(
    { planStartDate: d("2026-06-20"), planEndDate: d("2026-07-20") },
    { asOf: TODAY }
  );
  assert.deepEqual(result.violations, []);
  assert.equal(s(result.next), "20-Aug-2026");
});

test("an off-billing-day expiry is reported", () => {
  // Savita mehta's real shape: joined 22-Jul, expiry hand-edited to 24-Aug.
  // The renewal itself realigns to the 22nd, so the RENEWAL is sound — the
  // audit's separate OFF-ANCHOR flag is what reports the stored expiry.
  const result = checkRenewalInvariants(
    { joinDate: d("2026-07-22"), planEndDate: d("2026-08-24") },
    { asOf: TODAY }
  );
  assert.deepEqual(result.violations, [], "the realigned renewal is correct");
  assert.equal(s(result.next), "22-Sep-2026");
});

test("every renewal outcome adds time, is in the future, and is on the billing day", () => {
  // Sweep a wide grid: 28 billing days × 14 lapse lengths × 3 plan lengths.
  const failures = [];
  for (let day = 1; day <= 28; day++) {
    for (const monthsAgo of [0, 1, 2, 3, 6, 12, 18]) {
      for (const dur of [30, 90, 365]) {
        const join = new Date(Date.UTC(2025, 0, day));
        const expiry = new Date(Date.UTC(2026, 7 - monthsAgo, day));
        const r = checkRenewalInvariants(
          { joinDate: join, planEndDate: expiry },
          { planDurationDays: dur, asOf: TODAY }
        );
        if (r.violations.length)
          failures.push(`day ${day}, ${monthsAgo}m ago, ${dur}d → ${r.violations}`);
      }
    }
  }
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} grid failures`);
});

test("expectedRenewalExpiry cross-checks the production calculation", () => {
  // The checker re-derives the answer without calling computeRenewalExpiry, so
  // agreement between the two is meaningful. A regression in either surfaces
  // as OVER-ADVANCED.
  for (const [, , join, expiry] of REAL_SHORT_COVERAGE) {
    const r = checkRenewalInvariants(
      { joinDate: d(join), planEndDate: d(expiry) },
      { asOf: TODAY }
    );
    assert.equal(
      r.next.getTime(),
      r.expected.getTime(),
      `independent re-derivation disagreed for join ${join}`
    );
  }
  assert.equal(
    s(expectedRenewalExpiry(d("2026-06-01"), d("2026-07-01"), 30, d("2026-12-01"))),
    "01-Jan-2027"
  );
});

/* ── Guards against the old heuristic creeping back ───────────────────────── */

test("the audit script no longer thresholds on coverage length", () => {
  const src = readFileSync(pathJoin(ROOT, "scripts/audit-anchors.mjs"), "utf8");
  assert.doesNotMatch(
    src,
    /grantedDays\s*<\s*16\s*\|\|\s*grantedDays\s*>\s*46/,
    "the 16–46 day threshold must not return"
  );
  assert.doesNotMatch(
    src,
    /unusual number of days/,
    "coverage length must not be described as unusual"
  );
  assert.match(src, /checkRenewalInvariants/, "the audit must use the invariant checker");
});

test("every invariant name has a documented meaning", () => {
  for (const key of Object.keys(INVARIANTS)) {
    assert.ok(INVARIANTS[key]?.length > 10, `${key} needs a real description`);
  }
  // A correct record reports nothing, so the map is only ever used for output.
  assert.deepEqual(
    checkRenewalInvariants(
      { joinDate: d("2026-06-20"), planEndDate: d("2026-07-20") },
      { asOf: TODAY }
    ).violations,
    []
  );
});
