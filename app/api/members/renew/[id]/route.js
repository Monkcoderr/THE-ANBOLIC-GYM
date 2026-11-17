import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import Payment from "@/models/Payment";
import Admin from "@/models/Admin";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember } from "@/lib/memberUtils";
import {
  businessDateOnly,
  computeMemberStatus,
  computeRenewalExpiry,
  isSupportedPlanDuration,
  utcDateOnly,
} from "@/lib/dateUtils";
import { generateReceiptText } from "@/lib/receiptFormatter";
import { buildMemberSnapshot, NOT_VOIDED } from "@/lib/paymentRevert";

export const dynamic = "force-dynamic";

const RenewSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  paymentMethod: z.enum(["Cash", "UPI"]),
  planDurationDays: z.coerce
    .number()
    .int()
    .refine(isSupportedPlanDuration, "Choose a supported plan duration"),
  paymentDate: z.coerce.date().optional(),
  idempotencyKey: z.string().uuid("A valid renewal idempotency key is required"),
});

class RenewalConflict extends Error {
  constructor() {
    super("The membership changed during renewal. Please retry.");
    this.code = "MEMBER_STATE_DRIFTED";
  }
}

function paymentPayload(payment) {
  const value = payment?.toObject ? payment.toObject() : payment;
  return { ...value, _id: value._id.toString(), memberId: value.memberId.toString() };
}

function sameBusinessDay(a, b) {
  return utcDateOnly(a).getTime() === utcDateOnly(b).getTime();
}

function matchesIdempotentRequest(payment, input) {
  return (
    payment.amount === input.amount &&
    payment.paymentMethod === input.paymentMethod &&
    payment.planDurationDays === input.planDurationDays &&
    sameBusinessDay(payment.paymentDate, input.paymentDate)
  );
}

async function replayResult(memberId, idempotencyKey, input) {
  const payment = await Payment.findOne({ memberId, idempotencyKey }).lean();
  if (!payment) return null;
  if (!matchesIdempotentRequest(payment, input)) return { conflict: true };
  const member = await Member.findById(memberId).lean();
  if (!member) return null;
  return {
    member: decorateMember(member),
    payment: paymentPayload(payment),
    receiptText: payment.receiptText,
    replayed: true,
  };
}

