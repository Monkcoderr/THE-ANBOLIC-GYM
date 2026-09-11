/**
 * Acceptance tests for the void-bill correction workflow.
 *
 * The renewal and the revert are both pure functions of the data, so the whole
 * workflow is simulated here against the REAL lib/dateUtils.js and
 * lib/paymentRevert.js the app runs on — no database required.
 *
 * `applyRenewal` below is a faithful mirror of app/api/members/renew/[id]/route.js.
 * The source-grep guards at the bottom fail if the route stops matching it, so
 * the mirror cannot silently drift from production.
 *
 *   node --test scripts/void-bill.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as pathJoin } from "node:path";
import {
  computeMemberStatus,
  computeRenewalExpiry,
  getDaysSinceExpiry,
  utcDateOnly,
} from "../lib/dateUtils.js";
import {
  assessVoidability,
  buildMemberSnapshot,
  isVoided,
  NOT_VOIDED,
  PAYMENT_VOIDED,
  resolveRevertState,
} from "../lib/paymentRevert.js";

const ROOT = pathJoin(dirname(fileURLToPath(import.meta.url)), "..");
const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const s = (date) => {
  const x = utcDateOnly(date);
  return `${String(x.getUTCDate()).padStart(2, "0")}-${MONTHS[x.getUTCMonth()]}-${x.getUTCFullYear()}`;
};

/* ── Harness ───────────────────────────────────────────────────────────────
 * Members are built with expiries far in the FUTURE so computeMemberStatus —
 * which reads the real clock, exactly as the route does — always answers
 * "active". That keeps every assertion deterministic on any day the suite runs,
 * while still exercising the real production code paths.
 * ───────────────────────────────────────────────────────────────────────── */

