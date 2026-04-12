import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, CheckCircle, LogOut, QrCode, ShieldAlert, Clock } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useCustomAuth } from '../../context/AuthContext';
import { AttendanceWeekView } from '../../components/AttendanceWeekView';
import { attendanceService } from '../../services/api';
import * as Location from 'expo-location';
import { showSuccess, showError } from '../../utils/toastUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 375;

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const { organizationId, customUser, logout } = useCustomAuth();
    const [refreshing, setRefreshing] = useState(false);
    const [weekRefresh, setWeekRefresh] = useState(0);

    // Quick Attendance Status
    const [activeAttendance, setActiveAttendance] = useState<any>(null);
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    const todayYMD = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const formatDuration = (startTs: number) => {
        const diff = Date.now() - startTs;
        const totalMin = Math.floor(diff / 60000);
        if (totalMin < 0) return '0m';
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const [elapsedStr, setElapsedStr] = useState('');
    useEffect(() => {
        if (!activeAttendance?.checkInTime) {
            setElapsedStr('');
            return;
        }
        const timer = setInterval(() => {
            setElapsedStr(formatDuration(activeAttendance.checkInTime));
        }, 30000);
        setElapsedStr(formatDuration(activeAttendance.checkInTime));
        return () => clearInterval(timer);
    }, [activeAttendance?.checkInTime]);

    const fetchActiveAttendance = useCallback(async () => {
        if (!organizationId || !customUser?.empId) return;
        try {
            const date = todayYMD();
            const res = await attendanceService.list({
                organizationId,
                date,
                empId: String(customUser.empId),
            });
            const records = Array.isArray(res.data) ? res.data : [];
            const active = records.find((r: any) => r.checkInTime && !r.checkOutTime);
            setActiveAttendance(active || null);
        } catch (err) {
            console.error("Error fetching active attendance:", err);
        }
    }, [organizationId, customUser?.empId]);

    useEffect(() => {
        fetchActiveAttendance();
    }, [fetchActiveAttendance]);

    const handleQuickCheckout = async () => {
        if (!activeAttendance || isCheckingOut) return;
        
        Alert.alert(
            "Checkout",
            `Are you sure you want to check out from ${activeAttendance.siteName || 'Site'}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Check-out",
                    style: "destructive",
                    onPress: async () => {
                        setIsCheckingOut(true);
                        try {
                            const { status } = await Location.requestForegroundPermissionsAsync();
                            let lat = 0, lon = 0, acc = 0;
                            if (status === 'granted') {
                                try {
                                    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                                    lat = loc.coords.latitude;
                                    lon = loc.coords.longitude;
                                    acc = loc.coords.accuracy || 0;
                                } catch (e) { console.error("Location error", e); }
                            }

                            await attendanceService.create({
                                empId: String(customUser.empId),
                                name: customUser.name,
                                date: todayYMD(),
                                type: 'logout',
                                checkOutTime: Date.now(),
                                status: 'present',
                                latitude: lat,
                                longitude: lon,
                                locationAccuracy: acc,
                                region: activeAttendance.region || customUser.regionId,
                                organizationId: organizationId,
                                siteId: activeAttendance.siteId,
                                siteName: activeAttendance.siteName,
                                shiftName: activeAttendance.shiftName,
                                attendanceId: activeAttendance._id,
                            });

                            const total = formatDuration(activeAttendance.checkInTime);
                            showSuccess("Check-out Success", `Total work time: ${total}`);
                            fetchActiveAttendance();
                            setWeekRefresh(prev => prev + 1);
                        } catch (err) {
                            console.error("Checkout error", err);
                            showError("Error", "Failed to check out.");
                        } finally {
                            setIsCheckingOut(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.backgroundOrbs} pointerEvents="none">
                <View style={styles.orbA} />
                <View style={styles.orbB} />
            </View>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            setTimeout(() => setRefreshing(false), 800);
                        }}
                        tintColor="#2563eb"
                    />
                }
            >
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.greeting} numberOfLines={1}>
                            Home
                        </Text>
                        <Text style={styles.subGreeting} numberOfLines={1}>
                            {customUser?.name ? `Hi, ${customUser.name}` : 'Welcome'}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => logout()} style={styles.logoutBtn}>
                        <LogOut color="#ef4444" size={16} />
                        {!isSmallScreen && <Text style={styles.logoutText}>Log Out</Text>}
                    </TouchableOpacity>
                </View>

                {/* Active Attendance Session */}
                {activeAttendance && (
                    <View style={styles.activeSessionWrapper}>
                        <View style={styles.activeSessionCard}>
                            <View style={styles.activeSessionInfo}>
                                <View style={styles.activeSessionIcon}>
                                    <Clock color="#10b981" size={24} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.activeSessionLabel}>ACTIVE SESSION</Text>
                                    <Text style={styles.activeSessionSite} numberOfLines={1}>
                                        {activeAttendance.siteName || 'Unknown Site'}
                                    </Text>
                                    <Text style={styles.activeSessionTime}>
                                        In: {new Date(activeAttendance.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {activeAttendance.shiftName ? ` · ${activeAttendance.shiftName}` : ''}
                                    </Text>
                                    {elapsedStr ? (
                                        <Text style={styles.activeElapsed}>Working for: {elapsedStr}</Text>
                                    ) : null}
                                </View>
                            </View>
                            <TouchableOpacity 
                                style={[styles.quickCheckoutBtn, isCheckingOut && { opacity: 0.7 }]}
                                onPress={handleQuickCheckout}
                                disabled={isCheckingOut}
                            >
                                <LogOut color="white" size={20} />
                                <Text style={styles.quickCheckoutBtnText}>
                                    {isCheckingOut ? "Checking out..." : "Logout"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <View style={styles.actionContainer}>
                    <TouchableOpacity
                        style={[styles.actionBar, styles.attendanceBar]}
                        onPress={() => navigation.navigate('MarkAttendance')}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: '#10b981' }]}>
                            <CheckCircle color="white" size={isSmallScreen ? 20 : 24} />
                        </View>
                        <View style={styles.actionContent}>
                            <Text style={styles.actionTitle} numberOfLines={1}>
                                Attendance
                            </Text>
                             <Text style={styles.actionSub} numberOfLines={2}>
                                Quick check in or check out
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBar, styles.enrollBar]}
                        onPress={() => navigation.navigate('Enrollment')}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: '#3b82f6' }]}>
                            <Building2 color="white" size={isSmallScreen ? 20 : 24} />
                        </View>
                        <View style={styles.actionContent}>
                            <Text style={styles.actionTitle} numberOfLines={1}>
                                Enrollment
                            </Text>
                             <Text style={styles.actionSub} numberOfLines={2}>
                                Register staff for biometric features
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <View style={styles.quickRow}>
                    <TouchableOpacity
                        style={[styles.quickHalf, styles.patrolQuick]}
                        onPress={() => navigation.navigate('Patrol')}
                    >
                            <QrCode color="#fbbf24" size={isSmallScreen ? 20 : 22} />
                        <Text style={styles.quickTitle}>Patrol</Text>
                        <Text style={styles.quickSub} numberOfLines={2}>
                            Site visit & QR points
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.quickHalf, styles.issuesQuick]}
                        onPress={() => navigation.navigate('Issues')}
                    >
                        <View style={[styles.quickIcon, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                            <ShieldAlert color="#f87171" size={isSmallScreen ? 20 : 22} />
                        </View>
                        <Text style={styles.quickTitle}>Issues</Text>
                        <Text style={styles.quickSub} numberOfLines={2}>
                            Report & review issues
                        </Text>
                    </TouchableOpacity>
                </View>

                <AttendanceWeekView navigation={navigation} refreshToken={weekRefresh} />
            </ScrollView>
            <View style={{ height: insets.bottom }} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    backgroundOrbs: {
        ...StyleSheet.absoluteFillObject,
        zIndex: -1,
    },
    orbA: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: 'rgba(59, 130, 246, 0.14)',
        top: -100,
        left: -60,
    },
    orbB: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        bottom: 80,
        right: -80,
    },
    scrollContent: {
        padding: isSmallScreen ? 16 : 24,
        paddingBottom: 48,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
        gap: 12,
    },
    headerLeft: { flex: 1, minWidth: 0 },
    greeting: {
        fontSize: isSmallScreen ? 24 : 28,
        fontWeight: '800',
        color: 'white',
        letterSpacing: 0.5,
    },
    subGreeting: {
        fontSize: 14,
        color: '#64748b',
        marginTop: 6,
        fontWeight: '600',
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    logoutText: {
        color: '#ef4444',
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    actionContainer: {
        gap: 12,
        marginBottom: 28,
    },
    actionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: isSmallScreen ? 14 : 18,
        borderRadius: 20,
        borderWidth: 1,
        gap: 14,
        minHeight: 76,
    },
    attendanceBar: {
        backgroundColor: 'rgba(6, 78, 59, 0.35)',
        borderColor: 'rgba(16, 185, 129, 0.25)',
    },
    enrollBar: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    quickRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 28,
    },
    quickHalf: {
        flex: 1,
        minWidth: 0,
        padding: isSmallScreen ? 14 : 16,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: 'center',
        gap: 8,
    },
    patrolQuick: {
        backgroundColor: 'rgba(120, 53, 15, 0.2)',
        borderColor: 'rgba(245, 158, 11, 0.25)',
    },
    issuesQuick: {
        backgroundColor: 'rgba(127, 29, 29, 0.2)',
        borderColor: 'rgba(239, 68, 68, 0.22)',
    },
    quickIcon: {
        width: isSmallScreen ? 44 : 48,
        height: isSmallScreen ? 44 : 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickTitle: {
        fontSize: isSmallScreen ? 15 : 16,
        fontWeight: '800',
        color: 'white',
    },
    quickSub: {
        fontSize: 11,
        color: '#94a3b8',
        textAlign: 'center',
        lineHeight: 14,
    },
    actionIcon: {
        width: isSmallScreen ? 48 : 54,
        height: isSmallScreen ? 48 : 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionContent: { flex: 1, minWidth: 0 },
    actionTitle: {
        fontSize: isSmallScreen ? 16 : 18,
        fontWeight: '800',
        color: 'white',
    },
    actionSub: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 4,
        lineHeight: 17,
    },
    // Active Session Styles
    activeSessionWrapper: {
        marginBottom: 24,
    },
    activeSessionCard: {
        backgroundColor: '#0f172a',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
    activeSessionInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 16,
    },
    activeSessionIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    activeSessionLabel: {
        color: '#10b981',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 2,
    },
    activeSessionSite: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    activeSessionTime: {
        color: '#94a3b8',
        fontSize: 12,
        marginTop: 2,
        fontWeight: '600',
    },
    activeElapsed: {
        color: '#93c5fd',
        fontSize: 12,
        fontWeight: '800',
        marginTop: 4,
    },
    quickCheckoutBtn: {
        backgroundColor: '#ef4444',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        gap: 8,
    },
    quickCheckoutBtnText: {
        color: 'white',
        fontSize: 15,
        fontWeight: '800',
    },
});
