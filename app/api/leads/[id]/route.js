import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Lead from "@/models/Lead";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { digitsOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().min(10).optional(),
  interest: z.string().optional(),
  source: z.enum(["walk-in", "referral", "social", "other"]).optional(),
  notes: z.string().optional(),
  convertedToMember: z.boolean().optional(),
  convertedMemberId: z.string().optional(),
});

// PUT /api/leads/[id] — update any subset, including conversion flags.
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

    const update = { ...parsed.data };
    if (update.phone !== undefined) {
      const phone = digitsOnly(update.phone);
      if (phone.length < 10) {
        return fail("Phone must be at least 10 digits", "VALIDATION_ERROR", 422);
      }
      update.phone = phone;
    }

    const lead = await Lead.findByIdAndUpdate(
      params.id,
      { $set: update },
      { new: true }
    ).lean();

    if (!lead) return fail("Lead not found", "NOT_FOUND", 404);
    return ok({
      ...lead,
      _id: lead._id.toString(),
      convertedMemberId: lead.convertedMemberId?.toString() || null,
    });
  } catch (err) {
    return fail("Unable to update lead", "LEAD_UPDATE_FAILED", 500);
  }
}

// DELETE /api/leads/[id] — hard delete (leads are disposable).
export async function DELETE(request, { params }) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const lead = await Lead.findByIdAndDelete(params.id).lean();
    if (!lead) return fail("Lead not found", "NOT_FOUND", 404);
    return ok({ success: true });
  } catch (err) {
    return fail("Unable to delete lead", "LEAD_DELETE_FAILED", 500);
  }
}
