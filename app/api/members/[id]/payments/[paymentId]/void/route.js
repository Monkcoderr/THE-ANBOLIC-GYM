import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import Payment from "@/models/Payment";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember } from "@/lib/memberUtils";
import { utcDateOnly, addDays } from "@/lib/dateUtils";
import {
  assessVoidability,
  NOT_VOIDED,
  PAYMENT_VOIDED,
  VOID_BLOCKERS,
} from "@/lib/paymentRevert";

export const dynamic = "force-dynamic";

const VoidSchema = z.object({
  reason: z.string().trim().max(300, "Reason is too long").optional(),
  // Void the financial record WITHOUT touching membership. The escape hatch for
  // bills that can't be reversed in isolation (later renewals exist, or the
  // membership has since been changed outside the renewal flow).
  voidOnly: z.boolean().optional(),
});

/** A blocked void — surfaced as a 409 with the assessment's own code. */
class VoidConflict extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * True when the deployment can't run multi-document transactions (a standalone
 * mongod rather than a replica set). MongoDB rejects the FIRST operation of the
 * transaction in that case, so nothing has been written when this is detected.
 */
function isTransactionUnsupported(err) {
  const msg = String(err?.message || "");
  return (
    err?.codeName === "IllegalOperation" ||
    /Transaction numbers are only allowed on a replica set/i.test(msg) ||
    /Transactions are not supported/i.test(msg) ||
    /transaction.*not supported/i.test(msg)
  );
}

/**
 * POST /api/members/[id]/payments/[paymentId]/void
 *
 * Voids a mistaken bill and restores the member to the exact state they were in
 * immediately before that transaction, so the admin can renew again correctly.
 *
 * Body: { reason?: string, voidOnly?: boolean }
 *
 * The financial record is never destroyed — it is flagged `voided`, stops
 * counting toward revenue and every report, and keeps a full audit trail (who,
 * when, why, the original bill, and the state that was restored).
 *
 * Safety:
 *  • Only the changes caused by THIS bill are reversed. A bill with later
 *    renewals stacked on it is refused — the admin voids newest-first.
 *  • The member write is guarded on the expiry this bill produced, so it can
 *    never overwrite a membership that changed underneath it.
 *  • Atomic: both writes run in one transaction. On a deployment without
 *    transaction support the route falls back to a guarded, compensating
 *    sequence that either completes fully or leaves the data untouched.
 */
