import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        return await ctx.storage.generateUploadUrl();
    },
});

/**
 * Given a Convex storageId string, returns the public URL for the file.
 * Returns null if the storageId is invalid or the file doesn't exist.
 */
export const getUrl = query({
    args: { storageId: v.string() },
    handler: async (ctx, args) => {
        try {
            return await ctx.storage.getUrl(args.storageId as any);
        } catch {
            return null;
        }
    },
});
