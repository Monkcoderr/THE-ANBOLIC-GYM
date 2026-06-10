import { connectDB } from "@/lib/mongodb";
import Payment from "@/models/Payment";
import Member from "@/models/Member";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { computeMemberStatus, getMonthLabel } from "@/lib/dateUtils";
import { subMonths, startOfMonth } from "date-fns";

export const dynamic = "force-dynamic";

// GET /api/analytics — monthly revenue (6 months) + member stats.
export async function GET() {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();

    // Part 1 — monthly revenue for the last 6 months.
    const since = startOfMonth(subMonths(new Date(), 5));
    const revenueAgg = await Payment.aggregate([
      { $match: { paymentDate: { $gte: since } } },
      {
        $group: {
          _id: {
            year: { $year: "$paymentDate" },
            month: { $month: "$paymentDate" },
          },
          totalAmount: { $sum: "$amount" },
          paymentCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const monthlyRevenue = revenueAgg.map((r) => {
      const date = new Date(r._id.year, r._id.month - 1, 1);
      return {
        month: getMonthLabel(date),
        totalAmount: r.totalAmount,
        paymentCount: r.paymentCount,
      };
    });

    // Part 2 — member stats (status recomputed in JS).
    const members = await Member.find({ isDeleted: { $ne: true } })
      .select("planEndDate joinDate")
      .lean();

    const stats = { total: 0, active: 0, expiring: 0, expired: 0, newThisMonth: 0 };
    const monthStart = startOfMonth(new Date());

    for (const m of members) {
      stats.total += 1;
      const status = computeMemberStatus(m.planEndDate);
      stats[status] += 1;
      if (m.joinDate && new Date(m.joinDate) >= monthStart) {
        stats.newThisMonth += 1;
      }
    }

    return ok({ monthlyRevenue, memberStats: stats });
  } catch (err) {
    return fail("Unable to load analytics", "ANALYTICS_FAILED", 500);
  }
}
