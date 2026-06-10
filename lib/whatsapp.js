import { toIndiaWhatsApp } from "@/lib/utils";
import { formatDisplayDate, getDaysSinceExpiry } from "@/lib/dateUtils";

/**
 * Build a wa.me deep link with a pre-filled, URL-encoded message.
 * Phone is normalized to India E.164 digits (91 prefix) so links open
 * the correct chat from any device.
 */
export function buildWhatsAppLink(phone, message) {
  const digits = toIndiaWhatsApp(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Reminder message for an EXPIRING membership.
 */
export function expiringMessage(name, gymName, endDate) {
  return `Hi ${name}! 👋 Your membership at ${gymName} expires on ${formatDisplayDate(
    endDate
  )}.
Renew now to keep your fitness streak going! 💪
Visit us to renew. See you at the gym! 🏋️‍♂️`;
}

/**
 * Reminder message for an EXPIRED (but not MIA) membership.
 */
export function expiredMessage(name, gymName, endDate) {
  return `Hi ${name}! We miss you at ${gymName}! 😊
Your membership expired on ${formatDisplayDate(endDate)}.
Come back and crush your goals! Let us know if you'd like to renew. 💪🔥`;
}

/**
 * Reminder message for a MIA member (expired 7+ days).
 */
export function miaMessage(name, gymName, endDate) {
  const days = getDaysSinceExpiry(endDate);
  return `Hi ${name}! It's been ${days} days since we've seen you at ${gymName}! 🙁
Your membership expired on ${formatDisplayDate(endDate)}.
We'd love to have you back! Let's get back on track together. 💪
Reply to know about our current plans!`;
}

/**
 * Follow-up message for an unconverted lead.
 */
export function leadFollowUpMessage(name, gymName) {
  return `Hi ${name}! 👋 Thanks for visiting ${gymName}!
We'd love to help you start your fitness journey.
Are you still interested in joining? We have great plans available.
Reply to this message and we'll get you started! 💪🏋️‍♂️`;
}

/**
 * Pick the right reminder message for a member based on status + MIA flag.
 */
export function reminderForMember(member, gymName) {
  if (member.miaFlagged) return miaMessage(member.name, gymName, member.planEndDate);
  if (member.status === "expired")
    return expiredMessage(member.name, gymName, member.planEndDate);
  return expiringMessage(member.name, gymName, member.planEndDate);
}
