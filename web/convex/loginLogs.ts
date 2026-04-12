import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listRecentByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cap = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const logs = await ctx.db
      .query("loginLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const sorted = logs.sort(
      (a, b) =>
        (b.loginTime ?? b._creationTime) - (a.loginTime ?? a._creationTime)
    );
    return sorted.slice(0, cap);
  },
});

export const logLogin = mutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    organizationId: v.optional(v.id("organizations")),
    ipAddress: v.optional(v.string()),
    browserInfo: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    loginStatus: v.union(v.literal("success"), v.literal("failed"), v.literal("logout")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("loginLogs", {
      userId: args.userId,
      email: args.email,
      organizationId: args.organizationId,
      loginTime: Date.now(),
      ipAddress: args.ipAddress,
      browserInfo: args.browserInfo,
      sessionId: args.sessionId,
      loginStatus: args.loginStatus,
    });
  },
});

export const logLogout = mutation({
  args: {
    logId: v.id("loginLogs"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.logId, {
      logoutTime: Date.now(),
    });
  },
});