export async function POST(request, { params }) {
  const { session: auth, response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();

    const { id: memberId, paymentId } = params;
    if (
      !mongoose.isValidObjectId(memberId) ||
      !mongoose.isValidObjectId(paymentId)
    ) {
      return fail("Bill not found", "NOT_FOUND", 404);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = VoidSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || "Invalid input",
        "VALIDATION_ERROR",
        422
      );
    }
    const reason = parsed.data.reason || "";
    const voidOnly = parsed.data.voidOnly === true;

    const member = await Member.findOne({
      _id: memberId,
      isDeleted: { $ne: true },
    }).lean();
    if (!member) return fail("Member not found", "NOT_FOUND", 404);

    // Scoped to the member from the URL, so a payment can never be voided
    // against the wrong member.
    const payment = await Payment.findOne({
      _id: paymentId,
      memberId,
    }).lean();
    if (!payment) return fail("Bill not found", "NOT_FOUND", 404);

    // Ordering key is (createdAt, _id) — the order in which bills were RECORDED,
    // which is the order in which they mutated the member. Deliberately not
    // paymentDate: that is an admin-entered business date and can be backdated,
    // which would make an older bill look like the newest one and let a void
    // reverse changes another bill had already replaced. ObjectIds increase with
    // creation, so they are a stable tiebreak inside the same instant.
    const afterThis = {
      $or: [
        { createdAt: { $gt: payment.createdAt } },
        { createdAt: payment.createdAt, _id: { $gt: payment._id } },
      ],
    };
    const beforeThis = {
      $or: [
        { createdAt: { $lt: payment.createdAt } },
        { createdAt: payment.createdAt, _id: { $lt: payment._id } },
      ],
    };

    const [laterActiveCount, priorPayment] = await Promise.all([
      Payment.countDocuments({ memberId, ...NOT_VOIDED, ...afterThis }),
      Payment.findOne({ memberId, ...NOT_VOIDED, ...beforeThis })
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
    ]);

    const assessment = assessVoidability({
      payment,
      member,
      laterActiveCount,
      priorPayment,
    });

    // Already voided is fatal in every mode — there is nothing left to do.
    if (assessment.code === "ALREADY_VOIDED") {
      return fail(assessment.error, assessment.code, 409);
    }

    // Every other blocker only prevents the MEMBERSHIP revert. Voiding the
    // financial record alone stays available, and the message says so.
    if (!voidOnly) {
      if (!assessment.ok) {
        return fail(
          `${assessment.error} You can still void the bill on its own, which removes it from revenue and leaves the membership as it is.`,
          assessment.code,
          409
        );
      }
      if (assessment.drifted) {
        return fail(
          `${VOID_BLOCKERS.MEMBER_STATE_DRIFTED} You can still void the bill on its own, which removes it from revenue and leaves the membership as it is.`,
          "MEMBER_STATE_DRIFTED",
          409
        );
      }
    }

    const applyToMember = !voidOnly && assessment.ok && !assessment.drifted;
    const revert = assessment.revert || null;

    const voidFields = {
      status: PAYMENT_VOIDED,
      voidedAt: new Date(),
      voidedBy: auth?.adminId || null,
      voidReason: reason,
      revertedTo: revert
        ? {
            planEndDate: revert.planEndDate,
            planDurationDays: revert.planDurationDays,
            planStartDate: revert.planStartDate,
            status: revert.status,
            miaFlagged: revert.miaFlagged,
            appliedToMember: applyToMember,
            source: revert.source,
          }
        : { appliedToMember: false, source: "none" },
    };

    const memberUpdate = revert
      ? {
          planEndDate: revert.planEndDate,
          planDurationDays: revert.planDurationDays,
          planStartDate: revert.planStartDate,
          status: revert.status,
          miaFlagged: revert.miaFlagged,
          // joinDate is the permanent billing anchor and is never written here,
          // exactly as the renewal never wrote it.
        }
      : null;

    // Guard the member write on the expiry THIS bill produced, matched at
    // day precision (the same precision the assessment used). If anything moved
    // the expiry in the meantime the filter misses and nothing is written.
    const expectedDay = utcDateOnly(payment.newExpiry);
    const memberGuard = {
      _id: memberId,
      isDeleted: { $ne: true },
      planEndDate: { $gte: expectedDay, $lt: addDays(expectedDay, 1) },
    };
    const paymentGuard = { _id: payment._id, status: { $ne: PAYMENT_VOIDED } };

    let usedTransaction = false;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const voidRes = await Payment.updateOne(
          paymentGuard,
          { $set: voidFields },
          { session }
        );
        if (voidRes.matchedCount === 0) {
          throw new VoidConflict(
            "ALREADY_VOIDED",
            VOID_BLOCKERS.ALREADY_VOIDED
          );
        }
        if (applyToMember) {
          const memberRes = await Member.updateOne(
            memberGuard,
            { $set: memberUpdate },
            { session }
          );
          if (memberRes.matchedCount === 0) {
            throw new VoidConflict(
              "MEMBER_STATE_DRIFTED",
              VOID_BLOCKERS.MEMBER_STATE_DRIFTED
            );
          }
        }
      });
      usedTransaction = true;
    } catch (err) {
      if (err instanceof VoidConflict) {
        return fail(err.message, err.code, 409);
      }
      if (!isTransactionUnsupported(err)) throw err;
      // Deployment without transactions. Nothing was written (Mongo rejects the
      // first operation), so fall back to a compensating sequence.
    } finally {
      await session.endSession();
    }

    if (!usedTransaction) {
      // Member first, guarded: a mismatch leaves the database untouched.
      let before = null;
      if (applyToMember) {
        before = await Member.findOneAndUpdate(
          memberGuard,
          { $set: memberUpdate },
          { new: false }
        ).lean();
        if (!before) {
          return fail(
            VOID_BLOCKERS.MEMBER_STATE_DRIFTED,
            "MEMBER_STATE_DRIFTED",
            409
          );
        }
      }

      const undoMember = async () => {
        if (!before) return;
        await Member.updateOne(
          { _id: memberId },
          {
            $set: {
              planEndDate: before.planEndDate,
              planDurationDays: before.planDurationDays,
              planStartDate: before.planStartDate,
              status: before.status,
              miaFlagged: before.miaFlagged,
            },
          }
        );
      };

      try {
        const voidRes = await Payment.updateOne(paymentGuard, {
          $set: voidFields,
        });
        if (voidRes.matchedCount === 0) {
          await undoMember();
          return fail(
            VOID_BLOCKERS.ALREADY_VOIDED,
            "ALREADY_VOIDED",
            409
          );
        }
      } catch (err) {
        // Put the membership back exactly as it was, then report the failure.
        await undoMember();
        throw err;
      }
    }

    const [freshMember, freshPayment] = await Promise.all([
      Member.findById(memberId).lean(),
      Payment.findById(payment._id).lean(),
    ]);

    return ok({
      member: decorateMember(freshMember),
      payment: { ...freshPayment, _id: freshPayment._id.toString() },
      revertedMembership: applyToMember,
      revertedTo: applyToMember ? revert : null,
    });
  } catch (err) {
    return fail(
      "Unable to void this bill. Nothing was changed.",
      "VOID_FAILED",
      500
    );
  }
}
