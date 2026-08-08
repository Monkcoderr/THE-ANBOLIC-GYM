/**
 * Billing-anchor migration.
 *
 * Makes the JOINING DATE the single source of truth for every member's expiry
 * date, using calendar-month arithmetic:
 *
 *     expiry = joining date + (total billing months paid) calendar months
 *
 * The expiry always falls on the joining day-of-month (clamped to the last day
 * of shorter months). The expiry is NEVER derived from the old expiry date.
 *
 * ── Why the joining date itself sometimes needs repairing ────────────────
 * An older version of the create route stamped `joinDate = new Date()`, i.e.
 * the day the member was typed into the app, discarding the joining date the
 * admin actually entered. That real date survives in `planStartDate` for any
 * member who has never renewed (renewal overwrites planStartDate). Where the
 * two disagree and no renewal has happened, planStartDate wins.
 *
 * ── Total months paid ────────────────────────────────────────────────────
 * never renewed : the initial plan length, in months
 * renewed       : initial plan length + every renewal recorded in `payments`
 * The initial plan length of a renewed member is recovered from the first
 * payment's `previousExpiry` (the expiry as it stood before that renewal).
 * When that figure is not a clean whole number of months away from the joining
 * date the record cannot be reasoned about safely — it is reported as REVIEW
 * and left completely untouched.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   node scripts/migrate-billing-anchor.mjs                    # preview, no writes
 *   node scripts/migrate-billing-anchor.mjs --apply            # perform the migration
 *   node scripts/migrate-billing-anchor.mjs --assume-monthly-initial
 *          also repair the REVIEW members, assuming their first plan was a
 *          1-month plan (true for 149 of 162 records). Combine with --apply.
 *   node scripts/migrate-billing-anchor.mjs --rollback <file>  # undo an apply
 *
 * The migration is idempotent: once applied, a second run reports 0 changes.
 * Only `joinDate`, `planEndDate` and the derived `status` are ever written.
 * Payment history is never modified. Every --apply writes the previous values
 * of the affected records to scripts/backups/ first, so it can be undone.
 */

import mongoose from "mongoose";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as pathJoin } from "node:path";
import {
  addMonths,
  setDate,
  getDate,
  getDaysInMonth,
  startOfDay,
  addDays,
  subDays,
  differenceInDays,
  isSameDay,
  format,
} from "date-fns";

// ── Load .env.local (node doesn't auto-load it) ───────────────────────────
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
  console.error("Could not read .env.local — make sure it exists.");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set in .env.local");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const ASSUME_MONTHLY = process.argv.includes("--assume-monthly-initial");
const rollbackIdx = process.argv.indexOf("--rollback");
const ROLLBACK_FILE = rollbackIdx !== -1 ? process.argv[rollbackIdx + 1] : null;
if (rollbackIdx !== -1 && !ROLLBACK_FILE) {
  console.error("--rollback needs a backup file path.");
  process.exit(1);
}

// ── Billing maths (mirrors lib/dateUtils.js exactly) ──────────────────────
/**
 * Normalise to a DATE-ONLY value stored at UTC midnight, which is the
 * convention every date in this database already follows (the app runs on a
 * UTC server, where local midnight IS UTC midnight).
 *
 * This must be applied to everything the migration writes. Using date-fns'
 * startOfDay here instead would store local midnight — on an IST machine that
 * is 18:30 UTC the PREVIOUS day, so the production server would render every
 * migrated date one day early and read the wrong billing day off it.
 */
const utcDateOnly = (date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};
/** True when a stored value is already a clean UTC-midnight date-only value. */
const isUtcDateOnly = (date) =>
  date instanceof Date && date.getTime() === utcDateOnly(date).getTime();

const applyAnchorDay = (date, anchorDay) => {
  const d = new Date(date);
  return setDate(d, Math.min(anchorDay, getDaysInMonth(d)));
};
const durationToMonths = (days) => Math.max(1, Math.round((Number(days) || 0) / 30));
const computeExpiryFromJoin = (joinDate, totalMonths) => {
  const j = new Date(joinDate);
  return applyAnchorDay(
    addMonths(j, Math.max(0, Math.round(Number(totalMonths) || 0))),
    getDate(j)
  );
};
const computeMemberStatus = (planEndDate, today) => {
  const end = new Date(planEndDate);
  if (end < today) return "expired";
  if (end <= addDays(today, 3)) return "expiring";
  return "active";
};

