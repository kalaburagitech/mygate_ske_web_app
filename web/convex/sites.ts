import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { ensureMainOrganization } from "./mainOrganization";
import { isOrgAdminRoles } from "./userAccess";
import { getAuthorizedSiteIds } from "./accessControl";

const shiftValidator = v.object({
    name: v.string(),
    start: v.string(),
    end: v.string(),
    strength: v.number(),
});

// Site Management
export const createSite = mutation({
    args: {
        name: v.string(),
        locationName: v.optional(v.string()),
        latitude: v.number(),
        longitude: v.number(),
        allowedRadius: v.number(),
        organizationId: v.optional(v.id("organizations")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        shiftStart: v.optional(v.string()),
        shiftEnd: v.optional(v.string()),
        shifts: v.optional(v.array(shiftValidator)),
    },
    handler: async (ctx, args) => {
        const { organizationId: providedOrgId, ...rest } = args;
        const fallbackOrgId = await ensureMainOrganization(ctx);
        const organizationId = providedOrgId ?? fallbackOrgId;
        
        const shifts = args.shifts?.length
            ? args.shifts
            : (args.shiftStart && args.shiftEnd
                ? [{ name: "General Shift", start: args.shiftStart, end: args.shiftEnd, strength: 0 }]
                : []);

        return await ctx.db.insert("sites", {
            ...rest,
            organizationId,
            shifts,
        });
    },
});

export const updateSite = mutation({
    args: {
        id: v.id("sites"),
        name: v.string(),
        locationName: v.optional(v.string()),
        latitude: v.number(),
        longitude: v.number(),
        allowedRadius: v.number(),
        organizationId: v.optional(v.id("organizations")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        shiftStart: v.optional(v.string()),
        shiftEnd: v.optional(v.string()),
        shifts: v.optional(v.array(shiftValidator)),
    },
    handler: async (ctx, args) => {
        const { id, organizationId: providedOrgId, ...data } = args;
        const fallbackOrgId = await ensureMainOrganization(ctx);
        const organizationId = providedOrgId ?? fallbackOrgId;
        
        const shifts = data.shifts?.length
            ? data.shifts
            : (data.shiftStart && data.shiftEnd
                ? [{ name: "General Shift", start: data.shiftStart, end: data.shiftEnd, strength: 0 }]
                : []);

        await ctx.db.patch(id, {
            ...data,
            organizationId,
            shifts,
        });
    },
});

export const removeSite = mutation({
    args: { id: v.id("sites") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const listSitesByIds = query({
    args: { ids: v.array(v.id("sites")) },
    handler: async (ctx, args) => {
        const sites = [];
        for (const id of args.ids) {
            const site = await ctx.db.get(id);
            if (site) sites.push(site);
        }
        return sites;
    },
});

export const listAll = query({
    handler: async (ctx) => {
        return await ctx.db.query("sites").collect();
    },
});

export const countAll = query({
    handler: async (ctx) => {
        const sites = await ctx.db.query("sites").collect();
        return sites.length;
    },
});

export const listSitesByOrg = query({
    args: { 
        organizationId: v.id("organizations"),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        
        // Find all organization IDs in the requested tree
        const orgIds = [args.organizationId];
        const childOrgs = await ctx.db.query("organizations")
            .withIndex("by_parent_org", (q: any) => q.eq("parentOrganizationId", args.organizationId))
            .collect();
        childOrgs.forEach(o => orgIds.push(o._id));

        // Collect sites from all these organizations
        const allSitesInTree = [];
        for (const oid of orgIds) {
            const sites = await ctx.db
                .query("sites")
                .withIndex("by_org", (q) => q.eq("organizationId", oid))
                .collect();
            allSitesInTree.push(...sites);
        }
        
        // If we have specific authorized sites (restricted role or scoped admin)
        if (authorizedSiteIds) {
            const allowedSet = new Set(authorizedSiteIds.map(id => id.toString()));
            return allSitesInTree.filter(s => allowedSet.has(s._id.toString()));
        }

        // Fallback for cases where no authorizedSiteIds list is returned (usually wide admins)
        return allSitesInTree;
    },
});

export const listSitesByUser = query({
    args: { 
        userId: v.id("users"),
        regionId: v.optional(v.string()),
        city: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.userId);
        if (!authorizedSiteIds) return [];

        const sites = [];
        for (const sid of authorizedSiteIds) {
            const site = await ctx.db.get(sid);
            if (site) {
                let matchesRegion = true;
                if (args.regionId) {
                    matchesRegion = site.regionId === args.regionId;
                }
                let matchesCity = true;
                if (args.city) {
                    matchesCity = site.city === args.city;
                }

                if (matchesRegion && matchesCity) {
                    sites.push(site);
                }
            }
        }
        return sites;
    },
});

export const getSite = query({
    args: { id: v.id("sites") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// Patrol Point Management
export const createPatrolPoint = mutation({
    args: {
        siteId: v.id("sites"),
        name: v.string(),
        qrCode: v.string(),
        organizationId: v.id("organizations"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("patrolPoints", args);
    },
});

export const listPatrolPointsBySite = query({
    args: { siteId: v.id("sites") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("patrolPoints")
            .filter((q) => q.eq(q.field("siteId"), args.siteId))
            .collect();
    },
});

export const countByOrg = query({
    args: {
        organizationId: v.id("organizations"),
        siteId: v.optional(v.id("sites")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users"))
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        
        if (args.siteId) {
            const site = await ctx.db.get(args.siteId);
            if (!site) return 0;
            if (authorizedSiteIds) {
                const allowedSet = new Set(authorizedSiteIds.map(id => id.toString()));
                if (!allowedSet.has(args.siteId.toString())) return 0;
            }
            return 1;
        }

        // Find all organization IDs in the requested tree
        const orgIdsJoin = [args.organizationId];
        const childOrgs = await ctx.db.query("organizations")
            .withIndex("by_parent_org", (q: any) => q.eq("parentOrganizationId", args.organizationId))
            .collect();
        childOrgs.forEach(o => orgIdsJoin.push(o._id));

        let sites: any[] = [];
        for (const oid of orgIdsJoin) {
            const orgSites = await ctx.db
                .query("sites")
                .withIndex("by_org", (q) => q.eq("organizationId", oid))
                .collect();
            sites.push(...orgSites);
        }

        if (authorizedSiteIds) {
            const allowedSet = new Set(authorizedSiteIds.map(id => id.toString()));
            sites = sites.filter(s => allowedSet.has(s._id.toString()));
        }

        if (args.regionId) {
            sites = sites.filter(s => s.regionId === args.regionId);
        }

        if (args.city) {
            sites = sites.filter(s => s.city === args.city);
        }

        return sites.length;
    },
});

export const searchSites = query({
    args: v.object({
        organizationId: v.id("organizations"),
        searchQuery: v.optional(v.string()),
        paginationOpts: v.optional(
            v.object({
                cursor: v.optional(v.union(v.string(), v.null())),
                numItems: v.number(),
            })
        ),
    }),
    handler: async (ctx, args) => {
        // First, get all sites for this organization
        let sites = await ctx.db
            .query("sites")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        // Apply search filter if provided and not empty
        if (args.searchQuery && args.searchQuery.trim()) {
            const lower = args.searchQuery.toLowerCase().trim();
            sites = sites.filter((s) =>
                s.name.toLowerCase().includes(lower) ||
                s.locationName?.toLowerCase().includes(lower) ||
                s.city?.toLowerCase().includes(lower) ||
                s.regionId?.toLowerCase().includes(lower)
            );
        }

        // If no pagination options, return all matching sites
        if (!args.paginationOpts) {
            return {
                page: sites,
                isDone: true,
                continueCursor: "",
            };
        }

        const start = args.paginationOpts.cursor ? parseInt(args.paginationOpts.cursor) : 0;
        const numItems = args.paginationOpts.numItems;
        const paginatedSites = sites.slice(start, start + numItems);

        const isDone = start + paginatedSites.length >= sites.length;
        const continueCursor = isDone ? "" : (start + paginatedSites.length).toString();

        return {
            page: paginatedSites,
            isDone,
            continueCursor,
        };
    },
});
