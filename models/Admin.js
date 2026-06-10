import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    gymName: { type: String, required: true, trim: true },
    pinHash: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.Admin || mongoose.model("Admin", AdminSchema);
