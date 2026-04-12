import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { ensureMainOrganization } from "./mainOrganization";
import type { Doc, Id } from "./_generated/dataModel";

function normCity(s: string): string {
    return s.trim();
}

/**
 * When region cities change: rename (1 removed + 1 added heuristically), or remove city
 * from users.cities / clear sites.city under this regionId.
 */
async function syncCityAssignmentsForRegion(
    ctx: MutationCtx,
    regionIdKey: string,
    previousCities: string[],
    nextCities: string[]
): Promise<void> {
    const oldNorm = new Set(previousCities.map(normCity).filter(Boolean));
    const newNorm = new Set(nextCities.map(normCity).filter(Boolean));
    const removedNorm = [...oldNorm].filter((c) => !newNorm.has(c));
    const addedNorm = nextCities.map(normCity).filter(Boolean).filter((c) => !oldNorm.has(c));
    const addedUnique = [...new Set(addedNorm)];

    const usersInRegion = await ctx.db
        .query("users")
        .withIndex("by_region", (q) => q.eq("regionId", regionIdKey))
        .collect();
    const sitesInRegion = await ctx.db
        .query("sites")
        .withIndex("by_region", (q) => q.eq("regionId", regionIdKey))
        .collect();

    if (removedNorm.length === 1 && addedUnique.length === 1) {
        const fromN = removedNorm[0];
        const toDisplay = nextCities.find((c) => normCity(c) === addedUnique[0]) ?? addedUnique[0];
        for (const u of usersInRegion) {
            if (!u.cities?.length) continue;
            let changed = false;
            const next = u.cities.map((c) => {
                if (normCity(c) === fromN) {
                    changed = true;
                    return toDisplay;
                }
                return c;
            });
            if (changed) {
                await ctx.db.patch(u._id, {
                    cities: next.length ? next : undefined,
                });
            }
        }
        for (const s of sitesInRegion) {
            if (s.city != null && normCity(s.city) === fromN) {
                await ctx.db.patch(s._id, { city: toDisplay });
            }
        }
        return;
    }

    const removedSet = new Set(removedNorm);
    if (removedSet.size === 0) return;

    for (const u of usersInRegion) {
        if (!u.cities?.length) continue;
        const next = u.cities.filter((c) => !removedSet.has(normCity(c)));
        if (next.length !== u.cities.length) {
            await ctx.db.patch(u._id, {
                cities: next.length ? next : undefined,
            });
        }
    }
    for (const s of sitesInRegion) {
        if (s.city != null && removedSet.has(normCity(s.city))) {
            await ctx.db.patch(s._id, { city: undefined });
        }
    }
}

async function migrateRegionDisplayName(
    ctx: MutationCtx,
    oldName: string,
    newName: string
): Promise<void> {
    if (oldName === newName) return;
    const attendance = await ctx.db
        .query("attendanceRecords")
        .withIndex("by_region", (q) => q.eq("region", oldName))
        .collect();
    for (const row of attendance) {
        await ctx.db.patch(row._id, { region: newName });
    }
    const enrolled = await ctx.db
        .query("enrolledPersons")
        .withIndex("by_region", (q) => q.eq("region", oldName))
        .collect();
    for (const row of enrolled) {
        await ctx.db.patch(row._id, { region: newName });
    }
}

async function migrateRegionIdOnAssignments(
    ctx: MutationCtx,
    oldRegionId: string,
    newRegionId: string
): Promise<void> {
    if (oldRegionId === newRegionId) return;
    const users = await ctx.db
        .query("users")
        .withIndex("by_region", (q) => q.eq("regionId", oldRegionId))
        .collect();
    for (const u of users) {
        await ctx.db.patch(u._id, { regionId: newRegionId });
    }
    const sites = await ctx.db
        .query("sites")
        .withIndex("by_region", (q) => q.eq("regionId", oldRegionId))
        .collect();
    for (const s of sites) {
        await ctx.db.patch(s._id, { regionId: newRegionId });
    }
}

export const list = query({
    args: { organizationId: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        let orgIds: Id<"organizations">[] = [];
        
        if (args.organizationId) {
            orgIds.push(args.organizationId);
            // Find child organizations
            const children = await ctx.db
                .query("organizations")
                .withIndex("by_parent_org", (q: any) => q.eq("parentOrganizationId", args.organizationId))
                .collect();
            children.forEach(c => orgIds.push(c._id));
        } else {
            // Default legacy behavior: main organization
            const organizations = await ctx.db.query("organizations").collect();
            const mainOrganization = organizations.find((organization) => !organization.parentOrganizationId);
            if (!mainOrganization) return [];
            orgIds.push(mainOrganization._id);
        }

        const allRegions: Doc<"regions">[] = [];
        for (const oid of orgIds) {
            const regions = await ctx.db
                .query("regions")
                .withIndex("by_org", (q) => q.eq("organizationId", oid))
                .collect();
            allRegions.push(...regions);
        }

        // Return unique regions by regionId or just all of them
        return allRegions;
    },
});

