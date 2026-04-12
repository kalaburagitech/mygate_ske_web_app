import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { DEFAULT_ORGANIZATION_ACCESS } from "./organizationAccess";

export const MAIN_ORG_NAME = "MAIN_ORG";

export async function ensureMainOrganization(ctx: MutationCtx): Promise<Id<"organizations">> {
  const organizations = await ctx.db.query("organizations").collect();
  const existingMainOrg = organizations.find(
    (organization) => !organization.parentOrganizationId
  );

  if (existingMainOrg) {
    return existingMainOrg._id;
  }

  return await ctx.db.insert("organizations", {
    name: MAIN_ORG_NAME,
    parentOrganizationId: undefined,
    status: "active",
    access: DEFAULT_ORGANIZATION_ACCESS,
    createdAt: Date.now(),
  });
}
