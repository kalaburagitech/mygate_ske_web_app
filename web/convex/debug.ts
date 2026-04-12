import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthorizedSiteIds } from "./accessControl";

export const debugUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const authIds = await getAuthorizedSiteIds(ctx, args.userId);
    return { user, authIds };
  }
});