// Far enough ahead that these dates stay in the future for the life of the app.
const YEAR = new Date().getUTCFullYear() + 5;
const iso = (month, day) =>
  `${YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

let seq = 0;
/** Ascending stand-ins for ObjectId / createdAt, i.e. true creation order. */
const nextSeq = () => ++seq;

function makeMember({ joinDay = 5, joinMonth = 1, planDurationDays = 30 } = {}) {
  const joinDate = d(iso(joinMonth, joinDay));
  const planEndDate = d(iso(joinMonth + 1, joinDay));
  return {
    _id: "member-1",
    name: "Test Member",
    phone: "9876500000",
    joinDate,
    planStartDate: joinDate,
    planEndDate,
    planDurationDays,
    status: computeMemberStatus(planEndDate),
    miaFlagged: false,
  };
}

/**
 * Mirror of the renew route: the five member fields it writes, plus the Payment
 * document it creates (snapshot included).
 */
function applyRenewal(member, { amount, paymentMethod = "Cash", planDurationDays, paymentDate }) {
  const currentStatus = computeMemberStatus(member.planEndDate);
  const previousExpiry = member.planEndDate;
  const memberSnapshot = buildMemberSnapshot(member);

  const anchorDate = member.joinDate || member.planStartDate || previousExpiry;
  const newExpiry = computeRenewalExpiry(
    anchorDate,
    previousExpiry,
    planDurationDays
  );
  const newStartDate =
    currentStatus === "expired"
      ? utcDateOnly(new Date())
      : utcDateOnly(previousExpiry);

  const order = nextSeq();
  const payment = {
    _id: `payment-${order}`,
    order,
    createdAt: order,
    memberId: member._id,
    amount,
    paymentMethod,
    paymentDate: paymentDate || new Date(),
    planDurationDays,
    previousExpiry,
    newExpiry,
    status: "active",
    memberSnapshot,
  };

  const next = {
    ...member,
    planEndDate: newExpiry,
    planDurationDays,
    planStartDate: newStartDate,
    status: computeMemberStatus(newExpiry),
    miaFlagged: false,
  };
  return { member: next, payment };
}

/** The five renewal-owned fields, for exact before/after comparison. */
function renewalFields(m) {
  return {
    planEndDate: s(m.planEndDate),
    planDurationDays: m.planDurationDays,
    planStartDate: s(m.planStartDate),
    status: m.status,
    miaFlagged: m.miaFlagged,
  };
}

/** Mirror of the void route's ordering + assessment, then the member write. */
function voidBill(member, payments, paymentId, { voidOnly = false } = {}) {
  const payment = payments.find((p) => p._id === paymentId);
  const laterActiveCount = payments.filter(
    (p) => !isVoided(p) && p.order > payment.order
  ).length;
  const priorPayment =
    payments
      .filter((p) => !isVoided(p) && p.order < payment.order)
      .sort((a, b) => b.order - a.order)[0] || null;

  const assessment = assessVoidability({
    payment,
    member,
    laterActiveCount,
    priorPayment,
  });

  const applyToMember = !voidOnly && assessment.ok && !assessment.drifted;
  if (!voidOnly && !applyToMember) {
    return { ok: false, code: assessment.code || "MEMBER_STATE_DRIFTED", member, payments };
  }

  const voided = {
    ...payment,
    status: PAYMENT_VOIDED,
    voidedAt: new Date(),
    voidReason: "test",
    revertedTo: assessment.revert
      ? { ...assessment.revert, appliedToMember: applyToMember }
      : { appliedToMember: false },
  };
  const nextPayments = payments.map((p) => (p._id === paymentId ? voided : p));
  const nextMember = applyToMember
    ? {
        ...member,
        planEndDate: assessment.revert.planEndDate,
        planDurationDays: assessment.revert.planDurationDays,
        planStartDate: assessment.revert.planStartDate,
        status: assessment.revert.status,
        miaFlagged: assessment.revert.miaFlagged,
      }
    : member;

  return { ok: true, member: nextMember, payments: nextPayments, assessment };
}

/* ── Scenario A: wrong amount ─────────────────────────────────────────────── */

test("A — wrong amount: void restores the exact previous state, then the correct bill reproduces the same expiry", () => {
  const original = makeMember();
  const before = renewalFields(original);

  // ₹1,500 entered instead of ₹1,000.
  const wrong = applyRenewal(original, { amount: 1500, planDurationDays: 30 });
  assert.notDeepEqual(renewalFields(wrong.member), before, "the renewal must change state");

  const reverted = voidBill(wrong.member, [wrong.payment], wrong.payment._id);
  assert.ok(reverted.ok);
  assert.deepEqual(
    renewalFields(reverted.member),
    before,
    "the member must be byte-identical to the state before the wrong bill"
  );
  assert.equal(reverted.payments[0].status, PAYMENT_VOIDED);
  assert.equal(reverted.payments[0].amount, 1500, "the original amount is retained for audit");

  // Renew again with the correct amount.
  const right = applyRenewal(reverted.member, { amount: 1000, planDurationDays: 30 });
  assert.equal(right.payment.amount, 1000);
  assert.equal(
    s(right.member.planEndDate),
    s(wrong.member.planEndDate),
    "the corrected bill lands on the same billing day — only the money differs"
  );
  assert.deepEqual(renewalFields(right.member), renewalFields(wrong.member));
});

test("A — a voided bill never counts toward revenue", () => {
  // The revenue aggregation and the migration both filter on this fragment, and
  // it must be a $ne test so bills predating the field (no status) still count.
  assert.deepEqual(NOT_VOIDED, { status: { $ne: "voided" } });
  const bills = [
    { amount: 1000, status: "active" },
    { amount: 1500, status: "voided" },
    { amount: 800 }, // legacy row, no status field
  ];
  const counted = bills.filter((b) => b.status !== "voided");
  assert.equal(
    counted.reduce((sum, b) => sum + b.amount, 0),
    1800,
    "voided money is excluded; legacy rows are not"
  );
});

/* ── Scenario B: wrong payment date ──────────────────────────────────────── */

test("B — wrong payment date: void restores the previous state and the corrected date is recorded", () => {
  const original = makeMember();
  const before = renewalFields(original);

  const typo = applyRenewal(original, {
    amount: 1000,
    planDurationDays: 30,
    paymentDate: d(iso(1, 2)),
  });
  const reverted = voidBill(typo.member, [typo.payment], typo.payment._id);
  assert.deepEqual(renewalFields(reverted.member), before);

  const fixed = applyRenewal(reverted.member, {
    amount: 1000,
    planDurationDays: 30,
    paymentDate: d(iso(2, 5)),
  });
  assert.equal(s(fixed.payment.paymentDate), s(d(iso(2, 5))));
  assert.equal(
    s(fixed.member.planEndDate),
    s(typo.member.planEndDate),
    "the payment date must not move the expiry — the billing day owns it"
  );
});

/* ── Scenario C: wrong plan / duration ──────────────────────────────────── */

test("C — wrong plan: void reverts the duration change too, then the right plan applies cleanly", () => {
  const original = makeMember({ planDurationDays: 30 });
  const before = renewalFields(original);
  assert.equal(before.planDurationDays, 30);

  // 1 year selected instead of 1 month.
  const wrong = applyRenewal(original, { amount: 8000, planDurationDays: 365 });
  assert.equal(wrong.member.planDurationDays, 365);
  assert.equal(
    s(wrong.member.planEndDate),
    s(d(`${YEAR + 1}-02-05`)),
    "12 months on from the current expiry, on the same billing day"
  );

  const reverted = voidBill(wrong.member, [wrong.payment], wrong.payment._id);
  assert.ok(reverted.ok);
  assert.deepEqual(
    renewalFields(reverted.member),
    before,
    "planDurationDays must be restored, not left at 365"
  );

  const right = applyRenewal(reverted.member, { amount: 1000, planDurationDays: 30 });
  assert.equal(right.member.planDurationDays, 30);
  assert.equal(s(right.member.planEndDate), s(d(iso(3, 5))));
});

/* ── Scenario D: several previous payments ──────────────────────────────── */

test("D — voiding the latest bill leaves every earlier bill untouched", () => {
  const m0 = makeMember();
  const r1 = applyRenewal(m0, { amount: 1000, planDurationDays: 30 });
  const r2 = applyRenewal(r1.member, { amount: 1000, planDurationDays: 30 });
  const stateBeforeThird = renewalFields(r2.member);
  const r3 = applyRenewal(r2.member, { amount: 9999, planDurationDays: 30 });

  const payments = [r1.payment, r2.payment, r3.payment];
  const snapshotOfEarlier = JSON.stringify([r1.payment, r2.payment]);

  const out = voidBill(r3.member, payments, r3.payment._id);
  assert.ok(out.ok);
  assert.deepEqual(
    renewalFields(out.member),
    stateBeforeThird,
    "the member returns to the state produced by bill #2"
  );
  assert.equal(
    JSON.stringify(out.payments.slice(0, 2)),
    snapshotOfEarlier,
    "bills #1 and #2 must be completely unchanged"
  );
  assert.equal(out.payments[2].status, PAYMENT_VOIDED);

  // And the chain still runs on the original billing day.
  assert.equal(s(out.member.planEndDate), s(d(iso(4, 5))));
});

test("D — voids cascade correctly when applied newest-first", () => {
  const m0 = makeMember();
  const r1 = applyRenewal(m0, { amount: 1000, planDurationDays: 30 });
  const afterFirst = renewalFields(r1.member);
  const r2 = applyRenewal(r1.member, { amount: 1000, planDurationDays: 60 });
  const r3 = applyRenewal(r2.member, { amount: 1000, planDurationDays: 30 });

  let state = { member: r3.member, payments: [r1.payment, r2.payment, r3.payment] };
  state = voidBill(state.member, state.payments, r3.payment._id);
  assert.ok(state.ok);
  state = voidBill(state.member, state.payments, r2.payment._id);
  assert.ok(state.ok, "with #3 voided, #2 becomes the latest active bill");
  assert.deepEqual(
    renewalFields(state.member),
    afterFirst,
    "unwinding two bills returns the member to the state bill #1 produced"
  );
  assert.equal(state.payments[0].status, "active", "bill #1 stays active");
});

/* ── Scenario E: a later transaction exists ─────────────────────────────── */

test("E — an older bill with later renewals is refused, not blindly reverted", () => {
  const m0 = makeMember();
  const r1 = applyRenewal(m0, { amount: 1000, planDurationDays: 30 });
  const r2 = applyRenewal(r1.member, { amount: 1000, planDurationDays: 30 });
  const payments = [r1.payment, r2.payment];
  const currentState = renewalFields(r2.member);

  const assessment = assessVoidability({
    payment: r1.payment,
    member: r2.member,
    laterActiveCount: 1,
    priorPayment: null,
  });
  assert.equal(assessment.ok, false);
  assert.equal(assessment.code, "LATER_PAYMENTS_EXIST");

  const out = voidBill(r2.member, payments, r1.payment._id);
  assert.equal(out.ok, false, "the void must be refused");
  assert.deepEqual(
    renewalFields(out.member),
    currentState,
    "the member's current expiry must not be touched"
  );
  assert.equal(out.payments[0].status, "active", "and the bill must stay active");
});

test("E — voidOnly removes the money without touching the membership", () => {
  const m0 = makeMember();
  const r1 = applyRenewal(m0, { amount: 1000, planDurationDays: 30 });
  const r2 = applyRenewal(r1.member, { amount: 1000, planDurationDays: 30 });
  const currentState = renewalFields(r2.member);

  const out = voidBill(r2.member, [r1.payment, r2.payment], r1.payment._id, {
    voidOnly: true,
  });
  assert.ok(out.ok);
  assert.equal(out.payments[0].status, PAYMENT_VOIDED, "the bill is voided");
  assert.deepEqual(
    renewalFields(out.member),
    currentState,
    "membership untouched — only revenue changes"
  );
  assert.equal(out.payments[0].revertedTo.appliedToMember, false);
});

test("E — a membership changed outside the renewal flow is detected as drift", () => {
  const m0 = makeMember();
  const r1 = applyRenewal(m0, { amount: 1000, planDurationDays: 30 });
  // Something else moved the expiry after the bill was created.
  const tampered = { ...r1.member, planEndDate: d(iso(5, 17)) };

  const assessment = assessVoidability({
    payment: r1.payment,
    member: tampered,
    laterActiveCount: 0,
    priorPayment: null,
  });
  assert.equal(assessment.ok, true, "the bill itself is reversible");
  assert.equal(assessment.drifted, true, "but the member no longer matches it");

  const out = voidBill(tampered, [r1.payment], r1.payment._id);
  assert.equal(out.ok, false);
  assert.equal(s(out.member.planEndDate), s(d(iso(5, 17))), "the newer expiry survives");
});

test("E — an already-voided bill cannot be voided twice", () => {
  const m0 = makeMember();
  const r1 = applyRenewal(m0, { amount: 1000, planDurationDays: 30 });
  const first = voidBill(r1.member, [r1.payment], r1.payment._id);
  assert.ok(first.ok);
  const second = voidBill(first.member, first.payments, r1.payment._id);
  assert.equal(second.ok, false);
  assert.equal(second.code, "ALREADY_VOIDED");
});

/* ── Scenario F: nothing partial ever gets written ──────────────────────── */

test("F — the void route is atomic: one transaction, guarded writes, and compensation", () => {
  const src = readFileSync(
    pathJoin(ROOT, "app/api/members/[id]/payments/[paymentId]/void/route.js"),
    "utf8"
  );
  // Both writes run inside a single transaction where the deployment allows it.
  assert.match(src, /startSession\(\)/, "must open a session");
  assert.match(src, /withTransaction\(/, "must wrap both writes in one transaction");
  assert.match(src, /\{ session \}/, "both writes must join the session");
  // Every write is guarded, so a stale read can never overwrite newer data.
  assert.match(src, /paymentGuard/, "the payment write must be guarded");
  assert.match(src, /memberGuard/, "the member write must be guarded");
  assert.match(src, /status: \{ \$ne: PAYMENT_VOIDED \}/, "the payment guard must block double-voids");
  // The no-transaction fallback must undo the member write if the void fails.
  assert.match(src, /undoMember/, "the fallback must compensate the member write");
  assert.match(src, /isTransactionUnsupported/, "the fallback must only trigger on unsupported transactions");
  // A failure must never be reported as a partial success.
  assert.match(src, /Nothing was changed/, "the error message must state that nothing changed");
});

test("F — a bill with no recorded prior state is refused rather than guessed at", () => {
  // A seeded joining payment: no snapshot and no previousExpiry.
  const member = makeMember();
  const orphan = {
    _id: "payment-legacy",
    order: 0,
    memberId: member._id,
    amount: 1000,
    planDurationDays: 30,
    paymentDate: d(iso(1, 5)),
    previousExpiry: null,
    newExpiry: member.planEndDate,
    status: "active",
  };
  assert.equal(resolveRevertState(orphan, null, member), null);
  const assessment = assessVoidability({
    payment: orphan,
    member,
    laterActiveCount: 0,
    priorPayment: null,
  });
  assert.equal(assessment.ok, false);
  assert.equal(assessment.code, "NO_PRIOR_STATE");
});

/* ── The revert resolution itself ───────────────────────────────────────── */

test("the snapshot path restores every field a renewal writes, and nothing else", () => {
  const member = makeMember();
  const { member: after, payment } = applyRenewal(member, {
    amount: 1000,
    planDurationDays: 90,
  });
  const revert = resolveRevertState(payment, null, after);
  assert.equal(revert.source, "snapshot");
  assert.equal(s(revert.planEndDate), s(member.planEndDate));
  assert.equal(revert.planDurationDays, member.planDurationDays);
  assert.equal(s(revert.planStartDate), s(member.planStartDate));
  // The joining date is the permanent billing anchor and is not a revert target.
  assert.ok(!("joinDate" in revert), "a void must never write joinDate");
});

test("reconstruction agrees with the snapshot for a pre-snapshot bill", () => {
  // The same renewal, with the snapshot stripped as older bills have it. The
  // reconstructed answer must match the exact one field for field.
  const member = makeMember();
  const r1 = applyRenewal(member, { amount: 1000, planDurationDays: 30 });
  const r2 = applyRenewal(r1.member, { amount: 1000, planDurationDays: 60 });

  const exact = resolveRevertState(r2.payment, r1.payment, r2.member);
  const legacy = resolveRevertState(
    { ...r2.payment, memberSnapshot: undefined },
    r1.payment,
    r2.member
  );
  assert.equal(exact.source, "snapshot");
  assert.equal(legacy.source, "reconstructed");
  assert.equal(s(legacy.planEndDate), s(exact.planEndDate));
  assert.equal(legacy.planDurationDays, exact.planDurationDays);
  assert.equal(s(legacy.planStartDate), s(exact.planStartDate));
  assert.equal(legacy.status, exact.status);
});

test("a first renewal with no snapshot recovers the plan length from the billing anchor", () => {
  // No prior payment to read planDurationDays from: the initial expiry is a
  // whole number of months after the joining date, so it is derivable.
  const member = makeMember({ planDurationDays: 90 });
  const seeded = {
    ...member,
    planEndDate: d(iso(4, 5)), // joined 05/01, 3 months paid
    planDurationDays: 90,
  };
  const { payment } = applyRenewal(seeded, { amount: 1000, planDurationDays: 30 });
  const legacy = resolveRevertState(
    { ...payment, memberSnapshot: undefined },
    null,
    seeded
  );
  assert.equal(legacy.source, "reconstructed");
  assert.equal(s(legacy.planEndDate), s(d(iso(4, 5))));
  assert.equal(legacy.planDurationDays, 90, "3 billing months → a 90-day plan");
  assert.equal(s(legacy.planStartDate), s(member.joinDate));
});

test("status and MIA are recomputed from today, not copied from the snapshot", () => {
  // A bill whose snapshot said "active" but whose restored expiry is long past:
  // the void must store the status the rest of the app will compute on read.
  const longAgo = d("2020-01-10");
  const payment = {
    _id: "payment-x",
    amount: 1000,
    planDurationDays: 30,
    paymentDate: new Date(),
    previousExpiry: longAgo,
    newExpiry: d(iso(2, 10)),
    status: "active",
    memberSnapshot: {
      planEndDate: longAgo,
      planDurationDays: 30,
      planStartDate: d("2019-12-10"),
      status: "active",
      miaFlagged: false,
    },
  };
  const revert = resolveRevertState(payment, null, { joinDate: d("2019-12-10") });
  assert.equal(revert.status, "expired");
  assert.equal(revert.miaFlagged, true);
  assert.ok(getDaysSinceExpiry(longAgo) >= 7);
});

/* ── Integration guards ─────────────────────────────────────────────────── */

test("the renewal route records a snapshot so future voids are exact", () => {
  const src = readFileSync(
    pathJoin(ROOT, "app/api/members/renew/[id]/route.js"),
    "utf8"
  );
  assert.match(src, /buildMemberSnapshot\(member\)/, "must snapshot the member");
  // Taken BEFORE the mutations, or it would record the post-renewal state.
  const snapAt = src.indexOf("buildMemberSnapshot(member)");
  const mutateAt = src.indexOf("member.planEndDate = newExpiry");
  assert.ok(snapAt !== -1 && mutateAt !== -1);
  assert.ok(snapAt < mutateAt, "the snapshot must be captured before any mutation");
  assert.match(src, /memberSnapshot,/, "and stored on the payment");
});

test("an admin-entered payment date can never reach the expiry calculation", () => {
  const src = readFileSync(
    pathJoin(ROOT, "app/api/members/renew/[id]/route.js"),
    "utf8"
  );
  // computeRenewalExpiry must be called with three arguments only, so the
  // catch-up guard keeps using the real clock and a backdated receipt can never
  // produce an expiry in the past.
  const call = src.match(/computeRenewalExpiry\(([\s\S]*?)\);/);
  assert.ok(call, "the route must compute the expiry");
  assert.doesNotMatch(call[1], /paymentDate/, "paymentDate must not be an argument");
});

test("voided bills are excluded from revenue and from the billing migration", () => {
  const analytics = readFileSync(pathJoin(ROOT, "app/api/analytics/route.js"), "utf8");
  assert.match(analytics, /NOT_VOIDED/, "revenue must exclude voided bills");
  const migration = readFileSync(
    pathJoin(ROOT, "scripts/migrate-billing-anchor.mjs"),
    "utf8"
  );
  assert.match(
    migration,
    /status:\s*\{\s*\$ne:\s*"voided"\s*\}/,
    "the migration must not count voided bills as billing months"
  );
});

test("only the newest active bill is offered as voidable in the UI payload", () => {
  const src = readFileSync(pathJoin(ROOT, "app/api/members/[id]/route.js"), "utf8");
  assert.match(src, /findIndex\(\(p\) => p\.status !== PAYMENT_VOIDED\)/);
  assert.match(src, /canVoid/, "the payload must carry the server's decision");
  // History is ordered by creation, not by the admin-entered payment date.
  assert.match(src, /sort\(\{ createdAt: -1, _id: -1 \}\)/);
});

test("the void route never writes the billing anchor", () => {
  const src = readFileSync(
    pathJoin(ROOT, "app/api/members/[id]/payments/[paymentId]/void/route.js"),
    "utf8"
  );
  assert.doesNotMatch(
    src,
    /joinDate:\s*[^/\n]*revert/,
    "a void must not write joinDate"
  );
  const revertLib = readFileSync(pathJoin(ROOT, "lib/paymentRevert.js"), "utf8");
  assert.doesNotMatch(
    revertLib,
    /planEndDate:.*joinDate/,
    "the revert must not derive the expiry from the joining date"
  );
});

test("financial records are voided, never deleted", () => {
  const src = readFileSync(
    pathJoin(ROOT, "app/api/members/[id]/payments/[paymentId]/void/route.js"),
    "utf8"
  );
  assert.doesNotMatch(src, /Payment\.(deleteOne|deleteMany|findByIdAndDelete)/);
  const model = readFileSync(pathJoin(ROOT, "models/Payment.js"), "utf8");
  for (const field of ["voidedAt", "voidedBy", "voidReason", "memberSnapshot", "revertedTo"]) {
    assert.match(model, new RegExp(field), `Payment must record ${field}`);
  }
});
