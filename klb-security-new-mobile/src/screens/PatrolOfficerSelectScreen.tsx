import React, { useEffect, useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Search, User, Clock, Footprints } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { enrollmentService, patrolSessionService } from '../services/api';
import { usePatrolStore } from '../store/usePatrolStore';

function formatDurationShort(ms: number): string {
    if (!ms || ms < 0) return '—';
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

export default function PatrolOfficerSelectScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { organizationId } = useCustomAuth();
    const site = route.params?.site as any;

    const [list, setList] = useState<any[]>([]);
    const [summaries, setSummaries] = useState<Record<string, { durationMs: number; scanCount: number; endedAt: number }>>(
        {}
    );
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    useEffect(() => {
        if (!organizationId) {
            setList([]);
            setLoading(false);
            return;
        }
        enrollmentService
            .list({ organizationId })
            .then((res) => {
                const raw = res.data;
                setList(Array.isArray(raw) ? raw : []);
            })
            .catch(() => setList([]))
            .finally(() => setLoading(false));
    }, [organizationId]);

    useEffect(() => {
        if (!site?._id) return;
        patrolSessionService
            .subjectSummaries(site._id)
            .then((res) => {
                const d = res.data;
                setSummaries(d && typeof d === 'object' && !Array.isArray(d) ? d : {});
            })
            .catch(() => setSummaries({}));
    }, [site?._id]);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return list;
        return list.filter(
            (e) =>
                String(e.name || '')
                    .toLowerCase()
                    .includes(s) || String(e.empId || '').toLowerCase().includes(s)
        );
    }, [list, q]);

    const onPick = (row: any) => {
        if (!site) return;
        usePatrolStore.getState().setPatrolSubject({
            empId: String(row.empId),
            name: String(row.name || ''),
        });
        usePatrolStore.getState().setCurrentSite(site);
        usePatrolStore.getState().setSession(null);
        navigation.replace('PatrolStart', { selectedSite: site, isVisit: false });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Who is patrolling?</Text>
                    <Text style={styles.sub} numberOfLines={1}>
                        {site?.name}
                    </Text>
                </View>
            </View>

            <View style={styles.search}>
                <Search color="#64748b" size={18} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search name or employee ID..."
                    placeholderTextColor="#475569"
                    value={q}
                    onChangeText={setQ}
                />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color="#2563eb" size="large" />
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item, i) => String(item._id || item.empId || i)}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 + insets.bottom }}
                    renderItem={({ item }) => {
                        const empKey = String(item.empId || '');
                        const sum = summaries[empKey];
                        return (
                            <TouchableOpacity
                                style={styles.row}
                                onPress={() => onPick(item)}
                                activeOpacity={0.88}
                            >
                                <View style={styles.avatar}>
                                    <User color="#3b82f6" size={22} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.name} numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    <Text style={styles.emp}>ID: {item.empId}</Text>
                                    {sum ? (
                                        <View style={styles.statsRow}>
                                            <Clock color="#22c55e" size={12} />
                                            <Text style={styles.statsText}>
                                                Last patrol here: {formatDurationShort(sum.durationMs)} · {sum.scanCount}{' '}
                                                scan{sum.scanCount === 1 ? '' : 's'}
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={styles.statsRow}>
                                            <Footprints color="#475569" size={12} />
                                            <Text style={styles.statsMuted}>No completed patrol at this site yet</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={styles.startPill}>
                                    <Text style={styles.startPillText}>Start</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                    ListEmptyComponent={
                        <Text style={styles.empty}>No enrolled persons found for this organization.</Text>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 14 },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: { fontSize: 20, fontWeight: '800', color: '#fff' },
    sub: { fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: '600' },
    search: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 20,
        marginBottom: 16,
        paddingHorizontal: 14,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        gap: 10,
    },
    searchInput: { flex: 1, color: '#fff', fontSize: 15 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        backgroundColor: '#0f172a',
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    avatar: {
        width: 46,
        height: 46,
        borderRadius: 14,
        backgroundColor: 'rgba(59,130,246,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    name: { color: '#fff', fontSize: 16, fontWeight: '800' },
    emp: { color: '#64748b', fontSize: 13, marginTop: 4, fontWeight: '600' },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
        flexWrap: 'wrap',
    },
    statsText: { color: '#86efac', fontSize: 12, fontWeight: '700', flex: 1 },
    statsMuted: { color: '#64748b', fontSize: 12, fontWeight: '600', flex: 1 },
    startPill: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(37,99,235,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.45)',
    },
    startPillText: { color: '#93c5fd', fontSize: 12, fontWeight: '800' },
    empty: { color: '#64748b', textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
