import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  normalizePermissionsForRoles,
} from "./userAccess";
import { getAuthorizedSiteIds, filterUsersByAuthorizedSites } from "./accessControl";

/* ------------------------------------------------ */
/* GET USER BY CLERK ID */
/* ------------------------------------------------ */

export const getByClerkId = query({
    args: { clerkId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const clerkId = args.clerkId;
        if (!clerkId) return null;
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
            .first();

        if (!user) return null;

        // Determine effective organization
        // For restricted roles (Client, SO), use the organization of their first site
        const RESTRICTED_ROLES = ["Client", "SO"];
        const isRestricted = (user.roles || []).some(r => RESTRICTED_ROLES.includes(r));
        
        let effectiveOrgId = user.organizationId;
        let effectiveOrgName = "";

        if (isRestricted) {
            const firstSiteId = user.siteIds?.[0] || user.siteId;
            if (firstSiteId) {
                const site = await ctx.db.get(firstSiteId);
                if (site) {
                    effectiveOrgId = site.organizationId;
                }
            }
        }

        const org = await ctx.db.get(effectiveOrgId);
        effectiveOrgName = org?.name || "Unknown Organization";

        return {
            ...user,
            effectiveOrganizationId: effectiveOrgId,
            effectiveOrganizationName: effectiveOrgName,
            permissions: normalizePermissionsForRoles(user.roles || [], user.permissions),
        };
    },
});

export const updateSelfProfile = mutation({
    args: {
        clerkId: v.string(),
        name: v.string(),
        mobileNumber: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
            .first();

        if (!user) {
            throw new Error("Account not found. Please sign in again.");
        }

        const trimmedName = args.name.trim();
        if (trimmedName.length < 2) {
            throw new Error("Name must be at least 2 characters.");
        }
        if (trimmedName.length > 120) {
            throw new Error("Name is too long.");
        }

        const rawMobile = (args.mobileNumber ?? "").trim();
        let mobile: string | undefined;
        if (rawMobile.length === 0) {
            mobile = undefined;
        } else if (rawMobile.length < 8 || rawMobile.length > 20) {
            throw new Error("Enter a valid phone number (8–20 digits or characters).");
        } else if (!/^[\d\s+().-]+$/.test(rawMobile)) {
            throw new Error("Phone number contains invalid characters.");
        } else {
            mobile = rawMobile;
        }

        await ctx.db.patch(user._id, {
            name: trimmedName,
            mobileNumber: mobile,
        });

        return user._id;
    },
});

/* ------------------------------------------------ */
/* GET USER BY EMAIL */
/* ------------------------------------------------ */

export const getByEmail = query({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        return user ?? null;
    },
});

/* ------------------------------------------------ */
/* GET USER BY MOBILE */
/* ------------------------------------------------ */

export const getByMobileNumber = query({
    args: { mobileNumber: v.string() },
    handler: async (ctx, args) => {
        const users = await ctx.db.query("users").collect();
        return users.find((u) => u.mobileNumber === args.mobileNumber) ?? null;
    },
});

/** Normalize stored or input mobile to 10-digit Indian local part (6–9 leading). */
function normalizeIndianMobileTo10(input: string): string | null {
    const digits = input.replace(/\D/g, "");
    let n = digits;
    if (n.length === 12 && n.startsWith("91")) {
        n = n.slice(2);
    }
    if (n.length === 11 && n.startsWith("0")) {
        n = n.slice(1);
    }
    if (n.length !== 10 || !/^[6-9]\d{9}$/.test(n)) {
        return null;
    }
    return n;
}

/** Match user by Indian mobile regardless of how `mobileNumber` was stored (+91…, spaces, etc.). */
export const getByIndianMobile10 = query({
    args: { tenDigits: v.string() },
    handler: async (ctx, args) => {
        if (!/^[6-9]\d{9}$/.test(args.tenDigits)) {
            return null;
        }
        const users = await ctx.db.query("users").collect();
        for (const u of users) {
            if (!u.mobileNumber) {
                continue;
            }
            const candidate = normalizeIndianMobileTo10(u.mobileNumber);
            if (candidate === args.tenDigits) {
                return u;
            }
        }
        return null;
    },
});

async function getSiteIdsInCities(ctx: any, organizationId: any, cities?: string[]) {
    if (!cities || cities.length === 0 || !organizationId) return [];
    const allSites = await ctx.db
        .query("sites")
        .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
        .collect();
    const citySet = new Set(cities);
    return allSites
        .filter((s: any) => s.city && citySet.has(s.city))
        .map((s: any) => s._id);
}

