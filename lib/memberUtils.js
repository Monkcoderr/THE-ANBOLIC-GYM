import {
  computeMemberStatus,
  isMIAMember,
  getDaysUntilExpiry,
  getDaysSinceExpiry,
} from "@/lib/dateUtils";

/**
 * Decorate a plain member object with freshly-computed status fields.
 */
export function decorateMember(member) {
  const status = computeMemberStatus(member.planEndDate);
  const miaFlagged = status === "expired" && isMIAMember(member.planEndDate);
  return {
    ...member,
    _id: member._id?.toString?.() ?? member._id,
    status,
    miaFlagged,
    daysUntilExpiry: getDaysUntilExpiry(member.planEndDate),
    daysSinceExpiry: getDaysSinceExpiry(member.planEndDate),
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
