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
    Modal,
    ActivityIndicator
} from 'react-native';
import {
    MapPin,
    CheckCircle,
    ChevronLeft,
    Camera,
    Building2,
    Search
} from 'lucide-react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useCustomAuth } from '../context/AuthContext';
import { attendanceService, siteService, regionService } from '../services/api';
import { uploadImage } from '../services/upload';
import { prepareVisitPhotoForUpload } from '../utils/imageResize';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { showError, showSuccess } from '../utils/toastUtils';

export default function AttendanceManualScreen({ route, navigation }: any) {
    const insets = useSafeAreaInsets();
    const { organizationId, userId, customUser } = useCustomAuth();
    
    const [name, setName] = useState('');
    
    // Site Selection (City selection removed as requested)
    const [sites, setSites] = useState<any[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState(route.params?.siteId || '');
    const [selectedSiteName, setSelectedSiteName] = useState(route.params?.siteName || '');
    
    const [showSitePicker, setShowSitePicker] = useState(false);
    
    const [photo, setPhoto] = useState<{ localUri: string; storageId?: string; uploading?: boolean } | null>(null);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [loading, setLoading] = useState(false);
    const [fetchingData, setFetchingData] = useState(false);

    // Initial Data Fetch
    useEffect(() => {
        if (organizationId) {
            setFetchingData(true);
            siteService.getSitesByOrg(organizationId)
                .then((res) => {
                    setSites(res.data?.data || []);
                })
                .catch(e => console.error("Error fetching sites", e))
                .finally(() => setFetchingData(false));
        }
    }, [organizationId]);

    // Auto-GPS
    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission denied', 'Location is required for attendance logging.');
                return;
            }
            try {
                const loc = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High,
                });
                setLocation(loc);
            } catch (err) {
                console.error("Location error", err);
            }
        })();
    }, []);

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
                const uri = result.assets[0].uri;
                setPhoto({ localUri: uri, uploading: true });
                const optimizedUri = await prepareVisitPhotoForUpload(uri);
                const sid = await uploadImage(optimizedUri);
                setPhoto({ localUri: uri, storageId: sid, uploading: false });
            }
        } catch {
            showError('Camera', 'Could not open camera.');
        }
    };

    const handleOnSubmit = async () => {
        if (!selectedSiteId) {
            showError('Required', 'Please select a site.');
            return;
        }
        if (!name.trim()) {
            showError('Required', 'Please enter staff name.');
            return;
        }
        if (!photo?.storageId) {
            showError('Required', 'Please take verification photo.');
            return;
        }
        if (!location) {
            showError('GPS', 'Waiting for location…');
            return;
        }

        setLoading(true);
        try {
            await attendanceService.createManualAttendance({
                name: name.trim(),
                date: new Date().toISOString().split('T')[0],
                checkInTime: Date.now(),
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                locationAccuracy: location.coords.accuracy || undefined,
                region: customUser?.regionId || 'Unknown',
                organizationId: organizationId as any,
                siteId: selectedSiteId,
                siteName: selectedSiteName,
                imageId: photo.storageId,
                type: 'staff_manual'
            });

            showSuccess('Submitted', 'Attendance submitted for client approval.');
            navigation.goBack();
        } catch (e: any) {
            console.error(e);
            showError('Error', e?.response?.data?.error || e?.message || 'Failed to submit');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft color="white" size={24} />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerLabel}>Staff Attendance</Text>
                    <Text style={styles.headerTitle}>Manual Entry</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* 1. Site Selection (City selection removed) */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Assign Site</Text>
                    
                    <TouchableOpacity 
                        style={styles.innerInput}
                        onPress={() => setShowSitePicker(true)}
                    >
                        {fetchingData ? (
                            <ActivityIndicator size="small" color="#3b82f6" />
                        ) : (
                            <Text style={{ color: selectedSiteId ? 'white' : '#475569' }}>
                                {selectedSiteName || 'Select Site Location'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* 2. Staff Details */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Staff Information</Text>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Full Name</Text>
                        <TextInput
                            placeholder="Enter staff/contractor name"
                            placeholderTextColor="#475569"
                            style={styles.innerInput}
                            value={name}
                            onChangeText={setName}
                        />
                    </View>
                </View>

                {/* 3. Photo Verification */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Live Photo Verification</Text>
                    <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
                        <Camera color="#3b82f6" size={22} />
                        <Text style={styles.photoBtnTxt}>{photo ? 'Retake Photo' : 'Capture Selfie/Staff Photo'}</Text>
                    </TouchableOpacity>
                    
                    {photo && (
                        <View style={styles.previewContainer}>
                            <Image source={{ uri: photo.localUri }} style={styles.preview} />
                            {photo.uploading && (
                                <View style={styles.previewOverlay}>
                                    <ActivityIndicator color="white" />
                                </View>
                            )}
                        </View>
                    )}
                </View>

                {/* 4. GPS Status */}
                <View style={styles.card}>
                    <View style={styles.locRow}>
                        <MapPin color={location ? '#22c55e' : '#f97316'} size={20} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.locMain}>
                                {location
                                    ? `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`
                                    : 'Acquiring GPS…'}
                            </Text>
                            {location?.coords.accuracy ? (
                                <Text style={styles.locSub}>Accuracy: ±{Math.round(location.coords.accuracy)} meters</Text>
                            ) : null}
                        </View>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={handleOnSubmit}
                    disabled={loading || photo?.uploading}
                    style={[styles.submitBtn, (loading || photo?.uploading) && styles.submitBtnDisabled]}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <CheckCircle color="white" size={22} />
                            <Text style={styles.submitBtnText}>Submit for Approval</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>

            {/* Site Picker Modal */}
            <Modal visible={showSitePicker} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Site Location</Text>
                        <ScrollView style={{ maxHeight: 400 }}>
                            {sites.map(site => (
                                <TouchableOpacity 
                                    key={site._id} 
                                    style={styles.option} 
                                    onPress={() => { 
                                        setSelectedSiteId(site._id); 
                                        setSelectedSiteName(site.name); 
                                        setShowSitePicker(false); 
                                    }}
                                >
                                    <View>
                                        <Text style={[styles.optionText, selectedSiteId === site._id && { color: '#3b82f6', fontWeight: 'bold' }]}>
                                            {site.name}
                                        </Text>
                                        {site.city && (
                                            <Text style={styles.optionSubText}>{site.city}</Text>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowSitePicker(false)}>
                            <Text style={styles.modalCloseText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: { padding: 20, flexDirection: 'row', gap: 14, alignItems: 'center' },
    backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
    headerLabel: { color: '#64748b', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    headerTitle: { color: 'white', fontSize: 20, fontWeight: '800' },
    scrollContent: { padding: 20, gap: 14, paddingBottom: 48 },
    card: { backgroundColor: '#0f172a', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 16 },
    sectionTitle: { color: '#64748b', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 12 },
    inputGroup: { marginBottom: 8 },
    inputLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
    innerInput: { backgroundColor: 'rgba(0,0,0,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, color: 'white', fontSize: 15, minHeight: 48, justifyContent: 'center' },
    photoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)' },
    photoBtnTxt: { color: '#93c5fd', fontSize: 14, fontWeight: '800' },
    previewContainer: { marginTop: 12, borderRadius: 12, overflow: 'hidden', height: 200, width: '100%' },
    preview: { width: '100%', height: '100%', resizeMode: 'cover' },
    previewOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    locRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    locMain: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
    locSub: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#3b82f6', paddingVertical: 16, borderRadius: 16, marginTop: 10 },
    submitBtnDisabled: { backgroundColor: '#1e293b', opacity: 0.6 },
    submitBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 30 },
    modalContent: { backgroundColor: '#0f172a', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modalTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
    option: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    optionText: { color: '#94a3b8', fontSize: 16 },
    optionSubText: { color: '#64748b', fontSize: 12, marginTop: 2 },
    modalCloseBtn: { marginTop: 16, alignItems: 'center' },
    modalCloseText: { color: '#ef4444', fontSize: 16, fontWeight: 'bold' }
});
