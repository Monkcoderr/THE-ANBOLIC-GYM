/** Read-only billing integrity monitor. Never writes to MongoDB. */
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { dirname, join as pathJoin } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveBillingMonths, utcDateOnly } from "../lib/dateUtils.js";

const root = pathJoin(dirname(fileURLToPath(import.meta.url)), "..");
for (const raw of readFileSync(pathJoin(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
}
const sinceArg = process.argv.find((arg) => arg.startsWith("--lineage-since="));
const lineageSince = sinceArg ? new Date(sinceArg.slice(16)) : null;
const day = (value) => value ? utcDateOnly(value).toISOString().slice(0, 10) : null;

await mongoose.connect(process.env.MONGODB_URI, {
  bufferCommands: false,
  serverSelectionTimeoutMS: 8000,
});
try {
  const db = mongoose.connection.db;
  const members = await db.collection("members").find({}).toArray();
  const payments = await db.collection("payments").find({}).sort({ createdAt: 1, _id: 1 }).toArray();
  const memberById = new Map(members.map((m) => [String(m._id), m]));
  const byMember = new Map();
  for (const payment of payments) {
    const key = String(payment.memberId);
    if (!byMember.has(key)) byMember.set(key, []);
    byMember.get(key).push(payment);
  }

  const issues = [];
  for (const member of members) {
    if (
      !member.isDeleted &&
      member.joinDate &&
      member.planEndDate &&
      deriveBillingMonths(member.joinDate, member.planEndDate) === null
    ) {
      issues.push({
        severity: "error",
        code: "MEMBER_OFF_ANCHOR",
        memberId: member.customMemberId || String(member._id),
        joinDate: day(member.joinDate),
        expiry: day(member.planEndDate),
      });
    }
  }

  for (const payment of payments) {
    const member = memberById.get(String(payment.memberId));
    if (!member) {
      issues.push({ severity: "error", code: "ORPHAN_PAYMENT", paymentId: String(payment._id) });
      continue;
    }
    if (payment.status === "voided" && payment.revertedTo?.appliedToMember === false) {
      issues.push({
        severity: "error",
        code: "FINANCIAL_ONLY_VOID",
        memberId: member.customMemberId || String(member._id),
        paymentId: String(payment._id),
      });
    }
    if (lineageSince && payment.createdAt >= lineageSince) {
      for (const field of [
        "idempotencyKey",
        "renewalId",
        "entitlementStart",
        "entitlementEnd",
        "anchorDateUsed",
        "memberVersionBefore",
        "memberVersionAfter",
      ]) {
        if (payment[field] === undefined || payment[field] === null) {
          issues.push({
            severity: "error",
            code: "MISSING_RENEWAL_LINEAGE",
            memberId: member.customMemberId || String(member._id),
            paymentId: String(payment._id),
            field,
          });
        }
      }
    }
  }

  for (const [memberId, list] of byMember) {
    for (let i = 1; i < list.length; i += 1) {
      const seconds = (list[i].createdAt - list[i - 1].createdAt) / 1000;
      if (seconds <= 300) {
        const member = memberById.get(memberId);
        issues.push({
          severity: "warning",
          code: "RAPID_RENEWALS",
          memberId: member?.customMemberId || memberId,
          seconds,
          paymentIds: [String(list[i - 1]._id), String(list[i]._id)],
        });
      }
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  console.log(JSON.stringify({
    readOnly: true,
    scanned: { members: members.length, payments: payments.length },
    lineageSince: lineageSince?.toISOString() || null,
    summary: { errors: errors.length, warnings: warnings.length },
    issues,
  }, null, 2));
  if (errors.length) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
