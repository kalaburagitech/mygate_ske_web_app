import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthorizedSiteIds } from "./accessControl";

/** One QR string per org: remove any other patrol point using the same code before insert/update. */
async function removeOtherPointsWithSameQr(
    ctx: { db: any },
    organizationId: Id<"organizations">,
    qrCode: string,
    keepId?: Id<"patrolPoints">
) {
    const norm = qrCode.trim();
    if (!norm) return;
    const pts = await ctx.db
        .query("patrolPoints")
        .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
        .collect();
    for (const p of pts) {
        if (p.qrCode.trim() === norm && (!keepId || p._id !== keepId)) {
            await ctx.db.delete(p._id);
        }
    }
}

export const createPoint = mutation({
    args: {
        siteId: v.id("sites"),
        name: v.string(),
        organizationId: v.id("organizations"),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        imageId: v.optional(v.string()),
        qrCode: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const site = await ctx.db.get(args.siteId);
        const siteName = site?.name || "Unknown Site";

        const qrCode =
            args.qrCode?.trim() ||
            `${args.siteId.slice(0, 4)}-${args.name.replace(/\s+/g, "-").toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        await removeOtherPointsWithSameQr(ctx, args.organizationId, qrCode);

        /** Default checkpoint radius for every new QR (not site `allowedRadius`). Editable later via updatePoint. */
        const pointRadiusMeters = 200;

        const row: Record<string, unknown> = {
            siteId: args.siteId,
            siteName,
            name: args.name,
            qrCode,
            organizationId: args.organizationId,
            pointRadiusMeters,
            createdAt: Date.now(),
        };
        if (args.imageId) row.imageId = args.imageId;
        if (args.latitude !== undefined && Number.isFinite(args.latitude)) row.latitude = args.latitude;
        if (args.longitude !== undefined && Number.isFinite(args.longitude)) row.longitude = args.longitude;

        return await ctx.db.insert("patrolPoints", row as any);
    },
});

export const createBatchPoints = mutation({
    args: {
        baseName: v.string(),
        count: v.number(),
        siteId: v.id("sites"),
        latitude: v.number(),
        longitude: v.number(),
        organizationId: v.id("organizations"),
        imageId: v.optional(v.string()),
        pointRadiusMeters: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // Fetch the site once for all batch points
        const site = await ctx.db.get(args.siteId);
        const siteName = site?.name || "Unknown Site";
        const r =
            args.pointRadiusMeters != null && Number.isFinite(args.pointRadiusMeters)
                ? Math.max(1, args.pointRadiusMeters)
                : 200;

        const generatedIds = [] as string[];
        for (let i = 1; i <= Math.min(Math.max(args.count, 1), 100); i++) {
            const name = `${args.baseName}-${i}`;
            const qrCode = `${args.siteId.slice(0, 4)}-${name.replace(/\s+/g, '-').toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const record = await ctx.db.insert("patrolPoints", {
                siteId: args.siteId,
                siteName,
                name,
                latitude: args.latitude,
                longitude: args.longitude,
                organizationId: args.organizationId,
                imageId: args.imageId,
                qrCode,
                pointRadiusMeters: r,
                createdAt: Date.now(),
            });
            generatedIds.push(record);
        }
        return generatedIds;
    },
});

export const createPointsFromList = mutation({
    args: {
        points: v.array(v.object({ name: v.string(), qrCode: v.string() })),
        siteId: v.id("sites"),
        organizationId: v.id("organizations"),
    },
    handler: async (ctx, args) => {
        const site = await ctx.db.get(args.siteId);
        if (!site) throw new Error("Site not found");
        const siteName = site.name;

        const results = [];
        for (const p of args.points) {
            await removeOtherPointsWithSameQr(ctx, args.organizationId, p.qrCode);
            const id = await ctx.db.insert("patrolPoints", {
                siteId: args.siteId,
                siteName,
                name: p.name,
                qrCode: p.qrCode,
                organizationId: args.organizationId,
                pointRadiusMeters: 200,
                createdAt: Date.now(),
            });
            results.push(id);
        }
        return results;
    },
});

// Internal mutation to migrate existing records
export const migrateSiteNames = internalMutation({
    handler: async (ctx) => {
        const points = await ctx.db.query("patrolPoints").collect();
        let updatedCount = 0;

        for (const point of points) {
            if (!point.siteName && point.siteId) {
                const site = await ctx.db.get(point.siteId);
                if (site && site.name) {
                    await ctx.db.patch(point._id, {
                        siteName: site.name,
                    });
                    updatedCount++;
                } else {
                    await ctx.db.patch(point._id, {
                        siteName: "Unknown Site",
                    });
                    updatedCount++;
                }
            }
        }

        return { updated: updatedCount };
    },
});

export const listAll = query({
    handler: async (ctx) => {
        const points = await ctx.db.query("patrolPoints").collect();

        // Ensure all points have siteName (for backward compatibility)
        const pointsWithSiteName = await Promise.all(
            points.map(async (point) => {
                if (point.siteName) {
                    return point;
                }
                // Fetch site name for old records
                const site = await ctx.db.get(point.siteId);
                return {
                    ...point,
                    siteName: site?.name || "Unknown Site",
                };
            })
        );

        return pointsWithSiteName;
    },
});

