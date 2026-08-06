/**
 * One-off: ensure the Member.phone index is a PARTIAL unique index
 * (active members only) so a soft-deleted member's phone can be re-used.
 *
 * Usage:
 *   node scripts/fix-phone-index.mjs
 *
 * Safe to run repeatedly — it's idempotent. Reads MONGODB_URI from .env.local
 * and only touches the `phone` index on the members collection.
 */

import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
  console.error("✗ Could not read .env.local — make sure it exists.");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set in .env.local");
  process.exit(1);
}

const DESIRED = { unique: true, partialFilterExpression: { isDeleted: false } };

function isCorrectPartialIndex(ix) {
  return (
    ix.unique === true &&
    ix.partialFilterExpression &&
    ix.partialFilterExpression.isDeleted === false
  );
}

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const col = mongoose.connection.collection("members");

  const before = await col.indexes();
  const phoneIx = before.find(
    (ix) => ix.key && ix.key.phone === 1 && Object.keys(ix.key).length === 1
  );

  if (phoneIx && isCorrectPartialIndex(phoneIx)) {
    console.log("✓ Phone index is already the correct partial-unique index.");
    console.log("  Nothing to do — re-adding deleted members' phones works.");
    await mongoose.disconnect();
    return;
  }

  if (phoneIx) {
    console.log(`• Found stale phone index "${phoneIx.name}" — dropping it…`);
    await col.dropIndex(phoneIx.name);
  } else {
    console.log("• No existing phone index found — creating a fresh one…");
  }

  await col.createIndex({ phone: 1 }, { ...DESIRED, name: "phone_1" });
  console.log("✓ Created partial-unique phone index (active members only).");

  const after = (await col.indexes()).find((ix) => ix.name === "phone_1");
  console.log("  Now:", JSON.stringify(after));

  await mongoose.disconnect();
  console.log("✓ Done. Deleted members can now be re-added or restored.");
}

main().catch(async (err) => {
  console.error("✗ Failed:", err.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
