import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { pickPrimaryRoleForPermissions } from "./userAccess";
import { getAuthorizedSiteIds } from "./accessControl";

type VisitorStatus = "pending" | "approved" | "rejected" | "inside" | "exited";

function userRoleLabel(user: { roles?: string[] } | null | undefined, fallback: string): string {
    if (!user?.roles?.length) return fallback;
    return pickPrimaryRoleForPermissions(user.roles);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

export const createPatrolLog = mutation({
    args: {
        userId: v.id("users"),
        siteId: v.id("sites"),
        patrolPointId: v.optional(v.id("patrolPoints")),
        imageId: v.optional(v.string()),
        comment: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        distance: v.number(),
        organizationId: v.id("organizations"),
        sessionId: v.optional(v.id("patrolSessions")),
        issueDetails: v.optional(v.object({
            title: v.string(),
            priority: v.union(v.literal("Low"), v.literal("Medium"), v.literal("High")),
        })),
        patrolSubjectEmpId: v.optional(v.string()),
        patrolSubjectName: v.optional(v.string()),
        type: v.optional(v.string()),
        notes: v.optional(v.string()),
        severity: v.optional(v.union(v.literal("Low"), v.literal("Medium"), v.literal("High"))),
        imageUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { issueDetails, type, notes, severity, imageUrl, ...logData } = args;

        if (type === 'incident') {
            const incidentId = await ctx.db.insert("incidents", {
                guardId: args.userId,
                siteId: args.siteId,
                organizationId: args.organizationId,
                comment: notes || args.comment || "Reported as incident",
                severity: severity || "Medium",
                timestamp: Date.now(),
                imageId: imageUrl || args.imageId,
            });

            // Create notification
            const site = await ctx.db.get(args.siteId);
            await ctx.db.insert("notifications", {
                organizationId: args.organizationId,
                type: "issue",
                title: `New Incident: ${severity || "Medium"} Severity`,
                message: `${notes || args.comment || "No details"} at ${site?.name || "Unknown Site"}`,
                isRead: false,
                createdAt: Date.now(),
                referenceId: incidentId,
            });

            return incidentId;
        }

        const logId = await ctx.db.insert("patrolLogs", {
            ...logData,
            createdAt: Date.now(),
        });

        if (args.sessionId && args.patrolPointId) {
            const session = await ctx.db.get(args.sessionId);
            if (session) {
                const prev = session.scannedPoints || [];
                if (!prev.some((pid: any) => pid === args.patrolPointId)) {
                    await ctx.db.patch(args.sessionId, {
                        scannedPoints: [...prev, args.patrolPointId],
                    });
                }
            }
        }

        let allowedM = 200;
        if (args.patrolPointId) {
            const pt = await ctx.db.get(args.patrolPointId);
            if (pt?.pointRadiusMeters != null) allowedM = pt.pointRadiusMeters;
        }

        if (args.distance > allowedM) {
            const issueId = await ctx.db.insert("issues", {
                siteId: args.siteId,
                logId: logId,
                title: "Geo-fence Violation",
                description: `Patrol logged ${args.distance.toFixed(1)}m away from point (allowed ${allowedM}m).`,
                priority: "High",
                status: "open",
                timestamp: Date.now(),
                organizationId: args.organizationId,
            });

            // Create notification
            const site = await ctx.db.get(args.siteId);
            await ctx.db.insert("notifications", {
                organizationId: args.organizationId,
                type: "issue",
                title: "New Issue: Geo-fence Violation",
                message: `Priority: High at ${site?.name || "Unknown Site"}`,
                isRead: false,
                createdAt: Date.now(),
                referenceId: issueId,
            });
        }

        if (issueDetails) {
            const issueId = await ctx.db.insert("issues", {
                siteId: args.siteId,
                logId: logId,
                title: issueDetails.title,
                description: args.comment || "Reported during patrol.",
                priority: issueDetails.priority,
                status: "open",
                timestamp: Date.now(),
                organizationId: args.organizationId,
            });

            // Create notification
            const site = await ctx.db.get(args.siteId);
            await ctx.db.insert("notifications", {
                organizationId: args.organizationId,
                type: "issue",
                title: `New Issue: ${issueDetails.title}`,
                message: `Priority: ${issueDetails.priority} at ${site?.name || "Unknown Site"}`,
                isRead: false,
                createdAt: Date.now(),
                referenceId: issueId,
            });
        }

        return logId;
    },
});

export const listPatrolLogs = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);

        let logs: any[] = [];
        if (args.siteId) {
            if (authorizedSiteIds && !authorizedSiteIds.some(sid => sid.toString() === (args.siteId as any).toString())) {
                return [];
            }
            logs = await ctx.db
                .query("patrolLogs")
                .withIndex("by_site", (q) => q.eq("siteId", args.siteId as Id<"sites">))
                .order("desc")
                .collect();
        } else if (authorizedSiteIds || args.regionId || args.city) {
            let targetSiteIds = authorizedSiteIds;

            if (!targetSiteIds && args.organizationId) {
                const orgIds = [args.organizationId as Id<"organizations">];
                const childOrgs = await ctx.db.query("organizations")
                    .withIndex("by_parent_org", (q: any) => q.eq("parentOrganizationId", args.organizationId))
                    .collect();
                childOrgs.forEach(o => orgIds.push(o._id));

                const siteIds: Id<"sites">[] = [];
                for (const oid of orgIds) {
                    const osites = await ctx.db.query("sites").withIndex("by_org", q => q.eq("organizationId", oid)).collect();
                    osites.forEach(s => siteIds.push(s._id));
                }
                targetSiteIds = siteIds;
            }

            if (!targetSiteIds) {
                logs = await ctx.db.query("patrolLogs").order("desc").collect();
            } else {
                const logsPromises = targetSiteIds.map(async (sid) => {
                    const site = await ctx.db.get(sid);
                    if (!site) return [];
                    if (args.regionId && site.regionId !== args.regionId) return [];
                    if (args.city && site.city !== args.city) return [];

                    return await ctx.db.query("patrolLogs")
                        .withIndex("by_site", q => q.eq("siteId", sid))
                        .order("desc")
                        .take(100);
                });
                const results = await Promise.all(logsPromises);
                logs = results.flat().sort((a: any, b: any) => b.createdAt - a.createdAt);
            }
        } else if (args.organizationId) {
            logs = await ctx.db
                .query("patrolLogs")
                .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId as any))
                .order("desc")
                .collect();
        } else {
            logs = await ctx.db.query("patrolLogs").order("desc").collect();
        }

        return await Promise.all(
            logs!.map(async (log: any) => {
                const user: any = await ctx.db.get(log.userId);
                const site: any = await ctx.db.get(log.siteId);
                const point: any = log.patrolPointId ? await ctx.db.get(log.patrolPointId) : null;
                return {
                    ...log,
                    userName: user?.name ?? "Unknown",
                    siteName: site?.name ?? "Unknown",
                    pointName: point?.name ?? "General",
                    userRole: userRoleLabel(user, "Officer"),
                };
            })
        );
    },
});

