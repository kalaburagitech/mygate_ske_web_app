import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ChevronLeft, Camera, CheckCircle, ChevronDown, RefreshCw } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { API_URL, faceRecognitionService, regionService, enrollmentService } from '../services/api';
import { klbApiError, klbApiLog, klbFormatNetworkError } from '../utils/apiDebug';
import { useCustomAuth } from '../context/AuthContext';

type RegionRow = { regionId: string; regionName: string; cities?: string[] };

function extractFaceEncodingIds(data: any): number[] {
    if (!data || typeof data !== 'object') return [];
    const ids: number[] = [];
    const pushId = (raw: unknown) => {
        if (raw == null || raw === '') return;
        const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
        if (!Number.isNaN(n)) ids.push(n);
    };
    if (Array.isArray(data.results)) {
        for (const r of data.results) {
            pushId(r?.face_encoding_id ?? r?.faceEncodingId ?? r?.encoding_id ?? r?.person_id);
        }
    }
    if (Array.isArray(data.face_encoding_ids)) {
        for (const x of data.face_encoding_ids) pushId(x);
    }
    return ids;
}

function faceServiceExplicitFailure(data: any): boolean {
    return data?.success === false || data?.success === 'false' || data?.ok === false;
}

function faceBatchEnrollSucceeded(data: any, encodingIds: number[]): boolean {
    if (faceServiceExplicitFailure(data)) return false;
    return encodingIds.length >= 3;
}

/**
 * Face API often returns HTTP 200 with `success: false` and a long English/Chinese message.
 * Map to short titles + actionable copy for Alert.alert.
 */
function humanizeEnrollmentError(raw: string | undefined | null): { title: string; message: string } {
    const s = (raw || '').trim();
    if (!s) {
        return { title: 'Enrollment failed', message: 'Something went wrong. Please try again.' };
    }
    const lower = s.toLowerCase();

    // Duplicate / similarity rejection (face already in vendor gallery for this or another identity).
    if (
        lower.includes('similar faces already exist') ||
        lower.includes('similar face') ||
        (lower.includes('already exist') && lower.includes('person')) ||
        lower.includes('duplicate face')
    ) {
        const match = s.match(/matching degree:\s*([\d.]+%?)/i);
        const deg = match ? match[1].replace(/％/g, '%') : null;
        return {
            title: 'Face already registered',
            message:
                'The face system says this face closely matches someone already enrolled (similarity check).' +
                (deg ? ` Reported match: ${deg}.` : '') +
                '\n\nIf this employee was enrolled before, do not enroll again—ask an admin to update their profile.' +
                '\nIf they are new, confirm Employee ID is correct, or retake photos with different lighting/angle so it does not match another person.',
        };
    }

    if (
        /fail\s*\d+\s*frame|processed\s*0\s*frame|0\s*frame/i.test(s) ||
        /successfully processed 0/i.test(s)
    ) {
        return {
            title: 'Photos not accepted',
            message:
                'The face server could not use your frames (blur, lighting, or no clear face). Retake in a bright room, face the camera, hold still about 2 seconds per shot, arm’s length, no mask.',
        };
    }

    if (lower.includes('network') || lower.includes('failed to fetch')) {
        return {
            title: 'Connection problem',
            message: 'Could not reach the server. Check internet and try again.',
        };
    }

    // Shorten very long vendor strings for the alert body (keep first ~280 chars).
    const body = s.length > 280 ? `${s.slice(0, 277)}…` : s;
    return { title: 'Enrollment failed', message: body };
}

