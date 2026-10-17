#!/usr/bin/env node
/**
 * Guarded, reversible correction for Mohd Azeem (#1704) ONLY.
 *
 * Default: read-only verification + local exact EJSON backup + dry-run report.
 * Apply and rollback require the explicit approval token printed below. Never
 * use this script as a broad migration.
 *
 *   node scripts/correct-member-1704.mjs
 *   node scripts/correct-member-1704.mjs --apply --approval=1704-05DEC-2X600
 *   node scripts/correct-member-1704.mjs --rollback=<backup> --approval=1704-05DEC-2X600
 */

import mongoose from "mongoose";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join as pathJoin, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeInitialExpiry, computeExpiryFromJoin } from "../lib/dateUtils.js";

const { EJSON } = mongoose.mongo.BSON;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathJoin(__dirname, "..");
const APPROVAL = "1704-05DEC-2X600";
const CORRECTION_BY = "targeted-correction:#1704";
const MEMBER_ID = new mongoose.Types.ObjectId("6a6178aa31cce9b192ad30ba");
const UPI_ID = new mongoose.Types.ObjectId("6acd8e6b2a0c81b5aa2d89e6");
const CASH_ID = new mongoose.Types.ObjectId("6acd8e822a0c81b5aa2d89ea");
const PAYMENT_IDS = [UPI_ID, CASH_ID];
const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const iso = (value) => new Date(value).toISOString();
const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const approval = args.find((x) => x.startsWith("--approval="))?.slice(11);
const rollbackArg = args.find((x) => x.startsWith("--rollback="));
const ROLLBACK = rollbackArg ? rollbackArg.slice(11) : null;
if (APPLY && ROLLBACK) throw new Error("Choose either --apply or --rollback, not both.");
if ((APPLY || ROLLBACK) && approval !== APPROVAL) {
  throw new Error(`Write mode requires --approval=${APPROVAL}`);
}

function loadEnv() {
  const env = readFileSync(pathJoin(ROOT, ".env.local"), "utf8");
  for (const raw of env.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0 && !(line.slice(0, i).trim() in process.env)) {
      process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");
}

function assert(condition, message) {
  if (!condition) throw new Error(`SAFETY CHECK FAILED: ${message}`);
}

function verifyCurrent(member, payments) {
  assert(member, "member ObjectId does not exist");
  assert(member.customMemberId === "1704", "custom member ID is not 1704");
  assert(member.name === "Mohd Azeem", "member name changed");
  assert(member.isDeleted === false, "member is deleted");
  assert(same(member.joinDate, d("2026-09-05")), "joining date is no longer 05-Sep-2026");
  assert(same(member.planEndDate, d("2026-11-13")), "current expiry is no longer 13-Nov-2026");
  assert(same(member.planStartDate, d("2026-10-13")), "current plan start is no longer 13-Oct-2026");
  assert(member.planDurationDays === 30, "current plan duration is not one month");
  assert(member.status === "active", "current stored status is not active");
  assert(payments.length === 2, "member no longer has exactly two payment records");

  const byId = new Map(payments.map((p) => [String(p._id), p]));
  const upi = byId.get(String(UPI_ID));
  const cash = byId.get(String(CASH_ID));
  assert(upi && cash, "the two expected payment IDs are not the complete history");
  for (const p of [upi, cash]) {
    assert(String(p.memberId) === String(MEMBER_ID), "payment is linked to another member");
    assert(p.amount === 600, "payment amount is not ₹600");
    assert(p.planDurationDays === 30, "payment is not a one-month payment");
    assert(p.status === "voided", "payment is no longer in the expected voided state");
    assert(!p.reconciliation, "payment already has reconciliation metadata");
    assert(typeof p.receiptText === "string" && p.receiptText.length > 0, "receipt is missing");
  }
  assert(upi.paymentMethod === "UPI", "UPI payment method changed");
  assert(same(upi.paymentDate, d("2026-10-13")), "UPI payment date changed");
  assert(cash.paymentMethod === "Cash", "Cash payment method changed");
  assert(same(cash.paymentDate, d("2026-10-05")), "Cash payment date changed");
  return { upi, cash };
}

function exactBackup(member, payments) {
  mkdirSync(pathJoin(__dirname, "backups"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = pathJoin(__dirname, "backups", `member-1704-before-${stamp}.ejson`);
  const payload = {
    format: "MongoDB Extended JSON canonical",
    target: { customMemberId: "1704", memberId: MEMBER_ID },
    takenAt: new Date(),
    member,
    payments,
  };
  writeFileSync(path, EJSON.stringify(payload, null, 2, { relaxed: false }), "utf8");
  return path;
}

function proposed(now) {
  return {
    member: {
      joinDate: d("2026-09-05"),
      planStartDate: d("2026-11-05"),
      planEndDate: d("2026-12-05"),
      planDurationDays: 30,
      status: "active",
      miaFlagged: false,
      updatedAt: now,
    },
    payments: [
      {
        _id: CASH_ID,
        status: "active",
        reconciliation: {
          entitlementStart: d("2026-10-05"),
          entitlementEnd: d("2026-11-05"),
          reconciledAt: now,
          reconciledBy: CORRECTION_BY,
          reason: "Confirmed retained one-month payment; rebased to permanent 5th-day anchor.",
          requiresManualVoid: true,
        },
      },
      {
        _id: UPI_ID,
        status: "active",
        reconciliation: {
          entitlementStart: d("2026-11-05"),
          entitlementEnd: d("2026-12-05"),
          reconciledAt: now,
          reconciledBy: CORRECTION_BY,
          reason: "Confirmed retained one-month payment; rebased to permanent 5th-day anchor.",
          requiresManualVoid: true,
        },
      },
    ],
  };
}

function dryRunReport(member, payments, plan, backupPath) {
  const initialEnd = computeInitialExpiry(d("2026-09-05"), 30);
  const expectedEnd = computeExpiryFromJoin(d("2026-09-05"), 3);
  console.log("\nDRY RUN ONLY — NO DATABASE WRITES");
  console.log("=================================\n");
  console.log(`Target: #${member.customMemberId} ${member.name} (${member._id})`);
  console.log(`Exact local backup: ${backupPath}`);
  console.log("\nEntitlement verification:");
  console.log(`  initial 1 month : 05-Sep-2026 → ${iso(initialEnd).slice(0, 10)}`);
  console.log("  Cash ₹600 / 30d: 05-Oct-2026 → 05-Nov-2026");
  console.log("  UPI  ₹600 / 30d: 05-Nov-2026 → 05-Dec-2026");
  console.log(`  derived 3-cycle expiry: ${iso(expectedEnd).slice(0, 10)}`);
  console.log("  additional payments/adjustments: none");
  console.log("\nProposed member field changes:");
  console.log(`  planStartDate: ${iso(member.planStartDate)} → ${iso(plan.member.planStartDate)}`);
  console.log(`  planEndDate  : ${iso(member.planEndDate)} → ${iso(plan.member.planEndDate)}`);
  console.log(`  updatedAt    : ${iso(member.updatedAt)} → <apply-time>`);
  console.log("  joinDate, duration, status, MIA: unchanged (05-Sep, 30, active, false)");
  console.log("\nProposed payment changes (exactly two records):");
  for (const p of plan.payments) {
    const current = payments.find((x) => String(x._id) === String(p._id));
    console.log(`  ${p._id} ${current.paymentMethod} ${iso(current.paymentDate).slice(0, 10)}`);
    console.log("    status: voided → active");
    console.log(
      `    reconciliation: add ${iso(p.reconciliation.entitlementStart).slice(0, 10)} → ${iso(p.reconciliation.entitlementEnd).slice(0, 10)}, manual-void required`
    );
    console.log("    amount, method, paymentDate, createdAt, previousExpiry, newExpiry, receiptText,");
    console.log("    memberSnapshot, voidedAt/by/reason and revertedTo: unchanged");
  }
  console.log(`\nApply remains locked. After approval only: --apply --approval=${APPROVAL}\n`);
}

async function applyCorrection(db, member, payments, plan, backupPath) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const memberResult = await db.collection("members").updateOne(
        {
          _id: MEMBER_ID,
          customMemberId: "1704",
          joinDate: member.joinDate,
          planStartDate: member.planStartDate,
          planEndDate: member.planEndDate,
          planDurationDays: 30,
          status: "active",
          updatedAt: member.updatedAt,
        },
        { $set: plan.member },
        { session }
      );
      assert(memberResult.matchedCount === 1, "member changed after verification; transaction aborted");

      for (const change of plan.payments) {
        const before = payments.find((p) => String(p._id) === String(change._id));
        const result = await db.collection("payments").updateOne(
          {
            _id: change._id,
            memberId: MEMBER_ID,
            status: "voided",
            amount: 600,
            planDurationDays: 30,
            paymentDate: before.paymentDate,
            createdAt: before.createdAt,
            reconciliation: { $exists: false },
          },
          { $set: { status: "active", reconciliation: change.reconciliation } },
          { session }
        );
        assert(result.matchedCount === 1, `payment ${change._id} changed; transaction aborted`);
      }
    });
  } finally {
    await session.endSession();
  }
  console.log(`Correction applied to #1704 only. Rollback backup: ${backupPath}`);
}

