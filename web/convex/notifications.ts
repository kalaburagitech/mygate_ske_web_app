import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** List notifications for an organization */
export const list = query({
    args: {
        organizationId: v.id("organizations"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const notifications = await ctx.db
            .query("notifications")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
            .order("desc")
            .take(args.limit || 50);
        
        return notifications;
    },
});

export const getUnreadCount = query({
    args: {
        organizationId: v.id("organizations"),
    },
    handler: async (ctx, args) => {
        const unread = await ctx.db
            .query("notifications")
            .withIndex("by_org_read", (q) => q.eq("organizationId", args.organizationId).eq("isRead", false))
            .collect();
        return unread.length;
    },
});

export const markAsRead = mutation({
    args: {
        id: v.id("notifications"),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { isRead: true });
    },
});

export const markAllAsRead = mutation({
    args: {
        organizationId: v.id("organizations"),
    },
    handler: async (ctx, args) => {
        const unread = await ctx.db
            .query("notifications")
            .withIndex("by_org_read", (q) => q.eq("organizationId", args.organizationId).eq("isRead", false))
            .collect();
        
        for (const note of unread) {
            await ctx.db.patch(note._id, { isRead: true });
        }
    },
});

export const notifyUnique = mutation({
    args: {
        organizationId: v.id("organizations"),
        type: v.union(v.literal("new_user"), v.literal("issue")),
        title: v.string(),
        message: v.string(),
        referenceId: v.optional(v.union(v.id("users"), v.id("issues"), v.id("incidents"))),
    },
    handler: async (ctx, args) => {
        // Check if an unread notification of this type and reference already exists to avoid spam
        const existing = await ctx.db
            .query("notifications")
            .withIndex("by_org_read", (q) => q.eq("organizationId", args.organizationId).eq("isRead", false))
            .filter((q) => q.eq(q.field("type"), args.type))
            .filter((q) => q.eq(q.field("referenceId"), args.referenceId))
            .first();
        
        if (existing) return;

        await ctx.db.insert("notifications", {
            organizationId: args.organizationId,
            type: args.type,
            title: args.title,
            message: args.message,
            isRead: false,
            createdAt: Date.now(),
            referenceId: args.referenceId,
        });
    },
});

export const remove = mutation({
    args: {
        id: v.id("notifications"),
    },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});

export const removeAll = mutation({
    args: {
        organizationId: v.id("organizations"),
    },
    handler: async (ctx, args) => {
        const all = await ctx.db
            .query("notifications")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
            .collect();
        
        for (const note of all) {
            await ctx.db.delete(note._id);
        }
    },
});
