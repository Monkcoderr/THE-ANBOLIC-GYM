import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join as pathJoin } from "node:path";
import { fileURLToPath } from "node:url";
import {
  businessDateInput,
  businessDateOnly,
  isSupportedPlanDuration,
} from "../lib/dateUtils.js";

const ROOT = pathJoin(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(pathJoin(ROOT, path), "utf8");

test("India business date changes at India midnight, not UTC midnight", () => {
  assert.equal(businessDateInput(new Date("2026-10-16T18:29:59.999Z")), "2026-10-16");
  assert.equal(businessDateInput(new Date("2026-10-16T18:30:00.000Z")), "2026-10-17");
  assert.equal(businessDateOnly(new Date("2026-10-16T20:00:00.000Z")).toISOString(), "2026-10-17T00:00:00.000Z");
});

test("only approved plan presets are accepted", () => {
  for (const value of [30, 60, 90, 180, 365]) assert.equal(isSupportedPlanDuration(value), true);
  for (const value of [0, 1, 45, 120, 366]) assert.equal(isSupportedPlanDuration(value), false);
});

test("renewal persistence is one transaction with idempotency and version guards", () => {
  const route = read("app/api/members/renew/[id]/route.js");
  assert.match(route, /idempotencyKey: z\.string\(\)\.uuid/);
  assert.match(route, /withTransaction/);
  assert.match(route, /Payment\.create\([\s\S]*\{ session: dbSession \}/);
  assert.match(route, /Member\.updateOne/);
  assert.match(route, /__v: versionBefore/);
  assert.match(route, /\$inc: \{ __v: 1 \}/);
  assert.match(route, /replayResult/);
  assert.match(route, /matchesIdempotentRequest/);
  assert.match(route, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(route, /Nothing was changed/);
  assert.doesNotMatch(route, /await member\.save\(\)/);
});

test("payment schema has immutable lineage and a partial unique idempotency index", () => {
  const model = read("models/Payment.js");
  for (const field of [
    "idempotencyKey",
    "renewalId",
    "predecessorPaymentId",
    "entitlementStart",
    "entitlementEnd",
    "anchorDateUsed",
    "memberVersionBefore",
    "memberVersionAfter",
  ]) assert.match(model, new RegExp(field));
  assert.match(model, /unique: true/);
  assert.match(model, /partialFilterExpression/);
  assert.match(model, /immutable: true/);
});

test("renewal client reuses one UUID across retries", () => {
  const modal = read("components/members/RenewalModal.jsx");
  assert.match(modal, /const renewalKey = useRef\(null\)/);
  assert.match(modal, /renewalKey\.current \|\|= crypto\.randomUUID\(\)/);
  assert.match(modal, /idempotencyKey: renewalKey\.current/);
});

test("void is transaction-only and validates lineage inside the transaction", () => {
  const route = read("app/api/members/[id]/payments/[paymentId]/void/route.js");
  assert.match(route, /withTransaction/);
  assert.match(route, /predecessorPaymentId/);
  assert.match(route, /priorRecordedPayment/);
  assert.match(route, /__v: member\.__v \|\| 0/);
  assert.doesNotMatch(route, /undoMember|isTransactionUnsupported/);
});

test("joining-anchor correction requires a reason and appends an audit event atomically", () => {
  const route = read("app/api/members/[id]/route.js");
  const model = read("models/Member.js");
  assert.match(route, /ANCHOR_REASON_REQUIRED/);
  assert.match(route, /joinDateReason/);
  assert.match(route, /\$push = \{ billingAudit \}/);
  assert.match(route, /paidMonthsPreserved/);
  assert.match(model, /BillingAuditSchema/);
});

test("integrity monitor is read-only", () => {
  const audit = read("scripts/audit-billing-integrity.mjs");
  assert.match(audit, /readOnly: true/);
  assert.doesNotMatch(audit, /updateOne|updateMany|replaceOne|deleteOne|deleteMany|bulkWrite/);
});
