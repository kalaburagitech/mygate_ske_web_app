import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ClipboardList } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { userService, logService } from '../services/api';
import { hasVisitingOfficerRole } from '../utils/roleUtils';
import { showError } from '../utils/toastUtils';

const C = {
    bg: '#020617',
    card: '#0f172a',
    accent: '#2563eb',
    border: 'rgba(255, 255, 255, 0.05)',
    muted: '#64748b',
    label: '#475569',
    white: '#ffffff',
};

function dayKey(ts: number): string {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function buildRolling7Days(): { key: string; label: string }[] {
    const out: { key: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const key = dayKey(d.getTime());
        const wd = d.toLocaleDateString('en-IN', { weekday: 'short' });
        const label = wd.length > 2 ? wd.slice(0, 2) : wd;
        out.push({ key, label });
    }
    return out;
}

const MS_30D = 30 * 24 * 60 * 60 * 1000;

type OfficerRow = {
    _id: string;
    name: string;
    weekCounts: number[];
    visits30: number;
    /** Sum of (check-out − check-in) for completed visits in the last 30 days. */
    duration30Label: string;
};

/** Only visits with a check-out contribute (on-site time). */
function sumCompletedVisitDurationMs(logs: { createdAt: number; checkOutAt?: number }[]): number {
    let ms = 0;
    for (const l of logs) {
        const end = l.checkOutAt;
        const start = l.createdAt;
        if (typeof end === 'number' && Number.isFinite(end) && end > start) {
            ms += end - start;
        }
    }
    return ms;
}

function formatDurationLabel(ms: number): string {
    if (ms <= 0) return '0m';
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

function TeamListSkeleton() {
    return (
        <View style={styles.skeletonWrap} accessibilityLabel="Loading team">
            {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.skeletonRow}>
                    <View style={styles.skeletonAvatar} />
                    <View style={{ flex: 1, gap: 8 }}>
                        <View style={styles.skeletonLineLg} />
                        <View style={styles.skeletonWeek}>
                            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                                <View key={d} style={styles.skeletonDot} />
                            ))}
                        </View>
                    </View>
                    <View style={styles.skeletonBadges}>
                        <View style={styles.skeletonBadge} />
                        <View style={styles.skeletonBadge} />
                    </View>
                </View>
            ))}
        </View>
    );
}

