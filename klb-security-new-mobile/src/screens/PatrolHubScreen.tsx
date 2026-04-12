import React, { useEffect, useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, ChevronRight, Search, MapPin } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { siteService } from '../services/api';
import { isAdministrativeRole } from '../utils/roleUtils';

/**
 * Patrol tab: sites for the signed-in user; each site opens QR setup + patrol logging.
 */
export default function PatrolHubScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const { customUser, userId, organizationId } = useCustomAuth();
    const isAdmin = isAdministrativeRole(customUser);

    const [sites, setSites] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const city = useMemo(() => {
        if (Array.isArray(customUser?.cities) && customUser!.cities!.length > 0) {
            return customUser!.cities![0] as string;
        }
        return customUser?.city || undefined;
    }, [customUser]);

    const loadSites = async () => {
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
                if (city) {
                    data = data.filter(
                        (s: any) =>
                            String(s.city || '').toLowerCase().trim() === String(city).toLowerCase().trim()
                    );
                }
                setSites(data);
            } else {
                const res = await siteService.getSitesByUser(
                    userId,
                    customUser?.regionId || undefined,
                    city
                );
                setSites(res.data || []);
            }
        } catch (e) {
            console.error('Patrol sites load error', e);
            setSites([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        loadSites();
    }, [userId, organizationId, isAdmin, customUser?.regionId, city]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadSites();
        setRefreshing(false);
    };

    const filtered = sites.filter((s) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            (s.name && String(s.name).toLowerCase().includes(q)) ||
            (s.locationName && String(s.locationName).toLowerCase().includes(q)) ||
            (s.city && String(s.city).toLowerCase().includes(q))
        );
    });

    const goStack = (route: string, params?: object) => {
        const tabNav = navigation.getParent?.();
        const stackNav = tabNav?.getParent?.();
        (stackNav ?? tabNav ?? navigation).navigate(route as never, params as never);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Patrol</Text>
                <Text style={styles.sub}>Choose a site — add QR points or log a patrol round</Text>
            </View>

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
                <View style={styles.center}>
                    <ActivityIndicator color="#2563eb" size="large" />
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
                            onPress={() => goStack('PatrolSiteDetail', { site: item })}
                        >
                            <View style={styles.siteIcon}>
                                <Building2 color="#3b82f6" size={24} />
                            </View>
                            <View style={styles.siteBody}>
                                <Text style={styles.siteName}>{item.name}</Text>
                                <View style={styles.metaRow}>
                                    <MapPin color="#64748b" size={12} />
                                    <Text style={styles.siteMeta} numberOfLines={1}>
                                        {item.locationName || item.city || '—'}
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
                                No sites linked to your account. Contact your administrator.
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
    header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
    title: { fontSize: 26, fontWeight: '800', color: '#fff' },
    sub: { fontSize: 13, color: '#64748b', marginTop: 6, fontWeight: '600' },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        marginHorizontal: 24,
        marginBottom: 10,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        gap: 10,
        height: 44,
    },
    searchInput: { flex: 1, color: '#fff', fontSize: 15 },
    list: { paddingHorizontal: 24 },
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
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', marginTop: 48, paddingHorizontal: 32 },
    emptyTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '800', marginTop: 16 },
    emptySub: { color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
