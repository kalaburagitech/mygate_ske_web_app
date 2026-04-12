import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    TextInput,
    ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, ChevronRight, Search, List, MapPin } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useCustomAuth } from '../../context/AuthContext';
import { siteService } from '../../services/api';
import { isAdministrativeRole } from '../../utils/roleUtils';
import { SkeletonSiteRow } from '../../components/SkeletonBlocks';

/**
 * Attendance tab: all cities (chips) → sites; opening a site uses the site dashboard + mark flow.
 */
export default function AttendanceHistoryScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const { customUser, userId, organizationId } = useCustomAuth();
    const isAdmin = isAdministrativeRole(customUser);

    const [sites, setSites] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCity, setSelectedCity] = useState<string | null>(null);

    const loadSites = useCallback(async () => {
        if (!userId || !organizationId) {
            setSites([]);
            setLoading(false);
            return;
        }
        try {
            if (isAdmin) {
                const res = await siteService.getAllSites();
                let data = res.data || [];
                if (customUser?.regionId) {
                    data = data.filter(
                        (s: any) =>
                            String(s.regionId || '').toLowerCase() ===
                            String(customUser.regionId).toLowerCase()
                    );
                }
                setSites(data);
            } else {
                const res = await siteService.getSitesByUser(
                    userId,
                    customUser?.regionId || undefined,
                    undefined
                );
                setSites(res.data || []);
            }
        } catch (e) {
            console.error('Attendance sites load error', e);
            setSites([]);
        } finally {
            setLoading(false);
        }
    }, [userId, organizationId, isAdmin, customUser?.regionId]);

    useEffect(() => {
        setLoading(true);
        loadSites();
    }, [loadSites]);

    const cityOptions = useMemo(() => {
        const set = new Set<string>();
        for (const s of sites) {
            const c = s.city != null ? String(s.city).trim() : '';
            if (c) set.add(c);
        }
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [sites]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadSites();
        setRefreshing(false);
    };

    const filtered = useMemo(() => {
        let list = sites;
        if (selectedCity) {
            list = list.filter(
                (s) => String(s.city || '').toLowerCase().trim() === selectedCity!.toLowerCase().trim()
            );
        }
        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(
            (s) =>
                (s.name && String(s.name).toLowerCase().includes(q)) ||
                (s.locationName && String(s.locationName).toLowerCase().includes(q)) ||
                (s.city && String(s.city).toLowerCase().includes(q))
        );
    }, [sites, selectedCity, searchQuery]);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Attendance</Text>
                    <Text style={styles.sub}>All your sites — filter by city, then open a site</Text>
                </View>
                <TouchableOpacity
                    style={styles.recordsBtn}
                    onPress={() => navigation.navigate('AttendanceRecords')}
                    accessibilityLabel="Attendance records"
                >
                    <List color="#2563eb" size={22} />
                </TouchableOpacity>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
                style={styles.chipsScroll}
            >
                <TouchableOpacity
                    style={[styles.chip, selectedCity === null && styles.chipActive]}
                    onPress={() => setSelectedCity(null)}
                >
                    <Text style={[styles.chipText, selectedCity === null && styles.chipTextActive]}>All cities</Text>
                </TouchableOpacity>
                {cityOptions.map((c) => (
                    <TouchableOpacity
                        key={c}
                        style={[styles.chip, selectedCity === c && styles.chipActive]}
                        onPress={() => setSelectedCity(c)}
                    >
                        <Text style={[styles.chipText, selectedCity === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={styles.searchBar}>
                <Search color="#64748b" size={18} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search sites..."
                    placeholderTextColor="#475569"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {loading ? (
                <View style={styles.list}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <SkeletonSiteRow key={i} />
                    ))}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => item._id}
                    contentContainerStyle={[styles.list, { paddingBottom: 40 + insets.bottom }]}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.siteCard}
                            activeOpacity={0.88}
                            onPress={() => navigation.navigate('SiteAttendanceDashboard', { site: item })}
                        >
                            <View style={styles.siteIcon}>
                                <Building2 color="#3b82f6" size={24} />
                            </View>
                            <View style={styles.siteBody}>
                                <Text style={styles.siteName}>{item.name}</Text>
                                <View style={styles.metaRow}>
                                    <MapPin color="#64748b" size={12} />
                                    <Text style={styles.siteMeta} numberOfLines={1}>
                                        {[item.city, item.locationName].filter(Boolean).join(' · ') || '—'}
                                    </Text>
                                </View>
                            </View>
                            <ChevronRight color="#475569" size={20} />
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Building2 color="#334155" size={48} />
                            <Text style={styles.emptyTitle}>No sites</Text>
                            <Text style={styles.emptySub}>
                                No sites match this filter. Try &quot;All cities&quot; or contact your administrator.
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    title: { fontSize: 26, fontWeight: '800', color: '#fff' },
    sub: { fontSize: 13, color: '#64748b', marginTop: 6, fontWeight: '600', maxWidth: 260 },
    recordsBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    chipsScroll: { maxHeight: 48, marginBottom: 8 },
    chipsRow: { paddingHorizontal: 24, gap: 8, alignItems: 'center' },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    chipActive: {
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.2)',
    },
    chipText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
    chipTextActive: { color: '#fff' },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        marginHorizontal: 24,
        marginBottom: 16,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        gap: 10,
        height: 44,
    },
    searchInput: { flex: 1, color: '#fff', fontSize: 15 },
    list: { paddingHorizontal: 24, gap: 12 },
    siteCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        padding: 18,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginBottom: 12,
        gap: 14,
    },
    siteIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: 'rgba(59,130,246,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    siteBody: { flex: 1, minWidth: 0 },
    siteName: { color: '#fff', fontSize: 17, fontWeight: '800' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    siteMeta: { color: '#94a3b8', fontSize: 12, flex: 1 },
    empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
    emptyTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '800', marginTop: 16 },
    emptySub: { color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
