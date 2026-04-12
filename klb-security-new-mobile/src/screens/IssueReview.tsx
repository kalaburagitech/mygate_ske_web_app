import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ShieldAlert, Clock, MapPin, AlertCircle, CheckCircle2, Filter, ChevronRight } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
// import { useQuery, useMutation } from 'convex/react';
import { useCustomAuth } from '../context/AuthContext';
import { issueService } from '../services/api';
import { isAdministrativeRole } from '../utils/roleUtils';

export default function IssueReview() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { organizationId, customUser } = useCustomAuth();
    const { regionId, city } = route.params || {};
    const [statusFilter, setStatusFilter] = useState<'open' | 'closed'>('open');
    const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
    const [issues, setIssues] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const filteredIssues = issues?.filter(issue => {
        const matchesStatus = issue.status === statusFilter;
        const matchesPriority = priorityFilter ? issue.priority === priorityFilter : true;
        return matchesStatus && matchesPriority;
    });

    const fetchIssues = async () => {
        const isAdmin = isAdministrativeRole(customUser);
        const effectiveOrgId = isAdmin ? 'all' : (organizationId as string);
        if (!effectiveOrgId) return;

        setLoading(true);
        try {
            const res = await issueService.getIssuesByOrg(
                effectiveOrgId, 
                undefined, 
                regionId, 
                city
            );
            setIssues(res.data || []);
        } catch (err) {
            console.error("Failed to fetch issues", err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchIssues();
    }, [organizationId, regionId, city]);

    const handleResolve = async (id: string) => {
        Alert.alert(
            "Resolve Issue",
            "Are you sure you want to mark this issue as resolved?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Resolve",
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await issueService.resolveIssue(id);
                            fetchIssues();
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>Issue Review</Text>
            </View>

            <View style={styles.filterSection}>
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, statusFilter === 'open' && styles.activeTab]}
                        onPress={() => setStatusFilter('open')}
                    >
                        <Text style={[styles.tabText, statusFilter === 'open' && styles.activeTabText]}>Open Issues</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, statusFilter === 'closed' && styles.activeTab]}
                        onPress={() => setStatusFilter('closed')}
                    >
                        <Text style={[styles.tabText, statusFilter === 'closed' && styles.activeTabText]}>Resolved</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.priorityTabs}>
                    <TouchableOpacity
                        style={[styles.priorityTab, !priorityFilter && styles.priorityTabActive]}
                        onPress={() => setPriorityFilter(null)}
                    >
                        <Text style={[styles.priorityTabText, !priorityFilter && styles.priorityTabTextActive]}>All Levels</Text>
                    </TouchableOpacity>
                    {['High', 'Medium', 'Low'].map(p => (
                        <TouchableOpacity
                            key={p}
                            style={[styles.priorityTab, priorityFilter === p && styles.priorityTabActive]}
                            onPress={() => setPriorityFilter(p)}
                        >
                            <Text style={[styles.priorityTabText, priorityFilter === p && styles.priorityTabTextActive]}>{p}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {loading ? (
                    <View style={styles.emptyState}>
                        <ActivityIndicator color="#3b82f6" size="large" />
                        <Text style={[styles.emptyText, { marginTop: 12 }]}>Fetching issues...</Text>
                    </View>
                ) : filteredIssues?.map((issue) => (
                    <View key={issue._id} style={styles.issueCard}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.priorityIndicator, { backgroundColor: issue.priority === 'High' ? '#ef4444' : issue.priority === 'Medium' ? '#f59e0b' : '#22c55e' }]} />
                            <Text style={styles.priorityLabel}>{issue.priority} Priority</Text>
                            <Text style={styles.issueTime}>{new Date(issue.timestamp).toLocaleDateString()}</Text>
                        </View>
                        
                        <Text style={styles.issueTitle}>{issue.title}</Text>
                        <Text style={styles.issueDesc}>{issue.description}</Text>

                        {issue.imageId && (
                            <View style={styles.imageContainer}>
                                <Image 
                                    source={{ uri: `https://gallant-grasshopper-633.convex.cloud/api/storage/${issue.imageId}` }}
                                    style={styles.issueImage}
                                    resizeMode="cover"
                                />
                            </View>
                        )}

                        <View style={{ marginBottom: 16 }}>
                             <Text style={{ color: '#64748b', fontSize: 12 }}>Reported by: <Text style={{ color: '#cbd5e1' }}>{issue.reporterName} ({issue.reporterRole})</Text></Text>
                        </View>

                        <View style={styles.cardFooter}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={styles.metaInfo}>
                                    <Clock size={14} color="#64748b" />
                                    <Text style={styles.metaText}>{new Date(issue.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                </View>
                                {issue.reporterAttendance && (
                                    <View style={[styles.metaInfo, { marginLeft: 12 }]}>
                                        <View style={[styles.attendanceDot, { backgroundColor: issue.reporterAttendance === 'Clocked In' ? '#22c55e' : '#64748b' }]} />
                                        <Text style={[styles.metaText, { color: issue.reporterAttendance === 'Clocked In' ? '#22c55e' : '#64748b' }]}>
                                            {issue.reporterAttendance}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {issue.status === 'open' && (
                                <TouchableOpacity 
                                    style={styles.resolveBtn}
                                    onPress={() => handleResolve(issue._id)}
                                >
                                    <CheckCircle2 color="white" size={16} />
                                    <Text style={styles.resolveBtnText}>Resolve</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                ))}
                {!loading && filteredIssues?.length === 0 && (
                    <View style={styles.emptyState}>
                        <AlertCircle color="#1e293b" size={60} />
                        <Text style={styles.emptyTitle}>Clear Sky!</Text>
                        <Text style={styles.emptyText}>No {statusFilter} issues found with these filters.</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 24, gap: 16 },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, fontWeight: 'bold', color: 'white' },
    filterSection: { paddingHorizontal: 24, marginBottom: 24 },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        padding: 4,
        borderRadius: 16,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
    },
    activeTab: { backgroundColor: '#1e293b' },
    tabText: { color: '#64748b', fontWeight: 'bold', fontSize: 14 },
    activeTabText: { color: 'white' },
    priorityTabs: { flexDirection: 'row', gap: 12 },
    priorityTab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: '#0f172a',
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    priorityTabActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    priorityTabText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
    priorityTabTextActive: { color: 'white' },
    content: { padding: 24, gap: 16 },
    issueCard: {
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
    priorityIndicator: { width: 10, height: 10, borderRadius: 5 },
    priorityLabel: { fontSize: 12, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', flex: 1 },
    issueTime: { color: '#475569', fontSize: 12 },
    issueTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
    issueDesc: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 20 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    metaInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { color: '#64748b', fontSize: 13, fontWeight: '500' },
    resolveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#22c55e',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 8,
    },
    resolveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
    emptyState: { alignItems: 'center', marginTop: 100 },
    emptyTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginTop: 24, marginBottom: 8 },
    emptyText: { color: '#64748b', fontSize: 14, textAlign: 'center' },
    imageContainer: {
        width: '100%',
        height: 150,
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 20,
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    issueImage: {
        width: '100%',
        height: '100%',
    },
    attendanceDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
});
