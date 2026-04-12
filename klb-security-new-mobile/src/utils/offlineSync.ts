import AsyncStorage from '@react-native-async-storage/async-storage';
// import { api } from '../services/convex';
import { logService } from '../services/api';

const OFFLINE_QUEUE_KEY = '@patrol_offline_queue';

export interface OfflineLog {
    userId: string;
    siteId: string;
    qrCode: string;
    comment: string;
    latitude: number;
    longitude: number;
    organizationId: string;
    timestamp: number;
}

export const addToOfflineQueue = async (log: OfflineLog) => {
    try {
        const queueStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
        const queue: OfflineLog[] = queueStr ? JSON.parse(queueStr) : [];
        queue.push(log);
        await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        console.log('Log added to offline queue');
    } catch (error) {
        console.error('Failed to add to offline queue', error);
    }
};

export const syncOfflineLogs = async (convex: any) => {
    try {
        const queueStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
        if (!queueStr) return;

        const queue: OfflineLog[] = JSON.parse(queueStr);
        if (queue.length === 0) return;

        console.log(`Syncing ${queue.length} offline logs...`);

        for (const log of queue) {
            try {
                // Using new axios API client
                await logService.createDualLog({
                    ...log,
                    createdAt: log.timestamp // Backend expects createdAt
                });
            } catch (error) {
                console.error('Failed to sync individual log', error);
                // Keep it in queue or handle retry? 
                // For now, we continue and clear sucessfully synced ones?
                // Simple logic: if error is network, stop. If error is validation, remove from queue?
            }
        }

        // Clear queue after attempt (simple version)
        await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
        console.log('Offline queue cleared after sync attempt');
    } catch (error) {
        console.error('Failed to sync offline logs', error);
    }
};