// POST /api/members/renew/[id] — one idempotent, atomic renewal transaction.
export async function POST(request, { params }) {
  const { response, session: auth } = await requireAuth();
  if (response) return response;

  let parsed;
  try {
    const body = await request.json().catch(() => ({}));
    parsed = RenewSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || "Invalid input",
        "VALIDATION_ERROR",
        422
      );
    }

    await connectDB();
    const { amount, paymentMethod, planDurationDays, idempotencyKey } = parsed.data;
    const today = businessDateOnly();
    const paymentDate = parsed.data.paymentDate
      ? utcDateOnly(parsed.data.paymentDate)
      : today;
    if (paymentDate > today) {
      return fail("Payment date can't be in the future", "VALIDATION_ERROR", 422);
    }

    const requestIdentity = { amount, paymentMethod, planDurationDays, paymentDate };
    const existing = await replayResult(params.id, idempotencyKey, requestIdentity);
    if (existing?.conflict) {
      return fail(
        "This renewal key was already used for different payment details.",
        "IDEMPOTENCY_KEY_REUSED",
        409
      );
    }
    if (existing) return ok(existing);

    let result = null;
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const replay = await Payment.findOne({
          memberId: params.id,
          idempotencyKey,
        })
          .session(dbSession)
          .lean();
        if (replay) {
          if (!matchesIdempotentRequest(replay, requestIdentity)) {
            throw Object.assign(
              new Error("This renewal key was already used for different payment details."),
              { code: "IDEMPOTENCY_KEY_REUSED" }
            );
          }
          const current = await Member.findById(params.id).session(dbSession).lean();
          result = {
            member: decorateMember(current),
            payment: paymentPayload(replay),
            receiptText: replay.receiptText,
            replayed: true,
          };
          return;
        }

        const member = await Member.findOne({
          _id: params.id,
          isDeleted: { $ne: true },
        }).session(dbSession);
        if (!member) throw Object.assign(new Error("Member not found"), { code: "NOT_FOUND" });

        const previousExpiry = utcDateOnly(member.planEndDate);
        const memberSnapshot = buildMemberSnapshot(member);
        const anchorDate = utcDateOnly(
          member.joinDate || member.planStartDate || previousExpiry
        );
        const newExpiry = computeRenewalExpiry(
          anchorDate,
          previousExpiry,
          planDurationDays
        );
        const currentStatus = computeMemberStatus(previousExpiry);
        const newStartDate =
          currentStatus === "expired" ? today : previousExpiry;
        const newStatus = computeMemberStatus(newExpiry);
        const gymName =
          auth.gymName ||
          (await Admin.findOne().session(dbSession).lean())?.gymName ||
          "Gym";
        const receiptText = generateReceiptText(
          {
            name: member.name,
            phone: member.phone,
            customMemberId: member.customMemberId,
          },
          { amount, paymentMethod, paymentDate, newExpiry },
          gymName
        );
        const predecessor = await Payment.findOne({
          memberId: member._id,
          ...NOT_VOIDED,
        })
          .sort({ createdAt: -1, _id: -1 })
          .session(dbSession)
          .lean();
        const versionBefore = member.__v || 0;

        const [payment] = await Payment.create(
          [
            {
              memberId: member._id,
              memberName: member.name,
              memberPhone: member.phone,
              amount,
              paymentMethod,
              paymentDate,
              planDurationDays,
              previousExpiry,
              newExpiry,
              receiptText,
              status: "active",
              memberSnapshot,
              idempotencyKey,
              renewalId: idempotencyKey,
              predecessorPaymentId: predecessor?._id || null,
              entitlementStart: previousExpiry,
              entitlementEnd: newExpiry,
              anchorDateUsed: anchorDate,
              memberVersionBefore: versionBefore,
              memberVersionAfter: versionBefore + 1,
            },
          ],
          { session: dbSession }
        );

        const memberWrite = await Member.updateOne(
          {
            _id: member._id,
            isDeleted: { $ne: true },
            planEndDate: member.planEndDate,
            __v: versionBefore,
          },
          {
            $set: {
              planEndDate: newExpiry,
              planDurationDays,
              planStartDate: newStartDate,
              status: newStatus,
              miaFlagged: false,
            },
            $inc: { __v: 1 },
          },
          { session: dbSession }
        );
        if (memberWrite.matchedCount !== 1) throw new RenewalConflict();

        const memberAfter = {
          ...member.toObject(),
          planEndDate: newExpiry,
          planDurationDays,
          planStartDate: newStartDate,
          status: newStatus,
          miaFlagged: false,
          __v: versionBefore + 1,
        };
        result = {
          member: decorateMember(memberAfter),
          payment: paymentPayload(payment),
          receiptText,
          replayed: false,
        };
      });
    } finally {
      await dbSession.endSession();
    }

    return ok(result);
  } catch (err) {
    if (err?.code === "NOT_FOUND") return fail("Member not found", "NOT_FOUND", 404);
    if (err?.code === "IDEMPOTENCY_KEY_REUSED") return fail(err.message, err.code, 409);
    if (err instanceof RenewalConflict) return fail(err.message, err.code, 409);
    if (err?.code === 11000 && parsed?.success) {
      const requestIdentity = {
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod,
        planDurationDays: parsed.data.planDurationDays,
        paymentDate: parsed.data.paymentDate
          ? utcDateOnly(parsed.data.paymentDate)
          : businessDateOnly(),
      };
      const replay = await replayResult(
        params.id,
        parsed.data.idempotencyKey,
        requestIdentity
      ).catch(() => null);
      if (replay?.conflict) {
        return fail(
          "This renewal key was already used for different payment details.",
          "IDEMPOTENCY_KEY_REUSED",
          409
        );
      }
      if (replay) return ok(replay);
    }
    return fail("Unable to renew membership. Nothing was changed.", "RENEW_FAILED", 500);
  }
}