export const getDailyOfficerCoverage = query({
    args: { 
        organizationId: v.id("organizations"),
        requestingUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfToday = today.getTime();

        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);

        const patrolLogs = await ctx.db
            .query("patrolLogs")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId as any))
            .filter((q) => q.gte(q.field("createdAt"), startOfToday))
            .collect();
        
        const filteredPatrolLogs = patrolLogs.filter(log => {
            if (!authorizedSiteIds) return true;
            return authorizedSiteIds.some(sid => sid.toString() === log.siteId.toString());
        });

        const visitLogs = await ctx.db
            .query("visitLogs")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId as any))
            .filter((q) => q.gte(q.field("createdAt"), startOfToday))
            .collect();

        const filteredVisitLogs = visitLogs.filter(log => {
            if (!authorizedSiteIds) return true;
            return authorizedSiteIds.some(sid => sid.toString() === log.siteId.toString());
        });

        const combinedLogs = [...filteredPatrolLogs, ...filteredVisitLogs];
        const userMap = new Map<string, any>();

        for (const log of combinedLogs) {
            const userId = log.userId.toString();
            if (!userMap.has(userId)) {
                const user = await ctx.db.get(log.userId);
                userMap.set(userId, {
                    userId,
                    userName: user?.name || "Unknown",
                    userRole: userRoleLabel(user, "Officer"),
                    sites: new Set<string>(),
                    lastVisit: 0,
                });
            }

            const userData = userMap.get(userId);
            const site = await ctx.db.get(log.siteId);
            if (site) {
                userData.sites.add(site.name);
            }
            const logTime = (log as any).createdAt || (log as any).timestamp || 0;
            if (logTime > userData.lastVisit) {
                userData.lastVisit = logTime;
            }
        }

        return Array.from(userMap.values()).map(u => ({
            ...u,
            sites: Array.from(u.sites),
            siteCount: u.sites.size
        })).sort((a, b) => b.lastVisit - a.lastVisit);
    },
});