export default function EnrollmentScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const { organizationId, customUser } = useCustomAuth();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<any>(null);

    const [name, setName] = useState('');
    const [region, setRegion] = useState('');
    const [city, setCity] = useState('');
    const [empId, setEmpId] = useState('');
    const [empRank, setEmpRank] = useState('');
    const [regions, setRegions] = useState<RegionRow[]>([]);
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showCityPicker, setShowCityPicker] = useState(false);
    
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [isCapturing, setIsCapturing] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const [loading, setLoading] = useState(false);
    const [facing, setFacing] = useState<'front' | 'back'>('front');

    const userRegionId = customUser?.regionId ? String(customUser.regionId).trim() : '';

    useEffect(() => {
        fetchRegions();
    }, [userRegionId, customUser?.city, customUser?.cities]);

    const fetchRegions = async () => {
        try {
            const response = await regionService.getRegions();
            const all: RegionRow[] = response.data || [];
            let scoped: RegionRow[] = all;
            if (userRegionId) {
                scoped = all.filter(
                    (r) => String(r.regionId || '').toLowerCase() === userRegionId.toLowerCase()
                );
                if (scoped.length === 0) {
                    const userCities: string[] = [];
                    if (Array.isArray(customUser?.cities) && customUser!.cities!.length > 0) {
                        userCities.push(...customUser!.cities!.map((c) => String(c)));
                    } else if (customUser?.city) {
                        userCities.push(String(customUser.city));
                    }
                    scoped = [
                        {
                            regionId: userRegionId,
                            regionName: 'Your region',
                            cities: userCities.length > 0 ? userCities : undefined,
                        },
                    ];
                }
            }
            setRegions(scoped);
            if (scoped.length === 1) {
                setRegion(scoped[0].regionId);
            } else if (scoped.length === 0) {
                setRegion('');
            }
        } catch (error) {
            console.error('Error fetching regions:', error);
            Alert.alert('Error', 'Failed to load regions');
        }
    };

    const selectedRegionRow = regions.find((r) => r.regionId === region);

    const cityOptions = useMemo(() => {
        const fromRegion = Array.isArray(selectedRegionRow?.cities) ? selectedRegionRow!.cities! : [];
        const userList: string[] = [];
        if (Array.isArray(customUser?.cities) && customUser!.cities!.length > 0) {
            userList.push(...customUser!.cities!.map((c) => String(c).trim()).filter(Boolean));
        } else if (customUser?.city) {
            userList.push(String(customUser.city).trim());
        }
        if (userList.length === 0) return fromRegion;
        const norm = (s: string) => s.toLowerCase().trim();
        const matched = fromRegion.filter((c) => userList.some((u) => norm(u) === norm(String(c))));
        return matched.length > 0 ? matched : userList;
    }, [selectedRegionRow, customUser?.cities, customUser?.city]);

    useEffect(() => {
        if (cityOptions.length === 1 && !city) {
            setCity(cityOptions[0]);
        }
        if (city && cityOptions.length > 0 && !cityOptions.some((c) => String(c) === String(city))) {
            setCity('');
        }
    }, [cityOptions, city]);

    const captureFrames = async () => {
        if (!cameraRef.current) return;

        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permission Required', 'Camera permission is needed to capture images');
                return;
            }
        }

        setIsCapturing(true);
        setCapturedImages([]);
        let currentCountdown = 5;
        setCountdown(currentCountdown);

        const countdownInterval = setInterval(() => {
            currentCountdown -= 1;
            setCountdown(currentCountdown);
            if (currentCountdown <= 0) {
                clearInterval(countdownInterval);
                setCountdown(null);
                
                // Capture 3 frames — extra delay reduces motion blur (face server often rejects soft frames).
                const captured: string[] = [];
                const runCaptures = async () => {
                    for (let i = 0; i < 3; i++) {
                        try {
                            if (cameraRef.current) {
                                await new Promise((r) => setTimeout(r, 400));
                                const photo = await cameraRef.current.takePictureAsync({
                                    quality: 0.92,
                                    base64: false,
                                });
                                if (photo?.uri) {
                                    captured.push(photo.uri);
                                    setCapturedImages([...captured]);
                                }
                            }
                            if (i < 2) {
                                await new Promise((resolve) => setTimeout(resolve, 1600));
                            }
                        } catch (error) {
                            console.error(`Error capturing frame ${i + 1}:`, error);
                        }
                    }
                    setIsCapturing(false);
                    setShowCamera(false);
                };
                runCaptures();
            }
        }, 1000);
    };

    const handleSubmit = async () => {
        if (!name.trim() || !region || !city || !empId.trim() || !empRank.trim()) {
            Alert.alert('Validation Error', 'Please fill in all required fields (Name, Region, City, Employee ID, Employee Rank)');
            return;
        }

        if (capturedImages.length !== 3) {
            Alert.alert('Validation Error', 'Please capture exactly 3 images');
            return;
        }

        setLoading(true);
        try {
            klbApiLog('Enrollment', 'submit start', {
                API_URL,
                batchPath: '/face/batch-enroll',
                platform: Platform.OS,
                imageCount: capturedImages.length,
                imageUriPrefixes: capturedImages.map((u) => (u.length > 48 ? `${u.slice(0, 48)}…` : u)),
            });

            // Create FormData for batch_enroll API
            const formData = new FormData();
            
            // Unique names per part so sort_by_filename matches three distinct frames (Expo often reuses basename).
            for (let i = 0; i < capturedImages.length; i++) {
                const imageUri = capturedImages[i];
                const filename = `enroll_frame_${i + 1}.jpg`;
                const uri =
                    Platform.OS === 'android' && !imageUri.startsWith('file://') && !imageUri.startsWith('content://')
                        ? `file://${imageUri}`
                        : imageUri;

                formData.append('files', {
                    uri,
                    name: filename,
                    type: 'image/jpeg',
                } as any);
            }

            formData.append('name', name.trim());
            formData.append('region', region);
            formData.append('city', city);
            formData.append('emp_id', empId.trim());
            formData.append('emp_code', empId.trim());
            formData.append('emp_rank', empRank.trim());
            formData.append('description', '');
            formData.append('sort_by_filename', 'true');

            klbApiLog('Enrollment', 'calling faceRecognitionService.batchEnroll …');
            const response = await faceRecognitionService.batchEnroll(formData);
            klbApiLog('Enrollment', 'batch_enroll HTTP OK', { status: response.status });

            const data = response.data;
            const encodingIds = extractFaceEncodingIds(data);
            klbApiLog('Enrollment', 'parsed face response', {
                success: data?.success,
                success_count: data?.success_count,
                encodingIdsCount: encodingIds.length,
            });

            const upstreamText =
                (typeof data?.message === 'string' && data.message) ||
                (typeof data?.detail === 'string' && data.detail) ||
                (typeof data === 'string' ? data : '');

            if (
                upstreamText &&
                (/fail\s*\d+\s*frame|processed\s*0\s*frame|0\s*frame/i.test(upstreamText) ||
                    /successfully processed 0/i.test(upstreamText))
            ) {
                const { message } = humanizeEnrollmentError(upstreamText);
                throw new Error(message);
            }

            if (!faceBatchEnrollSucceeded(data, encodingIds)) {
                const msg =
                    data?.error ||
                    data?.detail ||
                    data?.message ||
                    (typeof data === 'string' ? data : null) ||
                    (encodingIds.length < 3
                        ? `Got ${encodingIds.length} of 3 face encodings. Use stronger light, hold still, and fill the frame.`
                        : 'Face service rejected enrollment.');
                throw new Error(msg);
            }

            const selectedRegion = regions.find((r) => r.regionId === region);
            const regionLabel = selectedRegion?.regionName || region;

            klbApiLog('Enrollment', 'calling enrollmentService.create (Convex)', {
                organizationId: organizationId || null,
                regionLabel,
                faceEncodingIds: encodingIds,
            });
            await enrollmentService.create({
                name,
                empId,
                empRank,
                region: regionLabel,
                faceEncodingIds: encodingIds,
                enrolledAt: Date.now(),
                organizationId: organizationId || undefined,
            });

            Alert.alert('Enrollment successful', 'Person enrolled successfully. Face recognition is ready for attendance.', [
                { text: 'OK', onPress: () => navigation.goBack() },
            ]);
        } catch (error: any) {
            klbApiError('Enrollment', 'caught error', {
                message: error?.message,
                axiosSummary: klbFormatNetworkError(error),
                stepHint:
                    error?.message === 'Network Error'
                        ? 'Failed before HTTP response — check API_URL reachable from phone, cleartext HTTP (Android), and iOS App Transport Security.'
                        : error?.response
                          ? 'Server returned an error response (see responseStatus/responseData).'
                          : 'Non-axios or unknown error.',
            });
            console.error('Enrollment error:', error);
            const serverMsg =
                error?.response?.data?.error ||
                error?.response?.data?.detail ||
                error?.response?.data?.message;
            const raw =
                typeof serverMsg === 'string'
                    ? serverMsg
                    : typeof error?.message === 'string'
                      ? error.message
                      : '';
            const { title, message } = humanizeEnrollmentError(raw);
            Alert.alert(title, message);
        } finally {
            setLoading(false);
        }
    };

    if (!permission) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centerContainer}>
                    <Text style={styles.text}>Loading camera permissions...</Text>
                </View>
                <View style={{ height: insets.bottom }} />
            </SafeAreaView>
        );
    }

    if (showCamera && !permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centerContainer}>
                    <Text style={styles.text}>Camera permission is required</Text>
                    <TouchableOpacity style={styles.button} onPress={requestPermission}>
                        <Text style={styles.buttonText}>Grant Permission</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.button, { marginTop: 12, backgroundColor: '#64748b' }]} onPress={() => setShowCamera(false)}>
                        <Text style={styles.buttonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
                <View style={{ height: insets.bottom }} />
            </SafeAreaView>
        );
    }

    if (showCamera) {
        return (
            <SafeAreaView style={styles.container}>
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFillObject}
                    facing={facing}
                />
                <View style={styles.cameraOverlay}>
                    <View style={styles.cameraHeader}>
                        <TouchableOpacity onPress={() => { setShowCamera(false); setIsCapturing(false); setCountdown(null); }} style={styles.iconBtn}>
                            <ChevronLeft color="white" size={24} />
                        </TouchableOpacity>
                        <Text style={styles.cameraTitle}>Capture Images</Text>
                        <TouchableOpacity 
                            onPress={() => setFacing(facing === 'front' ? 'back' : 'front')} 
                            style={styles.cameraSwitchBtn}
                        >
                            <RefreshCw color="white" size={20} />
                            <Text style={styles.cameraSwitchText}>{facing === 'front' ? 'Front' : 'Back'}</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.cameraContent}>
                        {isCapturing && countdown !== null && (
                            <View style={styles.countdownContainer}>
                                <Text style={styles.countdownText}>{countdown}</Text>
                                <Text style={styles.countdownSubtext}>Preparing to capture...</Text>
                            </View>
                        )}
                        {!isCapturing && countdown === null && (
                            <View style={styles.capturePrompt}>
                                <Text style={styles.promptText}>Ready to capture 3 frames</Text>
                                <Text style={styles.promptSubtext}>Click the button below to start</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.cameraFooter}>
                        {!isCapturing && (
                            <TouchableOpacity style={styles.captureButton} onPress={captureFrames}>
                                <Camera color="white" size={32} />
                            </TouchableOpacity>
                        )}
                        {capturedImages.length > 0 && (
                            <View style={styles.previewContainer}>
                                <Text style={styles.previewText}>Captured: {capturedImages.length}/3</Text>
                            </View>
                        )}
                    </View>
                </View>
                <View style={{ height: insets.bottom }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ChevronLeft color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Enrollment</Text>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.sectionTitle}>Person Details</Text>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Name *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter person name"
                        placeholderTextColor="#64748b"
                        value={name}
                        onChangeText={setName}
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Region *</Text>
                    {regions.length <= 1 ? (
                        <View style={[styles.input, styles.lockedField]}>
                            <Text style={[styles.regionText, !region && styles.regionPlaceholder]}>
                                {selectedRegionRow?.regionName ||
                                    (userRegionId ? 'Your region' : 'No region on your profile — contact admin')}
                            </Text>
                        </View>
                    ) : (
                        <TouchableOpacity style={styles.input} onPress={() => setShowRegionPicker(true)}>
                            <View style={styles.regionSelector}>
                                <Text style={[styles.regionText, !region && styles.regionPlaceholder]}>
                                    {region
                                        ? selectedRegionRow?.regionName || 'Select region'
                                        : 'Select region'}
                                </Text>
                                <ChevronDown color="#64748b" size={20} />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>City *</Text>
                    <TouchableOpacity
                        style={styles.input}
                        onPress={() => {
                            if (!region) {
                                Alert.alert('Selection Error', 'Please select a region first');
                                return;
                            }
                            setShowCityPicker(true);
                        }}
                    >
                        <View style={styles.regionSelector}>
                            <Text style={[styles.regionText, !city && styles.regionPlaceholder]}>
                                {city || 'Select city'}
                            </Text>
                            <ChevronDown color="#64748b" size={20} />
                        </View>
                    </TouchableOpacity>
                </View>

                <Modal
                    visible={showRegionPicker}
                    transparent={true}
                    animationType="slide"
                    onRequestClose={() => setShowRegionPicker(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Select Region</Text>
                                <TouchableOpacity onPress={() => setShowRegionPicker(false)}>
                                    <Text style={styles.modalClose}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView>
                                {regions.map((r) => (
                                    <TouchableOpacity
                                        key={r.regionId}
                                        style={[styles.regionOption, region === r.regionId && styles.regionOptionSelected]}
                                        onPress={() => {
                                            setRegion(r.regionId);
                                            setCity(''); // Reset city
                                            setShowRegionPicker(false);
                                        }}
                                    >
                                        <Text style={[styles.regionOptionText, region === r.regionId && styles.regionOptionTextSelected]}>
                                            {r.regionName}
                                        </Text>
                                        {region === r.regionId && <CheckCircle color="#2563eb" size={20} />}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                <Modal
                    visible={showCityPicker}
                    transparent={true}
                    animationType="slide"
                    onRequestClose={() => setShowCityPicker(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Select City</Text>
                                <TouchableOpacity onPress={() => setShowCityPicker(false)}>
                                    <Text style={styles.modalClose}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView>
                                {cityOptions.length === 0 ? (
                                    <Text style={styles.emptyCities}>
                                        No cities available for your profile. Ask an admin to assign cities to your
                                        account or to this region.
                                    </Text>
                                ) : (
                                    cityOptions.map((c) => (
                                        <TouchableOpacity
                                            key={c}
                                            style={[styles.regionOption, city === c && styles.regionOptionSelected]}
                                            onPress={() => {
                                                setCity(c);
                                                setShowCityPicker(false);
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    styles.regionOptionText,
                                                    city === c && styles.regionOptionTextSelected,
                                                ]}
                                            >
                                                {c}
                                            </Text>
                                            {city === c && <CheckCircle color="#2563eb" size={20} />}
                                        </TouchableOpacity>
                                    ))
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Employee ID *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter employee ID"
                        placeholderTextColor="#64748b"
                        value={empId}
                        onChangeText={setEmpId}
                    />
                </View>



                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Employee Rank *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter employee rank"
                        placeholderTextColor="#64748b"
                        value={empRank}
                        onChangeText={setEmpRank}
                    />
                </View>



                <Text style={styles.sectionTitle}>Face Images</Text>
                <Text style={styles.sectionSubtitle}>Capture 3 frames for face recognition</Text>

                {capturedImages.length > 0 && (
                    <View style={styles.imagePreviewContainer}>
                        {capturedImages.map((uri, index) => (
                            <View key={index} style={styles.imagePreview}>
                                <Image source={{ uri }} style={styles.previewImage} />
                                <Text style={styles.imageLabel}>Frame {index + 1}</Text>
                            </View>
                        ))}
                    </View>
                )}

                <TouchableOpacity
                    style={[styles.captureButtonLarge, capturedImages.length === 3 && styles.captureButtonComplete]}
                    onPress={() => setShowCamera(true)}
                    disabled={isCapturing}
                >
                    {capturedImages.length === 3 ? (
                        <>
                            <CheckCircle color="white" size={24} />
                            <Text style={styles.captureButtonText}>3 Images Captured</Text>
                        </>
                    ) : (
                        <>
                            <Camera color="white" size={24} />
                            <Text style={styles.captureButtonText}>
                                {capturedImages.length > 0 ? `Capture More (${capturedImages.length}/3)` : 'Click to Capture Images'}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.submitButton, loading && styles.disabled]}
                    onPress={handleSubmit}
                    disabled={loading || capturedImages.length !== 3}
                >
                    {loading ? (
                        <>
                            <ActivityIndicator color="white" />
                            <Text style={styles.submitButtonText}>Enrolling...</Text>
                        </>
                    ) : (
                        <Text style={styles.submitButtonText}>Submit Enrollment</Text>
                    )}
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
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
    },
    scrollContent: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
        marginTop: 8,
        marginBottom: 16,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 16,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#cbd5e1',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 16,
        color: 'white',
        fontSize: 16,
    },
    lockedField: {
        opacity: 0.95,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    regionSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    regionText: {
        color: 'white',
        fontSize: 16,
    },
    regionPlaceholder: {
        color: '#64748b',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#0f172a',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
    },
    modalClose: {
        fontSize: 16,
        color: '#2563eb',
        fontWeight: '600',
    },
    regionOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    regionOptionSelected: {
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
    },
    regionOptionText: {
        fontSize: 16,
        color: 'white',
    },
    regionOptionTextSelected: {
        color: '#2563eb',
        fontWeight: '600',
    },
    emptyCities: {
        color: '#94a3b8',
        fontSize: 14,
        padding: 16,
        lineHeight: 20,
    },
    imagePreviewContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    imagePreview: {
        flex: 1,
        alignItems: 'center',
    },
    previewImage: {
        width: '100%',
        height: 120,
        borderRadius: 12,
        backgroundColor: '#0f172a',
    },
    imageLabel: {
        color: '#64748b',
        fontSize: 12,
        marginTop: 4,
    },
    captureButtonLarge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563eb',
        padding: 18,
        borderRadius: 16,
        marginBottom: 20,
        gap: 12,
    },
    captureButtonComplete: {
        backgroundColor: '#10b981',
    },
    captureButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    submitButton: {
        backgroundColor: '#2563eb',
        padding: 18,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 12,
        marginBottom: 40,
    },
    disabled: {
        opacity: 0.5,
    },
    submitButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    cameraOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    cameraHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cameraSwitchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
    },
    cameraSwitchText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
    cameraTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    cameraContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    countdownContainer: {
        alignItems: 'center',
    },
    countdownText: {
        fontSize: 72,
        fontWeight: 'bold',
        color: 'white',
    },
    countdownSubtext: {
        fontSize: 16,
        color: '#cbd5e1',
        marginTop: 12,
    },
    capturePrompt: {
        alignItems: 'center',
    },
    promptText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 8,
    },
    promptSubtext: {
        fontSize: 14,
        color: '#cbd5e1',
    },
    cameraFooter: {
        paddingBottom: 60,
        alignItems: 'center',
    },
    captureButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#2563eb',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: 'white',
    },
    previewContainer: {
        marginTop: 20,
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 12,
    },
    previewText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    text: {
        color: 'white',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 20,
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
        fontSize: 16,
    },
});
