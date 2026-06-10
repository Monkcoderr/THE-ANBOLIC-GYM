import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import Payment from "@/models/Payment";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember } from "@/lib/memberUtils";
import { digitsOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().min(10).optional(),
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
      .sort({ paymentDate: -1 })
      .lean();

    return ok({
      member: decorateMember(member),
      payments: payments.map((p) => ({ ...p, _id: p._id.toString() })),
    });
  } catch (err) {
    return fail("Unable to load member", "MEMBER_FETCH_FAILED", 500);
  }
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
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.address !== undefined) update.address = parsed.data.address;
    if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
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

    const member = await Member.findOneAndUpdate(
      { _id: params.id, isDeleted: { $ne: true } },
      { $set: update },
      { new: true }
    ).lean();

    if (!member) return fail("Member not found", "NOT_FOUND", 404);
    return ok(decorateMember(member));
  } catch (err) {
    if (err?.code === 11000) {
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
