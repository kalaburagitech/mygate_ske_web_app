import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Image, ScrollView, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// import { useQuery } from 'convex/react';
// import { api } from '../../services/convex';
import { siteService, logService } from '../../services/api';
import { Clock, MapPin, ChevronRight, Filter, AlertTriangle, Building2, Search, X, QrCode, User } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCustomAuth } from '../../context/AuthContext';
import { isAdministrativeRole } from '../../utils/roleUtils';

const getStatusColor = (s: string) => {
    switch (s) {
        case 'pending': return '#f59e0b';
        case 'approved': return '#10b981';
        case 'inside': return '#3b82f6';
        case 'exited': return '#64748b';
        case 'rejected': return '#ef4444';
        default: return '#1e293b';
    }
};

export default function HistoryScreen() {
    const insets = useSafeAreaInsets();
    const { organizationId, userId, customUser } = useCustomAuth();
    const isAdmin = isAdministrativeRole(customUser);
    const route = useRoute<any>();
    const [selectedFilterSite, setSelectedFilterSite] = useState<string | null>(route?.params?.siteId || null);
    
    // Fetch sites for filtering
    const [allSites, setAllSites] = useState<any[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [visitLogs, setVisitLogs] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'patrol' | 'visitor'>('patrol');
    
    useEffect(() => {
        if (organizationId && userId) {
            const fetchPromise = isAdmin
                ? siteService.getAllSites()
                : siteService.getSitesByUser(userId);

            fetchPromise
                .then(res => setAllSites(res.data || []))
                .catch(err => console.error("Error fetching sites:", err));
        }
    }, [organizationId, userId, isAdmin]);
    
    useEffect(() => {
        if (organizationId) {
            setRefreshing(true);
            if (activeTab === 'patrol') {
                logService.getPatrolLogs(organizationId, selectedFilterSite || undefined)
                    .then(res => {
                        setLogs(res.data);
                        setRefreshing(false);
                    })
                    .catch(err => {
                        console.error("Error fetching logs:", err);
                        setRefreshing(false);
                    });
            } else {
                logService.getVisitLogs(organizationId, selectedFilterSite || undefined)
                    .then(res => {
                        setVisitLogs(res.data);
                        setRefreshing(false);
                    })
                    .catch(err => {
                        console.error("Error fetching visit logs:", err);
                        setRefreshing(false);
                    });
            }
        }
    }, [organizationId, selectedFilterSite, activeTab]);

    const [siteSearchQuery, setSiteSearchQuery] = useState('');

    const filteredSites = allSites?.filter(s => 
        s.name.toLowerCase().includes(siteSearchQuery.toLowerCase())
    );

    const [refreshing, setRefreshing] = useState(false);
    const navigation = useNavigation<any>();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        const next = new Set(expandedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedIds(next);
    };

    const onRefresh = () => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 1000);
    };

    const formatDate = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    };

    const formatTime = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Patrol History</Text>
                    <Text style={styles.subTitle}>
                        {selectedFilterSite ? 'Filtered by site' : 'Showing all logs'}
                    </Text>
                </View>
                <TouchableOpacity 
                    style={[styles.filterBtn, !selectedFilterSite && { borderColor: 'rgba(255,255,255,0.05)' }]}
                    onPress={() => setSelectedFilterSite(null)}
                >
                    <Filter color={selectedFilterSite ? "#2563eb" : "#64748b"} size={20} />
                </TouchableOpacity>
            </View>

            <View style={styles.tabContainer}>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'patrol' && styles.activeTab]}
                    onPress={() => setActiveTab('patrol')}
                >
                    <QrCode color={activeTab === 'patrol' ? 'white' : '#64748b'} size={18} />
                    <Text style={[styles.tabText, activeTab === 'patrol' && styles.activeTabText]}>Patrols</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'visitor' && styles.activeTab]}
                    onPress={() => setActiveTab('visitor')}
                >
                    <User color={activeTab === 'visitor' ? 'white' : '#64748b'} size={18} />
                    <Text style={[styles.tabText, activeTab === 'visitor' && styles.activeTabText]}>Visitors</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.filterContainer}>
                <View style={styles.searchFilterBar}>
                    <Search color="#64748b" size={16} />
                    <TextInput
                        style={styles.searchFilterInput}
                        placeholder="Search sites..."
                        placeholderTextColor="#475569"
                        value={siteSearchQuery}
                        onChangeText={setSiteSearchQuery}
                    />
                    {siteSearchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSiteSearchQuery('')}>
                            <X color="#64748b" size={16} />
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    <TouchableOpacity
                        style={[styles.filterChip, !selectedFilterSite && styles.activeFilterChip]}
                        onPress={() => setSelectedFilterSite(null)}
                    >
                        <Text style={[styles.filterChipText, !selectedFilterSite && styles.activeFilterChipText]}>All Sites</Text>
                    </TouchableOpacity>
                    {filteredSites?.map((site) => (
                        <TouchableOpacity
                            key={site._id}
                            style={[styles.filterChip, selectedFilterSite === site._id && styles.activeFilterChip]}
                            onPress={() => setSelectedFilterSite(site._id)}
                        >
                            <Building2 size={12} color={selectedFilterSite === site._id ? "white" : "#64748b"} />
                            <Text style={[styles.filterChipText, selectedFilterSite === site._id && styles.activeFilterChipText]}>
                                {site.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    {filteredSites?.length === 0 && (
                        <Text style={{ color: '#475569', fontSize: 12, marginLeft: 12, alignSelf: 'center' }}>No matches</Text>
                    )}
                </ScrollView>
            </View>

            {logs === undefined || (activeTab === 'visitor' && visitLogs === undefined) ? (
                <View style={styles.center}>
                    <ActivityIndicator color="#2563eb" size="large" />
                </View>
            ) : (
                <FlatList
                    data={activeTab === 'patrol' ? logs : visitLogs}
                    keyExtractor={(item) => item._id}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
                    renderItem={({ item }) => activeTab === 'patrol' ? (
                        <TouchableOpacity 
                            style={[styles.card, expandedIds.has(item._id) && styles.cardExpanded]} 
                            activeOpacity={0.7}
                            onPress={() => toggleExpand(item._id)}
                        >
                            <View style={styles.cardHeader}>
                                <View style={styles.timeTag}>
                                    <Clock color="#64748b" size={12} />
                                    <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
                                    <View style={styles.dot} />
                                    <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
                                </View>
                                {item.distance > 100 ? (
                                    <View style={styles.violationTag}>
                                        <AlertTriangle color="#ef4444" size={10} />
                                        <Text style={styles.violationText}>GEOFENCE VIOLATION</Text>
                                    </View>
                                ) : item.distance > 50 ? (
                                    <View style={styles.warningTag}>
                                        <AlertTriangle color="#f59e0b" size={10} />
                                        <Text style={styles.warningText}>DISTANCE WARNING</Text>
                                    </View>
                                ) : null}
                            </View>

                            <View style={styles.mainContent}>
                                <View style={styles.pointInfo}>
                                    <Text style={styles.pointName}>{item.pointName}</Text>
                                    <View style={styles.siteRow}>
                                        <Building2 color="#3b82f6" size={12} />
                                        <Text style={styles.siteName}>{item.siteName}</Text>
                                    </View>
                                </View>
                                {item.imageId && (
                                    <View style={styles.imagePlaceholder}>
                                        <Image
                                            source={{ uri: `https://gallant-grasshopper-633.convex.cloud/api/storage/${item.imageId}` }}
                                            style={styles.proofImage}
                                        />
                                    </View>
                                )}
                            </View>

                            {expandedIds.has(item._id) && (
                                <View style={styles.detailsSection}>
                                    <View style={styles.detailItem}>
                                        <MapPin color="#64748b" size={14} />
                                        <Text style={styles.detailLabel}>Scan Distance:</Text>
                                        <Text style={[styles.detailValue, item.distance > 100 && { color: '#ef4444' }]}>
                                            {item.distance.toFixed(1)} meters away
                                        </Text>
                                    </View>
                                    <View style={styles.detailItem}>
                                        <Clock color="#64748b" size={14} />
                                        <Text style={styles.detailLabel}>Full Timestamp:</Text>
                                        <Text style={styles.detailValue}>
                                            {new Date(item.createdAt).toLocaleString('en-IN')}
                                        </Text>
                                    </View>
                                    {item.comment ? (
                                        <View style={styles.expandedComment}>
                                            <Text style={styles.commentLabel}>Comment:</Text>
                                            <Text style={styles.commentText}>&quot;{item.comment}&quot;</Text>
                                        </View>
                                    ) : null}
                                </View>
                            )}

                            <View style={styles.footer}>
                                <View style={styles.guardInfo}>
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{item.userName.charAt(0)}</Text>
                                    </View>
                                    <Text style={styles.guardName}>{item.userName}</Text>
                                </View>
                                <ChevronRight 
                                    color="#334155" 
                                    size={16} 
                                    style={{ transform: [{ rotate: expandedIds.has(item._id) ? '90deg' : '0deg' }] }} 
                                />
                            </View>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity 
                            style={styles.card} 
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('VisitOfficerDetail', { logId: item._id })}
                        >
                            <View style={styles.cardHeader}>
                                <View style={styles.timeTag}>
                                    <Clock color="#64748b" size={12} />
                                    <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
                                    <View style={styles.dot} />
                                    <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
                                </View>
                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                                    <Text style={styles.statusText}>{item.status?.toUpperCase()}</Text>
                                </View>
                            </View>

                            <View style={styles.mainContent}>
                                <View style={styles.pointInfo}>
                                    <Text style={styles.pointName}>{item.visitorName || 'Unknown Visitor'}</Text>
                                    <Text style={styles.visitorSub}>{item.numberOfPeople || 1} Person • {item.vehicleNumber || 'No Vehicle'}</Text>
                                    <View style={styles.siteRow}>
                                        <Building2 color="#3b82f6" size={12} />
                                        <Text style={styles.siteName}>{item.siteName}</Text>
                                    </View>
                                </View>
                                {item.imageId && (
                                    <View style={styles.imagePlaceholder}>
                                        <Image
                                            source={{ uri: `https://gallant-grasshopper-633.convex.cloud/api/storage/${item.imageId}` }}
                                            style={styles.proofImage}
                                        />
                                    </View>
                                )}
                            </View>

                            <View style={styles.footer}>
                                <View style={styles.guardInfo}>
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{item.userName.charAt(0)}</Text>
                                    </View>
                                    <Text style={styles.guardName}>{item.userName}</Text>
                                </View>
                                <ChevronRight color="#334155" size={16} />
                            </View>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <MapPin color="#1e293b" size={64} style={{ marginBottom: 16 }} />
                            <Text style={styles.emptyText}>No {activeTab} history found</Text>
                            <Text style={styles.emptySub}>Logs will appear here after updates</Text>
                        </View>
                    }
                />
            )}
            <View style={{ height: insets.bottom }} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    header: {
        padding: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
    },
    subTitle: {
        fontSize: 14,
        color: '#3b82f6',
        marginTop: 4,
        fontWeight: '600',
    },
    filterBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    list: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: '#0f172a',
        padding: 20,
        borderRadius: 28,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    timeTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    dateText: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '600',
    },
    dot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#475569',
    },
    timeText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    warningTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 4,
    },
    warningText: {
        color: '#f59e0b',
        fontSize: 10,
        fontWeight: '900',
    },
    violationTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 4,
    },
    violationText: {
        color: '#ef4444',
        fontSize: 10,
        fontWeight: '900',
    },
    mainContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    pointInfo: {
        flex: 1,
        marginRight: 12,
    },
    pointName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 4,
    },
    siteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    siteName: {
        color: '#64748b',
        fontSize: 13,
        fontWeight: '600',
    },
    visitorSub: {
        color: '#94a3b8',
        fontSize: 12,
        marginBottom: 4,
    },
    imagePlaceholder: {
        width: 60,
        height: 60,
        borderRadius: 16,
        backgroundColor: '#1e293b',
        overflow: 'hidden',
    },
    proofImage: {
        width: '100%',
        height: '100%',
    },
    commentBox: {
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        padding: 12,
        borderRadius: 16,
        marginBottom: 16,
    },
    comment: {
        color: '#94a3b8',
        fontSize: 13,
        fontStyle: 'italic',
        lineHeight: 18,
    },
    footer: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
        paddingTop: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    guardInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    avatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#2563eb',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    guardName: {
        color: '#475569',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    empty: {
        alignItems: 'center',
        marginTop: 100,
        paddingHorizontal: 40,
    },
    emptyText: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    emptySub: {
        color: '#64748b',
        fontSize: 15,
        textAlign: 'center',
    },
    cardExpanded: {
        borderColor: '#2563eb',
    },
    detailsSection: {
        backgroundColor: 'rgba(37, 99, 235, 0.05)',
        padding: 16,
        borderRadius: 20,
        marginBottom: 16,
        gap: 8,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    detailLabel: {
        color: '#64748b',
        fontSize: 13,
    },
    detailValue: {
        color: 'white',
        fontSize: 13,
        fontWeight: '600',
    },
    expandedComment: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    commentLabel: {
        color: '#64748b',
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    commentText: {
        color: '#94a3b8',
        fontSize: 13,
        lineHeight: 18,
    },
    filterContainer: {
        marginBottom: 16,
    },
    filterScroll: {
        paddingHorizontal: 24,
        paddingBottom: 4,
        gap: 8,
    },
    searchFilterBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        marginHorizontal: 24,
        marginBottom: 12,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        height: 40,
    },
    searchFilterInput: {
        flex: 1,
        color: 'white',
        fontSize: 13,
        paddingHorizontal: 8,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        gap: 6,
    },
    activeFilterChip: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    filterChipText: {
        color: '#64748b',
        fontSize: 12,
        fontWeight: 'bold',
    },
    activeFilterChipText: {
        color: 'white',
    },
    tabContainer: {
        flexDirection: 'row',
        marginHorizontal: 24,
        marginBottom: 20,
        backgroundColor: '#0f172a',
        borderRadius: 16,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        gap: 8,
    },
    activeTab: {
        backgroundColor: '#2563eb',
    },
    tabText: {
        color: '#64748b',
        fontSize: 14,
        fontWeight: 'bold',
    },
    activeTabText: {
        color: 'white',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    statusText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    visitorSub: {
        color: '#64748b',
        fontSize: 12,
        marginBottom: 4,
    },
});
