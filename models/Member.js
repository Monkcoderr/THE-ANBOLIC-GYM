import mongoose from "mongoose";

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

MemberSchema.index({ status: 1 });
MemberSchema.index({ planEndDate: 1 });

export default mongoose.models.Member || mongoose.model("Member", MemberSchema);
