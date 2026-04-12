import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Removes the legacy `role` field from `users` documents. Keeps `roles` and all other fields.
 * Run once from the Convex dashboard: Functions → migrations/stripLegacyUserRoleField → Run.
 * Fixes: "Schema validation failed" when documents still contain `role` after migrating to `roles` only.
 */
export const stripLegacyUserRoleField = mutation({
    args: {},
    handler: async (ctx) => {
        const users = await ctx.db.query("users").collect();
        let fixed = 0;

        for (const doc of users) {
            const u = doc as Record<string, unknown> & { _id: Id<"users"> };
            if (!Object.prototype.hasOwnProperty.call(u, "role")) {
                continue;
            }

            const { _id, _creationTime, role: _legacyRole, ...rest } = u as Record<string, unknown> & {
                _id: Id<"users">;
                role?: unknown;
            };

            const roles =
                Array.isArray(u.roles) && (u.roles as unknown[]).length > 0
                    ? [...(u.roles as string[])]
                    : u.role != null && String(u.role).length > 0
                      ? [String(u.role)]
                      : ["NEW_USER"];

            await ctx.db.replace(_id, {
                ...(rest as Record<string, unknown>),
                roles,
            } as any);

            fixed++;
        }

        return { message: "Removed legacy role field where present", documentsUpdated: fixed };
    },
});
