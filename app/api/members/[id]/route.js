import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import Payment from "@/models/Payment";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember } from "@/lib/memberUtils";
import { utcDateOnly } from "@/lib/dateUtils";
import { digitsOnly, normalizeMemberId } from "@/lib/utils";
import {
  assessVoidability,
  PAYMENT_ACTIVE,
  PAYMENT_VOIDED,
} from "@/lib/paymentRevert";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().min(10).optional(),
  customMemberId: z.string().trim().max(40, "ID is too long").optional(),
  joinDate: z.coerce.date().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/members/[id] — member + payment history.
export async function GET(request, { params }) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const member = await Member.findOne({
      _id: params.id,
      isDeleted: { $ne: true },
    }).lean();
    if (!member) return fail("Member not found", "NOT_FOUND", 404);

    const payments = await Payment.find({ memberId: params.id })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    return ok({
      member: decorateMember(member),
      payments: decoratePayments(payments, member),
    });
  } catch (err) {
    return fail("Unable to load member", "MEMBER_FETCH_FAILED", 500);
  }
}

/**
 * Annotate a member's bills for the UI.
 *
 * `canVoid` and `voidPreview` are resolved on the SERVER so the bill actions and
 * the confirmation dialog show exactly what the void route will do — the client
 * never re-implements the rule. Only the newest non-voided bill is reversible in
 * isolation: anything older has later renewals stacked on top of it, and
 * reversing those in isolation would corrupt the current expiry.
 *
 * `payments` must arrive newest-first, ordered by creation (see the void route:
 * paymentDate is admin-entered and can be backdated, so it must not decide
 * which bill is the latest).
 */
function decoratePayments(payments, member) {
  const firstActiveIdx = payments.findIndex((p) => p.status !== PAYMENT_VOIDED);

  return payments.map((p, idx) => {
    const base = {
      ...p,
      _id: p._id.toString(),
      memberId: p.memberId?.toString?.() ?? p.memberId,
      // Bills created before the void feature existed carry no status.
      status: p.status === PAYMENT_VOIDED ? PAYMENT_VOIDED : PAYMENT_ACTIVE,
      canVoid: false,
      voidPreview: null,
    };

    if (idx !== firstActiveIdx) return base;

    // The most recent active bill in this member's history.
    const priorPayment =
      payments.slice(idx + 1).find((q) => q.status !== PAYMENT_VOIDED) || null;
    const assessment = assessVoidability({
      payment: p,
      member,
      laterActiveCount: 0,
      priorPayment,
    });

    return {
      ...base,
      canVoid: assessment.ok && !assessment.drifted,
      voidBlockedReason: assessment.ok ? null : assessment.error,
      voidPreview: assessment.revert
        ? {
            expiryFrom: utcDateOnly(p.newExpiry),
            expiryTo: assessment.revert.planEndDate,
            planDurationDays: assessment.revert.planDurationDays,
            status: assessment.revert.status,
            drifted: assessment.drifted,
          }
        : null,
    };
  });
}

// PUT /api/members/[id] — update name/phone/address/notes only.
export async function PUT(request, { params }) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || "Invalid input",
        "VALIDATION_ERROR",
        422
      );
    }

    const update = {};
    const unset = {};
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.address !== undefined) update.address = parsed.data.address;
    if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
    // Joining date is the permanent billing anchor and the ONLY place it may be
    // changed. Stored as a date-only UTC value like every other business date.
    // Changing it re-bases every future renewal onto the new day-of-month (the
    // next renewal re-anchors the expiry); the current expiry is left untouched
    // so an admin correcting a typo cannot accidentally alter a paid-up period.
    if (parsed.data.joinDate !== undefined)
      update.joinDate = utcDateOnly(parsed.data.joinDate);
    if (parsed.data.phone !== undefined) {
      const phone = digitsOnly(parsed.data.phone);
      if (phone.length < 10) {
        return fail("Phone must be at least 10 digits", "VALIDATION_ERROR", 422);
      }
      const clash = await Member.findOne({
        phone,
        _id: { $ne: params.id },
        isDeleted: { $ne: true },
      });
      if (clash) {
        return fail("Phone already in use", "DUPLICATE_PHONE", 409);
      }
      update.phone = phone;
    }

    // Custom member ID: assign, change, or clear. An empty value unsets the
    // field so the sparse unique index stops tracking this member.
    if (parsed.data.customMemberId !== undefined) {
      const customMemberId = normalizeMemberId(parsed.data.customMemberId);
      if (customMemberId) {
        const idClash = await Member.findOne({
          customMemberId,
          _id: { $ne: params.id },
          isDeleted: { $ne: true },
        });
        if (idClash) {
          return fail("That member ID is already in use", "DUPLICATE_MEMBER_ID", 409);
        }
        update.customMemberId = customMemberId;
      } else {
        unset.customMemberId = "";
      }
    }

    const mutation = {};
    if (Object.keys(update).length) mutation.$set = update;
    if (Object.keys(unset).length) mutation.$unset = unset;

    const member = await Member.findOneAndUpdate(
      { _id: params.id, isDeleted: { $ne: true } },
      mutation,
      { new: true }
    ).lean();

    if (!member) return fail("Member not found", "NOT_FOUND", 404);
    return ok(decorateMember(member));
  } catch (err) {
    if (err?.code === 11000) {
      if (err?.keyPattern?.customMemberId) {
        return fail("That member ID is already in use", "DUPLICATE_MEMBER_ID", 409);
      }
      return fail("Phone already in use", "DUPLICATE_PHONE", 409);
    }
    return fail("Unable to update member", "MEMBER_UPDATE_FAILED", 500);
  }
}

// DELETE /api/members/[id] — soft delete.
export async function DELETE(request, { params }) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const member = await Member.findOneAndUpdate(
      { _id: params.id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true } },
      { new: true }
    ).lean();
    if (!member) return fail("Member not found", "NOT_FOUND", 404);
    return ok({ success: true });
  } catch (err) {
    return fail("Unable to delete member", "MEMBER_DELETE_FAILED", 500);
  }
}