export const create = mutation({
    args: {
        regionId: v.string(),
        regionName: v.string(),
        cities: v.array(v.string()),
        isActive: v.boolean(),
    },
    handler: async (ctx, args) => {
        const mainOrganizationId = await ensureMainOrganization(ctx);
        const normalizedRegionId = args.regionId.trim().toUpperCase();
        const normalizedRegionName = args.regionName.trim();

        const existingById = await ctx.db
            .query("regions")
            .withIndex("by_regionId", (q) => q.eq("regionId", normalizedRegionId))
            .first();

        if (existingById) {
            throw new Error("Region ID already exists");
        }

        const existingByName = await ctx.db
            .query("regions")
            .withIndex("by_regionName", (q) => q.eq("regionName", normalizedRegionName))
            .first();

        if (existingByName) {
            throw new Error("Region name already exists");
        }

        const id = await ctx.db.insert("regions", {
            organizationId: mainOrganizationId,
            regionId: normalizedRegionId,
            regionName: normalizedRegionName,
            cities: Array.from(new Set(args.cities.map((city) => city.trim()).filter(Boolean))),
            isActive: args.isActive,
            createdAt: Date.now(),
        });

        return id;
    },
});

export const get = query({
    args: { regionId: v.string() },
    handler: async (ctx, args) => {
        const region = await ctx.db
            .query("regions")
            .withIndex("by_regionId", (q) => q.eq("regionId", args.regionId))
            .first();
        if (!region) {
            return null;
        }

        const orgId = region.organizationId;
        if (!orgId) {
            return null;
        }
        const organization = (await ctx.db.get(orgId as Id<"organizations">)) as Doc<"organizations"> | null;
        if (!organization || organization.parentOrganizationId) {
            return null;
        }

        return region;
    },
});

export const remove = mutation({
    args: { id: v.id("regions") },
    handler: async (ctx, args) => {
        const region = await ctx.db.get(args.id);
        if (!region) return;
        const rid = region.regionId;
        const users = await ctx.db
            .query("users")
            .withIndex("by_region", (q) => q.eq("regionId", rid))
            .collect();
        for (const u of users) {
            await ctx.db.patch(u._id, { regionId: undefined, cities: undefined });
        }
        const sites = await ctx.db
            .query("sites")
            .withIndex("by_region", (q) => q.eq("regionId", rid))
            .collect();
        for (const s of sites) {
            await ctx.db.patch(s._id, { regionId: undefined, city: undefined });
        }
        await ctx.db.delete(args.id);
    },
});

export const update = mutation({
    args: {
        id: v.id("regions"),
        regionId: v.string(),
        regionName: v.string(),
        cities: v.array(v.string()),
        isActive: v.boolean(),
    },
    handler: async (ctx, args) => {
        const mainOrganizationId = await ensureMainOrganization(ctx);
        const { id, ...data } = args;
        const normalizedRegionId = data.regionId.trim().toUpperCase();
        const normalizedRegionName = data.regionName.trim();
        const nextCities = Array.from(
            new Set(data.cities.map((city) => city.trim()).filter(Boolean))
        );

        const existing = await ctx.db.get(id);
        if (!existing) {
            throw new Error("Region not found");
        }

        const existingById = await ctx.db
            .query("regions")
            .withIndex("by_regionId", (q) => q.eq("regionId", normalizedRegionId))
            .first();

        if (existingById && existingById._id !== id) {
            throw new Error("Region ID already exists");
        }

        const existingByName = await ctx.db
            .query("regions")
            .withIndex("by_regionName", (q) => q.eq("regionName", normalizedRegionName))
            .first();

        if (existingByName && existingByName._id !== id) {
            throw new Error("Region name already exists");
        }

        const oldRegionIdKey = existing.regionId;
        const oldRegionName = existing.regionName;

        // 1) Cities: update users.cities + sites.city (rename heuristic or removals)
        await syncCityAssignmentsForRegion(ctx, oldRegionIdKey, existing.cities, nextCities);

        // 2) Region display name: attendance + face enrollment store regionName
        await migrateRegionDisplayName(ctx, oldRegionName, normalizedRegionName);

        // 3) Region id key: users + sites
        await migrateRegionIdOnAssignments(ctx, oldRegionIdKey, normalizedRegionId);

        await ctx.db.patch(id, {
            organizationId: mainOrganizationId,
            regionId: normalizedRegionId,
            regionName: normalizedRegionName,
            cities: nextCities,
            isActive: data.isActive,
        });
    },
});

export const setStatus = mutation({
    args: {
        id: v.id("regions"),
        isActive: v.boolean(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { isActive: args.isActive });
        return args.id;
    },
});

export const backfillMainOrganizationForRegions = mutation({
    args: {},
    handler: async (ctx) => {
        const mainOrganizationId = await ensureMainOrganization(ctx);
        const regions = await ctx.db.query("regions").collect();
        let updatedCount = 0;

        for (const region of regions) {
            if (!region.organizationId) {
                await ctx.db.patch(region._id, {
                    organizationId: mainOrganizationId,
                });
                updatedCount += 1;
            }
        }

        return { updatedCount, organizationId: mainOrganizationId };
    },
});