export const listByOrg = query({
    args: { organizationId: v.id("organizations"), requestingUserId: v.optional(v.id("users")) },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        const points = await ctx.db
            .query("patrolPoints")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        let filtered = points;
        if (authorizedSiteIds) {
            const authSet = new Set(authorizedSiteIds);
            filtered = points.filter((p) => authSet.has(p.siteId as any));
        }

        // Ensure all points have siteName (for backward compatibility)
        const pointsWithSiteName = await Promise.all(
            filtered.map(async (point) => {
                if (point.siteName) {
                    return point;
                }
                // Fetch site name for old records
                const site = await ctx.db.get(point.siteId);
                return {
                    ...point,
                    siteName: site?.name || "Unknown Site",
                };
            })
        );

        return pointsWithSiteName;
    },
});

export const listBySite = query({
    args: { siteId: v.id("sites") },
    handler: async (ctx, args) => {
        const points = await ctx.db
            .query("patrolPoints")
            .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
            .collect();

        // Get the site name once (since all points have the same siteId)
        const site = await ctx.db.get(args.siteId);
        const siteName = site?.name || "Unknown Site";

        // Add siteName to each point
        const pointsWithSiteName = points.map(point => ({
            ...point,
            siteName: point.siteName || siteName,
        }));

        return pointsWithSiteName;
    },
});

export const updatePoint = mutation({
    args: {
        id: v.id("patrolPoints"),
        name: v.optional(v.string()),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        imageId: v.optional(v.string()),
        siteId: v.optional(v.id("sites")),
        qrCode: v.optional(v.string()),
        organizationId: v.optional(v.id("organizations")),
        pointRadiusMeters: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;
        const existing = await ctx.db.get(id);
        if (!existing) throw new Error("Patrol point not found");

        const orgId = (updates.organizationId ?? existing.organizationId) as Id<"organizations">;
        if (updates.qrCode !== undefined && updates.qrCode.trim()) {
            await removeOtherPointsWithSameQr(ctx, orgId, updates.qrCode, id);
        }

        let siteName;
        if (updates.siteId) {
            const site = await ctx.db.get(updates.siteId);
            siteName = site?.name || "Unknown Site";
        }

        const finalUpdates: Record<string, unknown> = {};

        if (updates.name !== undefined) finalUpdates.name = updates.name;
        if (updates.latitude !== undefined) finalUpdates.latitude = updates.latitude;
        if (updates.longitude !== undefined) finalUpdates.longitude = updates.longitude;
        if (updates.imageId !== undefined) finalUpdates.imageId = updates.imageId;
        if (updates.siteId !== undefined) finalUpdates.siteId = updates.siteId;
        if (updates.qrCode !== undefined) finalUpdates.qrCode = updates.qrCode.trim();
        if (updates.organizationId !== undefined) finalUpdates.organizationId = updates.organizationId;
        if (updates.pointRadiusMeters !== undefined && Number.isFinite(updates.pointRadiusMeters)) {
            finalUpdates.pointRadiusMeters = Math.max(1, updates.pointRadiusMeters);
        }
        if (siteName) finalUpdates.siteName = siteName;

        await ctx.db.patch(id, finalUpdates as any);
    },
});

export const removePoint = mutation({
    args: { id: v.id("patrolPoints") },
    handler: async (ctx, args) => {
        return await ctx.db.delete(args.id);
    },
});

export const searchPoints = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        searchQuery: v.optional(v.string()),
        paginationOpts: v.object({
            cursor: v.union(v.string(), v.null()),
            numItems: v.float64(),
            id: v.optional(v.float64()),
        }),
        requestingUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        // Fetch patrol points for org (and optionally site), then apply optional search filter.
        let points;
        if (args.organizationId) {
            points = await ctx.db
                .query("patrolPoints")
                .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId as Id<"organizations">))
                .collect();
        } else {
            points = await ctx.db.query("patrolPoints").collect();
        }

        if (authorizedSiteIds) {
            const authSet = new Set(authorizedSiteIds);
            points = points.filter((p) => authSet.has(p.siteId as any));
        }

        if (args.siteId) {
            points = points.filter((p) => p.siteId === args.siteId);
        }

        if (args.searchQuery && args.searchQuery.trim()) {
            const lower = args.searchQuery.toLowerCase();
            points = points.filter((p) =>
                p.name.toLowerCase().includes(lower) ||
                (p.siteName && p.siteName.toLowerCase().includes(lower)) ||
                p.qrCode.toLowerCase().includes(lower)
            );
        }

        // Ensure all points have siteName (for backward compatibility)
        const pointsWithSiteName = await Promise.all(
            points.map(async (point) => {
                if (point.siteName) {
                    return point;
                }
                // Fetch site name for old records
                const site = await ctx.db.get(point.siteId);
                return {
                    ...point,
                    siteName: site?.name || "Unknown Site",
                };
            })
        );

        // Pagination
        const start = args.paginationOpts.cursor ? parseInt(args.paginationOpts.cursor) : 0;
        const numItems = args.paginationOpts.numItems;
        const paginated = pointsWithSiteName.slice(start, start + numItems);

        const isDone = start + paginated.length >= pointsWithSiteName.length;
        const continueCursor = isDone ? "" : (start + paginated.length).toString();

        return {
            page: paginated,
            continueCursor,
            isDone,
        };
    },
});

export const countByOrg = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        requestingUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        const orgId = args.organizationId;
        const sId = args.siteId;

        if (sId) {
            const points = await ctx.db
                .query("patrolPoints")
                .withIndex("by_site", (q) => q.eq("siteId", sId))
                .collect();
            return points.length;
        }

        const q = orgId
            ? ctx.db.query("patrolPoints").withIndex("by_org", (q) => q.eq("organizationId", orgId))
            : ctx.db.query("patrolPoints");
        let points = await q.collect();

        if (authorizedSiteIds) {
            const authSet = new Set(authorizedSiteIds);
            points = points.filter((p) => authSet.has(p.siteId as any));
        }

        return points.length;
    },
});