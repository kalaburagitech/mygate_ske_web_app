import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { normalizePermissionsForRoles } from "./userAccess";
import { ensureMainOrganization } from "./mainOrganization";

function rolesForUserDoc(u: { roles?: string[] }): string[] {
  if (u.roles && u.roles.length > 0) return u.roles;
  return ["NEW_USER"];
}

// Get or create user when they sign in
export const getOrCreateUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { clerkId, email, name } = args;

    // Prefer the existing Clerk link when it exists.
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();

    if (existingUser) {
      const normalizedPermissions = normalizePermissionsForRoles(
        rolesForUserDoc(existingUser),
        existingUser.permissions
      );

      // Update user info if needed
      if (
        existingUser.name !== name ||
        existingUser.email !== email ||
        JSON.stringify(existingUser.permissions || {}) !== JSON.stringify(normalizedPermissions)
      ) {
        await ctx.db.patch(existingUser._id, {
          name,
          email: email || existingUser.email,
          permissions: normalizedPermissions,
        });
        return {
          ...existingUser,
          name,
          email: email || existingUser.email,
          permissions: normalizedPermissions,
        };
      }
      return existingUser;
    }

    // If the email already exists, link this Clerk account to that user.
    if (email) {
      const existingByEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();

      if (existingByEmail) {
        const nextName = name || existingByEmail.name;
        await ctx.db.patch(existingByEmail._id, {
          clerkId,
          name: nextName,
          email,
          permissions: normalizePermissionsForRoles(
            rolesForUserDoc(existingByEmail),
            existingByEmail.permissions
          ),
        });

        return {
          ...existingByEmail,
          clerkId,
          name: nextName,
          email,
          permissions: normalizePermissionsForRoles(
            rolesForUserDoc(existingByEmail),
            existingByEmail.permissions
          ),
        };
      }
    }

    // For any other new user, ensure we have a valid main organization.
    const finalOrgId = await ensureMainOrganization(ctx);

    // First-time login without a matching user record stays pending until approved.
    const userId = await ctx.db.insert("users", {
      clerkId,
      name,
      email: email || undefined,
      roles: ["NEW_USER"],
      status: "active",
      organizationId: finalOrgId,
      cities: [],
      permissions: normalizePermissionsForRoles(["NEW_USER"]),
      creationTime: Date.now(),
    });

    // Create notification for admins
    await ctx.db.insert("notifications", {
      organizationId: finalOrgId,
      type: "new_user",
      title: "New User Registered",
      message: `${name} (${email || "no email"}) has joined.`,
      isRead: false,
      createdAt: Date.now(),
      referenceId: userId,
    });

    return await ctx.db.get(userId);
  },
});

// Get current user
export const getCurrentUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();
    return user;
  },
});

// Update user
export const updateUser = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    roles: v.optional(
      v.array(
        v.union(
          v.literal("Owner"),
          v.literal("Deployment Manager"),
          v.literal("Manager"),
          v.literal("Visiting Officer"),
          v.literal("SO"),
          v.literal("Client"),
          v.literal("NEW_USER")
        )
      )
    ),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
    return id;
  },
});