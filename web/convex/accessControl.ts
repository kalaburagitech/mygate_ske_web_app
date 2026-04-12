import { Doc, Id } from "./_generated/dataModel";
import { GenericQueryCtx } from "convex/server";

/**
 * Checks if a user has restricted access (Client or SO role) 
 * and returns their assigned site IDs if they do.
 * If the user is an admin (Owner, Manager, etc.), returns null (unrestricted).
 */
export async function getAuthorizedSiteIds(
  ctx: GenericQueryCtx<any>,
  userId: Id<"users"> | undefined
): Promise<Id<"sites">[] | null> {
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  if (!user) return null;

  const roles = user.roles ?? [];
  const isRestricted = roles.includes("Client") || roles.includes("SO") || roles.includes("NEW_USER");
  const isOwner = roles.includes("Owner") || roles.includes("Deployment Manager") || roles.includes("Manager") || roles.includes("Visiting Officer");

  // For Admins/Owners, they see everything in their org tree by default.
  // Prioritize Admin permissions over restricted roles if both exist.
  if (isOwner) {
    const orgIds = [user.organizationId];
    // Find children
    const childOrgs = await ctx.db.query("organizations")
      .withIndex("by_parent_org", (q: any) => q.eq("parentOrganizationId", user.organizationId))
      .collect();
    childOrgs.forEach(o => orgIds.push(o._id));

    const allSiteIds: Id<"sites">[] = [];
    for (const oid of orgIds) {
      const sites = await ctx.db.query("sites")
        .withIndex("by_org", q => q.eq("organizationId", oid))
        .collect();
      sites.forEach(s => allSiteIds.push(s._id));
    }
    return allSiteIds;
  }

  // Restricted Roles (Client/SO) or Owners with restricted access
  if (isRestricted) {
    const ids = new Set<Id<"sites">>();
    
    // Explicit assignments only
    if ((user as any).siteId) ids.add((user as any).siteId);
    if (Array.isArray(user.siteIds)) {
      user.siteIds.forEach((id: Id<"sites">) => ids.add(id));
    }
    
    return Array.from(ids);
  }

  return null;
}

/**
 * Intersects a query result with allowed sites.
 */
export function filterByAuthorizedSites<T extends { siteId?: Id<"sites"> | string }>(
  items: T[],
  authorizedSiteIds: Id<"sites">[] | null
): T[] {
  if (!authorizedSiteIds) return items;
  
  const allowedSet = new Set(authorizedSiteIds.map(id => id.toString()));
  return items.filter(item => {
    if (!item.siteId) return false;
    return allowedSet.has(item.siteId.toString());
  });
}

/**
 * Special filter for users based on their assigned sites.
 * A client should only see users who share at least one site with them.
 */
export function filterUsersByAuthorizedSites(
  users: Doc<"users">[],
  authorizedSiteIds: Id<"sites">[] | null
): Doc<"users">[] {
  if (!authorizedSiteIds) return users;
  
  const allowedSet = new Set(authorizedSiteIds.map(id => id.toString()));
  
  return users.filter(u => {
    // If user is directly assigned to an allowed site
    if (u.siteId && allowedSet.has(u.siteId.toString())) return true;
    
    // If user has any allowed site in their siteIds array
    if (Array.isArray(u.siteIds)) {
      return u.siteIds.some(sid => allowedSet.has(sid.toString()));
    }
    
    return false;
  });
}
