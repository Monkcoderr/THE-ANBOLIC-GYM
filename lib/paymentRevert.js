/**
 * Voiding a bill — resolving the member state to restore.
 *
 * ── What a renewal actually changes ──────────────────────────────────────
 * app/api/members/renew/[id]/route.js writes exactly five member fields:
 *
 *     planEndDate       ← the newly calculated expiry
 *     planDurationDays  ← the plan length just paid for
 *     planStartDate     ← today if the member was expired, else previousExpiry
 *     status            ← recomputed from the new expiry
 *     miaFlagged        ← cleared
 *
 * and creates one Payment document. `joinDate` is deliberately NOT touched —
 * it is the permanent billing anchor — so a void must not touch it either.
 * Reversing a renewal therefore means restoring those five fields and flagging
 * the Payment as voided. Nothing else in the database is affected: revenue is
 * derived by aggregating Payments, so excluding voided rows from that
 * aggregation is what removes the money from every total and report.
 *
 * ── Getting the previous state exactly right ─────────────────────────────
 * A Payment records `previousExpiry`, but historically not the previous
 * planDurationDays or planStartDate. Renewals now write a full `memberSnapshot`
 * so a void is an exact restore. For bills created before that field existed,
 * the previous state is RECONSTRUCTED from the payment history using the same
 * rules the renew route applied at the time — never guessed from today's date.
 *
 * Deliberately imports ./dateUtils.js by relative path rather than the "@/"
 * alias so this module runs unchanged under `node --test`.
 */

import {
  computeMemberStatus,
  deriveBillingMonths,
  getDaysSinceExpiry,
  utcDateOnly,
} from "./dateUtils.js";

export const PAYMENT_ACTIVE = "active";
export const PAYMENT_VOIDED = "voided";

/** Mongo filter fragment for "not voided", safe for pre-void-field documents. */
export const NOT_VOIDED = { status: { $ne: PAYMENT_VOIDED } };

export function isVoided(payment) {
  return payment?.status === PAYMENT_VOIDED;
}

/**
 * Capture the five renewal-owned fields of a member BEFORE a renewal mutates
 * them. Called by the renew route so every new bill can be reversed exactly.
 */
export function buildMemberSnapshot(member) {
  if (!member) return undefined;
  return {
    planEndDate: member.planEndDate,
    planDurationDays: member.planDurationDays,
    planStartDate: member.planStartDate,
    status: member.status,
    miaFlagged: !!member.miaFlagged,
  };
}

function hasUsableSnapshot(payment) {
  const s = payment?.memberSnapshot;
  return !!(s && s.planEndDate && s.planDurationDays);
}

/** True when two dates land on the same UTC calendar day. */
export function sameDay(a, b) {
  if (!a || !b) return false;
  return utcDateOnly(a).getTime() === utcDateOnly(b).getTime();
}

/**
 * Recompute the time-dependent fields for a restored expiry.
 *
 * `status` and `miaFlagged` are functions of TODAY, not of the moment the
 * renewal happened, so they are recomputed rather than copied from the
 * snapshot: a bill from three weeks ago snapshotted "active", but restoring
 * that expiry today may correctly leave the member expired. Every read path in
 * the app recomputes status the same way, so this keeps the stored value in
 * step with what the UI will display.
 */
function timeDependentFields(planEndDate) {
  const status = computeMemberStatus(planEndDate);
  return {
    status,
    miaFlagged: status === "expired" && getDaysSinceExpiry(planEndDate) >= 7,
  };
}

/**
 * The plan start date the renew route wrote when it created `payment`.
 *
 * Mirrors that route exactly: `newStartDate = expired ? today : previousExpiry`,
 * where "expired" means the pre-renewal expiry had already passed on the
 * payment date. Both sides are compared as date-only values, so an expiry
 * falling on the payment date itself counts as not-yet-expired — the same
 * boundary computeMemberStatus uses.
 *
 * Only ever used for bills that carry no snapshot, i.e. bills recorded before
 * snapshots existed — for those, paymentDate was always the moment of creation,
 * so it is a faithful stand-in for "today" as the route saw it.
 */
export function reconstructPlanStart(payment) {
  const paidOn = utcDateOnly(payment.paymentDate);
  if (!payment.previousExpiry) return paidOn;
  const prevExpiry = utcDateOnly(payment.previousExpiry);
  return prevExpiry < paidOn ? paidOn : prevExpiry;
}