const f = (d) => (d ? format(new Date(d), "dd-MMM-yyyy") : "—");
const pad = (s, n) => String(s).slice(0, n).padEnd(n);

// ── Load data ─────────────────────────────────────────────────────────────
await mongoose.connect(process.env.MONGODB_URI, {
  bufferCommands: false,
  serverSelectionTimeoutMS: 8000,
});
const membersCol = mongoose.connection.collection("members");
const paymentsCol = mongoose.connection.collection("payments");

// ── Rollback mode: restore a previous backup and exit ─────────────────────
if (ROLLBACK_FILE) {
  const saved = JSON.parse(readFileSync(ROLLBACK_FILE, "utf8"));
  const ops = saved.records.map((r) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(r._id) },
      update: {
        $set: {
          joinDate: new Date(r.joinDate),
          planEndDate: new Date(r.planEndDate),
          status: r.status,
          updatedAt: new Date(),
        },
      },
    },
  }));
  const res = await membersCol.bulkWrite(ops, { ordered: false });
  console.log(
    `Rolled back ${res.modifiedCount} of ${saved.records.length} records ` +
      `from ${ROLLBACK_FILE} (taken ${saved.takenAt}).`
  );
  await mongoose.disconnect();
  process.exit(0);
}

const members = await membersCol.find({ isDeleted: { $ne: true } }).toArray();
const payments = await paymentsCol.find({}).toArray();

const paymentsByMember = new Map();
for (const p of payments) {
  const k = String(p.memberId);
  if (!paymentsByMember.has(k)) paymentsByMember.set(k, []);
  paymentsByMember.get(k).push(p);
}
for (const list of paymentsByMember.values()) {
  list.sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));
}

const today = startOfDay(new Date());

/**
 * Work out what a single member's record should look like.
 * Returns { plan } for an actionable row, or { review, reason } to skip it.
 */
function planFor(member) {
  const history = paymentsByMember.get(String(member._id)) || [];
  const storedJoin = member.joinDate ? new Date(member.joinDate) : null;
  const storedStart = member.planStartDate ? new Date(member.planStartDate) : null;

  // ── 1. Resolve the true joining date (the permanent billing anchor) ────
  let anchor;
  let anchorNote = "";
  if (!history.length) {
    // planStartDate is untouched by renewals, so it still holds the joining
    // date the admin typed. Prefer it whenever it disagrees with joinDate.
    if (storedStart && storedJoin && !isSameDay(storedStart, storedJoin)) {
      anchor = storedStart;
      anchorNote = `joinDate ${f(storedJoin)}→${f(storedStart)}`;
    } else {
      anchor = storedStart || storedJoin;
    }
  } else {
    // planStartDate was overwritten by the renewal; joinDate is all we have.
    anchor = storedJoin || storedStart;
  }
  if (!anchor) return { review: true, reason: "no joining date or plan start date" };
  if (!member.planEndDate) return { review: true, reason: "no expiry date" };

  // ── 2. Total billing months paid for ──────────────────────────────────
  let totalMonths;
  let monthsNote;
  if (!history.length) {
    totalMonths = durationToMonths(member.planDurationDays);
    monthsNote = `${totalMonths}m initial`;
  } else {
    const first = history[0];
    if (!first.previousExpiry) {
      return { review: true, reason: "renewed member has no previousExpiry to reconstruct from" };
    }
    // The pre-renewal expiry tells us how long the initial plan ran for.
    const gapDays = differenceInDays(
      startOfDay(new Date(first.previousExpiry)),
      startOfDay(anchor)
    );
    const initialMonths = Math.max(0, Math.round(gapDays / 30));
    const renewalMonths = history.reduce(
      (sum, p) => sum + durationToMonths(p.planDurationDays),
      0
    );
    // Guard: the gap must actually be a whole number of months. If it isn't,
    // the stored joining date is not the real one and we must not guess.
    if (gapDays < -1 || Math.abs(gapDays - initialMonths * 30) > 3) {
      // The old create route computed the original expiry as
      // planStartDate + planDurationDays, so the real joining date can be
      // recovered by subtracting the initial plan length — provided we know
      // what that length was. Offer the 1-month reading as a suggestion.
      const suggestedJoin = startOfDay(subDays(new Date(first.previousExpiry), 30));
      return {
        review: true,
        reason:
          `joining date ${f(anchor)} is ${gapDays}d from the pre-renewal expiry ` +
          `${f(first.previousExpiry)} — not a whole number of months`,
        suggestedJoin,
        suggestedMonths: 1 + renewalMonths,
        suggestedExpiry: computeExpiryFromJoin(suggestedJoin, 1 + renewalMonths),
      };
    }
    totalMonths = initialMonths + renewalMonths;
    monthsNote =
      `${initialMonths}m initial + ${history.length} renewal` +
      `${history.length === 1 ? "" : "s"} (${renewalMonths}m) = ${totalMonths}m`;
  }

  // ── 3. Derive the expiry from the joining date ─────────────────────────
  const expected = utcDateOnly(computeExpiryFromJoin(anchor, totalMonths));
  const anchorNormalised = utcDateOnly(anchor);
  const current = new Date(member.planEndDate);
  const diff = differenceInDays(startOfDay(expected), startOfDay(current));
  // A record also needs rewriting when the calendar date is right but the
  // stored value isn't a clean UTC-midnight date-only value.
  const joinChanged =
    !storedJoin ||
    !isSameDay(storedJoin, anchorNormalised) ||
    !isUtcDateOnly(storedJoin);
  const expiryChanged = diff !== 0 || !isUtcDateOnly(current);

  return {
    plan: {
      id: member.customMemberId || String(member._id).slice(-6),
      _id: member._id,
      name: member.name || "(no name)",
      anchor: anchorNormalised,
      storedJoin,
      current,
      expected,
      diff,
      joinChanged,
      expiryChanged,
      anchorNote,
      monthsNote,
      status: computeMemberStatus(expected, today),
      renewals: history.length,
    },
  };
}