/* ------------------------------------------------ */
/* CREATE USER */
/* ------------------------------------------------ */

export const create = mutation({
    args: {
        clerkId: v.optional(v.string()),
        name: v.string(),
        role: v.optional(
            v.union(
                v.literal("Owner"),
                v.literal("Deployment Manager"),
                v.literal("Manager"),
                v.literal("Visiting Officer"),
                v.literal("SO"),
                v.literal("Client"),
                v.literal("NEW_USER")
            )
        ),
        roles: v.optional(
            v.array(
                v.union(
                    v.literal("Owner"),
                    v.literal("Deployment Manager"),
                    v.literal("Manager"),
                    v.literal("Visiting Officer"),
                    v.literal("SO"),
                    v.literal("Client"),
                    v.literal("NEW_USER")
                )
            )
        ),
        status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
        organizationId: v.id("organizations"),
        siteIds: v.optional(v.array(v.id("sites"))),
        email: v.optional(v.string()),
        mobileNumber: v.optional(v.string()),
        regionId: v.optional(v.string()),
        cities: v.optional(v.array(v.string())), // CHANGED: cities array
        permissions: v.optional(
            v.object({
                users: v.boolean(),
                sites: v.boolean(),
                patrolPoints: v.boolean(),
                patrolLogs: v.boolean(),
                visitLogs: v.boolean(),
                issues: v.boolean(),
                analytics: v.boolean(),
                attendance: v.optional(v.boolean()),
                regions: v.optional(v.boolean()),
            })
        ),
    },

    handler: async (ctx, args) => {
        /* Prevent duplicate Clerk users */
        const clerkIdArg = args.clerkId;
        if (clerkIdArg) {
            const existing = await ctx.db
                .query("users")
                .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkIdArg))
                .first();

            if (existing) {
                return existing._id;
            }
        }

        const clerkId =
            args.clerkId ??
            `pending_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const rolesList =
            args.roles && args.roles.length > 0
                ? [...new Set(args.roles)]
                : args.role
                  ? [args.role]
                  : [];
        if (rolesList.length === 0) {
            throw new Error("At least one role is required");
        }

        // AUTO-POPULATE siteIds from cities if not provided
        let finalSiteIds = args.siteIds;
        if ((!finalSiteIds || finalSiteIds.length === 0) && args.cities && args.cities.length > 0) {
            finalSiteIds = await getSiteIdsInCities(ctx, args.organizationId, args.cities);
        }

        return await ctx.db.insert("users", {
            clerkId,
            name: args.name,
            roles: rolesList,
            status: args.status ?? "active",
            organizationId: args.organizationId,
            siteId: (finalSiteIds && finalSiteIds.length > 0) ? finalSiteIds[0] : undefined,
            siteIds: finalSiteIds,
            email: args.email,
            mobileNumber: args.mobileNumber,
            regionId: args.regionId,
            cities: args.cities, // CHANGED: cities array
            permissions: normalizePermissionsForRoles(rolesList, args.permissions),
            creationTime: Date.now(),
        });
    },
});

/* ------------------------------------------------ */
/* UPDATE USER */
/* ------------------------------------------------ */

export const update = mutation({
    args: {
        id: v.id("users"),
        name: v.string(),
        role: v.optional(
            v.union(
                v.literal("Owner"),
                v.literal("Deployment Manager"),
                v.literal("Manager"),
                v.literal("Visiting Officer"),
                v.literal("SO"),
                v.literal("Client"),
                v.literal("NEW_USER")
            )
        ),
        roles: v.optional(
            v.array(
                v.union(
                    v.literal("Owner"),
                    v.literal("Deployment Manager"),
                    v.literal("Manager"),
                    v.literal("Visiting Officer"),
                    v.literal("SO"),
                    v.literal("Client"),
                    v.literal("NEW_USER")
                )
            )
        ),
        status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
        organizationId: v.optional(v.id("organizations")),
        siteIds: v.optional(v.array(v.id("sites"))),
        email: v.optional(v.string()),
        mobileNumber: v.optional(v.string()),
        regionId: v.optional(v.string()),
        cities: v.optional(v.array(v.string())), // CHANGED: cities array
        permissions: v.optional(
            v.object({
                users: v.boolean(),
                sites: v.boolean(),
                patrolPoints: v.boolean(),
                patrolLogs: v.boolean(),
                visitLogs: v.boolean(),
                issues: v.boolean(),
                analytics: v.boolean(),
                attendance: v.optional(v.boolean()),
                regions: v.optional(v.boolean()),
            })
        ),
    },

    handler: async (ctx, args) => {
        const { id, ...data } = args;
        const existing = await ctx.db.get(id);
        if (!existing) {
            throw new Error("User not found");
        }
        if (data.siteIds) {
            (data as any).siteId = (data.siteIds.length > 0) ? data.siteIds[0] : undefined;
        }

        const rolesList =
            data.roles && data.roles.length > 0
                ? [...new Set(data.roles)]
                : data.role
                  ? [data.role]
                  : existing.roles && existing.roles.length > 0
                    ? existing.roles
                    : [];
        if (rolesList.length === 0) {
            throw new Error("At least one role is required");
        }
        delete (data as { role?: unknown }).role;
        (data as { roles: typeof rolesList }).roles = rolesList;
        data.permissions = normalizePermissionsForRoles(rolesList, data.permissions);

        // SYNC siteIds from cities if cities changed or siteIds not explicitly provided
        if (data.cities && (!args.siteIds || args.siteIds.length === 0)) {
            const orgId = data.organizationId || existing.organizationId;
            const syncedSiteIds = await getSiteIdsInCities(ctx, orgId, data.cities);
            if (syncedSiteIds.length > 0) {
                data.siteIds = syncedSiteIds;
                (data as any).siteId = syncedSiteIds[0];
            }
        }

        await ctx.db.patch(id, data);
        return id;
    },
});

/* ------------------------------------------------ */
/* DELETE USER */
/* ------------------------------------------------ */

export const remove = mutation({
    args: { id: v.id("users") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const setStatus = mutation({
    args: {
        id: v.id("users"),
        status: v.union(v.literal("active"), v.literal("inactive")),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { status: args.status });
        return args.id;
    },
});

/* ------------------------------------------------ */
/* LIST ALL USERS */
/* ------------------------------------------------ */

export const listAll = query({
    handler: async (ctx) => {
        return await ctx.db.query("users").collect();
    },
});

export const countAll = query({
    handler: async (ctx) => {
        const users = await ctx.db.query("users").collect();
        return users.length;
    },
});

export const listClients = query({
    args: { 
        organizationId: v.id("organizations"),
        siteId: v.optional(v.id("sites"))
    },
    handler: async (ctx, args) => {
        const users = await ctx.db
            .query("users")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
            .collect();
        
        let clients = users.filter((u) => u.roles.includes("Client"));

        if (args.siteId) {
            const sid = args.siteId;
            clients = clients.filter(u => 
                u.siteId === sid || (u.siteIds && u.siteIds.includes(sid))
            );
        }

        return clients;
    },
});

/* ------------------------------------------------ */
/* LIST USERS BY ORGANIZATION */
/* ------------------------------------------------ */

export const listByOrg = query({
    args: { 
        organizationId: v.optional(v.id("organizations")),
        requestingUserId: v.optional(v.id("users"))
    },

    handler: async (ctx, args) => {
        const query = args.organizationId
            ? ctx.db.query("users").withIndex("by_org", (q: any) => q.eq("organizationId", args.organizationId))
            : ctx.db.query("users");
        
        const users = await query.collect();

        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        if (authorizedSiteIds) {
            return filterUsersByAuthorizedSites(users, authorizedSiteIds);
        }
        return users;
    },
});

/* ------------------------------------------------ */
/* LIST USERS BY SITE */
/* ------------------------------------------------ */

export const listBySite = query({
    args: { siteId: v.id("sites") },

    handler: async (ctx, args) => {
        const site = await ctx.db.get(args.siteId);

        if (!site) return [];

        const users = await ctx.db
            .query("users")
            .withIndex("by_org", (q) => q.eq("organizationId", site.organizationId))
            .collect();

        return users.filter(
            (user) =>
                (user.siteIds && user.siteIds.includes(args.siteId)) ||
                user.siteId === args.siteId
        );
    },
});

export const countByOrg = query({
    args: {
        organizationId: v.id("organizations"),
        siteId: v.optional(v.id("sites")),
        requestingUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        let users = await ctx.db
            .query("users")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        if (args.siteId) {
            const siteId = args.siteId;
            users = users.filter((user) => user.siteIds?.includes(siteId));
        }

        return users.length;
    },
});