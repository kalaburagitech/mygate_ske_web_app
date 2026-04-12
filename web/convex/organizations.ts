import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { DEFAULT_ORGANIZATION_ACCESS } from "./organizationAccess";
import { ensureMainOrganization, MAIN_ORG_NAME } from "./mainOrganization";

async function getRootOrganizationId(ctx: any, organizationId: any) {
    const organization = await ctx.db.get(organizationId);
    if (!organization) {
        throw new Error("Organization not found");
    }

    return organization.parentOrganizationId || organization._id;
}

async function getAuthorizedOrganizationIds(ctx: any, userId?: string) {
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const roles = user.roles ?? [];
    const isOwner = roles.some((r: string) => ["Owner", "Manager", "Deployment Manager"].includes(r));
    const isRestricted = roles.some((r: string) => ["Client", "SO"].includes(r));
    
    // Admins/Owners see everything
    if (isOwner) return null;
    
    // For non-owner restricted users, be strict
    if (!isRestricted) return null; // Or return empty if they have NO valid roles? Assuming other roles might exist.

    // For restricted users, their "Effective Organizations" are the ones 
    // associated with their assigned sites.
    const ids = new Set<string>();
    
    const siteIds = [] as any[];
    if ((user as any).siteId) siteIds.push((user as any).siteId);
    if (Array.isArray(user.siteIds)) {
        user.siteIds.forEach((id: any) => siteIds.push(id));
    }

    if (siteIds.length > 0) {
        for (const sid of siteIds) {
            const site = await ctx.db.get(sid);
            if (site) {
                ids.add(site.organizationId);
            }
        }
    } else {
        // Fallback: their own profile org if no sites are assigned
        ids.add(user.organizationId);
    }

    return Array.from(ids);
}

async function listOrganizationsInHierarchy(ctx: any, rootOrganizationId: any) {
    const childOrganizations = await ctx.db
        .query("organizations")
        .withIndex("by_parent_org", (q: any) => q.eq("parentOrganizationId", rootOrganizationId))
        .collect();
    const rootOrganization = await ctx.db.get(rootOrganizationId);

    return [
        ...(rootOrganization ? [rootOrganization] : []),
        ...childOrganizations,
    ];
}

/* ------------------------------------------------ */
/* GET ORGANIZATION BY ID */
/* ------------------------------------------------ */

export const get = query({
    args: {
        id: v.id("organizations"),
        currentOrganizationId: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args) => {
        const organization = await ctx.db.get(args.id);
        if (!organization) {
            return null;
        }

        if (!args.currentOrganizationId) {
            return organization;
        }

        const rootOrganizationId = await getRootOrganizationId(ctx, args.currentOrganizationId);
        const targetRootOrganizationId = organization.parentOrganizationId || organization._id;
        if (rootOrganizationId !== targetRootOrganizationId) {
            throw new Error("Access denied for this organization");
        }

        return organization;
    },
});

/* ------------------------------------------------ */
/* CREATE ORGANIZATION */
/* ------------------------------------------------ */

export const create = mutation({
    args: {
        name: v.string(),
        parentOrganizationId: v.optional(v.id("organizations")),
        status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
        access: v.optional(v.object({
            patrolling: v.boolean(),
            visits: v.boolean(),
            attendance: v.boolean(),
        })),
    },

    handler: async (ctx, args) => {
        const mainOrganizationId = await ensureMainOrganization(ctx);
        const orgId = await ctx.db.insert("organizations", {
            name: args.name,
            parentOrganizationId: args.parentOrganizationId ?? mainOrganizationId,
            status: args.status ?? "active",
            access: args.access ?? DEFAULT_ORGANIZATION_ACCESS,
            createdAt: Date.now(),
        });

        return orgId;
    },
});

/* ------------------------------------------------ */
/* UPDATE ORGANIZATION */
/* ------------------------------------------------ */

export const update = mutation({
    args: {
        id: v.id("organizations"),
        name: v.string(),
        status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
        access: v.optional(v.object({
            patrolling: v.boolean(),
            visits: v.boolean(),
            attendance: v.boolean(),
        })),
    },

    handler: async (ctx, args) => {
        const org = await ctx.db.get(args.id);
        if (!org) {
            throw new Error("Organization not found");
        }

        if (!org.parentOrganizationId && args.name !== org.name) {
            throw new Error("MAIN_ORG name cannot be changed");
        }

        await ctx.db.patch(args.id, {
            name: !org.parentOrganizationId ? org.name : args.name,
            status: args.status,
            access: args.access,
        });

        return args.id;
    },
});

