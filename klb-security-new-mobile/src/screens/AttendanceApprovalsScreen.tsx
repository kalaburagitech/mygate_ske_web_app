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
import { ChevronLeft, User, Clock, CheckCircle, MapPin, XCircle } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { attendanceService, uploadService } from '../services/api';
import { showError, showSuccess } from '../utils/toastUtils';

export default function AttendanceApprovalsScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const { organizationId, userId } = useCustomAuth();
    
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    function LogImage({ imageId, style }: { imageId?: string; style: any }) {
        const [uri, setUri] = useState<string | null>(null);
        useEffect(() => {
            if (imageId) {
                uploadService.getImageUrl(imageId).then(setUri);
            }
        }, [imageId]);

        if (!uri) return <User color="#3b82f6" size={24} />;
        return <Image source={{ uri }} style={style} />;
    }

    const loadLogs = useCallback(async () => {
        if (!userId) return;
        try {
            const res = await attendanceService.list({ 
                requestingUserId: userId,
                approvalStatus: 'pending'
            });
            setLogs(res.data || []);
        } catch (err) {
            console.error(err);
            showError('Error', 'Failed to load attendance requests.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userId]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const handleUpdateStatus = async (attendanceId: string, status: 'approved' | 'rejected') => {
        setLoading(true);
        try {
            await attendanceService.updateAttendanceStatus(attendanceId, status, userId);
            showSuccess('Success', `Attendance ${status}`);
            loadLogs();
        } catch (err) {
            showError('Error', 'Failed to update status.');
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <View style={styles.cardInfo}>
                <View style={styles.headerRow}>
                    <View style={styles.avatar}>
                        <LogImage 
                            imageId={item.imageId} 
                            style={styles.photo} 
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{item.name}</Text>
                        <Text style={styles.subText}>Staff/Contractor · {item.siteName}</Text>
                    </View>
                    <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>PENDING</Text>
                    </View>
                </View>

                <View style={styles.detailsRow}>
                    <View style={styles.detailItem}>
                        <Clock color="#64748b" size={14} />
                        <Text style={styles.detailText}>{new Date(item.createdAt || Date.now()).toLocaleTimeString()}</Text>
                    </View>
                    <View style={styles.detailItem}>
                        <MapPin color="#64748b" size={14} />
                        <Text style={styles.detailText}>Location Captured</Text>
                    </View>
                </View>

                <View style={styles.actions}>
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
                </View>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>Attendance Approvals</Text>
            </View>

            {loading && !refreshing ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#3b82f6" />
                </View>
            ) : (
                <FlatList
                    data={logs}
                    keyExtractor={(item) => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadLogs(); }} tintColor="#3b82f6" />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <User color="#1e293b" size={64} />
                            <Text style={styles.emptyText}>No pending attendance logs.</Text>
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
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    avatar: { width: 50, height: 50, borderRadius: 16, backgroundColor: 'rgba(59, 130, 246, 0.1)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    photo: { width: 50, height: 50 },
    name: { fontSize: 18, fontWeight: 'bold', color: 'white' },
    subText: { fontSize: 13, color: '#64748b', marginTop: 2 },
    pendingBadge: { backgroundColor: '#f59e0b20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    pendingText: { color: '#f59e0b', fontSize: 10, fontWeight: 'bold' },
    detailsRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detailText: { color: '#94a3b8', fontSize: 13 },
    actions: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12 },
    actionBtnText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100, gap: 16 },
    emptyText: { color: '#64748b', fontSize: 16, fontWeight: '600' }
});
