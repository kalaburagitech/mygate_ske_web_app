export type SiteShift = { name: string; start: string; end: string; strength?: number };

/** Parse "HH:mm" or "H:mm" to minutes from midnight. */
export function parseTimeToMinutes(t: string): number | null {
    const s = String(t || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/** Inclusive start, exclusive end in minutes space; supports overnight (end <= start). */
export function isNowInShift(nowMin: number, startMin: number, endMin: number): boolean {
    if (startMin < endMin) {
        return nowMin >= startMin && nowMin < endMin;
    }
    if (startMin > endMin) {
        return nowMin >= startMin || nowMin < endMin;
    }
    return false;
}

export function getCurrentShift(shifts: SiteShift[], date: Date = new Date()): SiteShift | null {
    const list = Array.isArray(shifts) ? shifts : [];
    if (list.length === 0) return null;
    const nowMin = date.getHours() * 60 + date.getMinutes();
    for (const sh of list) {
        const a = parseTimeToMinutes(sh.start);
        const b = parseTimeToMinutes(sh.end);
        if (a === null || b === null) continue;
        if (isNowInShift(nowMin, a, b)) return sh;
    }
    return null;
}

/** Next shift that starts after now today (by start time); wraps to first shift tomorrow not handled — UI shows first upcoming. */
export function getNextShift(shifts: SiteShift[], date: Date = new Date()): SiteShift | null {
    const list = Array.isArray(shifts) ? shifts : [];
    if (list.length === 0) return null;
    const nowMin = date.getHours() * 60 + date.getMinutes();
    const parsed = list
        .map((sh) => ({
            sh,
            start: parseTimeToMinutes(sh.start),
            end: parseTimeToMinutes(sh.end),
        }))
        .filter((x) => x.start !== null) as { sh: SiteShift; start: number; end: number | null }[];

    const upcoming = parsed.filter((x) => x.start > nowMin).sort((a, b) => a.start - b.start);
    if (upcoming.length > 0) return upcoming[0].sh;
    return parsed.sort((a, b) => a.start - b.start)[0]?.sh ?? null;
}

export function formatShiftRange(sh: SiteShift): string {
    return `${sh.start} – ${sh.end}`;
}
