import mongoose from "mongoose";

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
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PaymentSchema.index({ memberId: 1 });
PaymentSchema.index({ paymentDate: 1 });

export default mongoose.models.Payment ||
  mongoose.model("Payment", PaymentSchema);
