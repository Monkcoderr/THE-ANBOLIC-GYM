import {
  addDays,
  businessDateOnly,
  differenceInDays,
  NEW_MEMBER_WINDOW_DAYS,
  utcDateOnly,
} from "@/lib/dateUtils";

/** Decorate a member with status fields using the India business date. */
export function decorateMember(member, today = businessDateOnly()) {
  const endDay = utcDateOnly(member.planEndDate);
  const todayDay = utcDateOnly(today);
  const daysUntilExpiry = differenceInDays(endDay, todayDay);

  let status;
  if (endDay < todayDay) status = "expired";
  else if (endDay <= addDays(todayDay, 3)) status = "expiring";
  else status = "active";

  const daysSinceExpiry = daysUntilExpiry < 0 ? -daysUntilExpiry : 0;
  const miaFlagged = status === "expired" && daysSinceExpiry >= 7;

  let isNewMember = false;
  let daysSinceJoin = null;
  if (member.joinDate) {
    const joinDiff = differenceInDays(todayDay, utcDateOnly(member.joinDate));
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

export function sortMembers(members) {
  return [...members].sort((a, b) => {
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
    if (a.status === "expired") {
      if (a.miaFlagged !== b.miaFlagged) return a.miaFlagged ? -1 : 1;
      return new Date(b.planEndDate) - new Date(a.planEndDate);
    }
    return new Date(a.planEndDate) - new Date(b.planEndDate);
  });
}
