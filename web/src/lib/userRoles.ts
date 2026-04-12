import { pickPrimaryRoleForPermissions } from "../../convex/userAccess";

export const ADMIN_ROLES = ["Owner", "Deployment Manager", "Manager", "Visiting Officer"];
export const RESTRICTED_ROLES = ["Client", "SO", "NEW_USER"];

/** Convex user shape (subset): roles are the only source of truth. */
export function getUserRoles(user: { roles?: string[] } | null | undefined): string[] {
    if (!user?.roles?.length) return [];
    return [...user.roles];
}

/** JWT and legacy APIs that expect a single role string. */
export function primaryRoleForJwt(user: { roles?: string[] } | null | undefined): string {
    return pickPrimaryRoleForPermissions(getUserRoles(user));
}

/** Pending approval: no roles yet, or only NEW_USER. */
export function shouldRestrictToPendingUser(user: { roles?: string[] } | null | undefined): boolean {
    const r = getUserRoles(user);
    if (r.length === 0) return true;
    return r.every((x) => x === "NEW_USER");
}

export function userHasRole(
    user: { roles?: string[] } | null | undefined,
    role: string
): boolean {
    return getUserRoles(user).includes(role);
}

export function userHasAnyRole(
    user: { roles?: string[] } | null | undefined,
    roles: string[]
): boolean {
    const set = new Set(getUserRoles(user));
    return roles.some((r) => set.has(r));
}
