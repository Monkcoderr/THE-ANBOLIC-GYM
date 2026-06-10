import BottomNav from "@/components/layout/BottomNav";
import { GymProvider } from "@/components/layout/GymContext";
import { getSession } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/**
 * Dashboard layout — provides gym name context and the bottom nav.
 * Auth is enforced by middleware before this renders.
 */
export default async function DashboardLayout({ children }) {
  const session = await getSession();
  const gymName = session?.gymName || "Your Gym";

  return (
    <GymProvider gymName={gymName}>
      <div className="mx-auto min-h-screen w-full max-w-md pb-20">{children}</div>
      <BottomNav />
    </GymProvider>
  );
}
