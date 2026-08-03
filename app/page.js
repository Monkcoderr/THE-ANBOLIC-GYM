import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import Admin from "@/models/Admin";

// Entry point. Resolve the destination on the server so the user never sees a
// throwaway loading spinner gated on a client-side round-trip:
//   - admin exists  → /dashboard (middleware then enforces the PIN/session)
//   - no admin yet  → /setup
//   - DB unreachable → /login (mirrors the previous client-side fallback)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let target = "/login";
  try {
    await connectDB();
    const adminExists = (await Admin.estimatedDocumentCount()) > 0;
    target = adminExists ? "/dashboard" : "/setup";
  } catch {
    target = "/login";
  }

  // redirect() must be called outside the try/catch — it signals via a thrown
  // control-flow error that the catch above would otherwise swallow.
  redirect(target);
}
