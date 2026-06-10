import mongoose from "mongoose";

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
    convertedMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
    },
  },
  { timestamps: true }
);

LeadSchema.index({ createdAt: 1 });

export default mongoose.models.Lead || mongoose.model("Lead", LeadSchema);