/* ------------------------------------------------ */
/* DELETE ORGANIZATION */
/* ------------------------------------------------ */

export const remove = mutation({
    args: { id: v.id("organizations") },

    handler: async (ctx, args) => {
        const org = await ctx.db.get(args.id);
        if (!org) {
            throw new Error("Organization not found");
        }

        if (!org.parentOrganizationId) {
            throw new Error("MAIN_ORG cannot be deleted");
        }

        /* Check if organization has sites */

        const site = await ctx.db
            .query("sites")
            .withIndex("by_org", (q) => q.eq("organizationId", args.id))
            .first();

        if (site) {
            throw new Error(
                "Cannot delete organization with active sites. Delete sites first."
            );
        }

        /* Check if organization has users */

        const user = await ctx.db
            .query("users")
            .withIndex("by_org", (q) => q.eq("organizationId", args.id))
            .first();

        if (user) {
            throw new Error(
                "Cannot delete organization with registered users."
            );
        }

        await ctx.db.delete(args.id);

        return true;
    },
});

/* ------------------------------------------------ */
/* LIST ALL ORGANIZATIONS */
/* ------------------------------------------------ */

export const list = query({
    args: {
        currentOrganizationId: v.optional(v.id("organizations")),
        requestingUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const authorizedOrgIds = await getAuthorizedOrganizationIds(ctx, args.requestingUserId);

        // If not restricted (Admin/Owner), show ALL organizations in the system
        if (!authorizedOrgIds) {
            return await ctx.db.query("organizations").collect();
        }

        // For restricted roles (Client/SO), filter based on authorized IDs
        // We list all then filter to ensure we stay within the authorized set
        const allOrgs = await ctx.db.query("organizations").collect();
        return allOrgs.filter(org => (authorizedOrgIds as any[]).includes(org._id));
    },
});

export const getMainOrganization = query({
    handler: async (ctx) => {
        const organizations = await ctx.db.query("organizations").collect();
        return organizations.find((organization) => !organization.parentOrganizationId) ?? null;
    },
});

export const setStatus = mutation({
    args: {
        id: v.id("organizations"),
        status: v.union(v.literal("active"), v.literal("inactive")),
    },
    handler: async (ctx, args) => {
        const org = await ctx.db.get(args.id);
        if (!org) {
            throw new Error("Organization not found");
        }
        await ctx.db.patch(args.id, { status: args.status });
        return args.id;
    },
});

export const updateAccess = mutation({
    args: {
        id: v.id("organizations"),
        access: v.object({
            patrolling: v.boolean(),
            visits: v.boolean(),
            attendance: v.boolean(),
        }),
    },
    handler: async (ctx, args) => {
        const org = await ctx.db.get(args.id);
        if (!org) {
            throw new Error("Organization not found");
        }
        await ctx.db.patch(args.id, { access: args.access });
        return args.id;
    },
});

export const assignUserToMainOrganization = mutation({
    args: {
        email: v.string(),
    },
    handler: async (ctx, args) => {
        const mainOrganizationId = await ensureMainOrganization(ctx);
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (!user) {
            throw new Error(`User not found for email: ${args.email}`);
        }

        await ctx.db.patch(user._id, {
            organizationId: mainOrganizationId,
        });

        return {
            userId: user._id,
            organizationId: mainOrganizationId,
            organizationName: MAIN_ORG_NAME,
        };
    },
});

export const bootstrapMainOrganization = mutation({
    args: {},
    handler: async (ctx) => {
        const organizationId = await ensureMainOrganization(ctx);
        const organization = await ctx.db.get(organizationId);
        return organization;
    },
});

/* ------------------------------------------------ */
/* COUNT USERS IN ORGANIZATION */
/* ------------------------------------------------ */

export const countUsers = query({
    args: { organizationId: v.id("organizations") },

    handler: async (ctx, args) => {
        const users = await ctx.db
            .query("users")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        return users.length;
    },
});

/* ------------------------------------------------ */
/* COUNT SITES IN ORGANIZATION */
/* ------------------------------------------------ */

export const countSites = query({
    args: { organizationId: v.id("organizations") },

    handler: async (ctx, args) => {
        const sites = await ctx.db
            .query("sites")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        return sites.length;
    },
});