export const listAllPatrolLogs = query({
    handler: async (ctx) => {
        const logs = await ctx.db.query("patrolLogs").order("desc").collect();

        return await Promise.all(
            logs.map(async (log) => {
                const user = await ctx.db.get(log.userId);
                const site = await ctx.db.get(log.siteId);
                const point = log.patrolPointId ? await ctx.db.get(log.patrolPointId) : null;
                let imageUrl: string | null = null;
                if (log.imageId) {
                    try {
                        imageUrl = await ctx.storage.getUrl(log.imageId as any);
                    } catch {
                        imageUrl = null;
                    }
                }
                return {
                    ...log,
                    userName: user?.name || "Unknown",
                    userRole: userRoleLabel(user, "SO"),
                    siteName: site?.name || "Unknown",
                    pointName: point?.name || "General Area",
                    imageUrl,
                };
            })
        );
    },
});

export const createVisitLog = mutation({
    args: {
        userId: v.id("users"),
        siteId: v.id("sites"),
        qrData: v.string(),
        remark: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        organizationId: v.id("organizations"),
        visitType: v.optional(v.string()),
        imageId: v.optional(v.string()),
        imageIds: v.optional(v.array(v.string())),
        checkInAccuracyM: v.optional(v.number()),
        distanceFromSiteM: v.optional(v.number()),
        issueDetails: v.optional(v.object({
            title: v.string(),
            priority: v.union(v.literal("Low"), v.literal("Medium"), v.literal("High")),
        })),
        visitorName: v.optional(v.string()),
        numberOfPeople: v.optional(v.number()),
        vehicleNumber: v.optional(v.string()),
        targetUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const { issueDetails, imageIds, ...logData } = args;
        const ids = imageIds?.length
            ? imageIds
            : args.imageId
              ? [args.imageId]
              : [];
        const primaryImage = ids[0] ?? args.imageId;
        const logId = await ctx.db.insert("visitLogs", {
            ...logData,
            imageId: primaryImage,
            imageIds: ids.length ? ids : undefined,
            status: args.visitType === 'Vehicle' ? "inside" : "pending",
            createdAt: Date.now(),
        });

        if (issueDetails) {
            const issueId = await ctx.db.insert("issues", {
                siteId: args.siteId,
                logId: logId as any,
                title: issueDetails.title,
                description: args.remark || "Reported during visit.",
                priority: issueDetails.priority,
                status: "open",
                timestamp: Date.now(),
                organizationId: args.organizationId,
            });

            // Create notification
            const site = await ctx.db.get(args.siteId);
            await ctx.db.insert("notifications", {
                organizationId: args.organizationId,
                type: "issue",
                title: `New Issue: ${issueDetails.title}`,
                message: `Priority: ${issueDetails.priority} at ${site?.name || "Unknown Site"}`,
                isRead: false,
                createdAt: Date.now(),
                referenceId: issueId,
            });
        }

        return logId;
    },
});

export const getVisitorsByStatus = query({
    args: {
        organizationId: v.id("organizations"),
        status: v.optional(
            v.union(
                v.literal("all"),
                v.literal("pending"),
                v.literal("approved"),
                v.literal("rejected"),
                v.literal("inside"),
                v.literal("exited")
            )
        ),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        const logs = await ctx.db
            .query("visitLogs")
            .withIndex("by_org", (q: any) => q.eq("organizationId", args.organizationId as any))
            .order("desc")
            .collect();

        const filtered = logs.filter((log: any) => {
            const allowed = !authorizedSiteIds || authorizedSiteIds.includes(log.siteId);
            if (!allowed) return false;
            const status = (log.status as VisitorStatus | undefined) || "pending";
            if (!args.status || args.status === "all") return true;
            return status === args.status;
        });

        return await Promise.all(
            filtered.map(async (log: any) => {
                const user = await ctx.db.get(log.userId);
                const site = await ctx.db.get(log.siteId);
                const targetUser = log.targetUserId ? await ctx.db.get(log.targetUserId) : null;
                const imageUrls = await visitLogImageUrls(ctx, log);
                const status: VisitorStatus = (log.status as VisitorStatus | undefined) || "pending";
                return {
                    ...log,
                    status,
                    userName: user?.name || "Unknown",
                    targetUserName: targetUser?.name || "N/A",
                    flat: site?.locationName || site?.name || "N/A",
                    photoUrl: imageUrls[0] ?? null,
                    idProofUrl: imageUrls[1] ?? imageUrls[0] ?? null,
                    imageUrls,
                };
            })
        );
    },
});