const changes = [];
const unchanged = [];
const reviews = [];
for (const m of members) {
  const r = planFor(m);
  if (r.review) {
    // With --assume-monthly-initial the suggested joining date is treated as
    // real, so these records join the normal migration set.
    if (ASSUME_MONTHLY && r.suggestedJoin) {
      const current = new Date(m.planEndDate);
      const suggestedJoin = utcDateOnly(r.suggestedJoin);
      const suggestedExpiry = utcDateOnly(r.suggestedExpiry);
      changes.push({
        id: m.customMemberId || String(m._id).slice(-6),
        _id: m._id,
        name: m.name || "(no name)",
        anchor: suggestedJoin,
        storedJoin: m.joinDate ? new Date(m.joinDate) : null,
        current,
        expected: suggestedExpiry,
        diff: differenceInDays(startOfDay(suggestedExpiry), startOfDay(current)),
        joinChanged: true,
        expiryChanged: true,
        anchorNote: `joinDate ${f(m.joinDate)}→${f(suggestedJoin)} (assumed 1m initial)`,
        monthsNote: `1m initial (assumed) + renewals = ${r.suggestedMonths}m`,
        status: computeMemberStatus(suggestedExpiry, today),
        renewals: 1,
      });
      continue;
    }
    reviews.push({
      id: m.customMemberId || String(m._id).slice(-6),
      name: m.name || "(no name)",
      join: f(m.joinDate),
      expiry: f(m.planEndDate),
      reason: r.reason,
      suggestedJoin: r.suggestedJoin,
      suggestedExpiry: r.suggestedExpiry,
    });
  } else if (r.plan.expiryChanged || r.plan.joinChanged) {
    changes.push(r.plan);
  } else {
    unchanged.push(r.plan);
  }
}

// ── Report ────────────────────────────────────────────────────────────────
console.log(
  `\n${APPLY ? "APPLYING MIGRATION" : "PREVIEW ONLY — no database writes"}\n` +
    `${"=".repeat(118)}\n`
);
console.log(`Scanned ${members.length} active members.`);
console.log(`  will change   : ${changes.length}`);
console.log(`  already correct: ${unchanged.length}`);
console.log(`  needs review   : ${reviews.length}\n`);

const decreases = changes.filter((c) => c.diff < 0);
const increases = changes.filter((c) => c.diff > 0);
const sameDate = changes.filter((c) => c.diff === 0);

