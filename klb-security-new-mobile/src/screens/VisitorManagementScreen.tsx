import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    Image,
    Alert
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, User, Clock, CheckCircle, LogOut, Phone, MapPin, XCircle, AlertTriangle, Camera, Building2, QrCode } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { logService } from '../services/api';
import { uploadImage } from '../services/upload';
import { prepareVisitPhotoForUpload } from '../utils/imageResize';
import * as ImagePicker from 'expo-image-picker';
import { showError, showSuccess } from '../utils/toastUtils';

export default function VisitorManagementScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { status, siteId } = route.params || { status: 'approved' };
    const { organizationId, userId, customUser } = useCustomAuth();
    const isClient = customUser?.roles?.includes('Client');

    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('people');

    const loadLogs = useCallback(async () => {
        if (!organizationId) return;
        try {
            // Include userId as requestingUserId to ensure role-based filtering on server
            const res = await logService.getVisitLogs(organizationId, siteId, undefined, undefined, userId || undefined);
            const todayStart = new Date().setHours(0, 0, 0, 0);
            const filtered = (res.data || []).filter((l: any) => {
                if (status === 'today') {
                    return new Date(l.createdAt).getTime() >= todayStart;
                }
                return l.status === status;
            });
            setLogs(filtered);
        } catch (err) {
            console.error(err);
            showError('Error', 'Failed to load visitors.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [organizationId, siteId, status]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const handleUpdateStatus = async (logId: string, newStatus: string, imageId?: string) => {
        setLoading(true);
        try {
            await logService.updateVisitorStatus(logId, newStatus, imageId);
            showSuccess('Success', `Visitor marked as ${newStatus}`);
            loadLogs();
        } catch (err) {
            showError('Error', 'Failed to update status.');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkExit = async (logId: string) => {
        setLoading(true);
        try {
            await handleUpdateStatus(logId, 'exited');
        } catch (err) {
            console.error(err);
            showError('Error', 'Failed to mark exit.');
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <View style={styles.cardInfo}>
                <View style={styles.visitorHeader}>
                    <View style={styles.avatar}>
                        {item.imageId ? (
                            <Image 
                                source={{ uri: `https://gallant-grasshopper-633.convex.cloud/api/storage/${item.imageId}` }} 
                                style={styles.visitorPhoto} 
                            />
                        ) : (
                            <User color="#3b82f6" size={24} />
                        )}
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.visitorName}>{item.visitorName || 'Unknown Visitor'}</Text>
                        <Text style={styles.visitorSub}>{item.numberOfPeople || 1} Person • {item.vehicleNumber || 'No Vehicle'}</Text>
                        <Text style={styles.officerName}>By {item.userName || 'Officer'}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                        <Text style={styles.statusText}>{item.status?.toUpperCase()}</Text>
                    </View>
                </View>

                <View style={styles.detailsGrid}>
                    <View style={styles.detailItem}>
                        <Clock color="#64748b" size={14} />
                        <Text style={styles.detailText}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
                    </View>
                    {item.targetUserName && (
                        <View style={styles.detailItem}>
                            <Phone color="#64748b" size={14} />
                            <Text style={styles.detailText}>To: {item.targetUserName}</Text>
                        </View>
                    )}
                </View>

                <View style={styles.actions}>
                    {item.status === 'pending' && (
                        <>
                            <TouchableOpacity 
                                style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                                onPress={() => handleUpdateStatus(item._id, 'approved')}
                            >
                                <CheckCircle color="white" size={18} />
                                <Text style={styles.actionBtnText}>Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                                onPress={() => handleUpdateStatus(item._id, 'rejected')}
                            >
                                <XCircle color="white" size={18} />
                                <Text style={styles.actionBtnText}>Reject</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    {item.status === 'approved' && !isClient && (
                        <TouchableOpacity 
                            style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                            onPress={() => handleUpdateStatus(item._id, 'inside')}
                        >
                            <CheckCircle color="white" size={18} />
                            <Text style={styles.actionBtnText}>Mark Entry</Text>
                        </TouchableOpacity>
                    )}
                    {item.status === 'inside' && !isClient && (
                        <TouchableOpacity 
                            style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                            onPress={() => handleMarkExit(item._id)}
                        >
                            <LogOut color="white" size={18} />
                            <Text style={styles.actionBtnText}>Mark Exit</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );

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

    const title = status === 'today' ? "Today's Entries" : status.charAt(0).toUpperCase() + status.slice(1) + ' Visitors';
    const filteredLogs = logs.filter(log => {
        if (activeTab === 'people') return !log.vehicleNumber;
        return !!log.vehicleNumber;
    });

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>{title}</Text>
            </View>

            <View style={styles.tabBar}>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'people' && styles.activeTab]} 
                    onPress={() => setActiveTab('people')}
                >
                    <QrCode color={activeTab === 'people' ? '#3b82f6' : '#64748b'} size={18} />
                    <Text style={[styles.tabText, activeTab === 'people' && styles.activeTabText]}>People</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'vehicles' && styles.activeTab]} 
                    onPress={() => setActiveTab('vehicles')}
                >
                    <Building2 size={18} color={activeTab === 'vehicles' ? '#3b82f6' : '#64748b'} />
                    <Text style={[styles.tabText, activeTab === 'vehicles' && styles.activeTabText]}>Vehicles</Text>
                </TouchableOpacity>
            </View>

            {loading && !refreshing ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#3b82f6" />
                </View>
            ) : (
                <FlatList
                    data={filteredLogs}
                    keyExtractor={(item) => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadLogs(); }} tintColor="#3b82f6" />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <User color="#1e293b" size={64} />
                            <Text style={styles.emptyText}>No {status} visitors found.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 22, fontWeight: 'bold', color: 'white' },
    list: { padding: 20, gap: 16 },
    card: { backgroundColor: '#0f172a', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
    cardInfo: { padding: 20 },
    visitorHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(59, 130, 246, 0.1)', justifyContent: 'center', alignItems: 'center' },
    visitorName: { fontSize: 18, fontWeight: 'bold', color: 'white' },
    visitorSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
    officerName: { fontSize: 11, color: '#3b82f6', marginTop: 2, fontWeight: '600' },
    visitorPhoto: { width: 44, height: 44, borderRadius: 22 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    detailsGrid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detailText: { color: '#94a3b8', fontSize: 13 },
    actions: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12 },
    actionBtnText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100, gap: 16 },
    emptyText: { color: '#64748b', fontSize: 16, fontWeight: '600' },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingBottom: 16,
        gap: 12
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)'
    },
    activeTab: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgba(59, 130, 246, 0.3)'
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b'
    },
    activeTabText: {
        color: '#3b82f6'
    }
});
