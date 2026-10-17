import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join as pathJoin } from "node:path";
import { fileURLToPath } from "node:url";
import { computeExpiryFromJoin } from "../lib/dateUtils.js";

const ROOT = pathJoin(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(pathJoin(ROOT, "scripts/correct-member-1704.mjs"), "utf8");
const d = (iso) => new Date(`${iso}T00:00:00.000Z`);

test("#1704 correction derives exactly three anchored months to 05-Dec", () => {
  assert.equal(
    computeExpiryFromJoin(d("2026-09-05"), 3).toISOString(),
    "2026-12-05T00:00:00.000Z"
  );
  assert.match(src, /planEndDate: d\("2026-12-05"\)/);
  assert.match(src, /planStartDate: d\("2026-11-05"\)/);
});

test("#1704 correction is default-dry-run and write modes need an exact token", () => {
  assert.match(src, /const APPLY = args\.includes\("--apply"\)/);
  assert.match(src, /approval !== APPROVAL/);
  assert.match(src, /DRY RUN ONLY — NO DATABASE WRITES/);
  assert.doesNotMatch(src, /updateMany|deleteOne|deleteMany|bulkWrite/);
});

test("#1704 correction is hard-scoped to one member and two known payments", () => {
  for (const id of [
    "6a6178aa31cce9b192ad30ba",
    "6acd8e6b2a0c81b5aa2d89e6",
    "6acd8e822a0c81b5aa2d89ea",
  ]) {
    assert.match(src, new RegExp(id));
  }
  assert.match(src, /customMemberId === "1704"/);
  assert.match(src, /member\.isDeleted === false/);
  assert.match(src, /payments\.length === 2/);
  assert.match(src, /payment amount is not ₹600/);
  assert.match(src, /payment is not a one-month payment/);
});

test("original transaction, receipt, timestamp, snapshot and void audit fields are never set", () => {
  const paymentSet = src.match(
    /\{ \$set: \{ status: "active", reconciliation: change\.reconciliation \} \}/
  );
  assert.ok(paymentSet, "apply must set only status and additive reconciliation metadata");
  assert.match(src, /receiptText[\s\S]*unchanged/);
  assert.match(src, /memberSnapshot[\s\S]*voidedAt\/by\/reason[\s\S]*revertedTo: unchanged/);
});

test("backup uses canonical Extended JSON and rollback replaces exact documents transactionally", () => {
  assert.match(src, /EJSON\.stringify\(payload, null, 2, \{ relaxed: false \}\)/);
  assert.match(src, /withTransaction/);
  assert.match(src, /collection\("members"\)\.replaceOne/);
  assert.match(src, /collection\("payments"\)\.replaceOne/);
  assert.match(src, /reconciliation\.reconciledBy/);
});
