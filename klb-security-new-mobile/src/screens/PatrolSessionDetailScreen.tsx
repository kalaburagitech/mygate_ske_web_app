import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, User, MapPin, Ruler } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { patrolSessionService, uploadService } from '../services/api';

function formatDuration(ms: number): string {
    if (!ms || ms < 0) return '—';
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h > 0) return `${h}h ${min}m`;
    return `${min} min`;
}

export default function PatrolSessionDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const sessionId = route.params?.sessionId as string | undefined;
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState<any>(null);
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!sessionId) {
                setLoading(false);
                return;
            }
            try {
                const res = await patrolSessionService.getDetail(sessionId);
                if (!cancelled) setDetail(res.data);
                const logs = res.data?.logs || [];
                const next: Record<string, string> = {};
                for (const row of logs) {
                    if (row.imageId && !row.imageUrl && !next[row.logId]) {
                        const u = await uploadService.getImageUrl(row.imageId);
                        if (u) next[row.logId] = u;
                    }
                }
                if (!cancelled) setImageUrls(next);
            } catch (e) {
                console.error('Patrol session detail', e);
                if (!cancelled) setDetail(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    if (!sessionId) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.err}>Missing session</Text>
            </SafeAreaView>
        );
    }

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <ActivityIndicator color="#2563eb" size="large" />
                </View>
            </SafeAreaView>
        );
    }

    if (!detail) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <ChevronLeft color="#fff" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Patrol detail</Text>
                </View>
                <Text style={styles.err}>Could not load session.</Text>
            </SafeAreaView>
        );
    }

    const s = detail.session;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>Patrol detail</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
                <View style={styles.card}>
                    <View style={styles.row}>
                        <User color="#3b82f6" size={20} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.metaLabel}>Officer</Text>
                            <Text style={styles.metaValue}>{detail.guardName}</Text>
                            <Text style={styles.metaSub}>ID: {detail.guardEmpId || detail.guardUserId}</Text>
                        </View>
                    </View>
                    <View style={styles.row}>
                        <MapPin color="#22c55e" size={20} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.metaLabel}>Site</Text>
                            <Text style={styles.metaValue}>{detail.siteName}</Text>
                        </View>
                    </View>
                    <View style={styles.row}>
                        <Ruler color="#f59e0b" size={20} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.metaLabel}>Duration · distance · coverage</Text>
                            <Text style={styles.metaValue}>
                                {formatDuration(s.durationMs)} · {detail.totalDistanceM} m total (sum of distances at each
                                scan) · {detail.scanCount} scans · {detail.uniqueScannedPoints} / {detail.totalSitePoints}{' '}
                                points visited
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.timeText}>
                        Started: {new Date(s.startTime).toLocaleString()}
                        {s.endTime ? `\nEnded: ${new Date(s.endTime).toLocaleString()}` : '\n(In progress or not ended)'}
                    </Text>
                </View>

                <Text style={styles.section}>Scan order</Text>
                {(detail.logs || []).map((log: any) => {
                    const imgUri = log.imageUrl || imageUrls[log.logId];
                    const allowed = log.allowedRadiusM ?? 200;
                    const within = log.withinRange !== false && Number(log.distance) <= allowed;
                    return (
                        <View key={log.logId} style={styles.logCard}>
                            <View style={styles.logHead}>
                                <Text style={styles.logTitle}>
                                    #{log.order} {log.pointName || 'Point'}
                                </Text>
                                <View
                                    style={[
                                        styles.rangeTag,
                                        within ? styles.rangeTagOk : styles.rangeTagBad,
                                    ]}
                                >
                                    <Text style={within ? styles.rangeTagTextOk : styles.rangeTagTextBad}>
                                        {within ? 'Within range' : 'Far from point'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.logTime}>{new Date(log.createdAt).toLocaleString()}</Text>
                            <Text style={styles.logDist}>
                                About {log.distance?.toFixed?.(1) ?? log.distance} m from this checkpoint (allowed{' '}
                                {Math.round(allowed)} m)
                            </Text>
                            {log.comment ? <Text style={styles.comment}>{log.comment}</Text> : null}
                            {imgUri ? (
                                <Image source={{ uri: imgUri }} style={styles.photo} resizeMode="cover" />
                            ) : null}
                        </View>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    err: { color: '#f87171', padding: 24 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: { fontSize: 18, fontWeight: '800', color: '#fff' },
    scroll: { padding: 20, paddingBottom: 48 },
    card: {
        backgroundColor: '#0f172a',
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: 14,
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    metaLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' },
    metaValue: { fontSize: 15, fontWeight: '700', color: '#e2e8f0', marginTop: 2 },
    metaSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
    timeText: { fontSize: 12, color: '#94a3b8', lineHeight: 18, marginTop: 4 },
    section: {
        fontSize: 13,
        fontWeight: '800',
        color: '#64748b',
        textTransform: 'uppercase',
        marginTop: 24,
        marginBottom: 12,
    },
    logCard: {
        backgroundColor: '#0f172a',
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    logHead: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
    },
    logTitle: { color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 },
    rangeTag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
    },
    rangeTagOk: {
        backgroundColor: 'rgba(34,197,94,0.15)',
        borderColor: 'rgba(34,197,94,0.35)',
    },
    rangeTagBad: {
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderColor: 'rgba(239,68,68,0.35)',
    },
    rangeTagTextOk: { color: '#86efac', fontSize: 10, fontWeight: '800' },
    rangeTagTextBad: { color: '#fca5a5', fontSize: 10, fontWeight: '800' },
    logTime: { color: '#64748b', fontSize: 12, marginTop: 4 },
    logDist: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
    comment: { color: '#cbd5e1', fontSize: 13, marginTop: 8, lineHeight: 20 },
    photo: { width: '100%', height: 160, borderRadius: 12, marginTop: 10, backgroundColor: '#020617' },
});
