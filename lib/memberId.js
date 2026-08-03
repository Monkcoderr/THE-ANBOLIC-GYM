import Member from "@/models/Member";

/**
 * First auto-generated Custom Member ID. New members start numbering here and
 * increment sequentially (1719, 1720, 1721, …).
 */
export const FIRST_MEMBER_ID = 1719;

/**
 * Parse a customMemberId into an integer, or null when it isn't a plain
 * sequential number. Legacy / manual IDs like "GYM-001" are intentionally
 * ignored so they never interfere with the auto-numbering sequence.
 */
export function parseNumericId(value) {
  if (value == null) return null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  const n = parseInt(str, 10);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Compute the next sequential Custom Member ID (as a string).
 *
 * Scans EVERY member — including soft-deleted ones — so a released ID is never
 * reused, finds the highest purely-numeric customMemberId, and returns the next
 * value. Falls back to FIRST_MEMBER_ID when no numeric IDs exist yet.
 *
 * The unique index on customMemberId remains the concurrency source of truth;
 * callers should retry with a freshly-computed value if a create collides.
 */
export async function computeNextMemberId() {
  const docs = await Member.find(
    { customMemberId: { $exists: true, $nin: [null, ""] } },
    { customMemberId: 1, _id: 0 }
  ).lean();

  let max = FIRST_MEMBER_ID - 1;
  for (const doc of docs) {
    const n = parseNumericId(doc.customMemberId);
    if (n !== null && n > max) max = n;
  }
  return String(max + 1);
}
