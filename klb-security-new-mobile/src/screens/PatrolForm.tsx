import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// import { useQuery, useMutation } from 'convex/react';
import { usePatrolStore } from '../store/usePatrolStore';
import * as Location from 'expo-location';
import { Shield, Camera, MapPin, MessageSquare, CheckCircle2, Trash2, AlertTriangle, Check, Images } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
// import { api } from '../services/convex';
import { logService } from '../services/api';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { uploadImage } from '../services/upload';
import { showError, showSuccess } from '../utils/toastUtils';

export default function PatrolForm() {
    const insets = useSafeAreaInsets();
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { qrCode } = route.params || {};
    const { userId, organizationId } = useCustomAuth();
    const activeSession = usePatrolStore((state) => state.activeSession);
    const patrolSubject = usePatrolStore((state) => state.patrolSubject);
    const [location, setLocation] = useState<any>(null);
    const [validation, setValidation] = useState<any>(undefined);
    const [locationError, setLocationError] = useState<string | null>(null);
    const validateSeqRef = useRef(0);
    const locationRef = useRef<any>(null);
    locationRef.current = location;

    /** Validate on a timer using latest GPS from ref — not on every location event (saves slow networks). */
    useEffect(() => {
        if (!activeSession?.siteId || !qrCode || !userId) {
            setValidation(undefined);
            return;
        }
        const mySeq = ++validateSeqRef.current;
        let cancelled = false;
        const run = () => {
            if (cancelled || mySeq !== validateSeqRef.current) return;
            const loc = locationRef.current;
            if (!loc) return;
            logService
                .validatePatrolPoint(
                    activeSession.siteId as string,
                    qrCode,
                    loc.coords.latitude,
                    loc.coords.longitude,
                    userId as string
                )
                .then((res) => {
                    if (!cancelled && mySeq === validateSeqRef.current) setValidation(res.data);
                })
                .catch((err) => {
                    console.error('Validation error:', err);
                    if (cancelled || mySeq !== validateSeqRef.current) return;
                    const detail =
                        err?.response?.data?.detail ||
                        err?.response?.data?.error ||
                        err?.message ||
                        'Could not verify this QR.';
                    setValidation({
                        valid: false,
                        distance: 0,
                        allowedRadius: 100,
                        isWithinRange: false,
                        error: typeof detail === 'string' ? detail : 'Verification failed',
                    });
                });
        };

        const t0 = setTimeout(run, 200);
        const t1 = setTimeout(run, 2000);
        const id = setInterval(run, 12000);
        return () => {
            cancelled = true;
            clearTimeout(t0);
            clearTimeout(t1);
            clearInterval(id);
        };
    }, [activeSession?.siteId, qrCode, userId]);

    const [comment, setComment] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [storageIdState, setStorageIdState] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [loading, setLoading] = useState(false);
    const [hasIssue, setHasIssue] = useState(false);
    const [issuePriority, setIssuePriority] = useState<'Low' | 'Medium' | 'High'>('Medium');

    const createLog = async (data: any) => {
        return logService.createPatrolLog(data);
    };
    const updateSessionPoints = async (data: { sessionId: string; pointId: string }) => {
        return logService.updateSessionPoints(data.sessionId, data.pointId);
    };

    useEffect(() => {
        let subscription: Location.LocationSubscription | null = null;
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setLocationError('Location permission denied');
                return;
            }
            try {
                const currentLoc = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                setLocation(currentLoc);
                subscription = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.Balanced,
                        timeInterval: 8000,
                        distanceInterval: 12,
                    },
                    (loc) => setLocation(loc)
                );
            } catch (err) {
                console.error("Location error:", err);
                setLocationError('Unable to get location');
            }
        })();

        // Recovery for Android activity death during camera capture
        const checkPendingResult = async () => {
            try {
                const result: any = await ImagePicker.getPendingResultAsync();
                if (result) {
                    const finalResult = Array.isArray(result) ? result[0] : result;
                    if (finalResult && !finalResult.canceled && finalResult.assets && finalResult.assets.length > 0) {
                        const uri = finalResult.assets[0].uri;
                        setImage(uri);
                        processImageUpload(uri);
                    }
                }
            } catch (err) {
                console.error("[PatrolForm] Error checking pending camera result:", err);
            }
        };
        checkPendingResult();
    }, []);

    const processImageUpload = async (uri: string) => {
        setUploadingImage(true);
        try {
            const sid = await uploadImage(uri);
            setStorageIdState(sid);
            console.log("[PatrolForm] Image uploaded immediately:", sid);
        } catch (err) {
            console.error("[PatrolForm] Immediate upload failed:", err);
            showError("Upload Failed", "Could not upload the photo proof. Please try again.");
            setImage(null);
        } finally {
            setUploadingImage(false);
        }
    };
    const pickImage = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            showError("Camera Permission", "Camera permission is required to take a photo.");
            return;
        }

        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.3,
            });

            if (!result.canceled) {
                const uri = result.assets[0].uri;
                setImage(uri);
                processImageUpload(uri);
            }
        } catch (err) {
            console.error("Camera error:", err);
            showError("Camera Error", "Failed to open camera or capture photo.");
        }
    };

    const pickFromGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            showError("Photos", "Photo library permission is required.");
            return;
        }
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: false,
                quality: 0.35,
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
                const uri = result.assets[0].uri;
                setImage(uri);
                processImageUpload(uri);
            }
        } catch (err) {
            console.error("Gallery error:", err);
            showError("Gallery", "Could not open photo library.");
        }
    };

    const canSubmit =
        validation?.isWithinRange &&
        !loading &&
        validation?.errorCode !== 'wrong_site' &&
        validation?.errorCode !== 'no_coordinates';

    const allowedM = validation?.allowedRadius ?? 100;

    const handleSubmit = async () => {
        if (!canSubmit) {
            showError(
                'Too far from checkpoint',
                `Move within ${Math.round(allowedM)}m of this QR patrol point to log the scan.`
            );
            return;
        }
        if (!comment && !image) {
            showError("Evidence Required", "Please provide a comment or a photo.");
            return;
        }

        setLoading(true);
        try {
            let storageId = storageIdState;
            if (image && !storageId) {
                try {
                    storageId = await uploadImage(image);
                } catch (uploadErr: any) {
                    console.error("Image upload failed:", uploadErr);
                    if (!comment) {
                        throw uploadErr;
                    }
                    Alert.alert("Image Upload Failed", "Continuing without photo.");
                }
            }

            await createLog({
                userId: userId as any,
                siteId: activeSession?.siteId as any,
                patrolPointId: validation?.pointId,
                comment,
                latitude: location?.coords.latitude || 0,
                longitude: location?.coords.longitude || 0,
                distance: validation?.distance || 0,
                organizationId: organizationId as any,
                imageId: storageId,
                sessionId: activeSession?.id,
                patrolSubjectEmpId: patrolSubject?.empId,
                patrolSubjectName: patrolSubject?.name,
                issueDetails: hasIssue ? {
                    title: "Manual Issue Report",
                    priority: issuePriority
                } : undefined
            });

            if (activeSession?.id && validation?.pointId) {
                await updateSessionPoints({
                    sessionId: activeSession.id as any,
                    pointId: validation.pointId
                });
            }

            if (validation?.pointId) {
                usePatrolStore.getState().recordPatrolScan(
                    String(validation.pointId),
                    String(validation.pointName || 'Checkpoint')
                );
            }

            showSuccess('Saved', validation?.pointName || 'Checkpoint logged');
            if (activeSession?.siteId) {
                navigation.navigate("QRScanner");
            } else {
                navigation.navigate("MainTabs");
            }
        } catch (error: any) {
            const status = error?.response?.status;
            const data = error?.response?.data;
            console.error("Create log error:", status, data || error);
            const msg =
                error?.response?.data?.error ||
                error?.response?.data?.detail ||
                error.message ||
                'Failed to log patrol point.';
            Alert.alert('Error', typeof msg === 'string' ? msg : 'Failed to log patrol point.');
        } finally {
            setLoading(false);
        }
    };

    if (validation === undefined) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Shield color="#3b82f6" size={32} />
                    <View>
                        <Text style={styles.headerTitle}>Log Patrol Point</Text>
                        <Text style={styles.progressSubtitle}>
                            {patrolSubject
                                ? `${patrolSubject.name} (${patrolSubject.empId}) · `
                                : ""}
                            Scanned {activeSession?.scannedPointIds?.length || 0} points
                        </Text>
                    </View>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        onPress={() => {
                            const loc = locationRef.current;
                            if (!loc || !activeSession?.siteId || !qrCode || !userId) return;
                            logService
                                .validatePatrolPoint(
                                    activeSession.siteId as string,
                                    qrCode,
                                    loc.coords.latitude,
                                    loc.coords.longitude,
                                    userId as string
                                )
                                .then((res) => setValidation(res.data))
                                .catch(() => {});
                        }}
                        style={styles.recheckBtn}
                    >
                        <Text style={styles.recheckBtnText}>Recheck</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {validation?.errorCode === 'wrong_site' ? (
                    <View style={styles.wrongSiteBox}>
                        <AlertTriangle color="#fb923c" size={22} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.wrongSiteTitle}>Wrong site</Text>
                            <Text style={styles.wrongSiteBody}>
                                This QR belongs to another site. Use a label from{' '}
                                <Text style={styles.wrongSiteEm}>{activeSession?.siteName || 'this site'}</Text>.
                            </Text>
                        </View>
                    </View>
                ) : null}

                {validation?.errorCode === 'no_coordinates' ? (
                    <View style={styles.wrongSiteBox}>
                        <AlertTriangle color="#f87171" size={22} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.wrongSiteTitle}>No GPS on checkpoint</Text>
                            <Text style={styles.wrongSiteBody}>
                                Ask an admin to set coordinates on this patrol point (web → Patrol Points).
                            </Text>
                        </View>
                    </View>
                ) : null}

                <View style={styles.statusCard}>
                    <View
                        style={[
                            styles.statusIndicator,
                            validation?.errorCode === 'wrong_site'
                                ? styles.statusInvalid
                                : validation?.valid
                                  ? validation?.isWithinRange
                                      ? styles.statusValid
                                      : styles.statusInvalid
                                  : styles.statusInvalid,
                        ]}
                    />
                    <View style={styles.statusInfo}>
                        <CheckCircle2
                            color={
                                validation?.errorCode === 'wrong_site'
                                    ? '#fb923c'
                                    : validation?.errorCode === 'no_coordinates'
                                      ? '#f87171'
                                      : validation?.valid
                                        ? '#22c55e'
                                        : '#64748b'
                            }
                            size={20}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.statusLabel}>Scanner status</Text>
                            <Text style={styles.statusValue}>
                                {validation?.errorCode === 'wrong_site'
                                    ? 'Wrong site'
                                    : validation?.errorCode === 'no_coordinates'
                                      ? 'No GPS'
                                      : validation?.valid
                                        ? validation.pointName || 'Patrol point'
                                        : 'Not a checkpoint for this site'}
                            </Text>
                        </View>
                    </View>
                    {validation?.errorCode === 'wrong_site' || validation?.errorCode === 'no_coordinates' ? null : (
                        <View
                            style={[
                                styles.rangeChip,
                                validation?.isWithinRange ? styles.rangeChipOk : styles.rangeChipBad,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.rangeChipText,
                                    validation?.isWithinRange ? styles.rangeChipTextOk : styles.rangeChipTextBad,
                                ]}
                            >
                                {validation?.isWithinRange ? 'Within range' : 'Outside range'}
                            </Text>
                        </View>
                    )}
                </View>

                {validation?.valid &&
                validation?.errorCode !== 'wrong_site' &&
                validation?.errorCode !== 'no_coordinates' ? (
                    <View style={styles.distanceCard}>
                        <MapPin color="#94a3b8" size={18} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.distanceCardTitle}>Distance</Text>
                            <Text style={styles.distanceCardValue}>
                                ~{validation.distance?.toFixed(0) ?? '—'} m · limit {Math.round(allowedM)} m
                            </Text>
                            <Text style={styles.distanceCardSub}>
                                {validation.isWithinRange ? 'In range — add note/photo and submit.' : 'Move closer, then Recheck.'}
                            </Text>
                        </View>
                    </View>
                ) : null}

                {validation?.valid &&
                validation?.errorCode !== 'wrong_site' &&
                validation?.errorCode !== 'no_coordinates' &&
                !validation?.isWithinRange && (
                    <View style={styles.dangerBox}>
                        <AlertTriangle color="#f87171" size={20} />
                        <Text style={styles.dangerText}>
                            Move within {Math.round(allowedM)} m, tap Recheck, then submit.
                        </Text>
                    </View>
                )}

                <Text style={styles.sectionLabel}>Evidence Photo</Text>
                <View style={styles.imageSection}>
                    {image ? (
                        <TouchableOpacity 
                            onPress={pickImage} 
                            style={styles.imagePreviewContainer}
                            disabled={uploadingImage}
                        >
                            {uploadingImage ? (
                                <ActivityIndicator color="#3b82f6" />
                            ) : image ? (
                                <View style={{ position: 'relative' }}>
                                    <Image source={{ uri: image }} style={styles.imagePreview} />
                                    {storageIdState && (
                                        <View style={styles.checkBadge}>
                                            <Check color="white" size={14} />
                                        </View>
                                    )}
                                </View>
                            ) : (
                                <Camera color="#64748b" size={24} />
                            )}
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.captureRow}>
                            <TouchableOpacity style={[styles.captureBtn, styles.captureBtnHalf]} onPress={pickImage}>
                                <Camera color="#3b82f6" size={32} />
                                <Text style={styles.captureBtnText}>Camera</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.captureBtn, styles.captureBtnHalf]} onPress={pickFromGallery}>
                                <Images color="#3b82f6" size={32} />
                                <Text style={styles.captureBtnText}>Gallery</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <View style={styles.issueSection}>
                    <View style={styles.issueHeader}>
                        <Text style={styles.sectionLabel}>Report an Issue?</Text>
                        <TouchableOpacity
                            style={[styles.toggleBtn, hasIssue && styles.toggleBtnActive]}
                            onPress={() => setHasIssue(!hasIssue)}
                        >
                            <View style={[styles.toggleCircle, hasIssue && styles.toggleCircleActive]} />
                        </TouchableOpacity>
                    </View>

                    {hasIssue && (
                        <View style={styles.priorityGrid}>
                            {(['Low', 'Medium', 'High'] as const).map((p) => (
                                <TouchableOpacity
                                    key={p}
                                    style={[styles.priorityBtn, issuePriority === p && styles.priorityBtnActive]}
                                    onPress={() => setIssuePriority(p)}
                                >
                                    <Text style={[styles.priorityText, issuePriority === p && styles.priorityTextActive]}>
                                        {p}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                <Text style={styles.sectionLabel}>Patrol Comments</Text>
                <View style={styles.commentContainer}>
                    <MessageSquare color="#64748b" size={20} style={styles.commentIcon} />
                    <TextInput
                        style={styles.textInput}
                        placeholder="Add your observation at this point..."
                        placeholderTextColor="#475569"
                        multiline
                        numberOfLines={4}
                        value={comment}
                        onChangeText={setComment}
                    />
                </View>

                <View style={styles.locationSummary}>
                    <View style={styles.locationSummaryInner}>
                        <MapPin color="#64748b" size={20} />
                        <Text style={styles.locationSummaryText}>
                            {locationError ? `GPS Error: ${locationError}` : "GPS Coordinates Captured"}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[
                        styles.submitBtn,
                        (loading ||
                            (!comment && !image) ||
                            !validation?.isWithinRange ||
                            validation?.errorCode === 'wrong_site' ||
                            validation?.errorCode === 'no_coordinates') &&
                            styles.submitBtnDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={
                        loading ||
                        (!comment && !image) ||
                        !validation?.isWithinRange ||
                        validation?.errorCode === 'wrong_site' ||
                        validation?.errorCode === 'no_coordinates'
                    }
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <Shield color="white" size={24} />
                            <Text style={styles.submitBtnText}>CONFIRM & LOG POINT</Text>
                        </>
                    )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.skipBtnText}>Discard Scan</Text>
                </TouchableOpacity>
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
    loadingContainer: {
        flex: 1,
        backgroundColor: '#020617',
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 24,
        gap: 16,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        flex: 1,
    },
    closeBtn: {
        padding: 8,
    },
    closeBtnText: {
        color: '#64748b',
        fontSize: 14,
        fontWeight: '600',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    recheckBtn: {
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    recheckBtnText: {
        color: '#60a5fa',
        fontSize: 14,
        fontWeight: '700',
    },
    scrollContent: {
        padding: 24,
        paddingTop: 0,
    },
    statusCard: {
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        marginBottom: 32,
        overflow: 'hidden',
    },
    statusIndicator: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 6,
    },
    statusValid: {
        backgroundColor: '#22c55e',
    },
    statusInvalid: {
        backgroundColor: '#ef4444',
    },
    statusInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    statusLabel: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    statusValue: {
        fontSize: 16,
        color: 'white',
        fontWeight: '600',
        marginTop: 2,
    },
    rangeChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    rangeChipOk: {
        backgroundColor: 'rgba(34, 197, 94, 0.14)',
        borderColor: 'rgba(34, 197, 94, 0.35)',
    },
    rangeChipBad: {
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        borderColor: 'rgba(239, 68, 68, 0.35)',
    },
    rangeChipText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.6,
    },
    rangeChipTextOk: { color: '#86efac' },
    rangeChipTextBad: { color: '#fca5a5' },
    distanceCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: '#0f172a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    distanceCardTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    distanceCardValue: {
        fontSize: 16,
        fontWeight: '800',
        color: '#e2e8f0',
        marginTop: 4,
    },
    distanceCardSub: {
        fontSize: 13,
        color: '#94a3b8',
        marginTop: 6,
        lineHeight: 20,
    },
    dangerBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        padding: 14,
        borderRadius: 14,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
    },
    dangerText: {
        color: '#fecaca',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
        lineHeight: 20,
    },
    wrongSiteBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: 'rgba(251, 146, 60, 0.12)',
        padding: 16,
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(251, 146, 60, 0.35)',
    },
    wrongSiteTitle: {
        color: '#fdba74',
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 8,
    },
    wrongSiteBody: {
        color: '#fed7aa',
        fontSize: 14,
        lineHeight: 22,
        fontWeight: '500',
    },
    wrongSiteEm: {
        fontWeight: '800',
        color: '#fff',
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#94a3b8',
        marginBottom: 16,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    imageSection: {
        marginBottom: 32,
    },
    captureRow: {
        flexDirection: 'row',
        gap: 12,
    },
    captureBtn: {
        minHeight: 160,
        backgroundColor: '#0f172a',
        borderRadius: 24,
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 20,
    },
    captureBtnHalf: {
        flex: 1,
    },
    captureBtnText: {
        color: '#64748b',
        fontSize: 16,
        fontWeight: '600',
    },
    imagePreviewContainer: {
        height: 80, // Smaller WhatsApp style preview
        borderRadius: 24,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#0f172a', // Added background for when image is null but still a touchable area
        justifyContent: 'center',
        alignItems: 'center',
    },
    imagePreview: {
        width: '100%',
        height: '100%',
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#0f172a',
        zIndex: 10,
    },
    removeImageBtn: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    commentContainer: {
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: '#1e293b',
        minHeight: 120,
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
    },
    commentIcon: {
        marginTop: 4,
    },
    textInput: {
        flex: 1,
        color: 'white',
        fontSize: 16,
        textAlignVertical: 'top',
        paddingTop: 0,
    },
    locationSummary: {
        backgroundColor: '#0f172a',
        padding: 16,
        borderRadius: 20,
        marginBottom: 40,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    locationSummaryInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    locationSummaryText: {
        color: '#64748b',
        fontSize: 14,
        fontWeight: '500',
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563eb',
        height: 64,
        borderRadius: 24,
        gap: 12,
        marginBottom: 16,
    },
    submitBtnDisabled: {
        backgroundColor: '#1e293b',
        opacity: 0.5,
    },
    submitBtnText: {
        color: 'white',
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 1,
    },
    skipBtn: {
        padding: 16,
        alignItems: 'center',
    },
    skipBtnText: {
        color: '#475569',
        fontSize: 16,
        fontWeight: '600',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    progressSubtitle: {
        color: '#64748b',
        fontSize: 12,
        fontWeight: '600',
    },
    issueSection: {
        marginBottom: 32,
    },
    issueHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    toggleBtn: {
        width: 50,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#1e293b',
        padding: 4,
    },
    toggleBtnActive: {
        backgroundColor: '#2563eb',
    },
    toggleCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'white',
    },
    toggleCircleActive: {
        alignSelf: 'flex-end',
    },
    priorityGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    priorityBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#0f172a',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#1e293b',
    },
    priorityBtnActive: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    priorityText: {
        color: '#64748b',
        fontWeight: 'bold',
    },
    priorityTextActive: {
        color: 'white',
    },
});