export const getVisitorStatusCounts = query({
    args: {
        organizationId: v.id("organizations"),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        const logs = await ctx.db
            .query("visitLogs")
            .withIndex("by_org", (q: any) => q.eq("organizationId", args.organizationId as any))
            .collect();

        const counts = {
            all: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
            inside: 0,
            exited: 0,
        };

        for (const log of logs) {
            if (authorizedSiteIds && !authorizedSiteIds.includes(log.siteId)) continue;
            counts.all += 1;
            const status = ((log.status as VisitorStatus | undefined) || "pending") as VisitorStatus;
            counts[status] += 1;
        }

        return counts;
    },
});

export const updateVisitorStatus = mutation({
    args: {
        logId: v.id("visitLogs"),
        status: v.union(
            v.literal("approved"),
            v.literal("rejected"),
            v.literal("inside"),
            v.literal("exited")
        ),
        imageId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const log = await ctx.db.get(args.logId);
        if (!log) throw new Error("Visitor record not found");

        const patch: Record<string, unknown> = { status: args.status };
        if (args.status === "inside") patch.entryTime = Date.now();
        if (args.status === "exited") {
            patch.exitTime = Date.now();
            if (args.imageId) patch.exitImageId = args.imageId;
        }
        await ctx.db.patch(args.logId, patch as any);
        return { ok: true };
    },
});

export const visitCheckOut = mutation({
    args: {
        logId: v.id("visitLogs"),
        userId: v.id("users"),
        latitude: v.number(),
        longitude: v.number(),
        accuracyM: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const log = await ctx.db.get(args.logId);
        if (!log) throw new Error("Visit log not found");
        if (log.userId !== args.userId) throw new Error("Not allowed to check out this visit");
        if (log.checkOutAt != null) throw new Error("Already checked out");
        const patch: Record<string, unknown> = {
            checkOutAt: Date.now(),
            checkOutLatitude: args.latitude,
            checkOutLongitude: args.longitude,
        };
        if (args.accuracyM != null && Number.isFinite(args.accuracyM)) {
            patch.checkOutAccuracyM = args.accuracyM;
        }
        await ctx.db.patch(args.logId, patch as any);
    },
});

async function visitLogImageUrls(ctx: any, log: { imageId?: string; imageIds?: string[] }): Promise<string[]> {
    const ids: string[] = [];
    if (log.imageIds?.length) {
        for (const id of log.imageIds) {
            if (id && !ids.includes(id)) ids.push(id);
        }
    }
    if (log.imageId && !ids.includes(log.imageId)) ids.push(log.imageId);
    const urls: string[] = [];
    for (const id of ids) {
        try {
            const u = await ctx.storage.getUrl(id as any);
            if (u) urls.push(u);
        } catch {
            /* skip */
        }
    }
    return urls;
}

export const countVisitLogsByType = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        let logs: any[] = [];
        if (args.siteId) {
            if (authorizedSiteIds && !authorizedSiteIds.includes(args.siteId)) return { total:0, trainer:0, dayCheck:0, nightCheck:0, general:0 };
            const sId = args.siteId as any;
            logs = await ctx.db.query("visitLogs").withIndex("by_site", (q:any) => q.eq("siteId", sId)).collect();
        } else if (args.regionId || args.city || authorizedSiteIds) {
            const sites = await (args.organizationId
                ? ctx.db.query("sites").withIndex("by_org", (q: any) => q.eq("organizationId", args.organizationId as any))
                : ctx.db.query("sites")
            ).collect();
            
            const filteredSites = sites.filter(s => {
                let matchesRegion = !args.regionId || s.regionId === args.regionId;
                let matchesCity = !args.city || s.city === args.city;
                let matchesAuth = !authorizedSiteIds || authorizedSiteIds.includes(s._id);
                return matchesRegion && matchesCity && matchesAuth;
            });
            
            const logsPromises = filteredSites.map(site => 
                ctx.db.query("visitLogs").withIndex("by_site", (q:any) => q.eq("siteId", site._id)).collect()
            );
            const logsResults = await Promise.all(logsPromises);
            logs = logsResults.flat();
        } else if (args.organizationId) {
            logs = await ctx.db
                .query("visitLogs")
                .withIndex("by_org", (q: any) => q.eq("organizationId", args.organizationId as any))
                .collect();
        } else {
            logs = await ctx.db.query("visitLogs").collect();
        }

        return {
            total: logs.length,
            trainer: logs.filter(l => (l as any).visitType === "Trainer").length,
            dayCheck: logs.filter(l => (l as any).visitType === "SiteCheckDay").length,
            nightCheck: logs.filter(l => (l as any).visitType === "SiteCheckNight").length,
            general: logs.filter(l => !(l as any).visitType || (l as any).visitType === "General").length,
            visitors: logs.filter(l => !(l as any).vehicleNumber).length,
            vehicles: logs.filter(l => !!(l as any).vehicleNumber).length,
        };
    },
});

