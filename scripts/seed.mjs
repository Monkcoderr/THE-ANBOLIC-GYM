/**
 * Dummy-data seeder for Gym Manager Pro.
 *
 * Usage:
 *   node scripts/seed.mjs           # adds dummy data (keeps existing)
 *   node scripts/seed.mjs --reset   # wipes members/payments/leads first
 *
 * Reads MONGODB_URI from .env.local. Does NOT touch the Admin collection,
 * so your gym name + PIN login stays intact.
 */

import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  startOfDay,
  addDays,
  subDays,
  subMonths,
  format,
} from "date-fns";

// ── Load .env.local manually (node doesn't auto-load it) ──────────────────
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

const GYM_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Gym Manager Pro";
const RESET = process.argv.includes("--reset");

// ── Schemas (kept in sync with /models) ───────────────────────────────────
const MemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true },
    planDurationDays: { type: Number, required: true },
    planStartDate: { type: Date, required: true },
    planEndDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "expiring", "expired"],
      default: "active",
    },
    address: { type: String, default: "" },
    notes: { type: String, default: "" },
    miaFlagged: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    joinDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const PaymentSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    memberName: { type: String, required: true },
    memberPhone: { type: String, required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ["Cash", "UPI"], required: true },
    paymentDate: { type: Date, default: Date.now },
    planDurationDays: { type: Number, required: true },
    previousExpiry: { type: Date },
    newExpiry: { type: Date, required: true },
    receiptText: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const LeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    interest: { type: String, default: "" },
    source: {
      type: String,
      enum: ["walk-in", "referral", "social", "other"],
      default: "walk-in",
    },
    notes: { type: String, default: "" },
    convertedToMember: { type: Boolean, default: false },
    convertedMemberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

const Member = mongoose.models.Member || mongoose.model("Member", MemberSchema);
const Payment = mongoose.models.Payment || mongoose.model("Payment", PaymentSchema);
const Lead = mongoose.models.Lead || mongoose.model("Lead", LeadSchema);

// ── Helpers ────────────────────────────────────────────────────────────────
const TODAY = startOfDay(new Date());

function fmt(date) {
  return format(new Date(date), "dd-MMM-yyyy");
}

function receipt(member, payment) {
  return `🏋️‍♂️ *${GYM_NAME} - PAYMENT RECEIPT* 🏋️‍♂️
----------------------------------
👤 *Member Name:* ${member.name}
📱 *Phone:* ${member.phone}
📅 *Date:* ${fmt(payment.paymentDate)}
💰 *Amount Paid:* ₹${payment.amount}
💳 *Payment Mode:* ${payment.paymentMethod}
⏱️ *Valid Until:* ${fmt(payment.newExpiry)}
----------------------------------
Thank you for your payment! Let's crush those goals! 💪🔥`;
}

// status / mia derived from planEndDate, mirroring lib/dateUtils.js
function deriveStatus(planEndDate) {
  const end = new Date(planEndDate);
  const threeDaysLater = addDays(TODAY, 3);
  if (end < TODAY) return "expired";
  if (end <= threeDaysLater) return "expiring";
  return "active";
}
function deriveMia(planEndDate) {
  const end = startOfDay(new Date(planEndDate));
  if (end >= TODAY) return false;
  return Math.round((TODAY - end) / 86400000) >= 7;
}

const PRICE = { 30: 1000, 60: 1800, 90: 2500, 180: 4500, 365: 8000 };

/**
 * Build a member whose plan ENDS `endOffsetDays` from today
 * (negative = already expired). planStartDate is derived backwards.
 */
function makeMember({ name, phone, duration, endOffsetDays, address = "", notes = "" }) {
  const planEndDate = addDays(TODAY, endOffsetDays);
  const planStartDate = subDays(planEndDate, duration);
  const status = deriveStatus(planEndDate);
  return {
    name,
    phone,
    planDurationDays: duration,
    planStartDate,
    planEndDate,
    status,
    address,
    notes,
    miaFlagged: deriveMia(planEndDate),
    isDeleted: false,
    joinDate: planStartDate,
  };
}

// ── Dummy member definitions ────────────────────────────────────────────────
const memberDefs = [
  // 🟢 ACTIVE
  { name: "Rahul Sharma", phone: "9876500001", duration: 90, endOffsetDays: 72, address: "MG Road", notes: "Prefers morning slot" },
  { name: "Priya Nair", phone: "9876500002", duration: 180, endOffsetDays: 140, address: "Sector 21" },
  { name: "Arjun Mehta", phone: "9876500003", duration: 365, endOffsetDays: 300, notes: "Annual member, pays UPI" },
  { name: "Sneha Kapoor", phone: "9876500004", duration: 30, endOffsetDays: 25 },
  { name: "Vikram Singh", phone: "9876500005", duration: 90, endOffsetDays: 60, address: "Civil Lines" },
  { name: "Ananya Reddy", phone: "9876500006", duration: 60, endOffsetDays: 45 },

  // 🟡 EXPIRING SOON (within 3 days)
  { name: "Karan Malhotra", phone: "9876500007", duration: 30, endOffsetDays: 1, notes: "Reminded once" },
  { name: "Divya Iyer", phone: "9876500008", duration: 90, endOffsetDays: 2 },
  { name: "Rohit Verma", phone: "9876500009", duration: 60, endOffsetDays: 0, address: "Park Street" },

  // 🔴 EXPIRED (recent, not MIA)
  { name: "Meera Joshi", phone: "9876500010", duration: 30, endOffsetDays: -2 },
  { name: "Aditya Rao", phone: "9876500011", duration: 90, endOffsetDays: -4, notes: "Said will renew next week" },

  // 🔴 EXPIRED + MIA (7+ days)
  { name: "Pooja Gupta", phone: "9876500012", duration: 30, endOffsetDays: -10, address: "Gandhi Nagar" },
  { name: "Sandeep Kumar", phone: "9876500013", duration: 60, endOffsetDays: -18 },
  { name: "Neha Bhatt", phone: "9876500014", duration: 90, endOffsetDays: -35, notes: "Moved jobs, follow up" },
];

