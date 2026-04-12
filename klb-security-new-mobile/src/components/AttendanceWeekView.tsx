import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Clock, CalendarDays } from 'lucide-react-native';
import { attendanceService } from '../services/api';
import { useCustomAuth } from '../context/AuthContext';
import { canAccessMonitoringDashboard } from '../utils/roleUtils';
import { showError, showSuccess } from '../utils/toastUtils';
import { SkeletonAttendanceCard } from './SkeletonBlocks';

function toYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatTime(ts?: number): string {
    if (ts == null) return '—';
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function digitsOnly(s: string): string {
    return String(s).replace(/\D/g, '');
}

/** Match Convex face `empId` to the signed-in user (optional `id` field) or same mobile digits. */
function viewerMatchesRecordEmp(
    customUser: { id?: string; mobileNumber?: string } | null | undefined,
    empId: string
): boolean {
    if (!customUser) return false;
    const e = String(empId).trim();
    const faceStaffId = String(customUser.id || '').trim();
    if (faceStaffId && faceStaffId === e) return true;
    if (faceStaffId && faceStaffId.toLowerCase() === e.toLowerCase()) return true;
    const mobile = digitsOnly(customUser.mobileNumber || '');
    const empDigits = digitsOnly(e);
    if (mobile.length >= 10 && empDigits === mobile) return true;
    if (mobile.length >= 10 && mobile.endsWith(empDigits) && empDigits.length >= 4) return true;
    return false;
}

/** Rolling 7 days ending today: oldest → newest (today on the right). */
function buildWeekDays(): Date[] {
    const out: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        out.push(d);
    }
    return out;
}

type AttendanceRecord = {
    _id: string;
    empId: string;
    name: string;
    date: string;
    checkInTime?: number;
    checkOutTime?: number;
    siteId?: string;
    siteName?: string;
    shiftName?: string;
    region?: string;
};

type Props = {
    navigation: any;
    /** Increment from parent (e.g. pull-to-refresh) to reload without tab-focus churn. */
    refreshToken?: number;
};

