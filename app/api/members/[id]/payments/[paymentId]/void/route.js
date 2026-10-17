import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import Payment from "@/models/Payment";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember } from "@/lib/memberUtils";
import { addDays, utcDateOnly } from "@/lib/dateUtils";
import {
  assessVoidability,
  NOT_VOIDED,
  PAYMENT_VOIDED,
  VOID_BLOCKERS,
} from "@/lib/paymentRevert";

export const dynamic = "force-dynamic";

const VoidSchema = z.object({
  reason: z.string().trim().min(1, "A void reason is required").max(300),
  voidOnly: z.boolean().optional(),
});

class VoidConflict extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function POST(request, { params }) {
  const { session: auth, response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const { id: memberId, paymentId } = params;
    if (!mongoose.isValidObjectId(memberId) || !mongoose.isValidObjectId(paymentId)) {
      return fail("Bill not found", "NOT_FOUND", 404);
    }

    const parsed = VoidSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid input", "VALIDATION_ERROR", 422);
    }
    if (parsed.data.voidOnly === true) {
      return fail(
        VOID_BLOCKERS.FINANCIAL_ONLY_UNSAFE,
        "FINANCIAL_ONLY_VOID_FORBIDDEN",
        409
      );
    }

    let result = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const member = await Member.findOne({
          _id: memberId,
          isDeleted: { $ne: true },
        })
          .session(session)
          .lean();
        if (!member) throw new VoidConflict("NOT_FOUND", "Member not found");

        const payment = await Payment.findOne({ _id: paymentId, memberId })
          .session(session)
          .lean();
        if (!payment) throw new VoidConflict("NOT_FOUND", "Bill not found");

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
        const [laterActiveCount, priorPayment, priorRecordedPayment] = await Promise.all([
          Payment.countDocuments({ memberId, ...NOT_VOIDED, ...afterThis }).session(session),
          Payment.findOne({ memberId, ...NOT_VOIDED, ...beforeThis })
            .sort({ createdAt: -1, _id: -1 })
            .session(session)
            .lean(),
          Payment.findOne({ memberId, ...beforeThis })
            .sort({ createdAt: -1, _id: -1 })
            .session(session)
            .lean(),
        ]);

        if (
          payment.predecessorPaymentId &&
          String(payment.predecessorPaymentId) !== String(priorPayment?._id || "")
        ) {
          throw new VoidConflict(
            "PAYMENT_LINEAGE_CHANGED",
            "This payment's predecessor is no longer the latest valid payment. Reconcile it manually."
          );
        }

        const assessment = assessVoidability({
          payment,
          member,
          laterActiveCount,
          priorPayment,
          priorRecordedPayment,
        });
        if (!assessment.ok) throw new VoidConflict(assessment.code, assessment.error);
        if (assessment.drifted) {
          throw new VoidConflict("MEMBER_STATE_DRIFTED", VOID_BLOCKERS.MEMBER_STATE_DRIFTED);
        }

        const revert = assessment.revert;
        const expectedDay = utcDateOnly(payment.entitlementEnd || payment.newExpiry);
        const memberWrite = await Member.updateOne(
          {
            _id: memberId,
            isDeleted: { $ne: true },
            planEndDate: { $gte: expectedDay, $lt: addDays(expectedDay, 1) },
            __v: member.__v || 0,
          },
          {
            $set: {
              planEndDate: revert.planEndDate,
              planDurationDays: revert.planDurationDays,
              planStartDate: revert.planStartDate,
              status: revert.status,
              miaFlagged: revert.miaFlagged,
            },
            $inc: { __v: 1 },
          },
          { session }
        );
        if (memberWrite.matchedCount !== 1) {
          throw new VoidConflict("MEMBER_STATE_DRIFTED", VOID_BLOCKERS.MEMBER_STATE_DRIFTED);
        }

        const paymentWrite = await Payment.updateOne(
          { _id: payment._id, memberId, status: { $ne: PAYMENT_VOIDED } },
          {
            $set: {
              status: PAYMENT_VOIDED,
              voidedAt: new Date(),
              voidedBy: auth?.adminId || null,
              voidReason: parsed.data.reason,
              revertedTo: {
                planEndDate: revert.planEndDate,
                planDurationDays: revert.planDurationDays,
                planStartDate: revert.planStartDate,
                status: revert.status,
                miaFlagged: revert.miaFlagged,
                appliedToMember: true,
                source: revert.source,
              },
            },
          },
          { session }
        );
        if (paymentWrite.matchedCount !== 1) {
          throw new VoidConflict("ALREADY_VOIDED", VOID_BLOCKERS.ALREADY_VOIDED);
        }

        result = { revert, paymentId: payment._id };
      });
    } finally {
      await session.endSession();
    }

    const [freshMember, freshPayment] = await Promise.all([
      Member.findById(memberId).lean(),
      Payment.findById(result.paymentId).lean(),
    ]);
    return ok({
      member: decorateMember(freshMember),
      payment: { ...freshPayment, _id: freshPayment._id.toString() },
      revertedMembership: true,
      revertedTo: result.revert,
    });
  } catch (err) {
    if (err instanceof VoidConflict) {
      return fail(err.message, err.code, err.code === "NOT_FOUND" ? 404 : 409);
    }
    return fail(
      "Unable to void this bill transactionally. Nothing was changed.",
      "VOID_FAILED",
      500
    );
  }
}
