import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import Payment from "@/models/Payment";
import Admin from "@/models/Admin";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember } from "@/lib/memberUtils";
import {
  computeMemberStatus,
  addDays,
  startOfDay,
} from "@/lib/dateUtils";
import { generateReceiptText } from "@/lib/receiptFormatter";

export const dynamic = "force-dynamic";

const RenewSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  paymentMethod: z.enum(["Cash", "UPI"]),
  planDurationDays: z.coerce
    .number()
    .int()
    .positive("Plan duration must be positive"),
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

    const member = await Member.findOne({
      _id: params.id,
      isDeleted: { $ne: true },
    });
    if (!member) return fail("Member not found", "NOT_FOUND", 404);

    const currentStatus = computeMemberStatus(member.planEndDate);
    const previousExpiry = member.planEndDate;
    const today = startOfDay(new Date());

    let newStartDate;
    let newExpiry;
    if (currentStatus === "expired") {
      newStartDate = today;
      newExpiry = addDays(today, planDurationDays);
    } else {
      newStartDate = member.planStartDate;
      newExpiry = addDays(previousExpiry, planDurationDays);
    }

    const gymName = session.gymName || (await Admin.findOne().lean())?.gymName || "Gym";

    const paymentDate = new Date();
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
    });

    member.planEndDate = newExpiry;
    member.planDurationDays = planDurationDays;
    member.planStartDate = newStartDate;
    member.status = computeMemberStatus(newExpiry);
    member.miaFlagged = false;
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
