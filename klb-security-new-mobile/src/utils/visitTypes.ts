/** Convex / API visit type strings */
export type VisitTypeCode = 'SiteCheckDay' | 'SiteCheckNight' | 'Trainer' | string | undefined;

export function visitTypeLabel(t?: string): string {
    if (t === 'SiteCheckDay') return 'Day visit';
    if (t === 'SiteCheckNight') return 'Night visit';
    if (t === 'Trainer') return 'Trainer';
    return t || 'Visit';
}
