/**
 * Verbose API logging for Metro / device logs. Toggle while debugging connectivity.
 * In dev it follows __DEV__; set `global.__KLB_FORCE_API_LOGS__ = true` in App.tsx to force on release builds.
 */
export function klbApiDebugEnabled(): boolean {
    try {
        if (typeof global !== 'undefined' && (global as any).__KLB_FORCE_API_LOGS__ === true) {
            return true;
        }
    } catch {
        /* ignore */
    }
    return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function klbApiLog(tag: string, ...args: unknown[]): void {
    if (!klbApiDebugEnabled()) return;
    console.log(`[KLB:${tag}]`, ...args);
}

export function klbApiWarn(tag: string, ...args: unknown[]): void {
    if (!klbApiDebugEnabled()) return;
    console.warn(`[KLB:${tag}]`, ...args);
}

/** Always log failures so you still see them when __DEV__ is false. */
export function klbApiError(tag: string, ...args: unknown[]): void {
    console.error(`[KLB:${tag}]`, ...args);
}

/** Safe summary for Axios / fetch failures (Metro-friendly). */
export function klbFormatNetworkError(err: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = { type: typeof err, name: err instanceof Error ? err.name : undefined };
    if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>;
        out.message = e.message;
        out.code = e.code;
        const cfg = e.config as Record<string, unknown> | undefined;
        if (cfg) {
            out.requestMethod = cfg.method;
            out.requestUrl = cfg.url;
            out.baseURL = cfg.baseURL;
            const u = cfg.baseURL && cfg.url ? `${String(cfg.baseURL).replace(/\/$/, '')}/${String(cfg.url).replace(/^\//, '')}` : cfg.url;
            out.fullURL = u;
        }
        const res = e.response as Record<string, unknown> | undefined;
        if (res) {
            out.responseStatus = res.status;
            out.responseData = res.data;
        }
    }
    return out;
}