/**
 * The member state to restore when `payment` is voided.
 *
 * @param payment       the bill being voided
 * @param priorPayment  the member's most recent ACTIVE payment before it, or null
 * @param member        the member document (read for joinDate only)
 * @returns { source, planEndDate, planDurationDays, planStartDate, status, miaFlagged }
 *          or null when there is no recorded prior state to return to.
 */
export function resolveRevertState(payment, priorPayment, member) {
  if (!payment) return null;

  if (hasUsableSnapshot(payment)) {
    const s = payment.memberSnapshot;
    const planEndDate = utcDateOnly(s.planEndDate);
    return {
      source: "snapshot",
      planEndDate,
      planDurationDays: s.planDurationDays,
      planStartDate: utcDateOnly(s.planStartDate || s.planEndDate),
      ...timeDependentFields(planEndDate),
    };
  }

  // No snapshot: this bill predates the field. Reconstruct from history.
  if (!payment.previousExpiry) return null;
  const planEndDate = utcDateOnly(payment.previousExpiry);

  // Plan length before this bill. The immediately-prior payment holds it
  // directly; for a member's very first renewal it is recoverable from the
  // billing anchor, because the initial expiry is a whole number of months
  // after the joining date.
  let planDurationDays = priorPayment?.planDurationDays || null;
  if (!planDurationDays) {
    const anchor = member?.joinDate || member?.planStartDate || null;
    const months = anchor ? deriveBillingMonths(anchor, planEndDate) : null;
    planDurationDays = months ? months * 30 : payment.planDurationDays;
  }

  // Start date before this bill: whatever the prior renewal wrote, or the
  // joining date for a member who had never renewed.
  const planStartDate = priorPayment
    ? reconstructPlanStart(priorPayment)
    : utcDateOnly(member?.joinDate || member?.planStartDate || planEndDate);

  return {
    source: "reconstructed",
    planEndDate,
    planDurationDays,
    planStartDate,
    ...timeDependentFields(planEndDate),
  };
}

/**
 * Reasons a bill cannot be voided, with the message shown to the admin.
 */
export const VOID_BLOCKERS = {
  ALREADY_VOIDED: "This bill has already been voided.",
  LATER_PAYMENTS_EXIST:
    "This bill can't be voided because a newer renewal was recorded after it. Void the newest bill first, then work backwards.",
  NO_PRIOR_STATE:
    "This bill has no recorded previous membership state, so the membership can't be reversed automatically.",
  MEMBER_STATE_DRIFTED:
    "The membership has changed since this bill was created, so reversing it could overwrite newer data.",
};

/**
 * Decide whether `payment` can be voided, and what reverting it would do.
 *
 * @param payment              the bill being voided
 * @param member               the member document
 * @param laterActiveCount     how many non-voided payments come AFTER this one
 * @param priorPayment         the most recent non-voided payment before it, or null
 * @returns { ok, code, error, revert, drifted }
 *
 * `drifted` reports that the member's current expiry is no longer the expiry
 * this bill produced — something outside the renewal flow changed it. The
 * membership revert is refused in that case (the caller may still void the
 * financial record alone), because writing a stale expiry back would silently
 * discard whatever made the change.
 */
export function assessVoidability({
  payment,
  member,
  laterActiveCount = 0,
  priorPayment = null,
}) {
  if (isVoided(payment)) {
    return {
      ok: false,
      code: "ALREADY_VOIDED",
      error: VOID_BLOCKERS.ALREADY_VOIDED,
    };
  }

  // Requirement: only the changes caused by THIS bill may be reversed. A bill
  // with later renewals stacked on top of it cannot be reversed in isolation,
  // because the member's current expiry was produced by those later bills.
  if (laterActiveCount > 0) {
    return {
      ok: false,
      code: "LATER_PAYMENTS_EXIST",
      error: VOID_BLOCKERS.LATER_PAYMENTS_EXIST,
      laterActiveCount,
    };
  }

  const revert = resolveRevertState(payment, priorPayment, member);
  if (!revert) {
    return {
      ok: false,
      code: "NO_PRIOR_STATE",
      error: VOID_BLOCKERS.NO_PRIOR_STATE,
    };
  }

  const drifted = !sameDay(member?.planEndDate, payment.newExpiry);
  return { ok: true, code: null, error: null, revert, drifted };
}

export default assessVoidability;
