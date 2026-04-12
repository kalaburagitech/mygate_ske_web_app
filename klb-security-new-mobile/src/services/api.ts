import axios, { isAxiosError } from 'axios';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { klbApiError, klbApiLog, klbFormatNetworkError } from '../utils/apiDebug';

// Base URL for Next.js `/api/*` (includes `/api/face/*` proxy).
//
// Prefer env (no code edits per machine):
//   EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api npx expo start
//
// Tips when you see "Network request failed" on face/recognize:
// - Phone and PC must be on the same Wi‑Fi; Windows firewall must allow port 3000.
// - Android emulator: use http://10.0.2.2:3000/api (not the LAN IP).
// - iOS: rebuild after changing app.json ATS / cleartext settings.
// - Production: use https://your-domain.com/api (no cleartext).
const envRaw =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL
        ? String(process.env.EXPO_PUBLIC_API_URL).trim().replace(/\/+$/, "")
        : "";
function inferDevApiUrl(): string {
    // Expo web runs in the browser on the same machine as Next.js dev server.
    if (Platform.OS === "web" && typeof window !== "undefined") {
        const host = window.location.hostname || "localhost";
        return `http://${host}:3000/api`;
    }

    const expoHostRaw =
        (Constants as any)?.expoConfig?.hostUri ||
        (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
        (Constants as any)?.manifest?.debuggerHost ||
        "";
    const expoHost = String(expoHostRaw).split(":")[0];
    if (expoHost) return `http://${expoHost}:3000/api`;

    // Android emulator special loopback for host machine (fallback).
    if (Platform.OS === "android") {
        return "http://10.0.2.2:3000/api";
    }

    return "http://localhost:3000/api";
}

const FALLBACK_DEV = inferDevApiUrl();
export const API_URL = envRaw
    ? envRaw.endsWith("/api")
        ? envRaw
        : `${envRaw}/api`
    : FALLBACK_DEV;

/**
 * Face recognition runs on a separate upstream service. The mobile app must NOT call
 * ngrok/LAN URLs directly — many devices block them or hit the ngrok browser interstitial.
 * Instead, call Next.js routes under `/api/face/*`, which proxy to `FACE_RECOGNITION_UPSTREAM_URL` on the server.
 */
export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'bypass-tunnel-reminder': 'true',
    },
});

// Request Interceptor for logging
api.interceptors.request.use(
    (config) => {
        if (__DEV__) {
            // console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data || '');
        }
        return config;
    },
    (error) => {
        if (__DEV__) {
            console.error('[API Request Error]', error);
        }
        return Promise.reject(error);
    }
);

// Response Interceptor for logging
api.interceptors.response.use(
    (response) => {
        if (__DEV__) {
            // console.log(`[API Response] ${response.status} ${response.config.url}`, response.data);
        }
        return response;
    },
    (error) => {
        klbApiError('MainAPI', 'response error', klbFormatNetworkError(error));
        if (__DEV__) {
            // Show API errors in UI during development OR production if user requested
            Alert.alert(
                "System Error",
                `URL: ${error.config?.url ? error.config.url.split('/').pop() : 'API'}\nStatus: ${error.response?.status || 'Network Error'}\nMessage: ${error.response?.data?.error || error.message || 'Something went wrong. Please check your internet connection.'}`
            );
        } else {
            // General error alert for production if __DEV__ is false
            Alert.alert(
                "Connection Error",
                "Unable to reach server. Please check your internet connection and try again."
            );
        }
        return Promise.reject(error);
    }
);

/** Same host as `api` but no default JSON Content-Type — required so multipart boundaries are set correctly. */
const faceProxyApi = axios.create({
    baseURL: API_URL,
    headers: {
        accept: 'application/json',
        'bypass-tunnel-reminder': 'true',
    },
});

