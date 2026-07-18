import mongoose from "mongoose";

const MemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Admin-assigned human-friendly ID (e.g. "GYM-001"). Optional so existing
    // members keep working until an ID is assigned. Uniqueness is enforced by
    // a sparse index below — members without an ID are simply skipped.
    customMemberId: { type: String, trim: true, default: undefined },
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

MemberSchema.index({ status: 1 });
MemberSchema.index({ planEndDate: 1 });
// Sparse + unique: only documents that actually carry a customMemberId are
// indexed, so any number of members can exist without one while assigned IDs
// stay globally unique.
MemberSchema.index({ customMemberId: 1 }, { unique: true, sparse: true });

export default mongoose.models.Member || mongoose.model("Member", MemberSchema);
