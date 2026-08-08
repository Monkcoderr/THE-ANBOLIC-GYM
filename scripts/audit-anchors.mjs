/**
 * Read-only audit: find members whose billing anchor (joinDate) is suspicious,
 * and show what their next renewal expiry would be under the current
 * anchor-based rules.
 *
 * Flags two conditions:
 *   STAMPED  — joinDate falls on the same calendar day as createdAt, i.e. it
 *              was auto-stamped at creation time instead of taking the joining
 *              date the admin typed. Anchor day is therefore wrong.
 *   BACKSLIDE— the next renewal would land EARLIER than currentExpiry + 1 month
 *              because the anchor day is behind the current expiry day, so the
 *              member silently loses days.
 *
 * Usage: node scripts/audit-anchors.mjs
 */

import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  format,
  getDate,
  addMonths,
  setDate,
  getDaysInMonth,
  startOfDay,
  differenceInDays,
  isSameDay,
} from "date-fns";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim();
  }
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

const fmt = (d) => (d ? format(new Date(d), "dd-MMM-yyyy") : "—");
const applyAnchorDay = (date, day) => {
  const d = new Date(date);
  return setDate(d, Math.min(day, getDaysInMonth(d)));
};
const durationToMonths = (days) => Math.max(1, Math.round((Number(days) || 0) / 30));

await mongoose.connect(process.env.MONGODB_URI, {
  bufferCommands: false,
  serverSelectionTimeoutMS: 8000,
});

const all = await mongoose.connection
  .collection("members")
  .find({ isDeleted: { $ne: true } })
  .toArray();

const rows = [];
for (const m of all) {
  if (!m.joinDate || !m.planEndDate) continue;
  const anchorDay = getDate(new Date(m.joinDate));
  const months = durationToMonths(m.planDurationDays);
  const plain = addMonths(new Date(m.planEndDate), months);
  const anchored = applyAnchorDay(plain, anchorDay);
  const drift = differenceInDays(startOfDay(anchored), startOfDay(plain));

  const stamped =
    m.createdAt && isSameDay(new Date(m.joinDate), new Date(m.createdAt));

  if (!stamped && drift === 0) continue;

  rows.push({
    id: m.customMemberId || String(m._id).slice(-6),
    name: m.name,
    join: fmt(m.joinDate),
    created: fmt(m.createdAt),
    expiry: fmt(m.planEndDate),
    next: fmt(anchored),
    drift,
    flags: [stamped ? "STAMPED" : null, drift < 0 ? "BACKSLIDE" : null]
      .filter(Boolean)
      .join("+"),
  });
}

console.log(`Scanned ${all.length} active member records.`);
console.log(`Flagged ${rows.length}.\n`);
console.log(
  "ID     NAME                 JOIN          CREATED       EXPIRY        NEXT RENEWAL  DRIFT  FLAGS"
);
for (const r of rows.sort((a, b) => a.drift - b.drift)) {
  console.log(
    `${r.id.padEnd(6)} ${r.name.slice(0, 20).padEnd(20)} ${r.join.padEnd(13)} ` +
      `${r.created.padEnd(13)} ${r.expiry.padEnd(13)} ${r.next.padEnd(13)} ` +
      `${String(r.drift).padStart(5)}  ${r.flags}`
  );
}

await mongoose.disconnect();
