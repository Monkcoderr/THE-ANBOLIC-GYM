import mongoose from "mongoose";

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

const RevertedToSchema = new mongoose.Schema(
  {
    planEndDate: Date,
    planDurationDays: Number,
    planStartDate: Date,
    status: String,
    miaFlagged: Boolean,
    appliedToMember: Boolean,
    source: String,
  },
  { _id: false }
);

const ReconciliationSchema = new mongoose.Schema(
  {
    entitlementStart: Date,
    entitlementEnd: Date,
    reconciledAt: Date,
    reconciledBy: String,
    reason: String,
    requiresManualVoid: { type: Boolean, default: true },
  },
  { _id: false }
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

    // Immutable renewal identity and entitlement lineage. Optional only so
    // historical rows continue to deserialize unchanged.
    idempotencyKey: { type: String, default: undefined, immutable: true },
    renewalId: { type: String, default: undefined, immutable: true },
    predecessorPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      immutable: true,
    },
    entitlementStart: { type: Date, default: undefined, immutable: true },
    entitlementEnd: { type: Date, default: undefined, immutable: true },
    anchorDateUsed: { type: Date, default: undefined, immutable: true },
    memberVersionBefore: { type: Number, default: undefined, immutable: true },
    memberVersionAfter: { type: Number, default: undefined, immutable: true },

    status: { type: String, enum: ["active", "voided"], default: "active" },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: String, default: null },
    voidReason: { type: String, default: "" },
    memberSnapshot: { type: MemberStateSchema, default: undefined },
    revertedTo: { type: RevertedToSchema, default: undefined },
    reconciliation: { type: ReconciliationSchema, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PaymentSchema.index({ memberId: 1 });
PaymentSchema.index({ paymentDate: 1 });
PaymentSchema.index({ memberId: 1, createdAt: -1, _id: -1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index(
  { memberId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

export default mongoose.models.Payment || mongoose.model("Payment", PaymentSchema);
