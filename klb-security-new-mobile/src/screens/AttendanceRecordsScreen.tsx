import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, ScrollView, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, MapPin, ChevronRight, CheckCircle, X, Search, Calendar, ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { attendanceService } from '../services/api';
import { isAdministrativeRole } from '../utils/roleUtils';
import { Modal } from 'react-native';

/** Full attendance history (date filter + search). Opened from Attendance tab header. */
export default function AttendanceRecordsScreen() {
    const insets = useSafeAreaInsets();
    const { customUser, organizationId } = useCustomAuth();
    const isAdmin = isAdministrativeRole(customUser);
    const navigation = useNavigation<any>();

    const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [isCalendarVisible, setIsCalendarVisible] = useState(false);

    useEffect(() => {
        fetchAttendanceRecords();
    }, [organizationId, selectedDate, isAdmin]);

    const fetchAttendanceRecords = async () => {
        try {
            setLoading(true);
            const filters: any = {
                organizationId: isAdmin ? undefined : organizationId,
                date: selectedDate,
            };

            const response = await attendanceService.list(filters);
            setAttendanceRecords(response.data || []);
        } catch (error) {
            console.error('Error fetching attendance records:', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchAttendanceRecords();
        setRefreshing(false);
    };

    const toggleExpand = (id: string) => {
        const next = new Set(expandedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedIds(next);
    };

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    };

    const filteredRecords = attendanceRecords.filter((record) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase().trim();
        return (
            (record.name && record.name.toLowerCase().includes(query)) ||
            (record.empId && record.empId.toLowerCase().includes(query)) ||
            (record.city && record.city.toLowerCase().includes(query)) ||
            (record.siteName && record.siteName.toLowerCase().includes(query))
        );
    });

    const getDateOptions = () => {
        const options = [];
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            options.push({
                dateStr,
                label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : formatDate(dateStr),
            });
        }
        return options;
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ChevronLeft color="#fff" size={22} />
                </TouchableOpacity>
                <Text style={styles.screenTitle}>Records</Text>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setIsCalendarVisible(true)}>
                    <Calendar color="#2563eb" size={20} />
                </TouchableOpacity>
            </View>

            <Modal
                visible={isCalendarVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setIsCalendarVisible(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setIsCalendarVisible(false)}
                >
                    <View style={styles.calendarContainer}>
                        <View style={styles.calendarHeader}>
                            <Text style={styles.calendarTitle}>Select Date</Text>
                            <TouchableOpacity onPress={() => setIsCalendarVisible(false)}>
                                <X color="#64748b" size={20} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.daysGrid}>
                            {Array.from({ length: 31 }, (_, i) => {
                                const day = i + 1;
                                const date = new Date();
                                date.setDate(day);
                                const dStr = date.toISOString().split('T')[0];
                                const isSelected = selectedDate === dStr;
                                return (
                                    <TouchableOpacity
                                        key={day}
                                        style={[styles.dayCell, isSelected && styles.activeDayCell]}
                                        onPress={() => {
                                            setSelectedDate(dStr);
                                            setIsCalendarVisible(false);
                                        }}
                                    >
                                        <Text style={[styles.dayText, isSelected && styles.activeDayText]}>{day}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <TouchableOpacity
                            style={styles.todayBtn}
                            onPress={() => {
                                setSelectedDate(new Date().toISOString().split('T')[0]);
                                setIsCalendarVisible(false);
                            }}
                        >
                            <Text style={styles.todayBtnText}>Today</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <View style={styles.filterContainer}>
                <View style={styles.searchBar}>
                    <Search color="#64748b" size={16} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search name, ID or site..."
                        placeholderTextColor="#475569"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X color="#64748b" size={16} />
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
                    {getDateOptions().map((option) => (
                        <TouchableOpacity
                            key={option.dateStr}
                            style={[styles.dateChip, selectedDate === option.dateStr && styles.activeDateChip]}
                            onPress={() => setSelectedDate(option.dateStr)}
                        >
                            <Calendar size={12} color={selectedDate === option.dateStr ? 'white' : '#64748b'} />
                            <Text style={[styles.dateChipText, selectedDate === option.dateStr && styles.activeDateChipText]}>
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color="#2563eb" size="large" />
                </View>
            ) : (
                <FlatList
                    data={filteredRecords}
                    keyExtractor={(item, index) => item._id || `attendance-${index}`}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.card, expandedIds.has(item._id) && styles.cardExpanded]}
                            activeOpacity={0.7}
                            onPress={() => toggleExpand(item._id)}
                        >
                            <View style={styles.cardHeader}>
                                <View style={styles.statusBadge}>
                                    {item.checkInTime && !item.checkOutTime ? (
                                        <>
                                            <CheckCircle color="#10b981" size={12} />
                                            <Text style={styles.statusText}>Checked In</Text>
                                        </>
                                    ) : item.checkOutTime ? (
                                        <>
                                            <CheckCircle color="#3b82f6" size={12} />
                                            <Text style={styles.statusText}>Completed</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Clock color="#64748b" size={12} />
                                            <Text style={styles.statusText}>Pending</Text>
                                        </>
                                    )}
                                </View>
                                <View style={styles.timeTag}>
                                    <Clock color="#64748b" size={12} />
                                    <Text style={styles.dateText}>{formatDate(item.date)}</Text>
                                </View>
                            </View>

                            <View style={styles.mainContent}>
                                <View style={styles.personInfo}>
                                    <Text style={styles.personName}>{item.name}</Text>
                                    <View style={styles.detailsRow}>
                                        <Text style={styles.empId}>ID: {item.empId}</Text>
                                    </View>
                                    <View style={styles.regionRow}>
                                        <MapPin color="#3b82f6" size={12} />
                                        <Text style={styles.regionName}>
                                            {item.siteName ? `${item.siteName}` : ''}
                                            {item.city ? ` • ${item.city}` : ''}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {expandedIds.has(item._id) && (
                                <View style={styles.detailsSection}>
                                    {item.checkInTime && (
                                        <View style={styles.detailItem}>
                                            <Clock color="#10b981" size={14} />
                                            <Text style={styles.detailLabel}>Check In:</Text>
                                            <Text style={styles.detailValue}>{formatTime(item.checkInTime)}</Text>
                                        </View>
                                    )}
                                    {item.checkOutTime && (
                                        <View style={styles.detailItem}>
                                            <Clock color="#3b82f6" size={14} />
                                            <Text style={styles.detailLabel}>Check Out:</Text>
                                            <Text style={styles.detailValue}>{formatTime(item.checkOutTime)}</Text>
                                        </View>
                                    )}
                                    {item.shiftName && (
                                        <View style={styles.detailItem}>
                                            <Text style={styles.detailLabel}>Shift:</Text>
                                            <Text style={styles.detailValue}>{item.shiftName}</Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            <View style={styles.footer}>
                                <View style={styles.statusInfo}>
                                    <Text style={styles.statusLabel}>Status:</Text>
                                    <Text style={[styles.statusValue, item.status === 'present' && { color: '#10b981' }]}>
                                        {item.status === 'present' ? 'Present' : 'Absent'}
                                    </Text>
                                </View>
                                <ChevronRight
                                    color="#334155"
                                    size={16}
                                    style={{ transform: [{ rotate: expandedIds.has(item._id) ? '90deg' : '0deg' }] }}
                                />
                            </View>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Calendar color="#1e293b" size={64} style={{ marginBottom: 16 }} />
                            <Text style={styles.emptyText}>No attendance records found</Text>
                            <Text style={styles.emptySub}>
                                {searchQuery ? 'Try a different search term' : 'Records will appear here after check-ins'}
                            </Text>
                        </View>
                    }
                />
            )}
            <View style={{ height: insets.bottom }} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
    },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    screenTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: '#fff' },
    filterContainer: { marginBottom: 16 },
    searchBar: {
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
    searchInput: { flex: 1, color: 'white', fontSize: 13, paddingHorizontal: 8 },
    dateScroll: { paddingHorizontal: 24, paddingBottom: 4, gap: 8 },
    dateChip: {
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
    activeDateChip: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    dateChipText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
    activeDateChipText: { color: 'white' },
    list: { paddingHorizontal: 24, paddingBottom: 40 },
    card: {
        backgroundColor: '#0f172a',
        padding: 20,
        borderRadius: 28,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    cardExpanded: { borderColor: '#2563eb' },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: { color: '#10b981', fontSize: 12, fontWeight: '600' },
    timeTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    dateText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
    mainContent: { marginBottom: 14 },
    personInfo: { flex: 1 },
    personName: { fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 6 },
    detailsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    empId: { color: '#64748b', fontSize: 13, fontWeight: '600' },
    regionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    regionName: { color: '#3b82f6', fontSize: 13, fontWeight: '600' },
    detailsSection: {
        backgroundColor: 'rgba(37, 99, 235, 0.05)',
        padding: 16,
        borderRadius: 20,
        marginBottom: 16,
        gap: 8,
    },
    detailItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    detailLabel: { color: '#64748b', fontSize: 13 },
    detailValue: { color: 'white', fontSize: 13, fontWeight: '600' },
    footer: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
        paddingTop: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusLabel: { color: '#64748b', fontSize: 12, fontWeight: '600' },
    statusValue: { color: '#64748b', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
    emptyText: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
    emptySub: { color: '#64748b', fontSize: 15, textAlign: 'center' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    calendarContainer: {
        width: '90%',
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    calendarTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    dayCell: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    activeDayCell: { backgroundColor: '#2563eb' },
    dayText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
    activeDayText: { color: 'white' },
    todayBtn: {
        marginTop: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    todayBtnText: { color: '#3b82f6', fontSize: 14, fontWeight: 'bold' },
});