export function AttendanceWeekView({ navigation, refreshToken = 0 }: Props) {
    const { organizationId, customUser } = useCustomAuth();
    const [weekRecords, setWeekRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const weekDays = useMemo(() => buildWeekDays(), []);
    const [selectedDate, setSelectedDate] = useState(() => toYMD(new Date()));

    const startDate = toYMD(weekDays[0]);
    const endDate = toYMD(weekDays[weekDays.length - 1]);

    const isMonitoring = canAccessMonitoringDashboard(customUser);

    const load = useCallback(async () => {
        if (!organizationId) {
            setWeekRecords([]);
            setLoading(false);
            return;
        }
        try {
            const res = await attendanceService.listDateRange(organizationId, startDate, endDate);
            setWeekRecords(res.data || []);
        } catch (e) {
            console.error(e);
            showError('Attendance', 'Could not load attendance for this week.');
            setWeekRecords([]);
        } finally {
            setLoading(false);
        }
    }, [organizationId, startDate, endDate]);

    const handleDirectCheckout = async (r: AttendanceRecord) => {
        Alert.alert(
            "Checkout",
            `Force check-out ${r.name} from ${r.siteName || 'site'}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Logout",
                    style: "destructive",
                    onPress: async () => {
                        setLoading(true);
                        try {
                            await attendanceService.create({
                                empId: r.empId,
                                name: r.name,
                                date: r.date,
                                type: 'logout',
                                checkOutTime: Date.now(),
                                status: 'present',
                                organizationId: organizationId,
                                siteId: r.siteId,
                                siteName: r.siteName,
                                shiftName: r.shiftName,
                                attendanceId: r._id,
                                region: r.region || customUser?.regionId,
                            });
                            showSuccess("Success", "Staff checked out successfully");
                            load();
                        } catch (err) {
                            console.error(err);
                            showError("Error", "Failed to check out.");
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    useEffect(() => {
        setLoading(true);
        load();
    }, [load, refreshToken]);

    const dayRecords = useMemo(() => {
        const filtered = weekRecords.filter((r) => r.date === selectedDate);
        if (isMonitoring) return filtered;
        // If not a monitor/manager, only show their own records
        return filtered.filter((r) => viewerMatchesRecordEmp(customUser, r.empId));
    }, [weekRecords, selectedDate, isMonitoring, customUser]);

    const canShowCheckout = (r: AttendanceRecord) => {
        if (!r.checkInTime || r.checkOutTime) return false;
        if (isMonitoring) return true;
        return viewerMatchesRecordEmp(customUser, r.empId);
    };

    return (
        <View style={styles.wrap}>
            <View style={styles.sectionHead}>
                <CalendarDays color="#94a3b8" size={18} />
                <Text style={styles.sectionTitle}>Attendance this week</Text>
            </View>
            <Text style={styles.sectionSub}>Tap a day. Check out uses face verification when allowed.</Text>

            <View style={styles.weekStrip}>
                {weekDays.map((d) => {
                    const key = toYMD(d);
                    const sel = key === selectedDate;
                    const count = weekRecords.filter((r) => r.date === key).length;
                    const wd = d.toLocaleDateString('en-IN', { weekday: 'short' });
                    return (
                        <TouchableOpacity
                            key={key}
                            onPress={() => setSelectedDate(key)}
                            style={[styles.dayPill, sel && styles.dayPillActive]}
                            activeOpacity={0.85}
                        >
                            <Text style={[styles.dayWd, sel && styles.dayWdActive]} numberOfLines={1}>
                                {wd}
                            </Text>
                            <Text style={[styles.dayNum, sel && styles.dayNumActive]}>{d.getDate()}</Text>
                            {count > 0 ? (
                                <View style={styles.dot} />
                            ) : (
                                <View style={{ height: 5 }} />
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? (
                <View style={styles.loader}>
                    <SkeletonAttendanceCard />
                    <SkeletonAttendanceCard />
                </View>
            ) : dayRecords.length === 0 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>No attendance records for this date.</Text>
                </View>
            ) : (
                dayRecords.map((r) => (
                    <View key={r._id} style={styles.compactCard}>
                        <View style={styles.compactLeft}>
                            <Text style={styles.compactName} numberOfLines={1}>
                                {r.name}
                            </Text>
                            <Text style={styles.compactLine} numberOfLines={1}>
                                ID {r.empId} · In {formatTime(r.checkInTime)} · Out {formatTime(r.checkOutTime)}
                            </Text>
                        </View>
                        {r.checkOutTime ? (
                            <View style={styles.pillOk}>
                                <Text style={styles.pillOkText}>Out</Text>
                            </View>
                        ) : canShowCheckout(r) ? (
                            <TouchableOpacity
                                style={styles.coBtnSm}
                                onPress={() => handleDirectCheckout(r)}
                            >
                                <Text style={styles.coBtnSmText}>Check-out</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.pillWait}>
                                <Clock color="#64748b" size={11} />
                            </View>
                        )}
                    </View>
                ))
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginTop: 8 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
    sectionTitle: { color: 'white', fontSize: 17, fontWeight: '800' },
    sectionSub: { color: '#64748b', fontSize: 11, marginBottom: 10, lineHeight: 16 },
    weekStrip: {
        flexDirection: 'row',
        width: '100%',
        gap: 4,
        paddingVertical: 2,
    },
    dayPill: {
        flex: 1,
        minWidth: 0,
        paddingVertical: 6,
        paddingHorizontal: 1,
        borderRadius: 10,
        backgroundColor: 'rgba(15,23,42,0.9)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
    },
    dayPillActive: {
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.2)',
    },
    dayNum: { color: '#e2e8f0', fontSize: 13, fontWeight: '800' },
    dayNumActive: { color: '#fff' },
    dayWd: {
        color: '#64748b',
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    dayWdActive: { color: '#93c5fd' },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#10b981',
        marginTop: 4,
    },
    loader: { paddingVertical: 24, alignItems: 'center' },
    empty: {
        padding: 20,
        borderRadius: 16,
        backgroundColor: 'rgba(15,23,42,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    emptyText: { color: '#64748b', textAlign: 'center', fontSize: 13 },
    compactCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    compactLeft: { flex: 1, minWidth: 0 },
    compactName: { color: '#fff', fontSize: 13, fontWeight: '800' },
    compactLine: { color: '#64748b', fontSize: 10, marginTop: 3, fontWeight: '600' },
    coBtnSm: {
        backgroundColor: '#b91c1c',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    coBtnSmText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    pillOk: {
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
        backgroundColor: 'rgba(16,185,129,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.25)',
    },
    pillOkText: { color: '#34d399', fontSize: 9, fontWeight: '800' },
    pillWait: { padding: 6 },
});
