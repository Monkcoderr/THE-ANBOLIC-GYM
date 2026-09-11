import mongoose from "mongoose";

/**
 * A snapshot of the five member fields a renewal writes. Stored on the payment
 * so a void can restore the member to the EXACT state they were in immediately
 * before that transaction, without having to infer anything.
 *
 * _id is disabled: these are plain value objects, not sub-documents.
 */
const MemberStateSchema = new mongoose.Schema(
  {
    planEndDate: Date,
    planDurationDays: Number,
    planStartDate: Date,
    status: String,
    miaFlagged: Boolean,
  },
  { _id: false }
);

/**
 * What the void actually wrote back to the member. Kept separately from
 * memberSnapshot so the audit trail records the intent (snapshot) and the
 * outcome (revertedTo) independently — they differ when a bill is voided
 * financially without touching membership.
 */
const RevertedToSchema = new mongoose.Schema(
  {
    planEndDate: Date,
    planDurationDays: Number,
    planStartDate: Date,
    status: String,
    miaFlagged: Boolean,
    // false when the admin chose to void the financial record only.
    appliedToMember: Boolean,
    // "snapshot" (exact) or "reconstructed" (derived for pre-snapshot bills).
    source: String,
  },
  { _id: false }
);

const PaymentSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    memberName: { type: String, required: true },
    memberPhone: { type: String, required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ["Cash", "UPI"], required: true },
    paymentDate: { type: Date, default: Date.now },
    planDurationDays: { type: Number, required: true },
    previousExpiry: { type: Date },
    newExpiry: { type: Date, required: true },
    receiptText: { type: String },

    /* ── Void / audit trail ─────────────────────────────────────────────────
     * Financial records are NEVER destroyed. A mistaken bill is voided: the
     * document stays, flagged, and stops counting toward revenue, member
     * totals, and the billing-anchor migration. Queries that must exclude
     * voided rows use `{ status: { $ne: "voided" } }` rather than
     * `{ status: "active" }`, because rows created before this field existed
     * carry no status at all and are legitimately active.
     * ─────────────────────────────────────────────────────────────────────── */
    status: { type: String, enum: ["active", "voided"], default: "active" },
    voidedAt: { type: Date, default: null },
    // Admin id from the session — who performed the void.
    voidedBy: { type: String, default: null },
    voidReason: { type: String, default: "" },

    // The member's state immediately BEFORE this renewal was applied.
    memberSnapshot: { type: MemberStateSchema, default: undefined },
    // The state the void restored (audit of the reversal itself).
    revertedTo: { type: RevertedToSchema, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PaymentSchema.index({ memberId: 1 });
PaymentSchema.index({ paymentDate: 1 });
// Resolving the previous / later payments around a bill being voided walks a
// member's history in date order; this serves both directions of that scan.
PaymentSchema.index({ memberId: 1, paymentDate: -1 });
// Revenue aggregation filters out voided rows before grouping.
PaymentSchema.index({ status: 1 });

export default mongoose.models.Payment ||
  mongoose.model("Payment", PaymentSchema);
