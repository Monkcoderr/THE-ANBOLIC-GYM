/**
 * Removes ONLY the dummy data created by scripts/seed.mjs.
 *
 * Usage:
 *   node scripts/clear-dummy.mjs          # remove only seeded dummy records
 *   node scripts/clear-dummy.mjs --all    # wipe ALL members/payments/leads
 *
 * Reads MONGODB_URI from .env.local. Never touches the Admin collection,
 * so your gym name + PIN login stays intact.
 */

import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── Load .env.local manually ──────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
try {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  console.error("Could not read .env.local — make sure it exists.");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set in .env.local");
  process.exit(1);
}

const WIPE_ALL = process.argv.includes("--all");

// ── Minimal schemas ────────────────────────────────────────────────────────
const Member = mongoose.models.Member || mongoose.model("Member", new mongoose.Schema({}, { strict: false }));
const Payment = mongoose.models.Payment || mongoose.model("Payment", new mongoose.Schema({}, { strict: false }));
const Lead = mongoose.models.Lead || mongoose.model("Lead", new mongoose.Schema({}, { strict: false }));

// Dummy records from seed.mjs use these phone prefixes.
const DUMMY_MEMBER_PHONES = /^98765000\d{2}$/; // 9876500001–9876500014
const DUMMY_LEAD_PHONES = /^98111000\d{2}$/;    // 9811100001–9811100006

async function run() {
  console.log("Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log("Connected.");

  let memberFilter, paymentFilter, leadFilter;

  if (WIPE_ALL) {
    console.log("--all flag set — wiping ALL members, payments, and leads.");
    memberFilter = {};
    paymentFilter = {};
    leadFilter = {};
  } else {
    console.log("Removing only seeded dummy records (by phone pattern).");
    memberFilter = { phone: DUMMY_MEMBER_PHONES };
    // Payments reference dummy members via memberPhone.
    paymentFilter = { memberPhone: DUMMY_MEMBER_PHONES };
    leadFilter = { phone: DUMMY_LEAD_PHONES };
  }

  const [m, p, l] = await Promise.all([
    Member.deleteMany(memberFilter),
    Payment.deleteMany(paymentFilter),
    Lead.deleteMany(leadFilter),
  ]);

  console.log("\n── Cleanup summary ──────────────");
  console.log(`  Members removed  : ${m.deletedCount}`);
  console.log(`  Payments removed : ${p.deletedCount}`);
  console.log(`  Leads removed    : ${l.deletedCount}`);
  console.log("─────────────────────────────────\n");

  await mongoose.disconnect();
  console.log("Done. Admin account left untouched.");
}

run().catch(async (err) => {
  console.error("Cleanup failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