faceProxyApi.interceptors.request.use(
    (config) => {
        const path = config.url || '';
        const full = `${String(config.baseURL || '').replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
        klbApiLog('FaceProxy', '→', (config.method || 'GET').toUpperCase(), full, {
            hasFormData: typeof FormData !== 'undefined' && config.data instanceof FormData,
        });
        return config;
    },
    (err) => {
        klbApiError('FaceProxy', 'request interceptor error', klbFormatNetworkError(err));
        return Promise.reject(err);
    }
);

faceProxyApi.interceptors.response.use(
    (response) => {
        klbApiLog('FaceProxy', '←', response.status, response.config?.url, {
            contentType: response.headers?.['content-type'],
        });
        return response;
    },
    (error) => {
        const summary = isAxiosError(error)
            ? {
                message: error.message,
                code: error.code,
                fullURL: error.config?.baseURL
                    ? `${String(error.config.baseURL).replace(/\/$/, '')}/${String(error.config.url || '').replace(/^\//, '')}`
                    : error.config?.url,
                method: error.config?.method,
                responseStatus: error.response?.status,
                responseData: error.response?.data,
            }
            : klbFormatNetworkError(error);
        klbApiError('FaceProxy', 'HTTP/network failure', summary);
        if (error.message === 'Network Error') {
            klbApiError(
                'FaceProxy',
                'Hint: "Network Error" usually means the device cannot reach API_URL (wrong IP, firewall, HTTP blocked on iOS ATS, or Next.js not running).',
                { API_URL }
            );
        }
        return Promise.reject(error);
    }
);

function buildFaceProxyUrl(path: string): string {
    const base = String(API_URL).replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
}

/**
 * Axios + React Native FormData often fails with ERR_NETWORK before the request hits the server.
 * Native `fetch` multipart works reliably on iOS/Android.
 */
async function faceMultipartPost(
    path: string,
    formData: FormData
): Promise<{ data: unknown; status: number; statusText: string }> {
    const url = buildFaceProxyUrl(path);
    klbApiLog('FaceProxy', 'fetch multipart POST', url);

    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                accept: 'application/json',
            },
            body: formData,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        klbApiError('FaceProxy', 'fetch multipart failed (unreachable host, ATS, or cleartext blocked)', {
            url,
            API_URL,
            message: msg,
        });
        const err = new Error(msg || 'Network request failed') as Error & { code?: string; response?: undefined };
        err.code = 'ERR_NETWORK';
        throw err;
    }

    const text = await res.text();
    let data: unknown = {};
    if (text) {
        try {
            data = JSON.parse(text) as unknown;
        } catch {
            data = { raw: text, parseError: true as const };
        }
    }

    klbApiLog('FaceProxy', 'fetch multipart ←', res.status, path, { ok: res.ok });

    if (!res.ok) {
        const body = data as Record<string, unknown>;
        const err = new Error(
            (typeof body?.error === 'string' && body.error) ||
            (typeof body?.message === 'string' && body.message) ||
            res.statusText ||
            `HTTP ${res.status}`
        ) as Error & { response?: { status: number; statusText: string; data: unknown }; isAxiosError?: boolean };
        err.response = { status: res.status, statusText: res.statusText, data };
        err.isAxiosError = true;
        klbApiError('FaceProxy', 'face proxy returned error', { status: res.status, data });
        throw err;
    }

    return { data, status: res.status, statusText: res.statusText };
}

export const authService = {
    sendOtp: (mobileNumber: string) => api.post('/auth/otp', { mobileNumber }),
    verifyOtp: (mobileNumber: string, otp: string) => api.post('/auth/verify', { mobileNumber, otp }),
};

export const userService = {
    getUsers: () => api.get('/users'),
    getUsersByOrg: (organizationId: string) => api.get(`/users/org/${organizationId}`),
    getUserByClerkId: (clerkId: string) => api.get(`/users/${clerkId}`),
    createUser: (userData: any) => api.post('/users', userData),
    getClients: (organizationId: string, siteId?: string) => {
        let url = `/users/clients?organizationId=${organizationId}`;
        if (siteId) url += `&siteId=${siteId}`;
        return api.get(url);
    },
};

