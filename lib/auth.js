import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || "30d";

if (!JWT_SECRET) {
  throw new Error(
    "Please define the JWT_SECRET environment variable inside .env.local"
  );
}

export const COOKIE_NAME = "gym_session";

/**
 * Sign a JWT with the configured secret and expiry (default 30 days).
 */
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify a JWT. Returns the decoded payload or null if invalid/expired.
 * (Used in Node runtime API routes; middleware uses jose instead.)
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Hash a 6-digit PIN with bcrypt (cost factor 12).
 */
export function hashPin(pin) {
  return bcrypt.hash(pin, 12);
}

/**
 * Compare a plaintext PIN against a stored bcrypt hash.
 */
export function comparePin(pin, hash) {
  return bcrypt.compare(pin, hash);
}

/**
 * Cookie options for the session cookie.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
  };
}
