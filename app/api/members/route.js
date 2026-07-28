import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember, sortMembers } from "@/lib/memberUtils";
import { computeMemberStatus, addDays, computeInitialExpiry } from "@/lib/dateUtils";
import { digitsOnly, normalizeMemberId } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().min(10, "Phone must be at least 10 digits"),
  customMemberId: z.string().trim().max(40, "ID is too long").optional(),
  planDurationDays: z.coerce
    .number()
    .int()
    .positive("Plan duration must be positive"),
  planStartDate: z.coerce.date().optional(),
  // When provided, the member is created working BACKWARDS from this expiry
  // (used for migrating existing/old members). planStartDate is derived.
  planEndDate: z.coerce.date().optional(),
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
      query.$or = [{ name: rx }, { phone: rx }, { customMemberId: rx }];
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

    // Two creation modes:
    //  • Forward (new signup): start date + duration → derive expiry.
    //  • Backwards (migrating an old member): known expiry + plan length →
    //    derive the start date so the record stays internally consistent.
    let planStartDate;
    let planEndDate;
    let joinDate;
    if (parsed.data.planEndDate) {
      planEndDate = parsed.data.planEndDate;
      planStartDate = addDays(planEndDate, -planDurationDays);
      // Backdate joinDate so migrated members don't pollute "new this month".
      joinDate = planStartDate;
    } else {
      planStartDate = parsed.data.planStartDate || new Date();
      // Anchor the expiry to the member's joining day-of-month so every future
      // renewal falls on the same calendar day. The joining date IS the start
      // date for a new signup.
      planEndDate = computeInitialExpiry(planStartDate, planDurationDays);
      joinDate = planStartDate;
    }
    const status = computeMemberStatus(planEndDate);

    const existing = await Member.findOne({ phone, isDeleted: { $ne: true } });
    if (existing) {
      return fail(
        "A member with this phone already exists",
        "DUPLICATE_PHONE",
        409
      );
    }

    // Custom member ID is optional. When supplied it must be globally unique
    // across non-deleted members.
    const customMemberId = normalizeMemberId(parsed.data.customMemberId);
    if (customMemberId) {
      const idClash = await Member.findOne({
        customMemberId,
        isDeleted: { $ne: true },
      });
      if (idClash) {
        return fail(
          "That member ID is already in use",
          "DUPLICATE_MEMBER_ID",
          409
        );
      }
    }

    const member = await Member.create({
      name,
      phone,
      customMemberId,
      planDurationDays,
      planStartDate,
      planEndDate,
      status,
      address: address || "",
      notes: notes || "",
      joinDate,
    });

    return ok(decorateMember(member.toObject()), { status: 201 });
  } catch (err) {
    if (err?.code === 11000) {
      if (err?.keyPattern?.customMemberId) {
        return fail("That member ID is already in use", "DUPLICATE_MEMBER_ID", 409);
      }
      return fail("Phone number already in use", "DUPLICATE_PHONE", 409);
    }
    return fail("Unable to create member", "MEMBER_CREATE_FAILED", 500);
  }
}
