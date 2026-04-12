export type UserPermissions = {
  users: boolean;
  sites: boolean;
  patrolPoints: boolean;
  patrolLogs: boolean;
  visitLogs: boolean;
  issues: boolean;
  analytics: boolean;
  attendance: boolean;
  regions: boolean;
};

export const OWNER_PERMISSIONS: UserPermissions = {
  users: true,
  sites: true,
  patrolPoints: true,
  patrolLogs: true,
  visitLogs: true,
  issues: true,
  analytics: true,
  attendance: true,
  regions: true,
};

export const NEW_USER_PERMISSIONS: UserPermissions = {
  users: false,
  sites: false,
  patrolPoints: false,
  patrolLogs: false,
  visitLogs: false,
  issues: false,
  analytics: false,
  attendance: false,
  regions: false,
};

const ROLE_PRIORITY = [
  "Owner",
  "Deployment Manager",
  "Manager",
  "Visiting Officer",
  "SO",
  "Client",
  "NEW_USER",
] as const;

export type PermissionsPatch = {
  [K in keyof typeof OWNER_PERMISSIONS]?: boolean;
};

const ORG_ADMIN_ROLES = new Set<string>([
  "Owner",
  "Deployment Manager",
  "Manager",
  "Visiting Officer",
]);

/** True if the user has any org-wide admin role (site list / admin flows). */
export function isOrgAdminRoles(roles: string[]): boolean {
  return roles.some((r) => ORG_ADMIN_ROLES.has(r));
}

/** Highest-privilege role wins (permissions + JWT `role` claim). */
export function pickPrimaryRoleForPermissions(roles: string[]): string {
  if (!roles.length) return "NEW_USER";
  let best = roles[0];
  let bestIdx: number = ROLE_PRIORITY.length;
  for (const r of roles) {
    const i = ROLE_PRIORITY.indexOf(r as (typeof ROLE_PRIORITY)[number]);
    if (i !== -1 && i < bestIdx) {
      bestIdx = i;
      best = r;
    }
  }
  return best;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<string, typeof OWNER_PERMISSIONS> = {
  "Owner": OWNER_PERMISSIONS,
  "Deployment Manager": OWNER_PERMISSIONS,
  "Manager": OWNER_PERMISSIONS,
  "Visiting Officer": {
    ...NEW_USER_PERMISSIONS,
    patrolLogs: true,
    visitLogs: true,
    issues: true,
    attendance: true,
    analytics: true,
    regions: true,
  },
  "SO": {
    ...NEW_USER_PERMISSIONS,
    sites: true,
    patrolLogs: true,
    visitLogs: true,
    issues: true,
    attendance: true,
    analytics: true,
    regions: true,
  },
  "Client": {
    ...NEW_USER_PERMISSIONS,
    sites: true,
    patrolLogs: true,
    visitLogs: true,
    issues: true,
    attendance: true,
    analytics: true,
    regions: true,
  },
  "NEW_USER": NEW_USER_PERMISSIONS,
};

export function normalizePermissionsForRole(
  role: string,
  permissions?: PermissionsPatch
) {
  const defaults = DEFAULT_ROLE_PERMISSIONS[role] || NEW_USER_PERMISSIONS;
  
  // If role is NOT NEW_USER, and permissions are missing or all false, 
  // we assume it's uninitialized and return the role defaults.
  const isAllFalse = !permissions || Object.values(permissions).every(v => v === false);
  if (role !== "NEW_USER" && isAllFalse) {
    return defaults;
  }

  return {
    ...defaults,
    ...permissions,
  };
}

export function normalizePermissionsForRoles(
  roles: string[],
  permissions?: PermissionsPatch
) {
  const primary = pickPrimaryRoleForPermissions(roles);
  return normalizePermissionsForRole(primary, permissions);
}