/** Visiting tab: team roster and visit stats (no site visit flow — that lives under Patrol). */
export default function VisitingTeamScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const { organizationId, customUser } = useCustomAuth();
    const showTeam = hasVisitingOfficerRole(customUser);

    const [teamUsers, setTeamUsers] = useState<any[]>([]);
    const [allVisitLogs, setAllVisitLogs] = useState<any[]>([]);
    const [teamLoading, setTeamLoading] = useState(true);
    const [teamRefreshing, setTeamRefreshing] = useState(false);
    const [teamSearch, setTeamSearch] = useState('');

    const weekMeta = useMemo(() => buildRolling7Days(), []);

    const userRegion = customUser?.regionId
        ? String(customUser.regionId).toLowerCase().trim()
        : '';

    const loadTeam = useCallback(async () => {
        if (!organizationId || !showTeam) {
            setTeamUsers([]);
            setAllVisitLogs([]);
            setTeamLoading(false);
            setTeamRefreshing(false);
            return;
        }
        try {
            const [uRes, lRes] = await Promise.all([
                userService.getUsersByOrg(organizationId),
                logService.getVisitLogs(
                    organizationId,
                    undefined,
                    customUser?.regionId || undefined,
                    undefined
                ),
            ]);
            let users = uRes.data || [];
            if (userRegion) {
                users = users.filter((u: any) => {
                    const r = u.regionId ? String(u.regionId).toLowerCase().trim() : '';
                    return r === userRegion;
                });
            }
            setTeamUsers(users);
            setAllVisitLogs(lRes.data || []);
        } catch (e) {
            console.error(e);
            showError('Visiting', 'Could not load team visits.');
            setTeamUsers([]);
            setAllVisitLogs([]);
        } finally {
            setTeamLoading(false);
            setTeamRefreshing(false);
        }
    }, [organizationId, showTeam, customUser?.regionId, userRegion]);

    useEffect(() => {
        setTeamLoading(true);
        loadTeam();
    }, [loadTeam]);

    const officers = useMemo((): OfficerRow[] => {
        const visiting = teamUsers.filter((u) => u.status !== 'inactive' && hasVisitingOfficerRole(u));
        const now = Date.now();
        const cutoff30 = now - MS_30D;

        return visiting.map((u) => {
            const logs = allVisitLogs.filter((l) => l.userId === u._id);
            const weekCounts = weekMeta.map(({ key }) =>
                logs.filter((l) => dayKey(l.createdAt) === key).length
            );
            const logs30 = logs.filter((l) => l.createdAt >= cutoff30);
            const visits30 = logs30.length;
            const duration30Label = formatDurationLabel(sumCompletedVisitDurationMs(logs30));
            return {
                _id: u._id,
                name: u.name || 'Officer',
                weekCounts,
                visits30,
                duration30Label,
            };
        });
    }, [teamUsers, allVisitLogs, weekMeta]);

    const filteredOfficers = useMemo(() => {
        const q = teamSearch.trim().toLowerCase();
        if (!q) return officers;
        return officers.filter((o) => o.name.toLowerCase().includes(q));
    }, [officers, teamSearch]);

    const openOfficerDetail = (row: OfficerRow) => {
        const parent = typeof navigation.getParent === 'function' ? navigation.getParent() : null;
        (parent ?? navigation).navigate('VisitOfficerDetail', {
            officerId: row._id,
            officerName: row.name,
        });
    };

    const renderTeamRow = ({ item }: { item: OfficerRow }) => (
        <TouchableOpacity style={styles.teamRow} activeOpacity={0.85} onPress={() => openOfficerDetail(item)}>
            <View style={styles.teamAvatar}>
                <Text style={styles.teamAvatarLetter}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.teamRowMain}>
                <Text style={styles.teamName} numberOfLines={1}>
                    {item.name}
                </Text>
                <View style={styles.weekRow}>
                    {weekMeta.map((d, i) => {
                        const c = item.weekCounts[i] || 0;
                        const active = c > 0;
                        return (
                            <View key={d.key} style={styles.dayCol}>
                                <Text style={styles.dayLbl}>{d.label}</Text>
                                <View
                                    style={[
                                        styles.dayDot,
                                        active ? styles.dayDotOn : styles.dayDotZero,
                                    ]}
                                >
                                    <Text style={[styles.dayCount, active ? styles.dayCountOn : styles.dayCountZero]}>
                                        {c}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </View>
            <View style={styles.teamStats}>
                <Text style={styles.teamStatsHint}>Last 30 days</Text>
                <View style={styles.badgeRow}>
                    <View style={styles.badge}>
                        <Text style={styles.badgeMicro}>Visits</Text>
                        <Text style={styles.badgeTxt} numberOfLines={1}>
                            {item.visits30}
                        </Text>
                    </View>
                    <View style={styles.badge}>
                        <Text style={styles.badgeMicro}>On-site</Text>
                        <Text style={styles.badgeTxt} numberOfLines={1}>
                            {item.duration30Label}
                        </Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Visiting</Text>
                <Text style={styles.headerSub}>Team roster</Text>
            </View>

            {!showTeam ? (
                <View style={styles.centerMsg}>
                    <ClipboardList color={C.muted} size={40} />
                    <Text style={styles.centerTitle}>Visiting Officer role</Text>
                    <Text style={styles.centerSub}>Your account does not include the visiting team view.</Text>
                </View>
            ) : (
                <>
                    <View style={styles.teamSearchWrap}>
                        <Search color={C.muted} size={18} />
                        <TextInput
                            style={styles.teamSearchInput}
                            placeholder="Search officers"
                            placeholderTextColor={C.muted}
                            value={teamSearch}
                            onChangeText={setTeamSearch}
                        />
                    </View>
                    {teamLoading ? (
                        <TeamListSkeleton />
                    ) : (
                        <FlatList
                            data={filteredOfficers}
                            keyExtractor={(item) => item._id}
                            renderItem={renderTeamRow}
                            contentContainerStyle={styles.teamListPad}
                            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                            refreshControl={
                                <RefreshControl
                                    refreshing={teamRefreshing}
                                    onRefresh={() => {
                                        setTeamRefreshing(true);
                                        loadTeam();
                                    }}
                                    tintColor={C.accent}
                                />
                            }
                            ListEmptyComponent={
                                <View style={styles.teamEmpty}>
                                    <ClipboardList color={C.muted} size={40} />
                                    <Text style={styles.teamEmptyTitle}>No visiting officers</Text>
                                    <Text style={styles.teamEmptySub}>
                                        Assign Visiting Officer in admin, or adjust search.
                                    </Text>
                                </View>
                            }
                        />
                    )}
                </>
            )}
            <View style={{ height: insets.bottom }} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 },
    title: { fontSize: 24, fontWeight: 'bold', color: C.white },
    headerSub: { fontSize: 13, color: C.muted, marginTop: 4, fontWeight: '600' },
    teamSearchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 24,
        marginBottom: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: C.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
    },
    teamSearchInput: { flex: 1, fontSize: 15, color: C.white },
    teamListPad: { paddingHorizontal: 24, paddingBottom: 24 },
    teamRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.card,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: C.border,
    },
    teamAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    teamAvatarLetter: { fontSize: 20, fontWeight: '800', color: C.accent },
    teamRowMain: { flex: 1, minWidth: 0 },
    teamName: { fontSize: 16, fontWeight: '800', color: C.white, marginBottom: 8 },
    weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 2 },
    dayCol: { alignItems: 'center', flex: 1 },
    dayLbl: { fontSize: 9, color: C.muted, fontWeight: '700', marginBottom: 4 },
    dayDot: {
        minWidth: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    dayDotOn: { backgroundColor: 'rgba(34, 197, 94, 0.4)' },
    dayDotZero: { backgroundColor: 'rgba(239, 68, 68, 0.22)' },
    dayCount: { fontSize: 10, fontWeight: '800', color: C.muted },
    dayCountOn: { color: '#86efac' },
    dayCountZero: { color: '#fca5a5' },
    teamStats: { alignItems: 'flex-end', marginLeft: 6 },
    teamStatsHint: { fontSize: 10, color: C.muted, marginBottom: 6, fontWeight: '600' },
    badgeRow: { flexDirection: 'row', gap: 6 },
    badge: {
        backgroundColor: 'rgba(37, 99, 235, 0.25)',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 8,
        maxWidth: 96,
    },
    badgeMicro: { color: C.muted, fontSize: 9, fontWeight: '700', marginBottom: 2 },
    badgeTxt: { color: C.white, fontSize: 11, fontWeight: '700' },
    skeletonWrap: { paddingHorizontal: 24, paddingBottom: 24, gap: 10 },
    skeletonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.card,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: C.border,
        gap: 10,
    },
    skeletonAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(148,163,184,0.12)',
    },
    skeletonLineLg: { height: 14, borderRadius: 7, backgroundColor: 'rgba(148,163,184,0.12)', width: '55%' },
    skeletonWeek: { flexDirection: 'row', justifyContent: 'space-between', gap: 2 },
    skeletonDot: {
        flex: 1,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(148,163,184,0.1)',
        maxWidth: 28,
    },
    skeletonBadges: { alignItems: 'flex-end', gap: 6 },
    skeletonBadge: { width: 72, height: 28, borderRadius: 8, backgroundColor: 'rgba(148,163,184,0.12)' },
    teamEmpty: { padding: 40, alignItems: 'center' },
    teamEmptyTitle: { color: C.muted, fontSize: 16, fontWeight: '700', marginTop: 12 },
    teamEmptySub: { color: C.label, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    centerMsg: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    centerTitle: { color: C.white, fontSize: 17, fontWeight: '800', marginTop: 16 },
    centerSub: { color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