export const siteService = {
    getSitesByOrg: (orgId: string, regionId?: string, city?: string) => {
        let url = `/sites/org/${orgId}`;
        const params = new URLSearchParams();
        if (regionId) params.append('regionId', regionId);
        if (city) params.append('city', city);

        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;

        return api.get(url);
    },
    getSitesByIds: (ids: string[]) => api.post('/sites/list', { ids }),
    getSitesByUser: (userId: string, regionId?: string, city?: string) => {
        let url = `/sites/user/${userId}`;
        const params = new URLSearchParams();
        if (regionId) params.append('regionId', regionId);
        if (city) params.append('city', city);

        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;

        return api.get(url);
    },
    getAllSites: () => api.get('/sites/all'),
    getSiteById: (id: string) => api.get(`/sites/${id}`),
};

export const pointService = {
    getPointsByOrg: (orgId: string) => api.get(`/points/org/${orgId}`),
    getPointsBySite: (siteId: string) => api.get(`/points/site/${siteId}`),
    createPoint: (pointData: any) => api.post('/points', pointData),
    updatePoint: (pointData: any) => api.put(`/points/${pointData.id}`, pointData),
};

export const logService = {
    getPatrolLogs: (orgId: string, siteId?: string, regionId?: string, city?: string) => {
        let url = `/logs/patrol/org/${orgId}`;
        const params = new URLSearchParams();
        if (siteId) params.append('siteId', siteId);
        if (regionId) params.append('regionId', regionId);
        if (city) params.append('city', city);
        const query = params.toString();
        return api.get(query ? `${url}?${query}` : url);
    },
    getSODashboardData: (orgId: string, userId: string, siteId?: string) => {
        let url = `/logs/so-dashboard?organizationId=${orgId}&userId=${userId}`;
        if (siteId) url += `&siteId=${siteId}`;
        return api.get(url);
    },
    updateVisitorStatus: (logId: string, status: string, imageId?: string) => api.post(`/logs/visit/${logId}/status`, { status, imageId }),
    getClientDashboardData: (userId: string) => api.get(`/logs/client-dashboard?userId=${userId}`),
    getVisitLogs: (orgId: string, siteId?: string, regionId?: string, city?: string, requestingUserId?: string) => {
        let url = `/logs/visit/org/${orgId}`;
        const params = new URLSearchParams();
        if (siteId) params.append('siteId', siteId);
        if (regionId) params.append('regionId', regionId);
        if (city) params.append('city', city);
        if (requestingUserId) params.append('requestingUserId', requestingUserId);
        const query = params.toString();
        return api.get(query ? `${url}?${query}` : url);
    },
    getVisitLogsByUser: (userId: string, since?: number, limit?: number) => {
        const q = new URLSearchParams();
        if (since != null && Number.isFinite(since)) q.set('since', String(since));
        if (limit != null && Number.isFinite(limit)) q.set('limit', String(limit));
        const qs = q.toString();
        return api.get(`/logs/visit/user/${userId}${qs ? `?${qs}` : ''}`);
    },
    createVisitLog: (data: Record<string, unknown>) => api.post('/logs/visit', data),
    visitCheckOut: (
        logId: string,
        body: { userId: string; latitude: number; longitude: number; accuracyM?: number | null }
    ) => api.post(`/logs/visit/${logId}/checkout`, body),
    getLogsByUser: (userId: string) => api.get(`/logs/user/${userId}`),
    createPatrolLog: (logData: any) => api.post('/logs/patrol', logData),
    createDualLog: (logData: any) => api.post('/logs/dual', logData),
    validatePatrolPoint: (siteId: string, qrCode: string, userLat: number, userLon: number, _guardId: string) =>
        api.post('/logs/validate-point', {
            siteId,
            qrCode,
            latitude: userLat,
            longitude: userLon,
        }),
    updateSessionPoints: (sessionId: string, pointId: string) => api.post('/logs/session/points/update', { sessionId, pointId }),
    endSession: (sessionId: string) => api.post(`/logs/session/${sessionId}/end`),
    createIncidentReport: (data: any) => api.post('/logs/incident', data),
};

