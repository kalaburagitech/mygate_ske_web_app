import { query } from "./_generated/server";
import { v } from "convex/values";

export const getActivePatrols = query({
    args: { organizationId: v.id("organizations") },
    handler: async (ctx, args) => {
        const activeSessions = await ctx.db
            .query("patrolSessions")
            .withIndex("by_org_status", (q) =>
                q.eq("organizationId", args.organizationId).eq("status", "active")
            )
            .collect();

        return await Promise.all(
            activeSessions.map(async (session) => {
                const user = await ctx.db.get(session.guardId);
                const site = await ctx.db.get(session.siteId);

                // Get last scan for this session
                const lastLog = await ctx.db
                    .query("patrolLogs")
                    .withIndex("by_site", (q) => q.eq("siteId", session.siteId))
                    .filter((q) => q.eq(q.field("userId"), session.guardId))
                    .order("desc")
                    .first();

                const lastPointName = lastLog?.patrolPointId ? (await ctx.db.get(lastLog.patrolPointId))?.name : "Started Duty";

                return {
                    ...session,
                    guardName: user?.name || "Unknown",
                    siteName: site?.name || "Unknown",
                    lastScanTime: lastLog?.createdAt || session.startTime,
                    lastPointName: lastPointName
                };
            })
        );
    },
});

export const getMissedPoints = query({
    args: { siteId: v.id("sites") },
    handler: async (ctx, args) => {
        const allPoints = await ctx.db
            .query("patrolPoints")
            .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
            .collect();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const missedPoints = [];
        for (const point of allPoints) {
            const hasScanToday = await ctx.db
                .query("patrolLogs")
                .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
                .filter((q) =>
                    q.and(
                        q.eq(q.field("patrolPointId"), point._id),
                        q.gte(q.field("createdAt"), today.getTime())
                    )
                )
                .first();

            if (!hasScanToday) {
                missedPoints.push(point);
            }
        }

        return missedPoints;
    },
});