export const listVisitLogs = query({
    args: { 
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        
        let logs: any[] = [];
        if (args.siteId) {
            if (authorizedSiteIds && !authorizedSiteIds.some(sid => sid.toString() === args.siteId?.toString())) return [];
            logs = await ctx.db
                .query("visitLogs")
                .withIndex("by_site", (q: any) => q.eq("siteId", args.siteId as any))
                .order("desc")
                .collect();
        } else if (args.regionId || args.city || authorizedSiteIds) {
            const siteQuery = ctx.db.query("sites");
            const sites = await (args.organizationId 
                ? siteQuery.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId as any))
                : siteQuery
            ).collect();
            
            const filteredSites = sites.filter(s => {
                let matchesRegion = !args.regionId || s.regionId === args.regionId;
                let matchesCity = !args.city || s.city === args.city;
                let matchesAuth = !authorizedSiteIds || authorizedSiteIds.includes(s._id);
                return matchesRegion && matchesCity && matchesAuth;
            });

            const logsPromises = filteredSites.map(site => 
                ctx.db.query("visitLogs")
                    .withIndex("by_site", (q:any) => q.eq("siteId", site._id))
                    .order("desc")
                    .take(100)
            );
            
            const logsResults = await Promise.all(logsPromises);
            logs = logsResults.flat().sort((a, b) => b.createdAt - a.createdAt);
        } else if (args.organizationId) {
            logs = await ctx.db
                .query("visitLogs")
                .withIndex("by_org", (q: any) => q.eq("organizationId", args.organizationId as any))
                .order("desc")
                .collect();
        } else {
            logs = await ctx.db.query("visitLogs").order("desc").collect();
        }

        return await Promise.all(
            logs.map(async (log) => {
                const user = await ctx.db.get(log.userId);
                const site = await ctx.db.get(log.siteId);
                const pointQuery = ctx.db.query("patrolPoints");
                const point = await (args.organizationId || log.organizationId
                    ? pointQuery.withIndex("by_org", (q) => q.eq("organizationId", (args.organizationId || log.organizationId) as any))
                    : pointQuery
                ).filter((q) => q.eq(q.field("qrCode"), log.qrData)).first();

                const imageUrls = await visitLogImageUrls(ctx, log);
                return {
                    ...log,
                    userName: user?.name || "Unknown",
                    userRole: userRoleLabel(user, "SO"),
                    siteName: site?.name || "Unknown",
                    pointName: site ? `${site.name}_${point?.name || "General Scan"}` : (point?.name || "General Scan"),
                    imageUrl: imageUrls[0] ?? null,
                    imageUrls,
                };
            })
        );
    },
});

async function filterVisitLogsForRegionSites(
    ctx: any,
    organizationId: Id<"organizations">,
    regionId: string,
    city: string | undefined,
    siteId: Id<"sites"> | undefined,
    fromMs: number,
    toMs: number,
    authorizedSiteIds: Id<"sites">[] | null
) {
    // Fetch sites within the requested organization
    let targetSites: any[] = await ctx.db
        .query("sites")
        .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
        .collect();

    // If restricted, filter targetSites by authorized list
    if (authorizedSiteIds) {
        const allowedSet = new Set(authorizedSiteIds.map((id: any) => id.toString()));
        targetSites = targetSites.filter((s: any) => allowedSet.has(s._id.toString()));
    }

    const rNorm = regionId.toLowerCase().trim();
    const siteIdsFiltered = targetSites
        .filter(
            (s: any) =>
                String(s.regionId || "")
                    .toLowerCase()
                    .trim() === rNorm &&
                (!city || s.city === city) &&
                (!siteId || s._id === siteId)
        )
        .map((s: any) => s._id.toString());
    const siteSet = new Set(siteIdsFiltered);

    const logs = await ctx.db
        .query("visitLogs")
        .withIndex("by_org_created", (q: any) =>
            q.eq("organizationId", organizationId).gte("createdAt", fromMs)
        )
        .filter((q: any) => q.lte(q.field("createdAt"), toMs))
        .collect();

    return logs.filter((l: any) => siteSet.has(l.siteId.toString()));
}