async function rollback(db, backupPath) {
  const saved = EJSON.parse(readFileSync(resolve(backupPath), "utf8"));
  assert(saved.target?.customMemberId === "1704", "backup target is not #1704");
  assert(String(saved.target.memberId) === String(MEMBER_ID), "backup member ObjectId differs");
  assert(String(saved.member?._id) === String(MEMBER_ID), "backup member document differs");
  assert(saved.payments?.length === 2, "backup does not contain exactly two payments");

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const memberResult = await db.collection("members").replaceOne(
        {
          _id: MEMBER_ID,
          customMemberId: "1704",
          planEndDate: d("2026-12-05"),
        },
        saved.member,
        { session }
      );
      assert(memberResult.matchedCount === 1, "corrected member state not found; rollback aborted");
      for (const payment of saved.payments) {
        assert(PAYMENT_IDS.some((id) => String(id) === String(payment._id)), "unexpected payment in backup");
        const result = await db.collection("payments").replaceOne(
          {
            _id: payment._id,
            memberId: MEMBER_ID,
            status: "active",
            "reconciliation.reconciledBy": CORRECTION_BY,
          },
          payment,
          { session }
        );
        assert(result.matchedCount === 1, `corrected payment ${payment._id} not found; rollback aborted`);
      }
    });
  } finally {
    await session.endSession();
  }
  console.log("Rollback restored the exact EJSON before-state for #1704 and its two payments.");
}

loadEnv();
await mongoose.connect(process.env.MONGODB_URI, {
  bufferCommands: false,
  serverSelectionTimeoutMS: 8000,
});
try {
  const db = mongoose.connection.db;
  if (ROLLBACK) {
    await rollback(db, ROLLBACK);
  } else {
    const member = await db.collection("members").findOne({ _id: MEMBER_ID });
    const payments = await db
      .collection("payments")
      .find({ memberId: MEMBER_ID })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    verifyCurrent(member, payments);
    const backupPath = exactBackup(member, payments);
    const now = new Date();
    const plan = proposed(now);
    dryRunReport(member, payments, plan, backupPath);
    if (APPLY) await applyCorrection(db, member, payments, plan, backupPath);
  }
} finally {
  await mongoose.disconnect();
}
