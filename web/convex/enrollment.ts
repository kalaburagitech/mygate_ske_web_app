import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
    args: {
        name: v.string(),
        empId: v.string(),
        empRank: v.string(),
        status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
        region: v.string(),
        faceEncodingIds: v.array(v.number()),
        enrolledAt: v.number(),
        organizationId: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args) => {
        const enrollmentId = await ctx.db.insert("enrolledPersons", {
            name: args.name,
            empId: args.empId,
            empRank: args.empRank,
            status: args.status ?? "active",
            region: args.region,
            faceEncodingIds: args.faceEncodingIds,
            enrolledAt: args.enrolledAt,
            organizationId: args.organizationId,
        });

        return enrollmentId;
    },
});

export const list = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        region: v.optional(v.string()),
        empId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const enrollments = args.organizationId
            ? await ctx.db
                  .query("enrolledPersons")
                  .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
                  .collect()
            : args.region
              ? await ctx.db
                    .query("enrolledPersons")
                    .withIndex("by_region", (q) => q.eq("region", args.region!))
                    .collect()
              : args.empId
                ? await ctx.db
                      .query("enrolledPersons")
                      .withIndex("by_empId", (q) => q.eq("empId", args.empId!))
                      .collect()
                : await ctx.db.query("enrolledPersons").collect();

        return enrollments;
    },
});

export const update = mutation({
    args: {
        id: v.id("enrolledPersons"),
        name: v.optional(v.string()),
        empId: v.optional(v.string()),
        empRank: v.optional(v.string()),
        status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
        region: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;
        const current = await ctx.db.get(id);
        if (!current) throw new Error("Enrolled person not found");
        await ctx.db.patch(id, updates);
    },
});

export const setStatus = mutation({
    args: {
        id: v.id("enrolledPersons"),
        status: v.union(v.literal("active"), v.literal("inactive")),
    },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) throw new Error("Enrolled person not found");
        await ctx.db.patch(args.id, { status: args.status });
    },
});

export const remove = mutation({
    args: { id: v.id("enrolledPersons") },
    handler: async (ctx, args) => {
        const current = await ctx.db.get(args.id);
        if (!current) throw new Error("Enrolled person not found");
        await ctx.db.delete(args.id);
    },
});
