/** Great-circle distance in meters (WGS84 approximate). */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type SiteLike = {
    latitude?: number;
    longitude?: number;
    allowedRadius?: number;
};

/**
 * @returns device coords if within site geofence
 * @throws Error with user-facing message if outside or site misconfigured
 */
export function assertWithinSiteRadius(
    site: SiteLike | null | undefined,
    deviceLat: number,
    deviceLon: number,
    accuracyMeters?: number,
    /** Shown in errors, e.g. "mark attendance" or "register this patrol point" */
    actionPhrase: string = 'continue'
): void {
    if (!site) {
        throw new Error('No site selected. Choose a site first.');
    }
    const lat0 = site.latitude;
    const lon0 = site.longitude;
    if (lat0 == null || lon0 == null || Number.isNaN(lat0) || Number.isNaN(lon0)) {
        throw new Error('This site has no map coordinates. Ask an admin to set latitude, longitude, and radius.');
    }
    const radiusM = Math.max(30, Number(site.allowedRadius) > 0 ? Number(site.allowedRadius) : 200);
    const d = haversineMeters(deviceLat, deviceLon, lat0, lon0);
    const slack = (accuracyMeters != null && accuracyMeters > 0 ? accuracyMeters : 25) + 15;
    if (d > radiusM + slack) {
        throw new Error(
            `You are about ${Math.round(d)}m from the site centre. Move within ${radiusM}m (GPS ±${Math.round(
                slack
            )}m) to ${actionPhrase}.`
        );
    }
}
