/**
 * READ-ONLY audit of every member's billing anchor. Writes nothing.
 *
 * The joining date is the single source of truth for expiry dates: a member's
 * billing day is permanently the day-of-month they joined, and every expiry is
 * that day, a whole number of calendar months later. This script checks that
 * invariant against production data and shows what the next renewal would do.
 *
 * All billing maths is imported from lib/dateUtils.js — the exact module the
 * app runs on — so the audit can never disagree with the application.
 *
 *   node scripts/audit-anchors.mjs          # problem rows only
 *   node scripts/audit-anchors.mjs --all    # every member
 *
 * Flags
 *   OFF-ANCHOR  the stored expiry does not sit on the member's billing day, so
 *               no whole number of months reproduces it. Usually a hand-edited
 *               date. The next renewal corrects it by at most half a month.
 *   NO-JOIN     no joining date at all (pre-dates the required field). The
 *               renewal falls back to the plan start date as its anchor.
 *   STAMPED     the joining date falls on the same calendar day the record was
 *               created. Benign for a member registered on the day they joined,
 *               but on an older record it means the real joining date was lost.
 *   TIMESTAMPED the joining date carries a time component instead of being a
 *               clean date-only value, which is how the old auto-stamped dates
 *               are recognised.
 *
 * It also checks every member's next renewal against the structural invariants
 * of the billing policy (scripts/renewal-invariants.mjs). Coverage LENGTH is
 * never a warning: a late payer receiving only a few usable days is an
 * intentional consequence of the fixed billing day, so those records are listed
 * for information and excluded from the violation count.
 */

import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as pathJoin } from "node:path";
import { format, isSameDay, differenceInDays } from "date-fns";
import {
  computeRenewalExpiry,
  deriveBillingMonths,
  isUtcDateOnly,
  utcDateOnly,
} from "../lib/dateUtils.js";
import { checkRenewalInvariants, INVARIANTS } from "./renewal-invariants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(pathJoin(__dirname, "..", ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim();
  }
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

const SHOW_ALL = process.argv.includes("--all");
const f = (d) => (d ? format(utcDateOnly(d), "dd-MMM-yyyy") : "—");
const pad = (s, n) => String(s).slice(0, n).padEnd(n);

await mongoose.connect(process.env.MONGODB_URI, {
  bufferCommands: false,
  serverSelectionTimeoutMS: 8000,
});

const members = await mongoose.connection
  .collection("members")
  .find({ isDeleted: { $ne: true } })
  .toArray();

const rows = [];
for (const m of members) {
  const anchor = m.joinDate || m.planStartDate;
  const flags = [];

  if (!m.joinDate) flags.push("NO-JOIN");
  else if (!isUtcDateOnly(m.joinDate)) flags.push("TIMESTAMPED");
  if (m.joinDate && m.createdAt && isSameDay(new Date(m.joinDate), new Date(m.createdAt)))
    flags.push("STAMPED");

  const monthsPaid = deriveBillingMonths(anchor, m.planEndDate);
  if (monthsPaid === null && anchor && m.planEndDate) flags.push("OFF-ANCHOR");

  // What the next 1-month renewal would produce today, and how many days of
  // membership that actually grants. Coverage starts at the later of the
  // current expiry and today, so a lapsed member's dead months are excluded.
  let next = null;
  let grantedDays = null;
  if (anchor && m.planEndDate) {
    next = computeRenewalExpiry(anchor, m.planEndDate, 30);
    const today = utcDateOnly(new Date());
    const expiry = utcDateOnly(m.planEndDate);
    grantedDays = differenceInDays(next, expiry > today ? expiry : today);
  }

  rows.push({
    id: m.customMemberId || String(m._id).slice(-6),
    name: m.name || "(no name)",
    join: anchor,
    expiry: m.planEndDate,
    monthsPaid,
    next,
    grantedDays,
    flags,
  });
}

