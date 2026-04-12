export type RoleSource =
    | string
    | undefined
    | null
    | { roles?: string[] };

export function getUserRoles(source: RoleSource): string[] {
    if (source == null) return [];
    if (typeof source === 'string') return source ? [source] : [];
    if (typeof source === 'object' && source.roles && source.roles.length > 0) {
        return [...source.roles];
    }
    return [];
}

/** Owner, Deployment Manager, Manager — org admin capabilities. */
export function isAdministrativeRole(source: RoleSource): boolean {
    return getUserRoles(source).some((r) =>
        ['Owner', 'Deployment Manager', 'Manager'].includes(r)
    );
}

/**
 * Home = OfficerDashboard for admins + SO (field supervisors).
 * Visiting Officers use the standard guard home unless they also have SO/Manager/etc.
 */
export function canAccessMonitoringDashboard(source: RoleSource): boolean {
    const roles = getUserRoles(source);
    if (isAdministrativeRole(source)) return true;
    return roles.includes('SO') || roles.includes('Client');
}

export function canSelectAllSitesForVisits(source: RoleSource): boolean {
    const roles = getUserRoles(source).map((r) => r.toLowerCase().trim());
    if (isAdministrativeRole(source)) return true;
    return roles.some(
        (r) =>
            r === 'so' ||
            r.includes('security officer') ||
            r === 'sg' ||
            r.includes('security guard')
    );
}

/** True if user is assigned Visiting Officer (alone or among other roles). */
export function hasVisitingOfficerRole(source: RoleSource): boolean {
    return getUserRoles(source).includes('Visiting Officer');
}
