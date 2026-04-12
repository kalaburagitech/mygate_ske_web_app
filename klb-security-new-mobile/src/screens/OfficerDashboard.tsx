import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, User, Clock, ClipboardList, ChevronRight, MapPin, LogOut, X, CheckCircle, ShieldAlert, Menu, Calendar as CalendarIcon, QrCode, AlertTriangle, Plus, Sun, Moon, GraduationCap } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { siteService, logService, regionService, attendanceService } from '../services/api';
import * as Location from 'expo-location';
import { useCustomAuth } from '../context/AuthContext';
import { usePatrolStore } from '../store/usePatrolStore';
import { isAdministrativeRole, canAccessMonitoringDashboard } from '../utils/roleUtils';
import { showError, showSuccess } from '../utils/toastUtils';
import { AttendanceWeekView } from '../components/AttendanceWeekView';

export default function OfficerDashboard() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const { organizationId, userId, logout, customUser } = useCustomAuth();
    const isAdmin = isAdministrativeRole(customUser);
    const [selectedSiteId, setSelectedSiteId] = useState<any>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
    
    // Quick Attendance Status
    const [activeAttendance, setActiveAttendance] = useState<any>(null);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [isRefreshingAttendance, setIsRefreshingAttendance] = useState(false);

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
        }, 30000); // update every 30s
        setElapsedStr(formatDuration(activeAttendance.checkInTime));
        return () => clearInterval(timer);
    }, [activeAttendance?.checkInTime]);

    const fetchActiveAttendance = useCallback(async () => {
        if (!organizationId || !customUser?.empId) return;
        setIsRefreshingAttendance(true);
        try {
            const date = todayYMD();
            const res = await attendanceService.list({
                organizationId,
                date,
                empId: String(customUser.empId),
            });
            const records = Array.isArray(res.data) ? res.data : [];
            // Find an active session (checked in but not checked out)
            const active = records.find((r: any) => r.checkInTime && !r.checkOutTime);
            setActiveAttendance(active || null);
        } catch (err) {
            console.error("Error fetching active attendance:", err);
        } finally {
            setIsRefreshingAttendance(false);
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
                            // Also refresh dashboard stats if needed
                            if (isSORole) {
                                logService.getSODashboardData(organizationId, userId, selectedSiteId || undefined)
                                    .then(res => setSoStats(res.data.data))
                                    .catch(() => {});
                            }
                        } catch (err) {
                            console.error("Checkout error", err);
                            showError("Error", "Failed to check out. Please try again.");
                        } finally {
                            setIsCheckingOut(false);
                        }
                    }
                }
            ]
        );
    };

    const handleLogout = async () => {
        Alert.alert(
            "Logout",
            "Are you sure you want to logout?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Logout",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await logout();
                        } catch (err) {
                            console.error("Logout failed", err);
                        }
                    }
                }
            ]
        );
    };

    const [sites, setSites] = useState<any[]>([]);
    const [regions, setRegions] = useState<any[]>([]);
    const { lastCity, setLastSelection } = usePatrolStore();
    const [selectedCity, setSelectedCity] = useState<string | null>(lastCity || customUser?.city || null);

    const connectedRegionId = customUser?.regionId ?? null;

    const cityFilterOptions = useMemo((): string[] => {
        if (!connectedRegionId) return [];
        const fromUser =
            Array.isArray(customUser?.cities) && customUser!.cities!.length > 0
                ? (customUser!.cities as string[])
                : customUser?.city
                    ? [String(customUser.city)]
                    : [];
        const uniqUser = [...new Set(fromUser.map((c) => String(c).trim()).filter(Boolean))];
        if (uniqUser.length > 0) return uniqUser;
        const r = regions.find((x) => x.regionId === connectedRegionId);
        const fromRegion = Array.isArray(r?.cities) ? (r.cities as string[]) : [];
        return [...new Set(fromRegion.map((c) => String(c).trim()).filter(Boolean))];
    }, [customUser, regions, connectedRegionId]);

    const regionDisplayName =
        (connectedRegionId && regions.find((r) => r.regionId === connectedRegionId)?.regionName) ||
        (connectedRegionId ? 'Your region' : isAdmin ? 'Organization' : 'No region assigned');


    const [patrolLogs, setPatrolLogs] = useState<any[]>([]);
    const [visitLogs, setVisitLogs] = useState<any[]>([]);

    React.useEffect(() => {
        regionService.getRegions()
            .then(res => setRegions(res.data || []))
            .catch(err => console.error("Error fetching regions:", err));
    }, []);

    React.useEffect(() => {
        if (!organizationId || !userId) return;

        const applyCityScope = (data: any[]) => {
            // City filtering removed as requested
            return data;
        };

        const fail = (err: unknown) => {
            console.error('Error fetching sites:', err);
            showError('Sync Error', 'Failed to load sites. Please check your connection.');
            setSites([]);
        };

        if (!connectedRegionId) {
            if (isAdmin) {
                siteService
                    .getAllSites()
                    .then((res) => setSites(applyCityScope(res.data || [])))
                    .catch(fail);
            } else {
                setSites([]);
            }
            return;
        }

        const fetchMethod = isAdmin
            ? siteService.getAllSites()
            : siteService.getSitesByUser(userId, connectedRegionId, selectedCity || undefined);

        fetchMethod
            .then((res) => {
                let data = res.data || [];
                if (isAdmin) {
                    data = data.filter(
                        (site: any) =>
                            String(site.regionId || '').toLowerCase().trim() ===
                            String(connectedRegionId).toLowerCase().trim()
                    );
                }
                setSites(applyCityScope(data));
            })
            .catch(fail);
    }, [organizationId, userId, isAdmin, connectedRegionId, selectedCity, cityFilterOptions]);

    React.useEffect(() => {
        if (!organizationId && !isAdmin) return;
        const effectiveOrgId = isAdmin ? 'all' : (organizationId as string);

        logService
            .getPatrolLogs(
                effectiveOrgId,
                selectedSiteId || undefined,
                connectedRegionId || undefined,
                selectedCity || undefined
            )
            .then((res) => setPatrolLogs(res.data))
            .catch((err) => {
                console.error('Error fetching patrol logs:', err);
                showError('Logs Error', 'Failed to load patrol history.');
            });

        logService
            .getVisitLogs(
                effectiveOrgId,
                selectedSiteId || undefined,
                connectedRegionId || undefined,
                selectedCity || undefined
            )
            .then((res) => setVisitLogs(res.data))
            .catch((err) => {
                console.error('Error fetching visit logs:', err);
                showError('Logs Error', 'Failed to load visit history.');
            });
    }, [organizationId, selectedSiteId, selectedCity, isAdmin, connectedRegionId]);

    const filteredPatrolLogs = patrolLogs?.filter(log =>
        selectedSiteId ? log.siteId === selectedSiteId : sites.some(s => s._id === log.siteId)
    );
    const filteredVisitLogs = visitLogs?.filter(log =>
        selectedSiteId ? log.siteId === selectedSiteId : sites.some(s => s._id === log.siteId)
    );

    const [soStats, setSoStats] = useState<any>(null);
    const [clientStats, setClientStats] = useState<any>(null);
    const isSORole = customUser?.roles?.includes('SO');
    const isClientRole = customUser?.roles?.includes('Client');

    React.useEffect(() => {
        if (isSORole && organizationId && userId) {
            logService.getSODashboardData(organizationId, userId, selectedSiteId || undefined)
                .then(res => setSoStats(res.data.data))
                .catch(err => console.error("Error fetching SO stats", err));
        }
    }, [isSORole, organizationId, userId, selectedSiteId]);

    React.useEffect(() => {
        if (isClientRole && userId) {
            logService.getClientDashboardData(userId)
                .then(res => setClientStats(res.data.data))
                .catch(err => console.error("Error fetching Client stats", err));
        }
    }, [isClientRole, userId]);

    const handleActionPress = (actionType: 'VisitorEntry' | 'VehicleEntry' | 'Approved' | 'Inside' | 'Exit' | 'MyWork' | 'Pending') => {
        const performAction = (siteId: string) => {
            const site = sites.find(s => s._id === siteId);
            setIsQuickActionsOpen(false);

            switch (actionType) {
                case 'VisitorEntry':
                    navigation.navigate('VisitForm', { siteId, siteName: site?.name, organizationId, isManual: true, type: 'General' });
                    break;
                case 'VehicleEntry':
                    navigation.navigate('VisitForm', { siteId, siteName: site?.name, organizationId, isManual: true, type: 'Vehicle' });
                    break;
                case 'Pending':
                    navigation.navigate('VisitorManagement', { status: 'pending', siteId });
                    break;
                case 'Approved':
                    navigation.navigate('VisitorManagement', { status: 'approved', siteId });
                    break;
                case 'Inside':
                    navigation.navigate('VisitorManagement', { status: 'inside', siteId });
                    break;
                case 'Exit':
                    navigation.navigate('VisitorManagement', { status: 'inside', siteId });
                    break;
                case 'MyWork':
                    navigation.navigate('PatrolHistory');
                    break;
                case 'StaffAttendance':
                    navigation.navigate('AttendanceManual', { 
                        siteId, 
                        siteName: site?.name, 
                        organizationId,
                        regionId: customUser?.regionId 
                    });
                    break;
            }
        };

        if (selectedSiteId) {
            performAction(selectedSiteId);
            return;
        }

        if (sites.length === 0) {
            Alert.alert("No Sites", "You have no sites assigned to perform this action.");
            return;
        }

        if (sites.length === 1) {
            const siteId = sites[0]._id;
            setSelectedSiteId(siteId);
            performAction(siteId);
            return;
        }

        Alert.alert(
            "Select Site",
            "Please select a site to proceed:",
            [
                ...sites.slice(0, 3).map(site => ({
                    text: site.name,
                    onPress: () => {
                        setSelectedSiteId(site._id);
                        performAction(site._id);
                    }
                })),
                { text: "Cancel", style: "cancel" }
            ]
        );
    };

    const currentGuard = filteredPatrolLogs?.length ? filteredPatrolLogs[0].userName : "No guard active";
    const lastPatrol = filteredPatrolLogs?.length ? new Date(filteredPatrolLogs[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "None today";

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => setIsMenuOpen(true)} style={styles.menuBtn}>
                    <Menu color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>{isAdmin ? "Global Monitor" : "System Monitor"}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                        <LogOut color="#ef4444" size={16} />
                    </TouchableOpacity>
                </View>
            </View>

            {isMenuOpen && (
                <View style={styles.menuOverlay}>
                    <SafeAreaView style={{ flex: 1 }}>
                        <View style={styles.menuHeader}>
                            <Text style={styles.menuTitle}>Navigation</Text>
                            <TouchableOpacity onPress={() => setIsMenuOpen(false)} style={styles.closeBtn}>
                                <X color="white" size={24} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.menuContent}>
                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => { setIsMenuOpen(false); navigation.getParent()?.navigate('PatrolHistory'); }}
                            >
                                <View style={[styles.menuIcon, { backgroundColor: '#3b82f6' }]}>
                                    <ClipboardList color="white" size={20} />
                                </View>
                                <Text style={styles.menuText}>Patrol history</Text>
                                <ChevronRight color="#475569" size={20} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => { setIsMenuOpen(false); navigation.navigate('MainTabs', { screen: 'Attendance' }); }}
                            >
                                <View style={[styles.menuIcon, { backgroundColor: '#10b981' }]}>
                                    <CalendarIcon color="white" size={20} />
                                </View>
                                <Text style={styles.menuText}>Attendance</Text>
                                <ChevronRight color="#475569" size={20} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => { setIsMenuOpen(false); navigation.navigate('Issues'); }}
                            >
                                <View style={[styles.menuIcon, { backgroundColor: '#ef4444' }]}>
                                    <ShieldAlert color="white" size={20} />
                                </View>
                                <Text style={styles.menuText}>Issue Tracker</Text>
                                <ChevronRight color="#475569" size={20} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => { setIsMenuOpen(false); navigation.navigate('Patrol'); }}
                            >
                                <View style={[styles.menuIcon, { backgroundColor: '#f59e0b' }]}>
                                <QrCode color="white" size={20} />
                                </View>
                                <Text style={styles.menuText}>Patrol</Text>
                                <ChevronRight color="#475569" size={20} />
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </View>
            )}

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.scopeSection}>
                    <Text style={styles.scopeRegionLine} numberOfLines={2}>
                        Region · {regionDisplayName}
                    </Text>
                    <Text style={styles.scopeCityLine}>All sites in this region</Text>
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

                {canAccessMonitoringDashboard(customUser) && (
                    <View style={{ marginBottom: 24 }}>
                        <AttendanceWeekView 
                            navigation={navigation} 
                            refreshToken={activeAttendance ? 1 : 0} 
                        />
                    </View>
                )}

                {/* Dashboard Tools */}
                <View style={styles.actionSection}>
                    <Text style={styles.sectionTitle}>Dashboard tools</Text>
                    <View style={styles.toolsRow}>
                        {isSORole && (
                            <TouchableOpacity
                                style={[styles.actionCard, styles.toolCardHalf, { backgroundColor: '#db2777', borderColor: '#9d174d' }]}
                                onPress={() => handleActionPress('StaffAttendance')}
                            >
                                <View style={[styles.actionIconBox, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                    <User color="white" size={24} />
                                </View>
                                <View style={styles.actionContent}>
                                    <Text style={styles.actionTitle}>Attendance</Text>
                                    <Text style={styles.actionSub}>Staff/Contractor</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.actionCard, styles.toolCardHalf, { backgroundColor: '#d97706', borderColor: '#b45309' }]}
                            onPress={() => navigation.navigate('Patrol')}
                        >
                            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                <QrCode color="white" size={24} />
                            </View>
                            <View style={styles.actionContent}>
                                <Text style={styles.actionTitle}>Patrol</Text>
                                <Text style={styles.actionSub}>QR Scanning</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                    <View style={[styles.toolsRow, { marginTop: 12 }]}>
                        <TouchableOpacity
                            style={[styles.actionCard, styles.toolCardHalf, { backgroundColor: '#dc2626', borderColor: '#991b1b' }]}
                            onPress={() => navigation.navigate('Issues')}
                        >
                            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                <ShieldAlert color="white" size={24} />
                            </View>
                            <View style={styles.actionContent}>
                                <Text style={styles.actionTitle}>Issues</Text>
                                <Text style={styles.actionSub}>Log & Track</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionCard, styles.toolCardHalf, { backgroundColor: '#6366f1', borderColor: '#4338ca' }]}
                            onPress={() => handleActionPress('MyWork')}
                        >
                            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                <ClipboardList color="white" size={24} />
                            </View>
                            <View style={styles.actionContent}>
                                <Text style={styles.actionTitle}>My Work</Text>
                                <Text style={styles.actionSub}>History</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                {isSORole && (
                    <View style={{ marginBottom: 32 }}>
                        <Text style={styles.sectionTitle}>SO Dashboard</Text>
                        <View style={[styles.statsGrid, { marginTop: 12 }]}>
                            <View style={[styles.statCard, { flex: 1 }]}>
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                                    <Sun color="#f59e0b" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Day Checks</Text>
                                    <Text style={styles.statValue}>{soStats?.dayCheckCount || 0}</Text>
                                </View>
                            </View>
                            <View style={[styles.statCard, { flex: 1 }]}>
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}>
                                    <Moon color="#6366f1" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Night Checks</Text>
                                    <Text style={styles.statValue}>{soStats?.nightCheckCount || 0}</Text>
                                </View>
                            </View>
                        </View>
                        <View style={[styles.statsGrid, { marginTop: 12 }]}>
                            <View style={[styles.statCard, { flex: 1 }]}>
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                                    <GraduationCap color="#10b981" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Training</Text>
                                    <Text style={styles.statValue}>{soStats?.trainerCount || 0}</Text>
                                </View>
                            </View>
                            <View style={[styles.statCard, { flex: 1 }]}>
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                                    <ClipboardList color="#8b5cf6" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Total Work</Text>
                                    <Text style={styles.statValue}>{soStats?.todayEntries || 0}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {isClientRole && (
                    <View style={{ marginBottom: 32 }}>
                        <Text style={styles.sectionTitle}>Client Dashboard</Text>
                        <View style={styles.statsGrid}>
                            <TouchableOpacity
                                style={[styles.statCard, { flex: 1, borderColor: '#db2777' }]}
                                onPress={() => navigation.navigate('AttendanceApprovals')}
                            >
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(219, 39, 119, 0.1)' }]}>
                                    <Clock color="#db2777" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Staff</Text>
                                    <Text style={styles.statValue}>{clientStats?.stats?.pendingAttendance || 0}</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.statCard, { flex: 1 }]}
                                onPress={() => navigation.navigate('VisitorManagement', { status: 'pending' })}
                            >
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                                    <User color="#f59e0b" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Visitors</Text>
                                    <Text style={styles.statValue}>{clientStats?.stats?.pendingVisitors || 0}</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.statCard, { flex: 1 }]}
                                onPress={() => navigation.navigate('VisitorManagement', { status: 'pending' })}
                            >
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                                    <Building2 color="#3b82f6" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Vehicles</Text>
                                    <Text style={styles.statValue}>{clientStats?.stats?.pendingVehicles || 0}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.statsGrid, { marginTop: 12 }]}>
                            <TouchableOpacity
                                style={[styles.statCard, { flex: 1 }]}
                                onPress={() => navigation.navigate('VisitorManagement', { status: 'inside' })}
                            >
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                                    <User color="#3b82f6" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Inside Now</Text>
                                    <Text style={styles.statValue}>{clientStats?.stats?.insideNow || 0}</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.statCard, { flex: 1 }]}
                                onPress={() => navigation.navigate('VisitorManagement', { status: 'rejected' })}
                            >
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                                    <AlertTriangle color="#ef4444" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Rejected Today</Text>
                                    <Text style={styles.statValue}>{clientStats?.stats?.rejectedToday || 0}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.statsGrid, { marginTop: 12 }]}>
                            <TouchableOpacity
                                style={[styles.statCard, { flex: 0.5, marginRight: 6 }]}
                                onPress={() => navigation.navigate('VisitorManagement', { status: 'today' })}
                            >
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}>
                                    <Clock color="#6366f1" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Today's Entries</Text>
                                    <Text style={styles.statValue}>{clientStats?.stats?.todayEntries || 0}</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.statCard, { flex: 0.5 }]}
                                onPress={() => navigation.navigate('AttendanceApprovals')}
                            >
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(236, 72, 153, 0.1)' }]}>
                                    <CheckCircle color="#ec4899" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Att. Pending</Text>
                                    <Text style={styles.statValue}>{clientStats?.stats?.pendingAttendance || 0}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {selectedSiteId ? (
                    <View style={styles.activeSiteSection}>
                        <View style={styles.activeSiteHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.activeSiteLabel}>Monitoring Site</Text>
                                <Text style={styles.activeSiteName}>
                                    {sites?.find(s => s._id === selectedSiteId)?.name || 'Unknown Site'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.changeSiteBtn}
                                onPress={() => setSelectedSiteId(null)}
                            >
                                <Text style={styles.changeSiteText}>Change Site</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.statsGrid}>
                            <View style={styles.statCard}>
                                <View style={styles.statIconBox}>
                                    <User color="#3b82f6" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Current Guard</Text>
                                    <Text style={styles.statValue} numberOfLines={1}>{currentGuard}</Text>
                                </View>
                            </View>
                            <View style={styles.statCard}>
                                <View style={[styles.statIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                                    <Clock color="#10b981" size={20} />
                                </View>
                                <View>
                                    <Text style={styles.statLabel}>Last Patrol</Text>
                                    <Text style={styles.statValue}>{lastPatrol}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.fullWidthCard}>
                            <View style={styles.cardHeader}>
                                <ClipboardList color="#3b82f6" size={18} />
                                <Text style={styles.cardTitle}>Recent Activity</Text>
                            </View>
                            {Array.isArray(filteredPatrolLogs) && filteredPatrolLogs.length > 0 ? (
                                filteredPatrolLogs.slice(0, 3).map((log, i) => (
                                    <View key={log._id} style={styles.logRow}>
                                        <View style={[styles.logDot, { backgroundColor: log.distance > 100 ? '#ef4444' : '#22c55e' }]} />
                                        <View style={styles.logInfo}>
                                            <Text style={styles.logText}>{log.pointName}</Text>
                                            <Text style={styles.logSubtext}>{log.userName} • {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                        </View>
                                        <ChevronRight size={14} color="#334155" />
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.emptyText}>No recent patrols today.</Text>
                            )}
                        </View>

                        <View style={styles.fullWidthCard}>
                            <View style={styles.cardHeader}>
                                <MapPin color="#3b82f6" size={18} />
                                <Text style={styles.cardTitle}>Visiting Reports</Text>
                            </View>
                            {Array.isArray(filteredVisitLogs) && filteredVisitLogs.length > 0 ? (
                                filteredVisitLogs.slice(0, 3).map((log) => (
                                    <View key={log._id} style={styles.logRow}>
                                        <View style={[styles.logDot, { backgroundColor: '#3b82f6' }]} />
                                        <View style={styles.logInfo}>
                                            <Text style={styles.logText}>{log.userName}</Text>
                                            <Text style={styles.logSubtext}>{new Date(log.createdAt).toLocaleString()}</Text>
                                        </View>
                                        <ChevronRight size={14} color="#334155" />
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.emptyText}>No visiting reports for this site.</Text>
                            )}
                        </View>
                    </View>
                ) : (
                    <View style={styles.siteSelector}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={styles.sectionTitle}>Sites</Text>
                        </View>

                        <View style={styles.siteGrid}>
                            {sites?.map((site) => (
                                <TouchableOpacity
                                    key={site._id}
                                    style={styles.siteCard}
                                    onPress={() => setSelectedSiteId(site._id)}
                                >
                                    <View style={styles.siteIconBox}>
                                        <Building2 size={24} color="#3b82f6" />
                                    </View>
                                    <View style={styles.siteInfo}>
                                        <Text style={styles.siteNameText} numberOfLines={1}>{site.name}</Text>
                                        <Text style={styles.siteLocationText} numberOfLines={1}>
                                            {[site.locationName, site.city].filter(Boolean).join(' · ') || '—'}
                                        </Text>
                                    </View>
                                    <ChevronRight size={20} color="#334155" />
                                </TouchableOpacity>
                            ))}
                            {(!sites || sites.length === 0) && (
                                <View style={styles.emptyState}>
                                    <Building2 color="#1e293b" size={48} />
                                    <Text style={styles.emptyTitle}>No sites</Text>
                                    <Text style={styles.emptyText}>
                                        {connectedRegionId
                                            ? 'No sites match this region and city. Ask your admin if your assignment looks wrong.'
                                            : isAdmin
                                                ? 'Link a region to your account to focus this list, or add sites in the admin console.'
                                                : 'Your profile needs a region. Contact your administrator.'}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Quick Action Overlay (SO/Client Actions) */}
            {isQuickActionsOpen && (
                <View style={styles.menuOverlay}>
                    <SafeAreaView style={{ flex: 1 }}>
                        <View style={styles.menuHeader}>
                            <Text style={styles.menuTitle}>Quick Actions</Text>
                            <TouchableOpacity onPress={() => setIsQuickActionsOpen(false)} style={styles.closeBtn}>
                                <X color="white" size={24} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.menuContent}>
                            <View style={styles.toolsRow}>
                                {isSORole && (
                                    <>
                                        <TouchableOpacity style={[styles.menuItem, { flex: 1 }]} onPress={() => handleActionPress('VisitorEntry')}>
                                            <View style={[styles.menuIcon, { backgroundColor: '#3b82f6' }]}>
                                                <User color="white" size={20} />
                                            </View>
                                            <Text style={styles.menuText}>Visitor Entry</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.menuItem, { flex: 1 }]} onPress={() => handleActionPress('VehicleEntry')}>
                                            <View style={[styles.menuIcon, { backgroundColor: '#8b5cf6' }]}>
                                                <Building2 color="white" size={20} />
                                            </View>
                                            <Text style={styles.menuText}>Vehicle Entry</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.menuItem, { flex: 1 }]} onPress={() => handleActionPress('StaffAttendance')}>
                                            <View style={[styles.menuIcon, { backgroundColor: '#db2777' }]}>
                                                <User color="white" size={20} />
                                            </View>
                                            <Text style={styles.menuText}>Attendance</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                                {isClientRole && (
                                    <TouchableOpacity style={[styles.menuItem, { flex: 1 }]} onPress={() => handleActionPress('Pending')}>
                                        <View style={[styles.menuIcon, { backgroundColor: '#f59e0b' }]}>
                                            <Clock color="white" size={20} />
                                        </View>
                                        <Text style={styles.menuText}>Pending Approvals</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={styles.toolsRow}>
                                <TouchableOpacity style={[styles.menuItem, { flex: 1 }]} onPress={() => handleActionPress('Approved')}>
                                    <View style={[styles.menuIcon, { backgroundColor: '#10b981' }]}>
                                        <CheckCircle color="white" size={20} />
                                    </View>
                                    <Text style={styles.menuText}>Approved</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.menuItem, { flex: 1 }]} onPress={() => handleActionPress('Inside')}>
                                    <View style={[styles.menuIcon, { backgroundColor: '#14b8a6' }]}>
                                        <MapPin color="white" size={20} />
                                    </View>
                                    <Text style={styles.menuText}>Inside</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.toolsRow}>
                                <TouchableOpacity style={[styles.menuItem, { flex: 1 }]} onPress={() => handleActionPress('Exit')}>
                                    <View style={[styles.menuIcon, { backgroundColor: '#ef4444' }]}>
                                        <LogOut color="white" size={20} />
                                    </View>
                                    <Text style={styles.menuText}>Exit</Text>
                                </TouchableOpacity>
                                {isSORole && (
                                    <TouchableOpacity style={[styles.menuItem, { flex: 1 }]} onPress={() => handleActionPress('MyWork')}>
                                        <View style={[styles.menuIcon, { backgroundColor: '#6366f1' }]}>
                                            <ClipboardList color="white" size={20} />
                                        </View>
                                        <Text style={styles.menuText}>My Work</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </SafeAreaView>
                </View>
            )}

            {/* FAB */}
            {(isSORole || isClientRole) && !isQuickActionsOpen && (
                <TouchableOpacity 
                    style={[styles.fab, { bottom: 24 + insets.bottom }]} 
                    onPress={() => setIsQuickActionsOpen(true)}
                >
                    <Plus color="white" size={32} />
                </TouchableOpacity>
            )}

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 20,
        zIndex: 10,
    },
    title: { fontSize: 24, fontWeight: 'bold', color: 'white' },
    menuBtn: {
        padding: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    logoutBtn: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
        gap: 6,
    },
    logoutText: {
        color: '#ef4444',
        fontSize: 13,
        fontWeight: 'bold',
    },
    actionSection: {
        marginBottom: 32,
    },
    actionGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    actionCard: {
        flex: 1,
        backgroundColor: '#0f172a',
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        gap: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    actionIconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#3b82f6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionContent: {
        alignItems: 'center',
    },
    actionTitle: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    actionSub: {
        color: '#64748b',
        fontSize: 11,
        marginTop: 2,
        textAlign: 'center',
    },
    content: { padding: 24 },
    scopeSection: {
        marginBottom: 20,
        gap: 10,
    },
    scopeRegionLine: {
        color: '#e2e8f0',
        fontSize: 15,
        fontWeight: '700',
    },
    scopeCityLine: {
        color: '#64748b',
        fontSize: 13,
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
    cityChipsRow: {
        flexDirection: 'row',
        gap: 8,
        paddingVertical: 2,
    },
    cityChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(15,23,42,0.9)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cityChipActive: {
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.2)',
    },
    cityChipText: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
    },
    cityChipTextActive: {
        color: '#fff',
    },
    siteSelector: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 20
    },
    siteGrid: {
        gap: 12
    },
    siteCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
        gap: 16,
        width: '100%',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    siteIconBox: {
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    siteInfo: {
        flex: 1,
        gap: 4
    },
    siteNameText: {
        color: 'white',
        fontSize: 17,
        fontWeight: 'bold',
    },
    siteLocationText: {
        color: '#64748b',
        fontSize: 13,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    statCard: {
        backgroundColor: '#0f172a',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    statIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statLabel: {
        color: '#64748b',
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    statValue: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    activeSiteSection: {
        marginBottom: 32,
        gap: 16,
    },
    activeSiteHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    activeSiteLabel: {
        color: '#64748b',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    activeSiteName: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 4,
    },
    changeSiteBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    changeSiteText: {
        color: '#3b82f6',
        fontSize: 12,
        fontWeight: 'bold',
    },
    fullWidthCard: {
        backgroundColor: '#0f172a',
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    cardTitle: {
        color: 'white',
        fontSize: 15,
        fontWeight: 'bold',
    },
    logRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
        gap: 12,
    },
    logDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    logInfo: {
        flex: 1,
        gap: 2,
    },
    logText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    logSubtext: {
        color: '#64748b',
        fontSize: 12,
    },
    emptyText: {
        color: '#475569',
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 20,
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
        gap: 12,
    },
    emptyTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    attendanceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    viewAllText: {
        fontSize: 12,
        color: '#3b82f6',
        fontWeight: 'bold',
    },
    attendanceMiniCard: {
        width: 160,
        backgroundColor: '#0f172a',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        gap: 8,
    },
    attendanceUserRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    miniUserIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    attendanceName: {
        color: 'white',
        fontSize: 13,
        fontWeight: 'bold',
        flex: 1,
    },
    attendanceStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    attendanceTime: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '600',
    },
    attendanceLoc: {
        color: '#3b82f6',
        fontSize: 11,
        fontWeight: 'bold',
        marginTop: 2,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    filterChipText: {
        color: '#3b82f6',
        fontSize: 12,
        fontWeight: '600',
    },
    toolsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    toolCardHalf: {
        flex: 1,
        minWidth: 0,
        backgroundColor: '#1e1b4b',
        borderColor: '#312e81',
    },
    menuOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#020617',
        zIndex: 1000,
    },
    menuHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    menuTitle: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
    },
    closeBtn: {
        padding: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    menuContent: {
        padding: 24,
        gap: 16,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        gap: 16,
    },
    menuIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        flex: 1,
    },
    fab: {
        position: 'absolute',
        right: 20,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#3b82f6',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
});
