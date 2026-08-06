import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember } from "@/lib/memberUtils";

export const dynamic = "force-dynamic";

// POST /api/members/[id]/restore — undo a soft delete.
//
// Brings the member back exactly as it was: same phone, same custom ID, same
// payment history (payments were never detached — they key off this member's
// _id). Because the phone uniqueness index only covers active members, we must
// first make sure no OTHER active member has since claimed this phone; if one
// has, we surface a clear conflict instead of letting the DB throw a raw
// duplicate-key error. The custom ID stays reserved to this record even while
// deleted, so it can never collide on restore.
export async function POST(request, { params }) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();

    const member = await Member.findOne({
      _id: params.id,
      isDeleted: true,
    }).lean();
    if (!member) {
      return fail("Deleted member not found", "NOT_FOUND", 404);
    }

    const phoneClash = await Member.findOne({
      phone: member.phone,
      _id: { $ne: params.id },
      isDeleted: { $ne: true },
    })
      .select("_id name")
      .lean();
    if (phoneClash) {
      return fail(
        `Can't restore: an active member (${phoneClash.name}) already uses this phone number.`,
        "DUPLICATE_PHONE",
        409
      );
    }

    let restored;
    try {
      restored = await Member.findOneAndUpdate(
        { _id: params.id, isDeleted: true },
        { $set: { isDeleted: false } },
        { new: true }
      ).lean();
    } catch (err) {
      if (err?.code === 11000) {
        if (err?.keyPattern?.customMemberId) {
          return fail(
            "Can't restore: that member ID is now in use.",
            "DUPLICATE_MEMBER_ID",
            409
          );
        }
        return fail(
          "Can't restore: that phone number is now in use.",
          "DUPLICATE_PHONE",
          409
        );
      }
      throw err;
    }

    if (!restored) return fail("Deleted member not found", "NOT_FOUND", 404);
    return ok(decorateMember(restored));
  } catch (err) {
    return fail("Unable to restore member", "MEMBER_RESTORE_FAILED", 500);
  }
}
