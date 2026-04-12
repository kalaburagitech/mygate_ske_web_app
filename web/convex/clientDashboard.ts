import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthorizedSiteIds } from "./accessControl";

export const getClientDashboardData = query({
  args: {
    userId: v.id("users"),
    siteIds: v.optional(v.array(v.id("sites"))),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const isClient = user.roles.includes("Client");
    const isSO = user.roles.includes("SO");

    if (!isClient && !isSO) {
      throw new Error("Unauthorized: Only clients and SOs can access this dashboard");
    }

    const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.userId);
    
    if (authorizedSiteIds === null) {
      throw new Error("Unauthorized: Full access users should use the standard Dashboard");
    }

    // If specific site IDs are requested, filter the authorized ones
    let targetSiteIds = authorizedSiteIds;
    if (args.siteIds && args.siteIds.length > 0) {
      const authSet = new Set(authorizedSiteIds.map((id: Id<"sites">) => id.toString()));
      targetSiteIds = args.siteIds.filter((id: Id<"sites">) => authSet.has(id.toString()));
    }

    // 1. Fetch Assigned Sites
    const assignedSites = (await Promise.all(
      authorizedSiteIds.map((id) => ctx.db.get(id))
    )).filter((s): s is any => s !== null);

    // Get organization name from the first assigned site if possible, otherwise fallback to user's org
    const firstSite = assignedSites[0];
    const org = firstSite ? await ctx.db.get(firstSite.organizationId) : await ctx.db.get(user.organizationId);
    const organizationName = (org as any)?.name || "Unknown Organization";

    if (authorizedSiteIds.length === 0) {
      return {
        organizationName,
        assignedSites: [],
        attendance: [],
        patrolLogs: [],
        visitLogs: [],
      };
    }

    // 2. Fetch Attendance (Latest 50 records for assigned sites)
    const attendancePromises = authorizedSiteIds.map(siteId => 
        ctx.db.query("attendanceRecords")
            .withIndex("by_site", q => q.eq("siteId", siteId))
            .order("desc")
            .take(50)
    );

    // 3. Fetch Patrol Logs (Latest 50 per site)
    const patrolPromises = authorizedSiteIds.map(siteId => 
        ctx.db.query("patrolLogs")
            .withIndex("by_site", q => q.eq("siteId", siteId))
            .order("desc")
            .take(50)
    );

    // 4. Fetch Visit Logs (Latest 50 per site)
    const visitPromises = authorizedSiteIds.map(siteId => 
        ctx.db.query("visitLogs")
            .withIndex("by_site", q => q.eq("siteId", siteId))
            .order("desc")
            .take(50)
    );

    const [attendanceResults, patrolResults, visitResults] = await Promise.all([
        Promise.all(attendancePromises),
        Promise.all(patrolPromises),
        Promise.all(visitPromises)
    ]);

    const allVisitsToday = visitResults.flat().filter(v => v._creationTime >= new Date().setHours(0,0,0,0));

    // Stats for Client Dashboard
    const stats = {
        pendingVisitors: visitResults.flat().filter(v => v.status === "pending" && !v.vehicleNumber).length,
        pendingVehicles: visitResults.flat().filter(v => v.status === "pending" && !!v.vehicleNumber).length,
        approvedToday: allVisitsToday.filter(v => v.status === "approved").length,
        insideNow: visitResults.flat().filter(v => v.status === "inside").length,
        rejectedToday: allVisitsToday.filter(v => v.status === "rejected").length,
        todayEntries: allVisitsToday.length,
        pendingAttendance: attendanceResults.flat().filter(a => a.approvalStatus === "pending").length,
    };

    // Lists for Client Dashboard
    const pendingVisitors = visitResults.flat().filter(v => !v.vehicleNumber && v.status === "pending");
    const pendingVehicles = visitResults.flat().filter(v => !!v.vehicleNumber && v.status === "pending");

    // Enriched logs for better UI
    const enrichedPatrolLogs = await Promise.all(patrolResults.flat().sort((a,b) => b.createdAt - a.createdAt).slice(0, 100).map(async log => {
        const u = await ctx.db.get(log.userId);
        const s = await ctx.db.get(log.siteId);
        return { 
          ...log, 
          userName: u?.name || "Unknown", 
          siteName: (s as any)?.name || "Unknown" 
        };
    }));

    const enrichedVisitLogs = await Promise.all(visitResults.flat().sort((a,b) => b.createdAt - a.createdAt).slice(0, 100).map(async log => {
        const u = await ctx.db.get(log.userId);
        const s = await ctx.db.get(log.siteId);
        return { 
          ...log, 
          userName: u?.name || "Unknown", 
          siteName: (s as any)?.name || "Unknown" 
        };
    }));

    return {
      organizationName,
      assignedSites,
      attendance: attendanceResults.flat().sort((a,b) => (b.checkInTime || 0) - (a.checkInTime || 0)),
      patrolLogs: enrichedPatrolLogs,
      visitLogs: enrichedVisitLogs,
      stats,
      pendingVisitors,
      pendingVehicles,
    };
  },
});