function table(title, rows) {
  if (!rows.length) return;
  console.log(`\n── ${title} (${rows.length}) ${"─".repeat(Math.max(0, 92 - title.length))}`);
  console.log(
    `${pad("ID", 7)}${pad("NAME", 22)}${pad("JOINING", 13)}${pad("CURRENT EXP", 13)}` +
      `${pad("CORRECT EXP", 13)}${"DIFF".padStart(6)}  MONTHS PAID / NOTES`
  );
  for (const c of rows.sort((a, b) => a.diff - b.diff)) {
    const notes = [c.monthsNote, c.anchorNote].filter(Boolean).join("  ·  ");
    console.log(
      `${pad(c.id, 7)}${pad(c.name, 22)}${pad(f(c.anchor), 13)}${pad(f(c.current), 13)}` +
        `${pad(f(c.expected), 13)}${String(c.diff > 0 ? `+${c.diff}` : c.diff).padStart(6)}  ${notes}`
    );
  }
}

table("EXPIRY DECREASES — extra days removed", decreases);
table("EXPIRY INCREASES — days that were wrongly cut short", increases);
table("EXPIRY UNCHANGED — joining date corrected only", sameDate);

if (reviews.length) {
  console.log(
    `\n── NEEDS MANUAL REVIEW — left untouched (${reviews.length}) ${"─".repeat(50)}`
  );
  console.log(
    "These members renewed at least once, and their stored joining date is the\n" +
      "day they were typed into the app rather than the day they joined, so it\n" +
      "cannot be trusted. The suggested joining date assumes their FIRST plan was\n" +
      "a 1-month plan. Verify each one, then either fix the joining date on the\n" +
      "member's edit screen and re-run, or re-run with --assume-monthly-initial.\n"
  );
  console.log(
    `${pad("ID", 7)}${pad("NAME", 22)}${pad("STORED JOIN", 13)}${pad("EXPIRY", 13)}` +
      `${pad("SUGGESTED", 13)}${pad("→ EXPIRY", 13)}REASON`
  );
  for (const r of reviews) {
    console.log(
      `${pad(r.id, 7)}${pad(r.name, 22)}${pad(r.join, 13)}${pad(r.expiry, 13)}` +
        `${pad(f(r.suggestedJoin), 13)}${pad(f(r.suggestedExpiry), 13)}${r.reason}`
    );
  }
}

const totalDaysRemoved = decreases.reduce((s, c) => s + c.diff, 0);
const totalDaysAdded = increases.reduce((s, c) => s + c.diff, 0);
console.log(
  `\nNet effect: ${Math.abs(totalDaysRemoved)} extra days removed across ${decreases.length} members, ` +
    `${totalDaysAdded} days restored across ${increases.length} members.`
);

// ── Apply ─────────────────────────────────────────────────────────────────
if (!APPLY) {
  console.log(
    "\nNothing was written. Re-run with --apply to perform the migration:\n" +
      "  node scripts/migrate-billing-anchor.mjs --apply\n"
  );
} else if (!changes.length) {
  console.log("\nNothing to do — every member already satisfies the rule.\n");
} else {
  // Snapshot the fields we are about to overwrite so the migration is
  // reversible with --rollback.
  const backupDir = pathJoin(__dirname, "backups");
  mkdirSync(backupDir, { recursive: true });
  const stamp = format(new Date(), "yyyy-MM-dd'T'HHmmss");
  const backupPath = pathJoin(backupDir, `billing-anchor-${stamp}.json`);
  const byId = new Map(members.map((m) => [String(m._id), m]));
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        note: "Pre-migration joinDate/planEndDate/status for records changed by migrate-billing-anchor.mjs",
        records: changes.map((c) => {
          const m = byId.get(String(c._id));
          return {
            _id: String(c._id),
            name: m.name,
            customMemberId: m.customMemberId ?? null,
            joinDate: m.joinDate,
            planEndDate: m.planEndDate,
            status: m.status,
          };
        }),
      },
      null,
      2
    )
  );
  console.log(`\nBackup written: ${backupPath}`);

  const ops = changes.map((c) => ({
    updateOne: {
      filter: { _id: c._id },
      update: {
        $set: {
          joinDate: utcDateOnly(c.anchor),
          planEndDate: utcDateOnly(c.expected),
          status: c.status,
          updatedAt: new Date(),
        },
      },
    },
  }));
  const res = await membersCol.bulkWrite(ops, { ordered: false });
  console.log(`Migration applied. ${res.modifiedCount} member records updated.`);
  console.log("Re-run without --apply to confirm 0 remaining changes.");
  console.log(
    `To undo:\n  node scripts/migrate-billing-anchor.mjs --rollback "${backupPath}"\n`
  );
}

await mongoose.disconnect();
