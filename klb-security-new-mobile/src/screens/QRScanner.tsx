import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Zap, ZapOff, Info } from 'lucide-react-native';
// import { useQuery } from 'convex/react';
// import { api } from '../services/convex';
import { siteService, logService } from '../services/api';
import { usePatrolStore } from '../store/usePatrolStore';
import { useCustomAuth } from '../context/AuthContext';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

function formatPatrolElapsed(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) {
        return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function QRScanner() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [cameraKey, setCameraKey] = useState(0);
    const scanLockRef = useRef(false);
    const [torch, setTorch] = useState(false);
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { customUser } = useCustomAuth();
    const activeSession = usePatrolStore((state) => state.activeSession);
    const lastScannedPointName = usePatrolStore((state) => state.lastScannedPointName);
    const setSession = usePatrolStore((state) => state.setSession);
    const setPatrolSubject = usePatrolStore((state) => state.setPatrolSubject);

    const { isVisit, siteId, siteName, mode, pointId, pointName, pendingPointName } = route.params || {};

    const [targetSite, setTargetSite] = useState<any>(null);
    const [nowTick, setNowTick] = useState(Date.now());

    const scanCount = activeSession?.scannedPointIds?.length ?? 0;

    useEffect(() => {
        if (!activeSession?.startTime || mode === 'setup' || isVisit) return;
        const id = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, [activeSession?.startTime, mode, isVisit]);

    useEffect(() => {
        if (mode === 'setup' && siteId) {
            siteService
                .getSiteById(siteId)
                .then((res: any) => setTargetSite(res.data))
                .catch((err: any) => {
                    console.error('Error fetching site:', err);
                    setTargetSite(null);
                });
        }
    }, [mode, siteId]);

    useFocusEffect(
        useCallback(() => {
            scanLockRef.current = false;
            setScanned(false);
            return undefined;
        }, [])
    );

    const unlockScanner = useCallback(() => {
        scanLockRef.current = false;
        setScanned(false);
        setCameraKey((k) => k + 1);
    }, []);

    const endPatrolSession = async () => {
        const s = usePatrolStore.getState().activeSession;
        let discarded = false;
        if (s?.id) {
            try {
                const res = await logService.endSession(s.id);
                discarded = res?.data?.discarded === true;
            } catch (e) {
                console.warn('[QRScanner] end session', e);
            }
        }
        setSession(null);
        setPatrolSubject(null);
        if (discarded) {
            Alert.alert(
                'Patrol not saved',
                'No checkpoints were scanned in this round, so nothing was saved.'
            );
        }
        navigation.navigate('MainTabs', { screen: 'Patrol' } as never);
    };

    if (!permission) return <View style={styles.container} />;

    if (!permission.granted) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.text}>We need your permission to show the camera</Text>
                <TouchableOpacity style={styles.button} onPress={requestPermission}>
                    <Text style={styles.buttonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handleBarCodeScanned = async (payload: { data: string }) => {
        const data = payload?.data;
        if (data == null || data === '') return;
        if (scanned || scanLockRef.current) return;
        scanLockRef.current = true;
        setScanned(true);

        if (mode === 'setup') {
            if (!siteId) {
                Alert.alert('Error', 'Missing site. Go back and select a site again.');
                unlockScanner();
                return;
            }

            try {
                let latStr = '';
                let lngStr = '';
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert(
                        'Location required',
                        'Location is needed to save this checkpoint’s GPS (your phone’s position). We do not use the site centre for this step.'
                    );
                    unlockScanner();
                    return;
                }
                const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                latStr = location.coords.latitude.toString();
                lngStr = location.coords.longitude.toString();

                navigation.navigate('CreatePoint', {
                    mode: 'setup',
                    siteId,
                    siteName: targetSite?.name || siteName || 'Site',
                    pointId,
                    pointName: pointName || pendingPointName,
                    qrCode: data,
                    lat: latStr,
                    lng: lngStr,
                });
            } catch (error) {
                console.error(error);
                Alert.alert("Location Error", "Could not verify your location.");
                unlockScanner();
            }
        } else if (isVisit) {
            navigation.navigate('VisitForm', {
                qrCode: data,
                siteId: siteId,
                siteName: siteName,
                organizationId: customUser?.organizationId
            });
        } else {
            navigation.navigate('PatrolForm', { qrCode: data });
        }
    };

    return (
        <View style={styles.container}>
            <CameraView
                key={cameraKey}
                style={StyleSheet.absoluteFillObject}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                enableTorch={torch}
            />

            {/* Overlay */}
            <View style={styles.overlay}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                        <ArrowLeft color="white" size={22} />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>{mode === 'setup' ? 'Setup Point' : 'Scan Patrol Point'}</Text>
                        <Text style={styles.headerSubtitle}>
                            {activeSession?.siteName || targetSite?.name || siteName || "Active Site"}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => setTorch(!torch)} style={styles.iconBtn}>
                        {torch ? <Zap color="#f59e0b" size={22} fill="#f59e0b" /> : <ZapOff color="white" size={22} />}
                    </TouchableOpacity>
                </View>

                {!isVisit && !mode && activeSession ? (
                    <View style={styles.patrolHud}>
                        <View style={styles.hudRow}>
                            <Text style={styles.hudTimer}>
                                {formatPatrolElapsed(nowTick - activeSession.startTime)}
                            </Text>
                            <View style={styles.hudPill}>
                                <Text style={styles.hudPillText}>{scanCount} scanned</Text>
                            </View>
                        </View>
                        <Text style={styles.hudLast} numberOfLines={2}>
                            {lastScannedPointName
                                ? `Last: ${lastScannedPointName}`
                                : 'Scan a checkpoint QR to begin logging'}
                        </Text>
                    </View>
                ) : null}

                <View style={styles.scannerOuter}>
                    <View style={styles.scannerInner}>
                        <View style={styles.cornerTopLeft} />
                        <View style={styles.cornerTopRight} />
                        <View style={styles.cornerBottomLeft} />
                        <View style={styles.cornerBottomRight} />
                        <View style={styles.scanLine} />
                    </View>
                    <View style={styles.scanBadge}>
                        <Text style={styles.scanBadgeText}>
                            {scanned ? 'Open Scan again if stuck' : 'Ready to scan'}
                        </Text>
                    </View>
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity style={styles.scanAgainBtn} onPress={unlockScanner} activeOpacity={0.88}>
                        <Text style={styles.scanAgainText}>Scan again</Text>
                    </TouchableOpacity>
                    <View style={styles.infoBox}>
                        <Info color="#3b82f6" size={18} />
                        <Text style={styles.infoText}>
                            {mode === 'setup'
                                ? 'Scan the label, then save on the next screen. Default radius 200m.'
                                : 'Aim at the QR. Distance and site are checked on the next screen.'}
                        </Text>
                    </View>
                    {mode !== 'setup' && !isVisit && activeSession ? (
                        <TouchableOpacity style={styles.endPatrolBtn} onPress={endPatrolSession} activeOpacity={0.9}>
                            <Text style={styles.endPatrolText}>Stop patrol</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.sessionPill}>
                            <Text style={styles.sessionInfo}>
                                {isVisit ? 'Visit mode' : mode === 'setup' ? 'Setup mode' : 'Patrol'}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        backgroundColor: '#020617',
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'space-between',
        paddingBottom: 60,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 24,
    },
    headerCenter: {
        alignItems: 'center',
        gap: 2,
    },
    headerTitle: {
        color: 'white',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    headerSubtitle: {
        color: '#cbd5f5',
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    patrolHud: {
        marginHorizontal: 20,
        marginBottom: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(2, 6, 23, 0.82)',
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.35)',
    },
    hudRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    hudTimer: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '800',
    },
    hudPill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: 'rgba(16,185,129,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.4)',
    },
    hudPillText: {
        color: '#6ee7b7',
        fontSize: 12,
        fontWeight: '800',
    },
    hudLast: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 8,
        lineHeight: 18,
    },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(2, 6, 23, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scannerOuter: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    scannerInner: {
        width: width * 0.7,
        height: width * 0.7,
        borderWidth: 0,
        position: 'relative',
    },
    scanLine: {
        position: 'absolute',
        top: '50%',
        left: 8,
        right: 8,
        height: 2,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderRadius: 2,
    },
    cornerTopLeft: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 40,
        height: 40,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderColor: '#2563eb',
    },
    cornerTopRight: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 40,
        height: 40,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderColor: '#2563eb',
    },
    cornerBottomLeft: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: 40,
        height: 40,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderColor: '#2563eb',
    },
    cornerBottomRight: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 40,
        height: 40,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderColor: '#2563eb',
    },
    footer: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    scanAgainBtn: {
        marginBottom: 12,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 14,
        backgroundColor: 'rgba(37, 99, 235, 0.35)',
        borderWidth: 1,
        borderColor: 'rgba(96, 165, 250, 0.5)',
        width: '100%',
        maxWidth: 280,
    },
    scanAgainText: {
        color: '#e0e7ff',
        fontSize: 15,
        fontWeight: '800',
        textAlign: 'center',
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(2, 6, 23, 0.7)',
        padding: 16,
        borderRadius: 16,
        gap: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    infoText: {
        color: 'white',
        fontSize: 14,
        flex: 1,
    },
    sessionPill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    sessionInfo: {
        color: '#34d399',
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    endPatrolBtn: {
        marginBottom: 12,
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 16,
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.45)',
    },
    endPatrolText: {
        color: '#f87171',
        fontSize: 14,
        fontWeight: '800',
        textAlign: 'center',
    },
    text: {
        color: 'white',
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 24,
    },
    button: {
        backgroundColor: '#2563eb',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    scanBadge: {
        marginTop: 16,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: 'rgba(2, 6, 23, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    scanBadgeText: {
        color: '#cbd5f5',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
