import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Pressable,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, QrCode, Footprints, MapPin, X, History, User } from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { patrolSessionService } from '../services/api';

function formatDuration(ms: number): string {
    if (!ms || ms < 0) return '—';
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h > 0) return `${h}h ${min}m`;
    return `${min} min`;
}

/**
 * Per-site patrol: history (60 days), add QR (name → scan), or start patrol round.
 */
export default function PatrolSiteDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const site = route.params?.site as any;
    const [fabOpen, setFabOpen] = useState(false);
    const [sessions, setSessions] = useState<any[]>([]);
    const [loadingHist, setLoadingHist] = useState(false);

    const loadHistory = useCallback(async () => {
        if (!site?._id) return;
        setLoadingHist(true);
        try {
            const res = await patrolSessionService.listForSite(site._id, 60);
            setSessions(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error('Patrol history load', e);
            setSessions([]);
        } finally {
            setLoadingHist(false);
        }
    }, [site?._id]);

    useFocusEffect(
        useCallback(() => {
            loadHistory();
        }, [loadHistory])
    );

    if (!site) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.err}>Missing site</Text>
            </SafeAreaView>
        );
    }

    const addQr = () => {
        setFabOpen(false);
        navigation.navigate('PatrolAddPointName', { site });
    };

    const logPatrol = () => {
        setFabOpen(false);
        navigation.navigate('PatrolOfficerSelect', { site });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>
                        {site.name}
                    </Text>
                    <View style={styles.metaRow}>
                        <MapPin color="#64748b" size={14} />
                        <Text style={styles.sub} numberOfLines={1}>
                            {site.locationName || site.city || 'Patrol site'}
                        </Text>
                    </View>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
                showsVerticalScrollIndicator
            >
                <View style={styles.sectionHeader}>
                    <History color="#64748b" size={18} />
                    <Text style={styles.sectionTitle}>Patrol history (60 days)</Text>
                </View>
                {loadingHist ? (
                    <ActivityIndicator color="#2563eb" style={{ marginVertical: 16 }} />
                ) : sessions.length === 0 ? (
                    <Text style={styles.emptyHist}>No completed patrol rounds in the last 60 days.</Text>
                ) : (
                    sessions.map((row) => (
                        <TouchableOpacity
                            key={row.sessionId}
                            style={styles.histCard}
                            activeOpacity={0.88}
                            onPress={() =>
                                navigation.navigate('PatrolSessionDetail', { sessionId: row.sessionId })
                            }
                        >
                            <View style={styles.trailBadge}>
                                <Text style={styles.trailBadgeText}>Route</Text>
                            </View>
                            <Text style={styles.trail} numberOfLines={2}>
                                {row.pointTrail || '—'}
                            </Text>
                            <View style={styles.histOfficerRow}>
                                <User color="#3b82f6" size={14} />
                                <Text style={styles.histOfficerName}>{row.guardName}</Text>
                                {row.guardEmpId ? (
                                    <Text style={styles.histOfficerId}> · {row.guardEmpId}</Text>
                                ) : null}
                            </View>
                            <View style={styles.histStatsRow}>
                                <View style={styles.statChip}>
                                    <Text style={styles.statChipText}>{formatDuration(row.durationMs)}</Text>
                                </View>
                                <View style={styles.statChip}>
                                    <Text style={styles.statChipText}>{row.scanCount} scans</Text>
                                </View>
                                <View style={[styles.statChip, styles.statChipMuted]}>
                                    <Text style={[styles.statChipText, styles.statChipTextMuted]}>
                                        {Math.round(row.totalDistanceM ?? 0)} m
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.histMeta}>
                                {new Date(row.startTime).toLocaleString()}
                            </Text>
                        </TouchableOpacity>
                    ))
                )}

                <Text style={styles.hint}>
                    Tap + to add a point: enter its name, then scan a printed label from the web Patrol → QR code tab.
                    Log patrolling checks site, QR, and distance to the checkpoint.
                </Text>
            </ScrollView>

            <TouchableOpacity
                style={[styles.fab, { bottom: 24 + insets.bottom }]}
                onPress={() => setFabOpen(true)}
                activeOpacity={0.9}
            >
                <Plus color="#fff" size={28} />
            </TouchableOpacity>

            <Modal visible={fabOpen} transparent animationType="fade" onRequestClose={() => setFabOpen(false)}>
                <Pressable style={styles.sheetOverlay} onPress={() => setFabOpen(false)}>
                    <Pressable style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Patrol</Text>
                            <TouchableOpacity onPress={() => setFabOpen(false)} hitSlop={12}>
                                <X color="#94a3b8" size={22} />
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={styles.option} onPress={addQr} activeOpacity={0.88}>
                            <View style={[styles.optIcon, { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
                                <QrCode color="#3b82f6" size={22} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.optTitle}>Add QR code</Text>
                                <Text style={styles.optSub}>Enter point name, then scan the physical QR</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.option} onPress={logPatrol} activeOpacity={0.88}>
                            <View style={[styles.optIcon, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
                                <Footprints color="#10b981" size={22} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.optTitle}>Log patrolling</Text>
                                <Text style={styles.optSub}>Choose officer, then scan points with photo & notes</Text>
                            </View>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    err: { color: '#f87171', padding: 24 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 14 },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: { fontSize: 22, fontWeight: '800', color: '#fff' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    sub: { fontSize: 13, color: '#64748b', flex: 1, fontWeight: '600' },
    scroll: { paddingHorizontal: 24, paddingTop: 8 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' },
    emptyHist: { color: '#475569', fontSize: 14, marginBottom: 16 },
    histCard: {
        backgroundColor: '#0f172a',
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.22)',
    },
    trailBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(59,130,246,0.2)',
        marginBottom: 8,
    },
    trailBadgeText: {
        color: '#93c5fd',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.6,
    },
    trail: { color: '#f1f5f9', fontSize: 15, fontWeight: '800', lineHeight: 22 },
    histOfficerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        flexWrap: 'wrap',
    },
    histOfficerName: { color: '#e2e8f0', fontSize: 13, fontWeight: '800' },
    histOfficerId: { color: '#64748b', fontSize: 13, fontWeight: '600' },
    histStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    statChip: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: 'rgba(16,185,129,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.28)',
    },
    statChipMuted: {
        backgroundColor: 'rgba(148,163,184,0.12)',
        borderColor: 'rgba(148,163,184,0.2)',
    },
    statChipText: { color: '#6ee7b7', fontSize: 11, fontWeight: '800' },
    statChipTextMuted: { color: '#94a3b8' },
    histMeta: { color: '#475569', fontSize: 11, marginTop: 10, lineHeight: 16 },
    hint: { color: '#64748b', fontSize: 14, lineHeight: 22, marginTop: 20 },
    fab: {
        position: 'absolute',
        right: 24,
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#2563eb',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
    },
    sheetOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0f172a',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    optIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    optTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
    optSub: { color: '#64748b', fontSize: 12, marginTop: 4, lineHeight: 17 },
});