export const listVisitLogsPage = query({
    args: {
        organizationId: v.id("organizations"),
        regionId: v.string(),
        fromMs: v.number(),
        toMs: v.number(),
        city: v.optional(v.string()),
        siteId: v.optional(v.id("sites")),
        offset: v.number(),
        limit: v.number(),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const lim = Math.min(Math.max(args.limit, 1), 100);
        const off = Math.max(args.offset, 0);

        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        const filtered = await filterVisitLogsForRegionSites(
            ctx,
            args.organizationId,
            args.regionId,
            args.city,
            args.siteId,
            args.fromMs,
            args.toMs,
            authorizedSiteIds
        );
        filtered.sort((a: Doc<"visitLogs">, b: Doc<"visitLogs">) => b.createdAt - a.createdAt);
        
        const total = filtered.length;
        const slice = filtered.slice(off, off + lim);

        const items = await Promise.all(
            slice.map(async (log: any) => {
                const user: any = await ctx.db.get(log.userId);
                const site: any = await ctx.db.get(log.siteId);
                const imageUrls = await visitLogImageUrls(ctx, log);
                return {
                    ...log,
                    userName: user?.name ?? "Unknown",
                    siteName: site?.name ?? "Unknown",
                    imageUrls,
                    imageUrl: imageUrls[0] ?? null,
                };
            })
        );

        return { items, total, offset: off, limit: lim, hasMore: off + lim < total };
    },
});

export const listVisitLogsExport = query({
    args: {
        organizationId: v.id("organizations"),
        regionId: v.string(),
        fromMs: v.number(),
        toMs: v.number(),
        city: v.optional(v.string()),
        siteId: v.optional(v.id("sites")),
        maxRows: v.number(),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const max = Math.min(Math.max(args.maxRows, 1), 2500);
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        const filtered = await filterVisitLogsForRegionSites(
            ctx,
            args.organizationId,
            args.regionId,
            args.city,
            args.siteId,
            args.fromMs,
            args.toMs,
            authorizedSiteIds
        );
        filtered.sort((a: Doc<"visitLogs">, b: Doc<"visitLogs">) => b.createdAt - a.createdAt);
        const truncated = filtered.length > max;
        const slice = filtered.slice(0, max);

        const items = await Promise.all(
            slice.map(async (log: any) => {
                const user: any = await ctx.db.get(log.userId);
                const site: any = await ctx.db.get(log.siteId);
                const imageUrls = await visitLogImageUrls(ctx, log);
                return {
                    ...log,
                    userName: user?.name ?? "Unknown",
                    siteName: site?.name ?? "Unknown",
                    imageUrls,
                    imageUrl: imageUrls[0] ?? null,
                };
            })
        );
        return { items, truncated, totalMatching: filtered.length };
    },
});

export const listAllVisitLogs = query({
    handler: async (ctx) => {
        const logs = await ctx.db.query("visitLogs").order("desc").collect();
        return await Promise.all(
            logs.map(async (log) => {
                const user = await ctx.db.get(log.userId);
                const site = await ctx.db.get(log.siteId);
                const pointQuery = ctx.db.query("patrolPoints");
                const point = await (log.organizationId
                    ? pointQuery.withIndex("by_org", (q:any) => q.eq("organizationId", log.organizationId as any))
                    : pointQuery
                ).filter((q) => q.eq(q.field("qrCode"), log.qrData)).first();

                let imageUrl: string | null = null;
                if (log.imageId) {
                    try { imageUrl = await ctx.storage.getUrl(log.imageId as any); } catch { imageUrl = null; }
                }
                return {
                    ...log,
                    userName: user?.name || "Unknown",
                    userRole: userRoleLabel(user, "SO"),
                    siteName: site?.name || "Unknown",
                    pointName: site ? `${site.name}_${point?.name || "General Scan"}` : (point?.name || "General Scan"),
                    imageUrl,
                };
            })
        );
    },
});

export const listAllIssues = query({
    handler: async (ctx) => {
        const issues = await ctx.db.query("issues").order("desc").collect();
        return await Promise.all(
            issues.map(async (issue) => {
                const site = await ctx.db.get(issue.siteId);
                let reporterName = "Unknown";
                let reporterRole = "Staff";
                let locationContext = "General Visit";

                let logData: any = null;
                const pLog = await ctx.db.query("patrolLogs").filter((q:any) => q.eq(q.field("_id"), issue.logId as any)).first();
                if (pLog) {
                    logData = pLog;
                    locationContext = (pLog.patrolPointId ? (await ctx.db.get(pLog.patrolPointId))?.name : null) || "Patrol Area";
                } else {
                    const vLog = await ctx.db.query("visitLogs").filter((q:any) => q.eq(q.field("_id"), issue.logId as any)).first();
                    if (vLog) {
                        logData = vLog;
                        locationContext = "Visit Scan";
                    }
                }
                if (logData) {
                    const reporterDoc = await ctx.db.get(logData.userId as Id<"users">);
                    reporterName = reporterDoc?.name || "Unknown";
                    reporterRole = userRoleLabel(reporterDoc, "SO");
                }
                return { ...issue, siteName: site?.name || "Unknown Site", reporterName, reporterRole, locationContext };
            })
        );
    },
});

