import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Please define the MONGODB_URI environment variable inside .env.local"
  );
}

/**
 * Cache the Mongoose connection across hot reloads in development and across
 * serverless function invocations in production using a global variable.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  try {
    const { default: Member } = await import("@/models/Member");
    const { default: Payment } = await import("@/models/Payment");
    const { default: Lead } = await import("@/models/Lead");
    await Promise.all([
      Member.syncIndexes(),
      Payment.syncIndexes(),
      Lead.syncIndexes(),
    ]);
    indexesEnsured = true;
  } catch (err) {
    // Index creation is best-effort; never block the request on it.
    console.error("Index sync failed:", err.message);
  }
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  await ensureIndexes();
  return cached.conn;
}

export default connectDB;
