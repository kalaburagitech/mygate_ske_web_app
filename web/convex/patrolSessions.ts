import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthorizedSiteIds } from "./accessControl";

export const startSession = mutation({
    args: {
        guardId: v.id("users"),
        siteId: v.id("sites"),
        organizationId: v.id("organizations"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("patrolSessions", {
            guardId: args.guardId,
            siteId: args.siteId,
            organizationId: args.organizationId,
            status: "active",
            startTime: Date.now(),
            scannedPoints: [],
        });
    },
});

export const endSession = mutation({
    args: { sessionId: v.id("patrolSessions") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.sessionId, {
            status: "completed",
            endTime: Date.now(),
        });
    },
});

export const getSession = query({
    args: { sessionId: v.id("patrolSessions") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.sessionId);
    },
});

export const listPatrolRoundsExport = query({
    args: {
        organizationId: v.id("organizations"),
        fromMs: v.number(),
        toMs: v.number(),
        siteIds: v.optional(v.array(v.id("sites"))),
        maxRows: v.optional(v.number()),
        requestingUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        
        let sessions = await ctx.db
            .query("patrolSessions")
            .withIndex("by_org_end", (q) =>
                q
                    .eq("organizationId", args.organizationId)
                    .gte("endTime", args.fromMs)
                    .lte("endTime", args.toMs)
            )
            .filter((q) => q.eq(q.field("status"), "completed"))
            .collect();

        if (args.siteIds && args.siteIds.length > 0) {
            const set = new Set(args.siteIds.map((id) => id.toString()));
            sessions = sessions.filter((s) => set.has(s.siteId.toString()));
        }

        if (authorizedSiteIds) {
            const authSet = new Set(authorizedSiteIds.map(id => id.toString()));
            sessions = sessions.filter((s) => authSet.has(s.siteId.toString()));
        }

        sessions.sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0));

        const rows = await Promise.all(
            sessions.map(async (s) => {
                const logs = await ctx.db
                    .query("patrolLogs")
                    .withIndex("by_session", (q) => q.eq("sessionId", s._id))
                    .collect();
                if (logs.length === 0) return null;
                const user = await ctx.db.get(s.guardId);
                const site = await ctx.db.get(s.siteId);
                const pointNames: string[] = [];
                for (const log of logs.sort((a, b) => a.createdAt - b.createdAt)) {
                    if (log.patrolPointId) {
                        const p = await ctx.db.get(log.patrolPointId);
                        if (p) pointNames.push(p.name);
                    }
                }
                const durationMs = (s.endTime ?? s.startTime) - s.startTime;
                const totalDistanceM = logs.reduce((acc, l) => acc + l.distance, 0);
                return {
                    sessionId: s._id,
                    siteId: s.siteId,
                    siteName: site?.name ?? "Site",
                    regionId: site?.regionId ?? "",
                    city: site?.city ?? "",
                    guardName: user?.name ?? "Unknown",
                    guardEmpId: user?.id ?? user?.mobileNumber ?? "",
                    startTime: s.startTime,
                    endTime: s.endTime,
                    scanCount: logs.length,
                    pointTrail: pointNames.join(" → "),
                    durationMs,
                    totalDistanceM: Math.round(totalDistanceM * 10) / 10,
                };
            })
        );
        const items = rows.filter((r): r is NonNullable<typeof r> => r != null);
        return {
            items,
            truncated: items.length < sessions.length,
            totalMatching: sessions.length
        };
    },
});

