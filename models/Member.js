import mongoose from "mongoose";

const BillingAuditSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["anchor_reconciliation"], required: true },
    previousJoinDate: { type: Date, required: true },
    newJoinDate: { type: Date, required: true },
    previousExpiry: { type: Date, required: true },
    newExpiry: { type: Date, required: true },
    paidMonthsPreserved: { type: Number, required: true },
    reason: { type: String, required: true },
    changedBy: { type: String, default: null },
    changedAt: { type: Date, required: true },
  },
  { _id: true }
);

const MemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    customMemberId: { type: String, trim: true, default: undefined },
    phone: { type: String, required: true },
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
    joinDate: { type: Date, required: true },
    billingAudit: { type: [BillingAuditSchema], default: undefined },
  },
  { timestamps: true }
);

MemberSchema.index({ status: 1 });
MemberSchema.index({ planEndDate: 1 });
MemberSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
MemberSchema.index({ customMemberId: 1 }, { unique: true, sparse: true });

export default mongoose.models.Member || mongoose.model("Member", MemberSchema);