// ── Dummy lead definitions ──────────────────────────────────────────────────
const leadDefs = [
  // Fresh (< 48h) — normal
  { name: "Manish Tiwari", phone: "9811100001", interest: "3M", source: "walk-in", notes: "Asked about personal training", hoursAgo: 3 },
  { name: "Kavya Menon", phone: "9811100002", interest: "1M", source: "social", notes: "Came via Instagram ad", hoursAgo: 20 },
  { name: "Imran Khan", phone: "9811100003", interest: "6M", source: "referral", notes: "Referred by Rahul Sharma", hoursAgo: 40 },

  // Hot (>= 48h, still pending) — should highlight amber
  { name: "Deepak Yadav", phone: "9811100004", interest: "3M", source: "walk-in", notes: "Wanted to compare plans", hoursAgo: 60 },
  { name: "Ritika Sen", phone: "9811100005", interest: "other", source: "other", notes: "Enquired about couple plan", hoursAgo: 96 },
  { name: "Suresh Pillai", phone: "9811100006", interest: "2M", source: "referral", notes: "No response to first call", hoursAgo: 150 },
];

async function run() {
  console.log("Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log("Connected.");

  if (RESET) {
    console.log("Reset flag set — clearing members, payments, leads…");
    await Promise.all([
      Member.deleteMany({}),
      Payment.deleteMany({}),
      Lead.deleteMany({}),
    ]);
  }

  // Members (upsert by phone so re-running won't duplicate)
  const insertedMembers = [];
  for (const def of memberDefs) {
    const doc = makeMember(def);
    const member = await Member.findOneAndUpdate(
      { phone: doc.phone },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    insertedMembers.push(member);
  }
  console.log(`Members upserted: ${insertedMembers.length}`);

  // Payments — give each member their initial joining payment, plus spread
  // some historical payments across the last 6 months for the revenue chart.
  let paymentCount = 0;
  for (const member of insertedMembers) {
    const amount = PRICE[member.planDurationDays] || 1500;

    // Initial joining payment (on plan start)
    const initial = {
      memberId: member._id,
      memberName: member.name,
      memberPhone: member.phone,
      amount,
      paymentMethod: Math.random() > 0.5 ? "UPI" : "Cash",
      paymentDate: member.planStartDate,
      planDurationDays: member.planDurationDays,
      previousExpiry: null,
      newExpiry: member.planEndDate,
    };
    initial.receiptText = receipt(member, initial);
    await Payment.create(initial);
    paymentCount++;
  }

  // Extra historical payments spread over the last 6 months (revenue trend)
  const historicalMonths = [5, 4, 3, 2, 1, 0];
  for (const monthsAgo of historicalMonths) {
    const perMonth = 3 + Math.floor(Math.random() * 4); // 3-6 payments/month
    for (let i = 0; i < perMonth; i++) {
      const member = insertedMembers[Math.floor(Math.random() * insertedMembers.length)];
      const duration = [30, 60, 90][Math.floor(Math.random() * 3)];
      const payDate = subDays(subMonths(TODAY, monthsAgo), Math.floor(Math.random() * 25));
      const amount = PRICE[duration] || 1500;
      const pay = {
        memberId: member._id,
        memberName: member.name,
        memberPhone: member.phone,
        amount,
        paymentMethod: Math.random() > 0.5 ? "UPI" : "Cash",
        paymentDate: payDate,
        planDurationDays: duration,
        previousExpiry: payDate,
        newExpiry: addDays(payDate, duration),
      };
      pay.receiptText = receipt(member, pay);
      await Payment.create(pay);
      paymentCount++;
    }
  }
  console.log(`Payments created: ${paymentCount}`);

  // Leads (upsert by phone)
  let leadCount = 0;
  for (const def of leadDefs) {
    const createdAt = new Date(Date.now() - def.hoursAgo * 3600 * 1000);
    await Lead.findOneAndUpdate(
      { phone: def.phone },
      {
        $set: {
          name: def.name,
          phone: def.phone,
          interest: def.interest,
          source: def.source,
          notes: def.notes,
          convertedToMember: false,
          convertedMemberId: null,
          createdAt,
          updatedAt: createdAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: false }
    );
    leadCount++;
  }
  console.log(`Leads upserted: ${leadCount}`);

  // Summary
  const active = insertedMembers.filter((m) => m.status === "active").length;
  const expiring = insertedMembers.filter((m) => m.status === "expiring").length;
  const expired = insertedMembers.filter((m) => m.status === "expired").length;
  const mia = insertedMembers.filter((m) => m.miaFlagged).length;

  console.log("\n── Seed summary ─────────────────");
  console.log(`  🟢 Active   : ${active}`);
  console.log(`  🟡 Expiring : ${expiring}`);
  console.log(`  🔴 Expired  : ${expired} (of which MIA: ${mia})`);
  console.log(`  📋 Leads    : ${leadCount} (3 hot ≥48h)`);
  console.log("─────────────────────────────────\n");

  await mongoose.disconnect();
  console.log("Done. Disconnected.");
}

run().catch(async (err) => {
  console.error("Seed failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
