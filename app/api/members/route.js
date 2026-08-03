import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember, sortMembers } from "@/lib/memberUtils";
import { computeMemberStatus, addDays, computeInitialExpiry, startOfDay } from "@/lib/dateUtils";
import { digitsOnly, normalizeMemberId } from "@/lib/utils";
import { computeNextMemberId } from "@/lib/memberId";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().min(10, "Phone must be at least 10 digits"),
  customMemberId: z.string().trim().max(40, "ID is too long").optional(),
  // Set by the client when customMemberId holds the server-suggested value the
  // admin left unedited — lets the server safely retry on a concurrent clash.
  autoAssignId: z.boolean().optional(),
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

    // address/notes are large free-text fields only shown on the member detail
    // page (its own endpoint returns them) — excluding them here shrinks the
    // list payload without affecting cards, search, or the renewal flow.
    const raw = await Member.find(query)
      .select("-address -notes -__v")
      .lean();
    // Compute start-of-today once and share it across the whole batch.
    const today = startOfDay(new Date());
    let decorated = raw.map((m) => decorateMember(m, today));

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

    // Custom member ID handling.
    //  • New (forward) signup: auto-assign the next sequential ID when the
    //    admin leaves it blank, or left the server-suggested value unedited.
    //    On a concurrent collision we recompute and retry — the unique index
    //    is the source of truth, so IDs stay globally unique and gap-free.
    //  • Old-member backfill (planEndDate provided): never auto-assign; the ID
    //    stays optional and manual so existing members are left unchanged.
    const isBackfill = Boolean(parsed.data.planEndDate);
    let customMemberId = normalizeMemberId(parsed.data.customMemberId);
    let autoId = false;

    if (!isBackfill) {
      if (!customMemberId) {
        customMemberId = await computeNextMemberId();
        autoId = true;
      } else if (parsed.data.autoAssignId) {
        autoId = true;
      }
    }

    // Manually-entered IDs must be unique up front (clear error, no silent
    // retry). Checked against ALL members — a soft-deleted holder still owns
    // the number in the unique index, so its ID can't be re-used.
    if (customMemberId && !autoId) {
      const idClash = await Member.findOne({ customMemberId });
      if (idClash) {
        return fail(
          "That member ID is already in use",
          "DUPLICATE_MEMBER_ID",
          409
        );
      }
    }

    const baseDoc = {
      name,
      phone,
      planDurationDays,
      planStartDate,
      planEndDate,
      status,
      address: address || "",
      notes: notes || "",
      joinDate,
    };

    let member;
    const MAX_ID_RETRIES = 5;
    for (let attempt = 0; ; attempt++) {
      try {
        member = await Member.create({ ...baseDoc, customMemberId });
        break;
      } catch (err) {
        // A concurrent create grabbed our auto-assigned number — recompute
        // (now seeing the competitor) and try the next value.
        if (
          err?.code === 11000 &&
          err?.keyPattern?.customMemberId &&
          autoId &&
          attempt < MAX_ID_RETRIES
        ) {
          customMemberId = await computeNextMemberId();
          continue;
        }
        throw err;
      }
    }

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