export const patrolSessionService = {
    start: (guardId: string, siteId: string, organizationId: string) =>
        api.post('/logs/patrol-sessions/start', {
            guardId,
            userId: guardId,
            siteId,
            organizationId,
        }),
    listForSite: (siteId: string, days: number = 60) =>
        api.get(`/logs/patrol-sessions/site/${siteId}?days=${days}`),
    getDetail: (sessionId: string) => api.get(`/logs/patrol-sessions/${sessionId}`),
    subjectSummaries: (siteId: string) =>
        api.get(`/logs/patrol-sessions/site/${siteId}/subject-summaries`),
};

/**
 * Helper to convert a Convex storageId (assetId) to a public display URL.
 * Returns null if storageId is falsy or on error.
 */
export const uploadService = {
    getImageUrl: async (storageId: string): Promise<string | null> => {
        try {
            const res = await api.get(`/upload/url/${encodeURIComponent(storageId)}`);
            return res.data?.url ?? null;
        } catch {
            return null;
        }
    },
};

export const faceRecognitionService = {
    /** Multipart: use fetch (see `faceMultipartPost`). JSON GET/POST still use axios below. */
    batchEnroll: (formData: FormData) => faceMultipartPost('/face/batch-enroll', formData),
    recognize: (formData: FormData) => faceMultipartPost('/face/recognize', formData),
    checkAttendance: (params: { person_id?: number; emp_id?: string; name?: string; date?: string }) => {
        const queryParams = new URLSearchParams();
        if (params.person_id !== undefined) queryParams.append('person_id', params.person_id.toString());
        if (params.emp_id) queryParams.append('emp_id', params.emp_id);
        if (params.name) queryParams.append('name', params.name);
        if (params.date) queryParams.append('date', params.date);
        return faceProxyApi.get(`/face/attendance/check?${queryParams.toString()}`);
    },
    markAttendance: (data: {
        person_id?: number;
        emp_id?: string;
        name?: string;
        date?: string;
        status: 'present' | 'absent';
        action: 'check_in' | 'check_out';
        latitude?: number;
        longitude?: number;
        location_accuracy?: number;
    }) => {
        const formData = new URLSearchParams();
        if (data.person_id !== undefined) formData.append('person_id', data.person_id.toString());
        if (data.emp_id) formData.append('emp_id', data.emp_id);
        if (data.name) formData.append('name', data.name);
        if (data.date) formData.append('date', data.date);
        formData.append('status', data.status);
        formData.append('action', data.action);
        if (data.latitude !== undefined) formData.append('latitude', data.latitude.toString());
        if (data.longitude !== undefined) formData.append('longitude', data.longitude.toString());
        if (data.location_accuracy !== undefined) formData.append('location_accuracy', data.location_accuracy.toString());

        return faceProxyApi.post('/face/attendance/mark', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
    },
};

export const regionService = {
    getRegions: () => api.get('/regions'),
};

export const enrollmentService = {
    create: (enrollmentData: any) => api.post('/enrollment', enrollmentData),
    list: (filters?: any) => api.get('/enrollment', { params: filters }),
};

export const attendanceService = {
    create: (attendanceData: any) => api.post('/attendance', attendanceData),
    list: (filters?: any) => api.get('/attendance', { params: filters }),
    /** Inclusive YYYY-MM-DD range for an organization (Convex-backed). */
    listDateRange: (organizationId: string, startDate: string, endDate: string) =>
        api.get('/attendance', { params: { organizationId, startDate, endDate } }),
    createManualAttendance: (data: any) => api.post('/attendance/manual', data),
    updateAttendanceStatus: (attendanceId: string, status: string, approverId?: string) => api.post('/attendance/status', { attendanceId, status, approverId }),
};

export const issueService = {
    getIssuesByOrg: (orgId: string, siteId?: string, regionId?: string, city?: string) => {
        let url = `/logs/issues/org/${orgId}`;
        const params = new URLSearchParams();
        if (siteId) params.append('siteId', siteId);
        if (regionId) params.append('regionId', regionId);
        if (city) params.append('city', city);
        const query = params.toString();
        return api.get(query ? `${url}?${query}` : url);
    },
    resolveIssue: (issueId: string) => api.post('/logs/issues/resolve', { issueId }),
};

export default api;