export const listPatrolRoundsPage = query({
    args: {
        organizationId: v.id("organizations"),
        fromMs: v.number(),
        toMs: v.number(),
        siteIds: v.optional(v.array(v.id("sites"))),
        offset: v.number(),
        limit: v.number(),
        requestingUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const lim = Math.min(Math.max(args.limit, 1), 100);
        const off = Math.max(args.offset, 0);
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);

        let sessions = await ctx.db
            .query("patrolSessions")
            .withIndex("by_org_end", (q) =>
                q
                    .eq("organizationId", args.organizationId)
                    .gte("endTime", args.fromMs)
                    .lte("endTime", args.toMs)
            )
            .filter((q) => q.eq(q.field("status"), "completed"))
            .collect();

        if (args.siteIds && args.siteIds.length > 0) {
            const set = new Set(args.siteIds.map((id) => id.toString()));
            sessions = sessions.filter((s) => set.has(s.siteId.toString()));
        }

        if (authorizedSiteIds) {
            const authSet = new Set(authorizedSiteIds.map(id => id.toString()));
            sessions = sessions.filter((s) => authSet.has(s.siteId.toString()));
        }

        sessions.sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0));
        const total = sessions.length;
        const slice = sessions.slice(off, off + lim);

        const rows = await Promise.all(
            slice.map(async (s) => {
                const logs = await ctx.db
                    .query("patrolLogs")
                    .withIndex("by_session", (q) => q.eq("sessionId", s._id))
                    .collect();
                if (logs.length === 0) return null;
                const user = await ctx.db.get(s.guardId);
                const site = await ctx.db.get(s.siteId);
                const pointNames: string[] = [];
                for (const log of logs.sort((a, b) => a.createdAt - b.createdAt)) {
                    if (log.patrolPointId) {
                        const p = await ctx.db.get(log.patrolPointId);
                        if (p) pointNames.push(p.name);
                    }
                }
                const durationMs = (s.endTime ?? s.startTime) - s.startTime;
                const totalDistanceM = logs.reduce((acc, l) => acc + l.distance, 0);
                return {
                    sessionId: s._id,
                    siteId: s.siteId,
                    siteName: site?.name ?? "Site",
                    regionId: site?.regionId,
                    city: site?.city,
                    guardName: user?.name ?? "Unknown",
                    guardEmpId: user?.id ?? user?.mobileNumber ?? "",
                    startTime: s.startTime,
                    endTime: s.endTime,
                    scanCount: logs.length,
                    pointTrail: pointNames.join(" → "),
                    durationMs,
                    totalDistanceM: Math.round(totalDistanceM * 10) / 10,
                };
            })
        );

        return {
            items: rows.filter((r): r is NonNullable<typeof r> => r != null),
            total,
            offset: off,
            limit: lim,
            hasMore: off + lim < total,
        };
    },
});

export const getSessionDetail = query({
    args: { sessionId: v.id("patrolSessions") },
    handler: async (ctx, args) => {
        const s = await ctx.db.get(args.sessionId);
        if (!s) return null;

        const user = await ctx.db.get(s.guardId);
        const site = await ctx.db.get(s.siteId);
        const sitePoints = await ctx.db
            .query("patrolPoints")
            .withIndex("by_site", (q: any) => q.eq("siteId", s.siteId))
            .collect();

        const logs = await ctx.db
            .query("patrolLogs")
            .withIndex("by_session", (q: any) => q.eq("sessionId", s._id))
            .collect();
        logs.sort((a, b) => a.createdAt - b.createdAt);

        const logDetails = await Promise.all(
            logs.map(async (log, idx) => {
                let pointName = "";
                let allowedRadiusM = 200;
                const pt = log.patrolPointId ? await ctx.db.get(log.patrolPointId) : null;
                if (pt) {
                    pointName = pt.name ?? "";
                    if (pt.pointRadiusMeters != null) allowedRadiusM = pt.pointRadiusMeters;
                }
                const withinRange = log.distance <= allowedRadiusM;
                const imageUrl = log.imageId ? await ctx.storage.getUrl(log.imageId as any) : null;
                return {
                    order: idx + 1,
                    logId: log._id,
                    pointName,
                    comment: log.comment,
                    imageId: log.imageId,
                    imageUrl,
                    distance: log.distance,
                    allowedRadiusM,
                    withinRange,
                    createdAt: log.createdAt,
                    latitude: log.latitude,
                    longitude: log.longitude,
                };
            })
        );

        const endT = s.endTime ?? s.startTime;
        const uniquePoints = new Set(logs.map((l) => l.patrolPointId).filter(Boolean) as string[]);

        return {
            session: {
                id: s._id,
                startTime: s.startTime,
                endTime: s.endTime,
                status: s.status,
                durationMs: endT - s.startTime,
            },
            siteName: site?.name ?? "",
            totalSitePoints: sitePoints.length,
            uniqueScannedPoints: uniquePoints.size,
            scanCount: logs.length,
            totalDistanceM: Math.round(logs.reduce((a, l) => a + l.distance, 0) * 10) / 10,
            guardName: user?.name ?? "",
            guardEmpId: user?.id ?? user?.mobileNumber ?? "",
            guardUserId: s.guardId,
            logs: logDetails,
        };
    },
});
