import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthorizedSiteIds } from "./accessControl";

export const getSODashboardData = query({
  args: {
    userId: v.id("users"),
    siteId: v.optional(v.id("sites")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.userId);
    
    // Filter by siteId if provided, otherwise use all authorized sites
    let targetSiteIds = authorizedSiteIds;
    if (args.siteId) {
      if (authorizedSiteIds && !authorizedSiteIds.includes(args.siteId)) {
        throw new Error("Unauthorized: You do not have access to this site");
      }
      targetSiteIds = [args.siteId];
    }

    if (!targetSiteIds || targetSiteIds.length === 0) {
      return {
        pendingVisitors: 0,
        approvedVisitors: 0,
        insideVisitors: 0,
        pendingVehicles: 0,
        insideVehicles: 0,
        todayEntries: 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfToday = today.getTime();

    // Fetch visit logs for today for the target sites
    const visitLogs = await ctx.db
      .query("visitLogs")
      .withIndex("by_org_created", (q) => q.eq("organizationId", user.organizationId).gte("createdAt", startOfToday))
      .collect();

    const filteredLogs = visitLogs.filter(log => targetSiteIds!.includes(log.siteId));

    const stats = {
      pendingVisitors: filteredLogs.filter(l => !l.vehicleNumber && l.status === "pending").length,
      approvedVisitors: filteredLogs.filter(l => !l.vehicleNumber && l.status === "approved").length,
      insideVisitors: filteredLogs.filter(l => !l.vehicleNumber && l.status === "inside").length,
      pendingVehicles: filteredLogs.filter(l => !!l.vehicleNumber && l.status === "pending").length,
      insideVehicles: filteredLogs.filter(l => !!l.vehicleNumber && l.status === "inside").length,
      dayCheckCount: filteredLogs.filter(l => l.type === "siteCheckDay").length,
      nightCheckCount: filteredLogs.filter(l => l.type === "siteCheckNight").length,
      trainerCount: filteredLogs.filter(l => l.type === "trainer").length,
      todayEntries: filteredLogs.length,
    };

    return stats;
  },
});
