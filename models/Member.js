import mongoose from "mongoose";

const MemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Admin-assigned human-friendly ID (e.g. "GYM-001"). Optional so existing
    // members keep working until an ID is assigned. Uniqueness is enforced by
    // a sparse index below — members without an ID are simply skipped.
    customMemberId: { type: String, trim: true, default: undefined },
    // Uniqueness is enforced by a PARTIAL index below (active members only) so
    // a soft-deleted member's phone can be re-used when re-adding them.
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
    joinDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

MemberSchema.index({ status: 1 });
MemberSchema.index({ planEndDate: 1 });
// Partial + unique: only NON-deleted members are indexed, so a phone number
// stays unique among active records while a soft-deleted member's number can
// be re-used if that person is re-added later. syncIndexes() migrates the old
// blanket unique index to this one automatically on connect.
MemberSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
// Sparse + unique: only documents that actually carry a customMemberId are
// indexed, so any number of members can exist without one while assigned IDs
// stay globally unique.
MemberSchema.index({ customMemberId: 1 }, { unique: true, sparse: true });

export default mongoose.models.Member || mongoose.model("Member", MemberSchema);