export const listIssuesByOrg = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        let issues;
        if (args.siteId) {
            if (authorizedSiteIds && !authorizedSiteIds.includes(args.siteId)) return [];
            issues = await ctx.db.query("issues").withIndex("by_site", (q:any) => q.eq("siteId", args.siteId as any)).order("desc").collect();
        } else if (args.organizationId) {
            issues = await ctx.db.query("issues").withIndex("by_org", (q:any) => q.eq("organizationId", args.organizationId as any)).order("desc").collect();
        } else {
            issues = await ctx.db.query("issues").order("desc").collect();
        }

        if (!args.siteId && (args.regionId || args.city || authorizedSiteIds)) {
             const siteQuery = ctx.db.query("sites");
             const sites = await (args.organizationId 
                ? siteQuery.withIndex("by_org", (q: any) => q.eq("organizationId", args.organizationId as any))
                : siteQuery
            ).collect();
            
            const filteredSites = sites.filter(s => {
                let matchesRegion = !args.regionId || s.regionId === args.regionId;
                let matchesCity = !args.city || s.city === args.city;
                let matchesAuth = !authorizedSiteIds || authorizedSiteIds.includes(s._id);
                return matchesRegion && matchesCity && matchesAuth;
            });

            const issuePromises = filteredSites.map(site => ctx.db.query("issues").withIndex("by_site", (q:any) => q.eq("siteId", site._id)).order("desc").collect());
            const issueResults = await Promise.all(issuePromises);
            issues = issueResults.flat().sort((a, b) => b.timestamp - a.timestamp);
        }

        return await Promise.all(
            issues.map(async (issue) => {
                const site = await ctx.db.get(issue.siteId);
                let reporterName = "Unknown";
                let reporterRole = "Staff";
                let locationContext = "General Visit";

                let logData: any = null;
                const pLog = await ctx.db.query("patrolLogs").filter((q:any) => q.eq(q.field("_id"), issue.logId as any)).first();
                if (pLog) {
                    logData = pLog;
                    locationContext = (pLog.patrolPointId ? (await ctx.db.get(pLog.patrolPointId))?.name : null) || "Patrol Area";
                } else {
                    const vLog = await ctx.db.query("visitLogs").filter((q:any) => q.eq(q.field("_id"), issue.logId as any)).first();
                    if (vLog) {
                        logData = vLog;
                        locationContext = "Visit Scan";
                    }
                }
                if (logData) {
                    const reporterDoc = await ctx.db.get(logData.userId as Id<"users">);
                    reporterName = reporterDoc?.name || "Unknown";
                    reporterRole = userRoleLabel(reporterDoc, "SO");
                }

                let reporterAttendance = "N/A";
                if (logData?.userId) {
                    const user = await ctx.db.get(logData.userId) as any;
                    if (user?.empId) {
                        const dateStr = new Date(issue.timestamp).toISOString().split('T')[0];
                        const attendance = await ctx.db.query("attendanceRecords").withIndex("by_empId_date", (q:any) => q.eq("empId", user.empId).eq("date", dateStr)).first();
                        if (attendance) reporterAttendance = attendance.status === "present" ? "Clocked In" : "Absent";
                    }
                }
                return { ...issue, siteName: site?.name || "Unknown Site", reporterName, reporterRole, locationContext, reporterAttendance };
            })
        );
    },
});

export const resolveIssue = mutation({
    args: { issueId: v.id("issues") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.issueId, { status: "closed" });
    },
});