const clean = rows.filter((r) => !r.flags.includes("OFF-ANCHOR") && !r.flags.includes("NO-JOIN"));
const problems = rows.filter((r) => r.flags.includes("OFF-ANCHOR") || r.flags.includes("NO-JOIN"));
const stamped = rows.filter((r) => r.flags.includes("STAMPED"));

console.log(`\nREAD-ONLY AUDIT — no database writes\n${"=".repeat(104)}\n`);
console.log(`Members scanned              : ${rows.length}`);
console.log(`Expiry on the billing day    : ${clean.length}`);
console.log(`Needs no action, but noted   : ${stamped.length} STAMPED`);
console.log(`Off-anchor or missing anchor : ${problems.length}`);

function table(title, list) {
  if (!list.length) return;
  console.log(`\n── ${title} (${list.length}) ${"─".repeat(Math.max(0, 72 - title.length))}`);
  console.log(
    `${pad("ID", 7)}${pad("NAME", 22)}${pad("JOINED", 13)}${pad("EXPIRY", 13)}` +
      `${"PAID".padStart(5)}  ${pad("NEXT RENEWAL", 13)}${"USABLE".padStart(7)}  FLAGS`
  );
  for (const r of list) {
    console.log(
      `${pad(r.id, 7)}${pad(r.name, 22)}${pad(f(r.join), 13)}${pad(f(r.expiry), 13)}` +
        `${String(r.monthsPaid ?? "—").padStart(4)}m  ${pad(f(r.next), 13)}` +
        `${String(r.grantedDays ?? "—").padStart(7)}  ${r.flags.join("+") || "ok"}`
    );
  }
}

table("OFF-ANCHOR / NO-JOIN — the next renewal will realign these", problems);
if (SHOW_ALL) table("ON-ANCHOR", clean);
else console.log(`\n${clean.length} members sit exactly on their billing day (--all to list).`);

// Renewal correctness. Coverage LENGTH is deliberately not a warning: under the
// finalized billing policy a late payer receives fewer usable days, and that is
// intentional, not an anomaly. What gets flagged is a renewal that breaks the
// structure of the rule — see scripts/renewal-invariants.mjs.
const broken = [];
for (const r of rows) {
  if (!r.join || !r.expiry) continue;
  const check = checkRenewalInvariants(
    { joinDate: r.join, planEndDate: r.expiry },
    { planDurationDays: 30 }
  );
  r.coverageDays = check.coverageDays;
  r.cyclesAdvanced = check.cyclesAdvanced;
  if (check.violations.length) broken.push({ ...r, violations: check.violations });
}

console.log(
  `\nRenewal-rule violations: ${broken.length}` +
    (broken.length
      ? `\n${broken
          .map(
            (r) =>
              `  ${r.id} ${r.name} → ${r.violations
                .map((v) => `${v} (${INVARIANTS[v]})`)
                .join(", ")}`
          )
          .join("\n")}`
      : " (none — every renewal adds time, lands in the future on the billing day," +
        "\n                         and advances no further than the catch-up rule allows)")
);

// Informational: how much usable membership today's renewal would grant. Short
// figures are correct for late payers and are NOT errors.
const withCoverage = rows.filter((r) => r.coverageDays != null);
const short = withCoverage
  .filter((r) => r.coverageDays < 16)
  .sort((a, b) => a.coverageDays - b.coverageDays);
console.log(
  `\nFor information — late payers who would get under 16 days: ${short.length}` +
    " (intentional, not errors)"
);
for (const r of short)
  console.log(
    `  ${pad(r.id, 7)}${pad(r.name, 22)} expiry ${f(r.expiry)} → ${f(r.next)}` +
      `  ${String(r.coverageDays).padStart(3)}d usable` +
      (r.cyclesAdvanced ? `  (+${r.cyclesAdvanced} cycle caught up)` : "")
  );
console.log();

await mongoose.disconnect();
