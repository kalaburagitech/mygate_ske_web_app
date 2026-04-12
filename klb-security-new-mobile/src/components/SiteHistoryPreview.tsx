import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
// import { useQuery } from 'convex/react';
// import { api } from '../services/convex';
import { logService } from '../services/api';
import { Clock } from 'lucide-react-native';
import { useCustomAuth } from '../context/AuthContext';

export function SiteHistoryPreview({ siteId }: { siteId: any }) {
    const [logs, setLogs] = React.useState<any[]>([]);

    const { organizationId } = useCustomAuth();

    React.useEffect(() => {
        if (siteId && organizationId) {
            logService.getPatrolLogs(organizationId, siteId)
                .then(res => {
                    // Ensure we always have an array
                    setLogs(Array.isArray(res.data) ? res.data : []);
                })
                .catch(err => {
                    console.error("Error fetching logs for preview:", err);
                    setLogs([]);
                });
        }
    }, [siteId, organizationId]);

    if (!Array.isArray(logs) || logs.length === 0) return null;

    return (
        <View style={styles.container}>
            {logs.map((log: any) => (
                <View key={log._id} style={styles.logItem}>
                    <View style={styles.dot} />
                    <View style={styles.content}>
                        <Text style={styles.pointText} numberOfLines={1}>
                            {log.pointName}
                        </Text>
                        <View style={styles.footer}>
                            <Text style={styles.userText}>{log.userName}</Text>
                            <View style={styles.timeRow}>
                                <Clock size={10} color="#64748b" />
                                <Text style={styles.timeText}>
                                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
        gap: 8,
    },
    logItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#3b82f6',
        marginTop: 6,
    },
    content: {
        flex: 1,
    },
    pointText: {
        color: '#e2e8f0',
        fontSize: 13,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 2,
    },
    userText: {
        color: '#64748b',
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    timeText: {
        color: '#64748b',
        fontSize: 11,
    },
});