export const createDualLog = mutation({
    args: {
        userId: v.id("users"),
        siteId: v.id("sites"),
        patrolPointId: v.optional(v.id("patrolPoints")),
        qrCode: v.optional(v.string()),
        imageId: v.optional(v.string()),
        comment: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        organizationId: v.id("organizations"),
        visitType: v.optional(v.string()),
        issueDetails: v.optional(v.object({
            title: v.string(),
            priority: v.union(v.literal("Low"), v.literal("Medium"), v.literal("High")),
        })),
    },
    handler: async (ctx, args) => {
        const { patrolPointId, qrCode, visitType, issueDetails, ...rest } = args;
        let finalPatrolPointId = patrolPointId;
        if (!finalPatrolPointId && qrCode) {
            const point = await ctx.db.query("patrolPoints").withIndex("by_site", (q:any) => q.eq("siteId", args.siteId)).filter((q:any) => q.eq(q.field("qrCode"), qrCode)).first();
            if (point) finalPatrolPointId = point._id;
        }

        const site = await ctx.db.get(args.siteId);
        if (!site) throw new Error("Site not found");

        let distance = 0;
        if (finalPatrolPointId) {
            const point = await ctx.db.get(finalPatrolPointId);
            if (point && point.latitude && point.longitude) {
                distance = calculateDistance(args.latitude, args.longitude, point.latitude, point.longitude);
            }
        } else {
            distance = calculateDistance(args.latitude, args.longitude, site.latitude, site.longitude);
        }

        const patrolLogId = await ctx.db.insert("patrolLogs", { ...rest, patrolPointId: finalPatrolPointId, distance, createdAt: Date.now() });

        if (issueDetails) {
            const issueId = await ctx.db.insert("issues", { 
                siteId: args.siteId, 
                logId: patrolLogId, 
                title: issueDetails.title, 
                description: args.comment || "Reported during patrol.", 
                priority: issueDetails.priority, 
                status: "open", 
                timestamp: Date.now(), 
                organizationId: args.organizationId 
            });

            // Create notification for admins
            await ctx.db.insert("notifications", {
                organizationId: args.organizationId,
                type: "issue",
                title: `New Issue: ${issueDetails.title}`,
                message: `Priority: ${issueDetails.priority} at ${site.name}`,
                isRead: false,
                createdAt: Date.now(),
                referenceId: issueId,
            });
        }
        return patrolLogId;
    },
});

export const countPatrolLogsByOrg = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        
        let targetSiteIds = authorizedSiteIds;
        if (!targetSiteIds && args.organizationId) {
            // Unrestricted fallback: get hierarchy
            const orgIds = [args.organizationId];
            const children = await ctx.db.query("organizations").withIndex("by_parent_org", q => q.eq("parentOrganizationId", args.organizationId)).collect();
            children.forEach(c => orgIds.push(c._id));
            const allSitesInTree = [];
            for (const oid of orgIds) {
                const results = await ctx.db.query("sites").withIndex("by_org", q => q.eq("organizationId", oid)).collect();
                allSitesInTree.push(...results);
            }
            targetSiteIds = allSitesInTree.map(s => s._id);
        }

        if (!targetSiteIds) return 0;

        const filtered = [];
        for (const sid of targetSiteIds) {
            const s = await ctx.db.get(sid);
            if (!s) continue;
            if (args.siteId && s._id !== args.siteId) continue;
            if (args.regionId && s.regionId !== args.regionId) continue;
            if (args.city && s.city !== args.city) continue;
            filtered.push(sid);
        }

        const promises = filtered.map(sid => ctx.db.query("patrolLogs").withIndex("by_site", q => q.eq("siteId", sid)).collect());
        const results = await Promise.all(promises);
        return results.flat().length;
    },
});

export const countIssuesByOrg = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        
        let targetSiteIds = authorizedSiteIds;
        if (!targetSiteIds && args.organizationId) {
            const orgIds = [args.organizationId];
            const children = await ctx.db.query("organizations").withIndex("by_parent_org", q => q.eq("parentOrganizationId", args.organizationId)).collect();
            children.forEach(c => orgIds.push(c._id));
            const allSitesInTree = [];
            for (const oid of orgIds) {
                const results = await ctx.db.query("sites").withIndex("by_org", q => q.eq("organizationId", oid)).collect();
                allSitesInTree.push(...results);
            }
            targetSiteIds = allSitesInTree.map(s => s._id);
        }

        if (!targetSiteIds) return 0;

        const filtered = [];
        for (const sid of targetSiteIds) {
            const s = await ctx.db.get(sid);
            if (!s) continue;
            if (args.siteId && s._id !== args.siteId) continue;
            if (args.regionId && s.regionId !== args.regionId) continue;
            if (args.city && s.city !== args.city) continue;
            filtered.push(sid);
        }

        const issuesPromises = filtered.map(siteId => ctx.db.query("issues").withIndex("by_site", (q:any) => q.eq("siteId", siteId)).collect());
        const issuesResults = await Promise.all(issuesPromises);
        return issuesResults.flat().length;
    },
});
