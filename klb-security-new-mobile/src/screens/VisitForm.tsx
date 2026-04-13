import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Alert,
    Image,
    StyleSheet,
    FlatList,
    Modal,
    Pressable,
} from 'react-native';
import {
    MapPin,
    CheckCircle,
    ChevronLeft,
    Camera,
    Check,
    ShieldAlert,
    Images,
    Sun,
    Moon,
    GraduationCap,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { CommonActions } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { logService } from '../services/api';
import { uploadImage } from '../services/upload';
import { prepareVisitPhotoForUpload } from '../utils/imageResize';
import { usePatrolStore } from '../store/usePatrolStore';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { showError, showSuccess } from '../utils/toastUtils';

type PhotoItem = { localUri: string; storageId?: string; uploading?: boolean };

function calculateDistanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export default function VisitForm({ route, navigation }: any) {
    const insets = useSafeAreaInsets();
    const { customUser } = useCustomAuth();
    const currentUser = customUser;

    const {
        siteId,
        siteName,
        qrCode,
        organizationId,
        isManual,
        type,
        siteLat,
        siteLng,
        allowedRadius,
    } = route.params || {};

    const [remark, setRemark] = useState('');
    const [visitorName, setVisitorName] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [numberOfPeople, setNumberOfPeople] = useState('1');
    const [targetUserId, setTargetUserId] = useState<string | null>(null);
    const [clients, setClients] = useState<any[]>([]);
    const [showClientPicker, setShowClientPicker] = useState(false);
    
    const [photos, setPhotos] = useState<PhotoItem[]>([]);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [loading, setLoading] = useState(false);
    const [reportIssue, setReportIssue] = useState(false);
    const [issueTitle, setIssueTitle] = useState('');
    const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
    const [previewUri, setPreviewUri] = useState<string | null>(null);

    useEffect(() => {
        if (organizationId || customUser?.organizationId) {
            import('../services/api').then(({ userService }) => {
                userService.getClients(organizationId || customUser?.organizationId, siteId)
                    .then(res => setClients(res.data.data || []))
                    .catch(e => console.error("Error fetching clients", e));
            });
        }
    }, [organizationId, customUser?.organizationId]);
    /** Record check-in at device GPS or at the site’s registered coordinates. */
    const [checkInLocation, setCheckInLocation] = useState<'device' | 'site'>('device');

    const radiusM = typeof allowedRadius === 'number' && Number.isFinite(allowedRadius) ? allowedRadius : 100;

    useEffect(() => {
        let sub: Location.LocationSubscription | null = null;
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission denied', 'Location is required for visit check-in/out.');
                return;
            }
            const first = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });
            setLocation(first);
            sub = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 4000,
                    distanceInterval: 5,
                },
                (loc) => setLocation(loc)
            );
        })();
        return () => {
            sub?.remove();
        };
    }, []);

    useEffect(() => {
        if (checkInLocation === 'site' && (siteLat == null || siteLng == null)) {
            setCheckInLocation('device');
        }
    }, [checkInLocation, siteLat, siteLng]);

    useEffect(() => {
        const checkPending = async () => {
            try {
                const result: any = await ImagePicker.getPendingResultAsync();
                if (result) {
                    const finalResult = Array.isArray(result) ? result[0] : result;
                    if (finalResult?.assets?.[0]?.uri) {
                        addPhotoFromUri(finalResult.assets[0].uri);
                    }
                }
            } catch {
                /* ignore */
            }
        };
        checkPending();
    }, []);

    const currentDistance =
        location && siteLat != null && siteLng != null
            ? calculateDistanceM(
                  location.coords.latitude,
                  location.coords.longitude,
                  siteLat,
                  siteLng
              )
            : null;

    const isAtSite =
        checkInLocation === 'site' ||
        siteLat == null ||
        siteLng == null ||
        (currentDistance != null && currentDistance <= radiusM);

    const canSubmitCheckIn =
        checkInLocation === 'site' ||
        siteLat == null ||
        siteLng == null ||
        (currentDistance != null && currentDistance <= radiusM);

    const accuracyM =
        location?.coords.accuracy != null && Number.isFinite(location.coords.accuracy)
            ? location.coords.accuracy
            : undefined;

    const uploadOne = useCallback(async (uri: string, index: number) => {
        setPhotos((prev) =>
            prev.map((p, i) => (i === index ? { ...p, uploading: true } : p))
        );
        try {
            const optimizedUri = await prepareVisitPhotoForUpload(uri);
            const sid = await uploadImage(optimizedUri);
            setPhotos((prev) =>
                prev.map((p, i) => (i === index ? { ...p, storageId: sid, uploading: false } : p))
            );
        } catch {
            showError('Upload', 'Could not upload a photo.');
            setPhotos((prev) => prev.filter((_, i) => i !== index));
        }
    }, []);

    const addPhotoFromUri = (uri: string) => {
        setPhotos((prev) => {
            const idx = prev.length;
            const next = [...prev, { localUri: uri, uploading: true }];
            setTimeout(() => uploadOne(uri, idx), 50);
            return next;
        });
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Camera', 'Camera permission is required.');
            return;
        }
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.35,
            });
            if (!result.canceled && result.assets[0]?.uri) {
                addPhotoFromUri(result.assets[0].uri);
            }
        } catch {
            showError('Camera', 'Could not open camera.');
        }
    };

    const pickGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Photos', 'Photo library permission is required.');
            return;
        }
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.35,
                allowsMultipleSelection: true,
                selectionLimit: 8,
            });
            if (!result.canceled) {
                for (const a of result.assets) {
                    if (a.uri) addPhotoFromUri(a.uri);
                }
            }
        } catch {
            showError('Gallery', 'Could not open library.');
        }
    };

    const removePhoto = (index: number) => {
        setPhotos((prev) => prev.filter((_, i) => i !== index));
    };

    const handleCheckIn = async () => {
        if (checkInLocation === 'device' && !location) {
            showError('GPS', 'Waiting for location…');
            return;
        }
        if (checkInLocation === 'site' && (siteLat == null || siteLng == null)) {
            showError('Site', 'This site has no map coordinates.');
            return;
        }
        if (!remark.trim() && photos.length === 0) {
            showError('Required', 'Add a note or at least one photo.');
            return;
        }
        const isOperational = ['SiteCheckDay', 'SiteCheckNight', 'Trainer'].includes(type || '');
        if (type !== 'Vehicle' && !isOperational && !targetUserId) {
            showError('Required', 'Please select an approving client.');
            return;
        }
        if (!canSubmitCheckIn) {
            showError('Location', `Move within ${Math.round(radiusM)} m of the site, or choose “Site coordinates”.`);
            return;
        }
        if (photos.some((p) => p.uploading || (p.localUri && !p.storageId))) {
            showError('Photos', 'Wait for uploads to finish.');
            return;
        }
        if (!currentUser?._id || !siteId) {
            showError('Auth', 'Missing user or site.');
            return;
        }

        setLoading(true);
        try {
            const imageIds = photos.map((p) => p.storageId).filter(Boolean) as string[];
            const useSite = checkInLocation === 'site' && siteLat != null && siteLng != null;
            const lat = useSite ? siteLat : location!.coords.latitude;
            const lon = useSite ? siteLng : location!.coords.longitude;
            const res = await logService.createVisitLog({
                userId: currentUser._id,
                siteId,
                qrData: isManual ? 'VISIT' : qrCode || 'VISIT',
                remark: remark.trim() || 'Visit check-in',
                visitorName: visitorName.trim() || undefined,
                vehicleNumber: vehicleNumber.trim() || undefined,
                numberOfPeople: parseInt(numberOfPeople) || 1,
                targetUserId: targetUserId || undefined,
                latitude: lat,
                longitude: lon,
                organizationId: organizationId || currentUser.organizationId,
                visitType: type || (isManual ? 'Manual' : 'General'),
                imageIds: imageIds.length ? imageIds : undefined,
                imageId: imageIds[0],
                issueDetails: reportIssue
                    ? { title: issueTitle || 'Visit issue', priority }
                    : undefined,
            });
            const id = (res.data as any)?.visitLogId;
            if (!id) throw new Error('No visit id returned');
            if (!isManual && qrCode) {
                usePatrolStore.getState().addScannedPoint(qrCode);
            }
            showSuccess('Checked in', 'Check out from Visit history when you leave the site.');
            navigation.dispatch(
                CommonActions.reset({
                    index: 1,
                    routes: [
                        { name: 'MainTabs', params: { screen: 'Visiting' } },
                        {
                            name: 'VisitOfficerDetail',
                            params: {
                                officerId: String(currentUser._id),
                                officerName: currentUser.name || 'Me',
                            },
                        },
                    ],
                })
            );
        } catch (e: any) {
            console.error(e);
            showError('Check-in', e?.response?.data?.error || e?.message || 'Failed');
        } finally {
            setLoading(false);
        }
    };

    const visitTitle =
        type === 'Trainer'
            ? 'Trainer visit'
            : type === 'SiteCheckDay'
              ? 'Day visit'
              : type === 'SiteCheckNight'
                ? 'Night visit'
                : isManual
                  ? 'Visit'
                  : 'Visit';

    const TypeIcon =
        type === 'Trainer'
            ? GraduationCap
            : type === 'SiteCheckNight'
              ? Moon
              : type === 'SiteCheckDay'
                ? Sun
                : MapPin;

    const typeIconColor =
        type === 'Trainer' ? '#60a5fa' : type === 'SiteCheckNight' ? '#e2e8f0' : type === 'SiteCheckDay' ? '#fbbf24' : '#94a3b8';

    const isOfficerVisit = ['SiteCheckDay', 'SiteCheckNight', 'Trainer'].includes(type || '');

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft color="white" size={24} />
                </TouchableOpacity>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={styles.typeIconWrap}>
                        <TypeIcon color={typeIconColor} size={22} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerLabel}>{visitTitle}</Text>
                        <Text style={styles.headerTitle}>{siteName || 'Site'}</Text>
                    </View>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Check-in position</Text>
                    <Text style={styles.locHint}>Choose what we store for this check-in. Live GPS is always shown for reference.</Text>
                    <TouchableOpacity
                        style={[styles.locChoice, checkInLocation === 'device' && styles.locChoiceOn]}
                        onPress={() => setCheckInLocation('device')}
                        activeOpacity={0.85}
                    >
                        <View style={[styles.locRadio, checkInLocation === 'device' && styles.locRadioOn]} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.locChoiceTitle}>My current GPS</Text>
                            <Text style={styles.locChoiceSub}>Must be within {Math.round(radiusM)} m of the site (unless you switch below).</Text>
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.locChoice,
                            checkInLocation === 'site' && styles.locChoiceOn,
                            (siteLat == null || siteLng == null) && { opacity: 0.45 },
                        ]}
                        onPress={() => siteLat != null && siteLng != null && setCheckInLocation('site')}
                        activeOpacity={0.85}
                        disabled={siteLat == null || siteLng == null}
                    >
                        <View style={[styles.locRadio, checkInLocation === 'site' && styles.locRadioOn]} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.locChoiceTitle}>Site coordinates</Text>
                            <Text style={styles.locChoiceSub}>Record check-in at the site’s registered pin (distance saved as 0 m).</Text>
                        </View>
                    </TouchableOpacity>

                    <View style={[styles.locRow, { marginTop: 14 }]}>
                        <MapPin color={isAtSite ? '#22c55e' : '#f97316'} size={20} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.locMain}>
                                {location
                                    ? `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`
                                    : 'Acquiring GPS…'}
                            </Text>
                            {accuracyM != null ? (
                                <Text style={styles.locSub}>GPS accuracy ±{Math.round(accuracyM)} m</Text>
                            ) : null}
                            {currentDistance != null && siteLat != null ? (
                                <Text
                                    style={[
                                        styles.locDist,
                                        { color: isAtSite ? '#86efac' : '#fdba74' },
                                    ]}
                                >
                                    {isAtSite ? 'Within radius · ' : 'Outside radius · '}
                                    ~{Math.round(currentDistance)} m from site center (allow {Math.round(radiusM)} m)
                                </Text>
                            ) : null}
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Photos</Text>
                    <View style={styles.photoActions}>
                        <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
                            <Camera color="#3b82f6" size={22} />
                            <Text style={styles.photoBtnTxt}>Camera</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.photoBtn} onPress={pickGallery}>
                            <Images color="#3b82f6" size={22} />
                            <Text style={styles.photoBtnTxt}>Gallery</Text>
                        </TouchableOpacity>
                    </View>
                    <FlatList
                        horizontal
                        data={photos}
                        keyExtractor={(_, i) => `${i}`}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
                        renderItem={({ item, index }) => (
                            <TouchableOpacity
                                onPress={() => !item.uploading && setPreviewUri(item.localUri)}
                                activeOpacity={0.9}
                            >
                                <View style={styles.thumbWrap}>
                                    <Image source={{ uri: item.localUri }} style={styles.thumb} />
                                    {item.uploading ? (
                                        <View style={styles.thumbOverlay}>
                                            <Text style={styles.thumbLoadingTxt}>…</Text>
                                        </View>
                                    ) : item.storageId ? (
                                        <View style={styles.checkCorner}>
                                            <Check color="#fff" size={12} />
                                        </View>
                                    ) : null}
                                    <TouchableOpacity
                                        style={styles.removeX}
                                        onPress={() => removePhoto(index)}
                                        hitSlop={8}
                                    >
                                        <Text style={styles.removeXTxt}>×</Text>
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>

                {!isOfficerVisit && (
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Visitor / Vehicle Details</Text>
                        
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Visitor Name</Text>
                            <TextInput
                                placeholder="Full name"
                                placeholderTextColor="#475569"
                                style={styles.innerInput}
                                value={visitorName}
                                onChangeText={setVisitorName}
                            />
                        </View>

                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                            <View style={{ flex: 1.5 }}>
                                <Text style={styles.inputLabel}>Vehicle Number (Opt)</Text>
                                <TextInput
                                    placeholder="ABC-123"
                                    placeholderTextColor="#475569"
                                    style={styles.innerInput}
                                    value={vehicleNumber}
                                    onChangeText={setVehicleNumber}
                                    autoCapitalize="characters"
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.inputLabel}>People</Text>
                                <TextInput
                                    placeholder="1"
                                    placeholderTextColor="#475569"
                                    style={styles.innerInput}
                                    value={numberOfPeople}
                                    onChangeText={setNumberOfPeople}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>

                        {type !== 'Vehicle' && !isOfficerVisit && (
                            <View style={{ marginTop: 12 }}>
                                <Text style={styles.inputLabel}>Approving Client</Text>
                                <TouchableOpacity 
                                    style={styles.innerInput}
                                    onPress={() => setShowClientPicker(true)}
                                >
                                    <Text style={{ color: targetUserId ? 'white' : '#475569' }}>
                                        {targetUserId ? clients.find(c => c._id === targetUserId)?.name || 'Selected Client' : 'Select Approver'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                <View style={[styles.card, styles.inputSection]}>
                    <Text style={styles.sectionTitle}>Notes</Text>
                    <TextInput
                        multiline
                        numberOfLines={4}
                        placeholder="Observations…"
                        placeholderTextColor="#475569"
                        style={styles.textInput}
                        value={remark}
                        onChangeText={setRemark}
                        editable={true}
                    />
                </View>

                <View style={[styles.card, styles.issueSection]}>
                    <View style={styles.issueHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <ShieldAlert color={reportIssue ? '#f43f5e' : '#64748b'} size={20} />
                            <Text style={styles.infoLabel}>Report issue?</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setReportIssue(!reportIssue)}
                            style={[styles.switch, reportIssue && styles.switchActive]}
                        >
                            <View style={[styles.switchThumb, reportIssue && styles.switchThumbOn]} />
                        </TouchableOpacity>
                    </View>
                    {reportIssue && (
                        <View style={styles.issueDetails}>
                            <TextInput
                                placeholder="Issue title"
                                placeholderTextColor="#475569"
                                style={styles.innerInput}
                                value={issueTitle}
                                onChangeText={setIssueTitle}
                            />
                            <View style={styles.priorityGrid}>
                                {(['Low', 'Medium', 'High'] as const).map((p) => (
                                    <TouchableOpacity
                                        key={p}
                                        onPress={() => setPriority(p)}
                                        style={[
                                            styles.priorityBtn,
                                            priority === p && styles.priorityBtnActive,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.priorityText,
                                                priority === p && styles.priorityTextActive,
                                            ]}
                                        >
                                            {p}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}
                </View>

                <TouchableOpacity
                    onPress={handleCheckIn}
                    disabled={!canSubmitCheckIn || loading}
                    style={[styles.submitBtn, (!canSubmitCheckIn || loading) && styles.submitBtnDisabled]}
                >
                    {loading ? (
                        <Text style={styles.submitBtnText}>Saving…</Text>
                    ) : (
                        <>
                            <CheckCircle color="white" size={22} />
                            <Text style={styles.submitBtnText}>{isOfficerVisit ? 'Submit Report' : 'Check in at site'}</Text>
                        </>
                    )}
                </TouchableOpacity>

                {!canSubmitCheckIn ? (
                    <View style={styles.warningBox}>
                        <ShieldAlert color="#ef4444" size={16} />
                        <Text style={styles.warningText}>
                            Too far from site (~{Math.round(currentDistance || 0)} m). Move closer or select “Site
                            coordinates” above.
                        </Text>
                    </View>
                ) : null}
            </ScrollView>
            <View style={{ height: insets.bottom }} />

            <Modal visible={!!previewUri} transparent animationType="fade">
                <Pressable style={styles.modalBg} onPress={() => setPreviewUri(null)}>
                    {previewUri ? (
                        <Image source={{ uri: previewUri }} style={styles.fullImg} resizeMode="contain" />
                    ) : null}
                </Pressable>
            </Modal>

            {showClientPicker && (
                <Modal visible={showClientPicker} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Select Client</Text>
                                <TouchableOpacity onPress={() => setShowClientPicker(false)}>
                                    <Text style={styles.modalClose}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={{ maxHeight: 400 }}>
                                {clients.map((client) => (
                                    <TouchableOpacity 
                                        key={client._id}
                                        style={[
                                            styles.regionOption,
                                            targetUserId === client._id && styles.regionOptionSelected
                                        ]}
                                        onPress={() => {
                                            setTargetUserId(client._id === targetUserId ? null : client._id);
                                            setShowClientPicker(false);
                                        }}
                                    >
                                        <Text style={[
                                            styles.regionOptionText,
                                            targetUserId === client._id && styles.regionOptionTextSelected
                                        ]}>
                                            {client.name}
                                        </Text>
                                        {targetUserId === client._id && <Check color="#3b82f6" size={18} />}
                                    </TouchableOpacity>
                                ))}
                                {clients.length === 0 && (
                                    <Text style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>
                                        No clients found for this site.
                                    </Text>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: { padding: 20, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerLabel: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    headerTitle: { color: 'white', fontSize: 20, fontWeight: '800', marginTop: 4 },
    typeIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    locHint: { color: '#64748b', fontSize: 12, marginBottom: 12, lineHeight: 18 },
    locChoice: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        marginBottom: 10,
        backgroundColor: 'rgba(0,0,0,0.15)',
    },
    locChoiceOn: { borderColor: 'rgba(59,130,246,0.45)', backgroundColor: 'rgba(59,130,246,0.1)' },
    locRadio: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2,
        borderColor: '#475569',
        marginTop: 2,
    },
    locRadioOn: { borderColor: '#3b82f6', backgroundColor: '#3b82f6' },
    locChoiceTitle: { color: '#e2e8f0', fontSize: 14, fontWeight: '800' },
    locChoiceSub: { color: '#64748b', fontSize: 12, marginTop: 4, lineHeight: 17 },
    scrollContent: { padding: 20, gap: 14, paddingBottom: 48 },
    card: {
        backgroundColor: '#0f172a',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        padding: 16,
    },
    sectionTitle: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginBottom: 10,
        letterSpacing: 0.8,
    },
    inputGroup: {
        marginBottom: 8,
    },
    inputLabel: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    locRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    locMain: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
    locSub: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
    locDist: { fontSize: 13, fontWeight: '700', marginTop: 8, lineHeight: 18 },
    photoActions: { flexDirection: 'row', gap: 12 },
    photoBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(59,130,246,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.25)',
    },
    photoBtnTxt: { color: '#93c5fd', fontSize: 14, fontWeight: '800' },
    thumbWrap: {
        width: 88,
        height: 88,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#1e293b',
    },
    thumb: { width: '100%', height: '100%' },
    thumbOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    thumbLoadingTxt: { color: '#fff', fontSize: 22, fontWeight: '800' },
    checkCorner: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    removeX: {
        position: 'absolute',
        top: 2,
        right: 2,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    removeXTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
    inputSection: { padding: 16 },
    textInput: { color: 'white', fontSize: 15, minHeight: 100, textAlignVertical: 'top' },
    issueSection: { padding: 16 },
    issueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel: { color: 'white', fontSize: 14, fontWeight: '700' },
    switch: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#1e293b', padding: 2 },
    switchActive: { backgroundColor: '#f43f5e' },
    switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'white' },
    switchThumbOn: { alignSelf: 'flex-end' },
    issueDetails: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
    innerInput: {
        color: 'white',
        fontSize: 14,
        backgroundColor: 'rgba(0,0,0,0.2)',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    priorityGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
    priorityBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.2)',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    priorityBtnActive: { backgroundColor: 'rgba(59, 130, 246, 0.2)', borderColor: '#3b82f6' },
    priorityText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
    priorityTextActive: { color: 'white' },
    submitBtn: {
        backgroundColor: '#2563eb',
        height: 58,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 8,
    },
    submitBtnDisabled: { backgroundColor: '#1e293b', opacity: 0.45 },
    submitBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        padding: 12,
        borderRadius: 12,
        gap: 8,
    },
    warningText: { color: '#f87171', fontSize: 12, fontWeight: '600', flex: 1 },
    modalBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
        justifyContent: 'center',
        padding: 16,
    },
    fullImg: { width: '100%', height: '80%' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#0f172a',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        maxHeight: '70%',
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
    },
    modalClose: {
        fontSize: 16,
        color: '#3b82f6',
        fontWeight: '600',
    },
    regionOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.02)',
    },
    regionOptionSelected: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    regionOptionText: {
        fontSize: 16,
        color: 'white',
    },
    regionOptionTextSelected: {
        color: '#3b82f6',
        fontWeight: 'bold',
    },
});
