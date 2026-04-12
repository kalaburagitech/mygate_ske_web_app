import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

function mapLegacyRoleName(r: string): string {
    switch (r) {
        case "Officer":
            return "Visiting Officer";
        case "Security Officer":
        case "SG":
            return "SO";
        case "Higher Officer":
            return "Manager";
        default:
            return r;
    }
}

/**
 * One-time: normalize `roles`, map legacy role strings, merge `city` into `cities`, remove legacy `role` / `city` keys.
 * Run from the Convex dashboard after deploying the schema that stores only `users.roles`.
 */
export const migrateUserRoles = mutation({
    args: {},
    handler: async (ctx) => {
        const users = await ctx.db.query("users").collect();
        const updates: { id: Id<"users">; roles: string[] }[] = [];

        for (const user of users) {
            const u = user as Record<string, unknown> & { _id: Id<"users"> };
            const raw: string[] =
                Array.isArray(u.roles) && (u.roles as string[]).length > 0
                    ? [...(u.roles as string[])]
                    : u.role
                      ? [String(u.role)]
                      : ["NEW_USER"];
            const mapped = [...new Set(raw.map(mapLegacyRoleName))];
            const roles = mapped.length > 0 ? mapped : ["NEW_USER"];

            let cities = u.cities as string[] | undefined;
            const legacyCity = u.city as string | undefined;
            if (legacyCity && (!cities || cities.length === 0)) {
                cities = [legacyCity];
            }

            const {
                _id,
                _creationTime: _ct,
                role: _legacyRole,
                city: _legacyCityField,
                ...rest
            } = u;

            await ctx.db.replace(_id, {
                ...(rest as Record<string, unknown>),
                roles,
                cities,
            } as any);

            updates.push({ id: _id, roles });
        }

        return {
            message: "Migration completed",
            updatedCount: updates.length,
            updates,
        };
    },
});
