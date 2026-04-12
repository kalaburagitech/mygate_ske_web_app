import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PatrolSession {
    id: string;
    siteId: string;
    siteName: string;
    startTime: number;
    scannedPointIds?: string[];
}

interface PatrolActingSubject {
    empId: string;
    name: string;
}

interface PatrolState {
    activeSession: PatrolSession | null;
    currentSite: any | null;
    /** Guard/officer selected before starting a patrol (enrollment emp id + display name). */
    patrolSubject: PatrolActingSubject | null;
    /** Last successfully logged checkpoint name in the active session (scanner HUD). */
    lastScannedPointName: string | null;
    offlineQueue: any[];
    lastRegionId: string | null;
    lastCity: string | null;
    lastScannedPoints: Record<string, number>; // qrCode -> timestamp (ms)

    setSession: (session: PatrolSession | null) => void;
    recordPatrolScan: (pointId: string, pointName: string) => void;
    setCurrentSite: (site: any) => void;
    setPatrolSubject: (subject: PatrolActingSubject | null) => void;
    setLastSelection: (regionId: string | null, city: string | null) => void;
    addScannedPoint: (qrCode: string) => void;
    isPointRecentlyScanned: (qrCode: string, windowMs?: number) => boolean;
    addToOfflineQueue: (log: any) => void;
    clearOfflineQueue: () => void;
    clearLastScannedPoints: () => void;
}

const STORAGE_KEY = 'patrol-storage-v1';

export const usePatrolStore = create<PatrolState>()(
    (set, get) => ({
        activeSession: null,
        currentSite: null,
        patrolSubject: null,
        lastScannedPointName: null,
        offlineQueue: [],
        lastRegionId: null,
        lastCity: null,
        lastScannedPoints: {},

        setSession: (activeSession) => {
            set((state) => {
                const prevId = state.activeSession?.id;
                const nextId = activeSession?.id;
                const sessionChanged = prevId !== nextId;
                return {
                    activeSession,
                    lastScannedPointName:
                        !activeSession || sessionChanged ? null : state.lastScannedPointName,
                };
            });
            saveToStorage(get());
        },
        recordPatrolScan: (pointId, pointName) => {
            set((state) => {
                const s = state.activeSession;
                if (!s) return state;
                const ids = [...(s.scannedPointIds || [])];
                if (!ids.includes(pointId)) ids.push(pointId);
                const newState = {
                    ...state,
                    activeSession: { ...s, scannedPointIds: ids },
                    lastScannedPointName: pointName,
                };
                saveToStorage(newState);
                return newState;
            });
        },
        setCurrentSite: (currentSite) => {
            set({ currentSite });
            saveToStorage(get());
        },
        setPatrolSubject: (patrolSubject) => {
            set({ patrolSubject });
            saveToStorage(get());
        },
        setLastSelection: (lastRegionId, lastCity) => {
            set({ lastRegionId, lastCity });
            saveToStorage(get());
        },
        
        addScannedPoint: (qrCode) => {
            set((state) => {
                const newState = {
                    ...state,
                    lastScannedPoints: {
                        ...state.lastScannedPoints,
                        [qrCode]: Date.now()
                    }
                };
                saveToStorage(newState);
                return newState;
            });
        },

        isPointRecentlyScanned: (qrCode, windowMs = 5 * 60 * 1000) => { // Default 5 mins
            const lastScan = get().lastScannedPoints[qrCode];
            if (!lastScan) return false;
            return (Date.now() - lastScan) < windowMs;
        },

        addToOfflineQueue: (log) => set((state) => ({
            offlineQueue: [...state.offlineQueue, log]
        })),
        
        clearOfflineQueue: () => set({ offlineQueue: [] }),

        clearLastScannedPoints: () => {
            set({ lastScannedPoints: {} });
            saveToStorage(get());
        },
    })
);

// Manual Storage Helpers
const saveToStorage = async (state: PatrolState) => {
    try {
        const data = JSON.stringify({
            lastRegionId: state.lastRegionId,
            lastCity: state.lastCity,
            lastScannedPoints: state.lastScannedPoints,
            activeSession: state.activeSession,
            currentSite: state.currentSite,
            patrolSubject: state.patrolSubject,
            lastScannedPointName: state.lastScannedPointName,
        });
        await AsyncStorage.setItem(STORAGE_KEY, data);
    } catch (e) {
        console.error('[PatrolStore] Failed to save state', e);
    }
};

const loadFromStorage = async () => {
    try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            usePatrolStore.setState((state) => ({
                ...state,
                ...parsed
            }));
        }
    } catch (e) {
        console.error('[PatrolStore] Failed to load state', e);
    }
};

// Start hydration
loadFromStorage();
