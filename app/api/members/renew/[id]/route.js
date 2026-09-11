import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import Payment from "@/models/Payment";
import Admin from "@/models/Admin";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember } from "@/lib/memberUtils";
import {
  computeMemberStatus,
  computeRenewalExpiry,
  utcDateOnly,
} from "@/lib/dateUtils";
import { generateReceiptText } from "@/lib/receiptFormatter";
import { buildMemberSnapshot } from "@/lib/paymentRevert";

export const dynamic = "force-dynamic";

const RenewSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  paymentMethod: z.enum(["Cash", "UPI"]),
  planDurationDays: z.coerce
    .number()
    .int()
    .positive("Plan duration must be positive"),
  // When the money actually changed hands. Optional — defaults to now — and
  // recorded on the bill only. It can never move the expiry: the billing day
  // comes from the joining date, and the catch-up guard below deliberately uses
  // the real clock, so backdating a receipt cannot produce a past expiry.
  paymentDate: z.coerce.date().optional(),
});

// POST /api/members/renew/[id] — renew a plan + record payment + receipt.
export async function POST(request, { params }) {
  const { response, session } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const parsed = RenewSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || "Invalid input",
        "VALIDATION_ERROR",
        422
      );
    }
    const { amount, paymentMethod, planDurationDays } = parsed.data;

    // A business date entered by the admin is stored date-only at UTC midnight,
    // like every other business date. Omitted means "right now".
    let paymentDate = new Date();
    if (parsed.data.paymentDate) {
      paymentDate = utcDateOnly(parsed.data.paymentDate);
      if (paymentDate > utcDateOnly(new Date())) {
        return fail(
          "Payment date can't be in the future",
          "VALIDATION_ERROR",
          422
        );
      }
    }

    const member = await Member.findOne({
      _id: params.id,
      isDeleted: { $ne: true },
    });
    if (!member) return fail("Member not found", "NOT_FOUND", 404);

    const currentStatus = computeMemberStatus(member.planEndDate);
    const previousExpiry = member.planEndDate;
    // The member's exact state before this renewal touches anything. Stored on
    // the payment so voiding the bill can restore it verbatim instead of
    // inferring it from history. Captured here, before any mutation.
    const memberSnapshot = buildMemberSnapshot(member);

    // The billing anchor is the member's authoritative joining date. It is READ
    // here and never written — a renewal must never change when someone joined.
    // The fallbacks only exist for legacy records created before joinDate was
    // required; every current record has one.
    const anchorDate = member.joinDate || member.planStartDate || previousExpiry;
    const newExpiry = computeRenewalExpiry(
      anchorDate,
      previousExpiry,
      planDurationDays
    );
    // The new billing period runs continuously from the previous expiry.
    const newStartDate =
      currentStatus === "expired" ? utcDateOnly(new Date()) : utcDateOnly(previousExpiry);

    const gymName = session.gymName || (await Admin.findOne().lean())?.gymName || "Gym";

    const receiptText = generateReceiptText(
      { name: member.name, phone: member.phone },
      { amount, paymentMethod, paymentDate, newExpiry },
      gymName
    );

    // Save Payment first, then update Member.
    const payment = await Payment.create({
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
    });

    member.planEndDate = newExpiry;
    member.planDurationDays = planDurationDays;
    member.planStartDate = newStartDate;
    member.status = computeMemberStatus(newExpiry);
    member.miaFlagged = false;
    // member.joinDate is deliberately NOT touched here.
    await member.save();

    return ok({
      member: decorateMember(member.toObject()),
      payment: { ...payment.toObject(), _id: payment._id.toString() },
      receiptText,
    });
  } catch (err) {
    return fail("Unable to renew membership", "RENEW_FAILED", 500);
  }
}
