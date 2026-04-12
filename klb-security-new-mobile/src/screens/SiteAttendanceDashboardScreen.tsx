import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    RefreshControl,
    ListRenderItem,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { attendanceService, regionService } from '../services/api';
import { SkeletonBox } from '../components/SkeletonBlocks';
import {
    getCurrentShift,
    getNextShift,
    formatShiftRange,
    type SiteShift,
} from '../utils/shiftUtils';

function todayYMD(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export default function SiteAttendanceDashboardScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { organizationId } = useCustomAuth();
    const site = route.params?.site as any;
    const [tick, setTick] = useState(0);
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [regionName, setRegionName] = useState<string>('');

    const shifts: SiteShift[] = useMemo(
        () => (Array.isArray(site?.shifts) ? site.shifts : []),
        [site]
    );

    const activeShift = useMemo(() => getCurrentShift(shifts, new Date()), [shifts, tick]);
    const nextShift = useMemo(() => getNextShift(shifts, new Date()), [shifts, tick]);
    const shiftForMark = activeShift || nextShift;
    const strengthShift = activeShift || nextShift;

    const loadRecords = useCallback(async () => {
        if (!organizationId || !site?._id) {
            setRecords([]);
            return;
        }
        const date = todayYMD();
        const res = await attendanceService.list({
            organizationId,
            date,
            siteId: site._id,
        });
        setRecords(Array.isArray(res.data) ? res.data : []);
    }, [organizationId, site?._id]);

    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 30000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                await loadRecords();
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [loadRecords]);

    useEffect(() => {
        if (!site?.regionId) return;
        regionService
            .getRegions()
            .then((res) => {
                const r = (res.data || []).find((x: any) => x.regionId === site.regionId);
                if (r?.regionName) setRegionName(r.regionName);
            })
            .catch(() => {});
    }, [site?.regionId]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadRecords();
        setRefreshing(false);
    };

    const totalStrength = useMemo(
        () => shifts.reduce((acc, sh) => acc + (typeof sh.strength === 'number' ? sh.strength : 0), 0),
        [shifts]
    );
    const strength = totalStrength > 0 ? totalStrength : strengthShift?.strength ?? 0;
    const presentCount = new Set(
        records.filter((r) => r.checkInTime).map((r) => String(r.empId))
    ).size;
    const pct =
        strength > 0 ? Math.min(100, Math.round((presentCount / strength) * 100)) : presentCount > 0 ? 100 : 0;

    const shiftsPerEmp = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of records) {
            if (!r.checkInTime) continue;
            const id = String(r.empId);
            m.set(id, (m.get(id) ?? 0) + 1);
        }
        return m;
    }, [records]);

    const formatTs = (ts?: number) =>
        ts == null
            ? '—'
            : new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const openMarkAttendance = () => {
        if (!site) return;
        navigation.navigate('MarkAttendance', {
            presetSite: site,
            presetRegionId: site.regionId,
            presetCity: site.city || undefined,
            presetShift: shiftForMark,
            fromSiteDashboard: true,
        });
    };

    const renderItem: ListRenderItem<any> = useCallback(
        ({ item: r }) => {
            const shiftCount = shiftsPerEmp.get(String(r.empId)) ?? 0;
            return (
                <View style={styles.compactRow}>
                    <View style={styles.compactMain}>
                        <View style={styles.nameLine}>
                            <Text style={styles.compactName} numberOfLines={1}>
                                {r.name}
                            </Text>
                            {shiftCount > 1 ? (
                                <Text style={styles.multiTag}>{shiftCount}×</Text>
                            ) : null}
                        </View>
                        <Text style={styles.compactMeta} numberOfLines={1}>
                            ID {r.empId}
                            {r.shiftName ? ` · ${r.shiftName}` : ''} · In {formatTs(r.checkInTime)} · Out{' '}
                            {formatTs(r.checkOutTime)}
                        </Text>
                    </View>
                    {!r.checkOutTime && r.checkInTime ? (
                        <TouchableOpacity
                            style={styles.coBtn}
                            onPress={() =>
                                navigation.navigate('MarkAttendance', {
                                    workDate: todayYMD(),
                                    expectedEmpId: r.empId,
                                    checkoutOnly: true,
                                    directCamera: true,
                                    presetSite: site,
                                    presetRegionId: site.regionId,
                                    presetCity: site.city,
                                    presetShift: shiftForMark,
                                })
                            }
                        >
                            <Text style={styles.coBtnText}>Check-out</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.donePill}>
                            <Text style={styles.donePillText}>Done</Text>
                        </View>
                    )}
                </View>
            );
        },
        [navigation, site, shiftForMark, shiftsPerEmp]
    );

    const listHeader = useMemo(
        () => (
            <View style={{ paddingBottom: 8 }}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summarySite} numberOfLines={1}>
                        {site?.name || 'Site'}
                    </Text>
                    <Text style={styles.summarySub} numberOfLines={1}>
                        {regionName || site?.regionId || '—'} · {site?.city || '—'}
                    </Text>
                    <View style={styles.summaryLine}>
                        <Text style={styles.summaryShift} numberOfLines={1}>
                            {activeShift
                                ? `${activeShift.name} (active) · ${formatShiftRange(activeShift)}`
                                : nextShift
                                  ? `Next: ${nextShift.name} · ${formatShiftRange(nextShift)}`
                                  : shifts.length === 0
                                    ? 'No shifts'
                                    : 'Between shifts'}
                        </Text>
                    </View>
                    <View style={styles.summaryStats}>
                        {loading ? (
                            <>
                                <SkeletonBox height={14} width="40%" radius={4} />
                                <SkeletonBox height={14} width="28%" radius={4} />
                            </>
                        ) : (
                            <>
                                <Text style={styles.statInline}>
                                    <Text style={styles.statEm}>{presentCount}</Text>
                                    <Text style={styles.statMuted}>/{strength || '—'} </Text>
                                    <Text style={styles.statPct}>{strength ? `${pct}%` : '—'}</Text>
                                </Text>
                                <Text style={styles.statMutedSmall}>
                                    {shifts.length} shift{shifts.length === 1 ? '' : 's'} · today
                                </Text>
                            </>
                        )}
                    </View>
                </View>

                <TouchableOpacity style={styles.markBtn} onPress={openMarkAttendance} activeOpacity={0.9}>
                    <Text style={styles.markBtnText}>Mark attendance</Text>
                </TouchableOpacity>

                <Text style={styles.listCaption}>
                    {records.length} record{records.length === 1 ? '' : 's'} · scroll for more
                </Text>
            </View>
        ),
        [
            site,
            regionName,
            activeShift,
            nextShift,
            shifts.length,
            loading,
            presentCount,
            strength,
            pct,
            records.length,
        ]
    );

    if (!site) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.errorText}>Missing site</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft color="#fff" size={24} />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
            </View>

            <FlatList
                data={records}
                keyExtractor={(item) => String(item._id)}
                renderItem={renderItem}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={
                    loading ? null : (
                        <Text style={styles.emptyList}>No attendance for this site today.</Text>
                    )
                }
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
                contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
                initialNumToRender={32}
                maxToRenderPerBatch={48}
                windowSize={9}
                removeClippedSubviews
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: { paddingHorizontal: 16 },
    summaryCard: {
        backgroundColor: '#0f172a',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        marginBottom: 10,
    },
    summarySite: { color: '#fff', fontSize: 17, fontWeight: '800' },
    summarySub: { color: '#64748b', fontSize: 11, marginTop: 2, fontWeight: '600' },
    summaryLine: { marginTop: 8 },
    summaryShift: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
    summaryStats: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 6,
    },
    statInline: { flexShrink: 1 },
    statEm: { color: '#34d399', fontSize: 16, fontWeight: '800' },
    statMuted: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
    statPct: { color: '#93c5fd', fontSize: 15, fontWeight: '800' },
    statMutedSmall: { color: '#64748b', fontSize: 10, fontWeight: '600' },
    markBtn: {
        backgroundColor: '#2563eb',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 8,
    },
    markBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    listCaption: { color: '#475569', fontSize: 10, fontWeight: '600', marginBottom: 6 },
    compactRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 10,
        marginBottom: 4,
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    compactMain: { flex: 1, minWidth: 0 },
    nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    compactName: { color: '#fff', fontSize: 13, fontWeight: '800', flex: 1, minWidth: 0 },
    multiTag: {
        color: '#fbbf24',
        fontSize: 9,
        fontWeight: '800',
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: 'rgba(245,158,11,0.12)',
        overflow: 'hidden',
    },
    compactMeta: { color: '#64748b', fontSize: 10, marginTop: 2, fontWeight: '600' },
    coBtn: {
        backgroundColor: '#b91c1c',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    coBtnText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    donePill: {
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
        backgroundColor: 'rgba(16,185,129,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.25)',
    },
    donePillText: { color: '#34d399', fontSize: 9, fontWeight: '800' },
    emptyList: { color: '#64748b', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
    errorText: { color: '#f87171', padding: 24 },
});
