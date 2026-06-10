import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember, sortMembers } from "@/lib/memberUtils";
import { computeMemberStatus, addDays } from "@/lib/dateUtils";
import { digitsOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().min(10, "Phone must be at least 10 digits"),
  planDurationDays: z.coerce
    .number()
    .int()
    .positive("Plan duration must be positive"),
  planStartDate: z.coerce.date().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/members — list with search/status filter + pagination.
export async function GET(request) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const statusFilter = searchParams.get("status") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "50", 10));

    const query = { isDeleted: { $ne: true } };
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: rx }, { phone: rx }];
    }

    const raw = await Member.find(query).lean();
    let decorated = raw.map(decorateMember);

    if (["active", "expiring", "expired"].includes(statusFilter)) {
      decorated = decorated.filter((m) => m.status === statusFilter);
    }

    decorated = sortMembers(decorated);

    const totalCount = decorated.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const start = (page - 1) * limit;
    const members = decorated.slice(start, start + limit);

    return ok({ members, totalCount, page, totalPages });
  } catch (err) {
    return fail("Unable to load members", "MEMBERS_FETCH_FAILED", 500);
  }
}

// POST /api/members — create a new member.
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

    const { name, planDurationDays, address, notes } = parsed.data;
    const phone = digitsOnly(parsed.data.phone);
    if (phone.length < 10) {
      return fail("Phone must be at least 10 digits", "VALIDATION_ERROR", 422);
    }

    const planStartDate = parsed.data.planStartDate || new Date();
    const planEndDate = addDays(planStartDate, planDurationDays);
    const status = computeMemberStatus(planEndDate);

    const existing = await Member.findOne({ phone, isDeleted: { $ne: true } });
    if (existing) {
      return fail(
        "A member with this phone already exists",
        "DUPLICATE_PHONE",
        409
      );
    }

    const member = await Member.create({
      name,
      phone,
      planDurationDays,
      planStartDate,
      planEndDate,
      status,
      address: address || "",
      notes: notes || "",
      joinDate: new Date(),
    });

    return ok(decorateMember(member.toObject()), { status: 201 });
  } catch (err) {
    if (err?.code === 11000) {
      return fail("Phone number already in use", "DUPLICATE_PHONE", 409);
    }
    return fail("Unable to create member", "MEMBER_CREATE_FAILED", 500);
  }
}
