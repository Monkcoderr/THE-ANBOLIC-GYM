import {
  startOfDay,
  addDays,
  differenceInDays,
  NEW_MEMBER_WINDOW_DAYS,
} from "@/lib/dateUtils";

/**
 * Decorate a plain member object with freshly-computed status fields.
 *
 * `today` is accepted so a caller decorating many members (e.g. the list
 * endpoint) can compute the start-of-day once and share it across the whole
 * batch, instead of re-deriving it ~10× per member. The math below mirrors the
 * individual helpers in dateUtils exactly:
 *   - status: computeMemberStatus (raw end-time vs start-of-today + 3 days)
 *   - daysUntilExpiry / daysSinceExpiry: start-of-day differences
 *   - miaFlagged: expired for 7+ whole days
 *   - isNewMember / daysSinceJoin: whole days since joining (0-based)
 */
export function decorateMember(member, today = startOfDay(new Date())) {
  const rawEnd = new Date(member.planEndDate);
  const endDay = startOfDay(rawEnd);
  const daysUntilExpiry = differenceInDays(endDay, today);

  let status;
  if (rawEnd < today) status = "expired";
  else if (rawEnd <= addDays(today, 3)) status = "expiring";
  else status = "active";

  const daysSinceExpiry = daysUntilExpiry < 0 ? -daysUntilExpiry : 0;
  const miaFlagged = status === "expired" && daysSinceExpiry >= 7;

  let isNewMember = false;
  let daysSinceJoin = null;
  if (member.joinDate) {
    const joinDiff = differenceInDays(
      today,
      startOfDay(new Date(member.joinDate))
    );
    isNewMember = joinDiff >= 0 && joinDiff <= NEW_MEMBER_WINDOW_DAYS;
    daysSinceJoin = joinDiff > 0 ? joinDiff : 0;
  }

  return {
    ...member,
    _id: member._id?.toString?.() ?? member._id,
    status,
    miaFlagged,
    daysUntilExpiry,
    daysSinceExpiry,
    isNewMember,
    daysSinceJoin,
  };
}

const STATUS_ORDER = { expired: 0, expiring: 1, active: 2 };

/**
 * Sort decorated members: expired first (MIA at the very top), then
 * expiring, then active. Within expired, most-recent expirations first.
 */
export function sortMembers(members) {
  return [...members].sort((a, b) => {
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
    if (a.status === "expired") {
      // MIA members bubble to the very top of the expired group.
      if (a.miaFlagged !== b.miaFlagged) return a.miaFlagged ? -1 : 1;
      // Most recent expiration first (closest to today).
      return new Date(b.planEndDate) - new Date(a.planEndDate);
    }
    // Expiring/active: soonest expiry first.
    return new Date(a.planEndDate) - new Date(b.planEndDate);
  });
}
