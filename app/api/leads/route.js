import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Lead from "@/models/Lead";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { getHoursOld } from "@/lib/dateUtils";
import { digitsOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().min(10, "Phone must be at least 10 digits"),
  interest: z.string().optional(),
  source: z.enum(["walk-in", "referral", "social", "other"]).optional(),
  notes: z.string().optional(),
});

// GET /api/leads — unconverted leads, newest first, with hoursOld.
export async function GET() {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const leads = await Lead.find({ convertedToMember: false })
      .sort({ createdAt: -1 })
      .lean();

    const decorated = leads.map((l) => ({
      ...l,
      _id: l._id.toString(),
      convertedMemberId: l.convertedMemberId?.toString() || null,
      hoursOld: getHoursOld(l.createdAt),
    }));

    return ok({ leads: decorated });
  } catch (err) {
    return fail("Unable to load leads", "LEADS_FETCH_FAILED", 500);
  }
}

// POST /api/leads — create a lead.
export async function POST(request) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || "Invalid input",
        "VALIDATION_ERROR",
        422
      );
    }

    const phone = digitsOnly(parsed.data.phone);
    if (phone.length < 10) {
      return fail("Phone must be at least 10 digits", "VALIDATION_ERROR", 422);
    }

    const lead = await Lead.create({
      name: parsed.data.name,
      phone,
      interest: parsed.data.interest || "",
      source: parsed.data.source || "walk-in",
      notes: parsed.data.notes || "",
    });

    return ok({ ...lead.toObject(), _id: lead._id.toString() }, { status: 201 });
  } catch (err) {
    return fail("Unable to create lead", "LEAD_CREATE_FAILED", 500);
  }
}
