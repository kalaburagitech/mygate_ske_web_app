import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ChevronLeft, CheckCircle, X, User, Clock, MapPin, RefreshCw, ScanLine } from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Accuracy } from 'expo-location';
import { faceRecognitionService, regionService, attendanceService, siteService } from '../services/api';
import { useCustomAuth } from '../context/AuthContext';
import { showError, showSuccess } from '../utils/toastUtils';
import { getCurrentShift, getNextShift } from '../utils/shiftUtils';
import { SkeletonBox } from '../components/SkeletonBlocks';
import { assertWithinSiteRadius } from '../utils/geoUtils';

function toYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

type Step = 'region' | 'city' | 'site' | 'shift' | 'confirm' | 'loading_sites';

function uniqueCitiesFromUser(customUser: { cities?: string[]; city?: string } | null | undefined): string[] {
    const raw = [...(customUser?.cities || []), customUser?.city].filter(Boolean) as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of raw) {
        const k = String(c).trim();
        if (!k) continue;
        const low = k.toLowerCase();
        if (seen.has(low)) continue;
        seen.add(low);
        out.push(k);
    }
    return out;
}

function normShift(s?: string | null): string {
    const t = (s ?? '').trim();
    return t.length ? t.toLowerCase() : 'default';
}

export default function MarkAttendanceScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { organizationId, userId, customUser } = useCustomAuth();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<any>(null);
    const scanBusyRef = useRef(false);

    const [step, setStep] = useState<Step>('region');
    const [workDate, setWorkDate] = useState(() => toYMD(new Date()));
    const [expectedEmpId, setExpectedEmpId] = useState<string | undefined>(undefined);
    const [checkoutOnly, setCheckoutOnly] = useState(false);

    const [candidateSites, setCandidateSites] = useState<any[]>([]);
    const [selectedSiteDoc, setSelectedSiteDoc] = useState<any | null>(null);
    const [selectedShift, setSelectedShift] = useState<{ name: string; start: string; end: string; strength?: number } | null>(null);
    const [showSitePicker, setShowSitePicker] = useState(false);
    const [showShiftPicker, setShowShiftPicker] = useState(false);
    const [loadingSites, setLoadingSites] = useState(false);
    const [region, setRegion] = useState('');
    const [city, setCity] = useState('');
    const [regions, setRegions] = useState<Array<{ regionId: string; regionName: string; cities?: string[] }>>([]);
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showCityPicker, setShowCityPicker] = useState(false);
    
    const [detectedPerson, setDetectedPerson] = useState<any>(null);
    const [attendanceStatus, setAttendanceStatus] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [facing, setFacing] = useState<'front' | 'back'>('front');
    const [liveScanning, setLiveScanning] = useState(false);
    const [scannedPeople, setScannedPeople] = useState<Record<string, { emp_id: string; name: string; match_score: number }>>({});
    const [pickMatches, setPickMatches] = useState<any[] | null>(null);
    /** Multi-select employee IDs for batch check-in / check-out (not used for strict single check-out verify). */
    const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

    const strictSingleCheckout = checkoutOnly && !!expectedEmpId;

    useEffect(() => {
        fetchRegions();
        requestLocationPermission();
    }, []);

    useFocusEffect(
        useCallback(() => {
            const p = route.params || {};
            if (p.presetSite) {
                if (p.workDate) setWorkDate(p.workDate);
                else setWorkDate(toYMD(new Date()));
                setCheckoutOnly(!!p.checkoutOnly);
                setExpectedEmpId(p.expectedEmpId);
                const s = p.presetSite;
                setRegion(p.presetRegionId || s.regionId || '');
                setCity(p.presetCity || s.city || '');
                setSelectedSiteDoc(s);
                setCandidateSites([s]);
                const shifts = Array.isArray(s.shifts) ? s.shifts : [];
                if (p.presetShift) {
                    setSelectedShift(p.presetShift);
                } else if (shifts.length > 1) {
                    setSelectedShift(null);
                    setDetectedPerson(null);
                    setAttendanceStatus(null);
                    setStep('shift');
                    return;
                } else if (shifts.length === 1) {
                    setSelectedShift(shifts[0]);
                } else {
                    setSelectedShift(null);
                }
                setDetectedPerson(null);
                setAttendanceStatus(null);
                setStep('confirm');
                return;
            }
            setLiveScanning(false);
            setScannedPeople({});
            setPickMatches(null);
            setSelectedEmpIds([]);
            if (p.workDate) {
                setWorkDate(p.workDate);
            } else {
                setWorkDate(toYMD(new Date()));
            }
            setExpectedEmpId(p.expectedEmpId);
            setCheckoutOnly(!!p.checkoutOnly);
            setSelectedSiteDoc(null);
            setSelectedShift(null);
            setCandidateSites([]);
            setDetectedPerson(null);
            setAttendanceStatus(null);
            /** Home / quick checkout: open camera immediately (skip city/sites). */
            if (p.checkoutOnly && p.directCamera && customUser?.regionId) {
                setRegion(customUser.regionId);
                const uc = uniqueCitiesFromUser(customUser);
                setCity(uc[0] || '');
                const stub = (p as any).checkoutSiteStub;
                if (stub?._id) {
                    setSelectedSiteDoc(stub);
                    setCandidateSites([stub]);
                }
                const sn = (p as any).checkoutShiftName;
                setSelectedShift(
                    sn ? { name: String(sn), start: '', end: '' } : null
                );
                setStep('camera');
                return;
            }
            if (p.checkoutOnly && customUser?.regionId) {
                setRegion(customUser.regionId);
                const uc = uniqueCitiesFromUser(customUser);
                if (uc.length === 1) {
                    setCity(uc[0]);
                    setStep('camera');
                } else if (uc.length > 1) {
                    setCity('');
                    setStep('city');
                } else {
                    setCity('');
                    setStep('confirm');
                }
                return;
            }
            const rid = customUser?.regionId || '';
            setRegion(rid);
            if (!rid) {
                setCity('');
                setStep('region');
                return;
            }
            const uc = uniqueCitiesFromUser(customUser);
            setStep('loading_sites');
        }, [route.params, customUser])
    );

    const checkAttendanceForUser = async (empId: string) => {
        setCheckingStatus(true);
        try {
            if (organizationId) {
                const params: Record<string, string> = {
                    organizationId,
                    empId: String(empId),
                    date: workDate,
                };
                if (selectedSiteDoc?._id) params.siteId = selectedSiteDoc._id;
                const res = await attendanceService.list(params);
                const rows = Array.isArray(res.data) ? res.data : [];
                const sk = normShift(selectedShift?.name);
                let subset = rows.filter((r: any) => normShift(r.shiftName) === sk);
                if (subset.length === 0) subset = rows;
                const row = subset[0];
                if (row) {
                    applyStatusFromRow(row);
                    return;
                }
            }
            setAttendanceStatus({ checked_in: false, fullyDone: false, checkInTime: undefined, checkOutTime: undefined });
        } catch (error: any) {
            console.error('Error checking attendance:', error);
            setAttendanceStatus({ checked_in: false, fullyDone: false, checkInTime: undefined, checkOutTime: undefined });
        } finally {
            setCheckingStatus(false);
        }
    };

    useEffect(() => {
        if (step === 'confirm' && customUser?.emp_id) {
            setDetectedPerson({
                emp_id: customUser.emp_id,
                name: customUser.name || 'Staff Member',
            });
            checkAttendanceForUser(customUser.emp_id);
        }
    }, [step]);

    const requestLocationPermission = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({});
                setLocation(loc);
            }
        } catch (error) {
            console.error('Location error:', error);
        }
    };

    const fetchRegions = async () => {
        try {
            const response = await regionService.getRegions();
            setRegions(response.data || []);
        } catch (error) {
            console.error('Error fetching regions:', error);
            showError('Error', 'Failed to load regions');
        }
    };

    const applyStatusFromRow = (row: any) => {
        const hasCheckedIn = row?.checkInTime != null;
        const hasCheckedOut = row?.checkOutTime != null;
        if (hasCheckedIn && hasCheckedOut) {
            setAttendanceStatus({
                fullyDone: true,
                checked_in: false,
                checkInTime: row.checkInTime,
                checkOutTime: row.checkOutTime,
            });
        } else if (hasCheckedIn) {
            setAttendanceStatus({
                fullyDone: false,
                checked_in: true,
                checkInTime: row.checkInTime,
                checkOutTime: row.checkOutTime,
            });
        } else {
            setAttendanceStatus({
                fullyDone: false,
                checked_in: false,
                checkInTime: undefined,
                checkOutTime: undefined,
            });
        }
    };

    const checkAttendanceStatus = useCallback(async () => {
        if (!detectedPerson) return;

        setCheckingStatus(true);
        try {
            if (organizationId) {
                const params: Record<string, string> = {
                    organizationId,
                    empId: String(detectedPerson.emp_id),
                    date: workDate,
                };
                if (selectedSiteDoc?._id) params.siteId = selectedSiteDoc._id;
                const res = await attendanceService.list(params);
                const rows = Array.isArray(res.data) ? res.data : [];
                const sk = normShift(selectedShift?.name);
                let subset = rows.filter((r: any) => normShift(r.shiftName) === sk);
                if (subset.length === 0) subset = rows;
                const row = subset[0];
                if (row) {
                    applyStatusFromRow(row);
                    return;
                }
            }

            const response = await faceRecognitionService.checkAttendance({
                emp_id: detectedPerson.emp_id,
                date: workDate,
            });
            const data = response.data;
            if (typeof data === 'string') {
                setAttendanceStatus({ checked_in: false, fullyDone: false, checkInTime: undefined, checkOutTime: undefined });
            } else {
                applyStatusFromRow(data);
            }
        } catch (error: any) {
            console.error('Error checking attendance:', error);
            setAttendanceStatus({ checked_in: false, fullyDone: false, checkInTime: undefined, checkOutTime: undefined });
        } finally {
            setCheckingStatus(false);
        }
    }, [detectedPerson, organizationId, workDate, selectedSiteDoc?._id, selectedShift?.name]);

    useEffect(() => {
        if (!strictSingleCheckout) return;
        if (detectedPerson && step === 'camera') {
            checkAttendanceStatus();
        }
    }, [detectedPerson, step, checkAttendanceStatus, strictSingleCheckout]);

    const mergeMatchesIntoScanned = (matches: any[]) => {
        setScannedPeople((prev) => {
            const next = { ...prev };
            for (const m of matches) {
                const id = String(m.emp_id ?? m.empId ?? '');
                if (!id) continue;
                const score = Number(m.match_score ?? m.score ?? 0);
                const cur = next[id];
                if (!cur || score > (cur.match_score ?? 0)) {
                    next[id] = {
                        emp_id: id,
                        name: String(m.name ?? 'Unknown'),
                        match_score: score,
                    };
                }
            }
            return next;
        });
    };

    const toggleSelectEmp = (id: string) => {
        setSelectedEmpIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handleFaceDetected = async (
        imageUri: string,
        opts?: { silent?: boolean; mergeOnly?: boolean }
    ) => {
        if (!opts?.silent) setLoading(true);
        try {
            const formData = new FormData();
            const filename = imageUri.split('/').pop() || 'face.jpg';
            formData.append('file', {
                uri: imageUri,
                name: filename,
                type: 'image/jpeg',
            } as any);
            formData.append('region', region);
            formData.append('city', city);
            formData.append('emp_id', '');

            const response = await faceRecognitionService.recognize(formData);
            const payload = (response.data || {}) as Record<string, any>;
            const matches = Array.isArray(payload.matches) ? payload.matches : [];
            const ok = payload.success !== false && matches.length > 0;

            if (!ok) {
                if (!opts?.silent) showError('No Match', 'Face not recognized. Please try again.');
                return;
            }

            if (opts?.mergeOnly) {
                mergeMatchesIntoScanned(matches);
                return;
            }

            const strict = checkoutOnly && !!expectedEmpId;
            if (!strict) {
                mergeMatchesIntoScanned(matches);
                setPickMatches(null);
                return;
            }

            if (matches.length === 1) {
                const match = matches[0];
                setDetectedPerson({
                    emp_id: match.emp_id,
                    name: match.name,
                    match_score: match.match_score,
                    face_encoding_id: match.face_encoding_id,
                });
                mergeMatchesIntoScanned(matches);
            } else {
                mergeMatchesIntoScanned(matches);
                setPickMatches(matches);
            }
        } catch (error: any) {
            console.error('Recognition error:', error);
            if (!opts?.silent) showError('Error', error.response?.data?.detail || 'Failed to recognize face');
        } finally {
            if (!opts?.silent) setLoading(false);
        }
    };

    const captureAndRecognize = async () => {
        if (!cameraRef.current) return;

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                base64: false,
            });
            if (photo?.uri) await handleFaceDetected(photo.uri);
        } catch (error) {
            console.error('Capture error:', error);
            showError('Error', 'Failed to capture image');
        }
    };

    const captureAndRecognizeSilent = async () => {
        if (!cameraRef.current || scanBusyRef.current) return;
        scanBusyRef.current = true;
        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.65,
                base64: false,
            });
            if (photo?.uri) await handleFaceDetected(photo.uri, { silent: true, mergeOnly: true });
        } catch {
            /* ignore bursty live-scan failures */
        } finally {
            scanBusyRef.current = false;
        }
    };

    useEffect(() => {
        if (!liveScanning || step !== 'camera') return;
        if (strictSingleCheckout && detectedPerson) return;
        const id = setInterval(() => {
            captureAndRecognizeSilent();
        }, 2800);
        return () => clearInterval(id);
    }, [liveScanning, step, detectedPerson, strictSingleCheckout]);

    const goToCameraStep = useCallback(() => {
        if (!permission?.granted) {
            requestPermission().then((result) => {
                if (result.granted) {
                    setStep('camera');
                } else {
                    showError('Permission Required', 'Camera permission is needed for face recognition');
                }
            });
        } else {
            setStep('camera');
        }
    }, [permission?.granted, requestPermission]);

    const advanceAfterSiteSelect = useCallback(
        (site: any) => {
            setSelectedSiteDoc(site);
            const shifts = Array.isArray(site?.shifts) ? site.shifts : [];
            const auto = getCurrentShift(shifts, new Date()) || getNextShift(shifts, new Date());
            if (auto) {
                setSelectedShift(auto);
                setStep('confirm');
            } else if (shifts.length === 1) {
                setSelectedShift(shifts[0]);
                setStep('confirm');
            } else {
                setSelectedShift(null);
                setStep('confirm');
            }
        },
        [goToCameraStep]
    );

    useEffect(() => {
        if (step !== 'loading_sites') return;
        if (!userId || !region) {
            setStep('region');
            return;
        }
        let cancelled = false;
        (async () => {
            setLoadingSites(true);
            try {
                const response = await siteService.getSitesByUser(userId, region, city || undefined);
                const list = response.data || [];
                if (cancelled) return;
                setCandidateSites(list);
                if (list.length === 0) {
                    showError('Sites', 'No sites linked for this location.');
                    const uc = uniqueCitiesFromUser(customUser);
                    setStep(uc.length > 1 ? 'city' : 'region');
                    return;
                }
                if (list.length === 1) {
                    advanceAfterSiteSelect(list[0]);
                } else {
                    setSelectedSiteDoc(null);
                    setSelectedShift(null);
                    setStep('site');
                }
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    showError('Sites', 'Could not load sites.');
                    setStep('city');
                }
            } finally {
                if (!cancelled) setLoadingSites(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [step, userId, region, city, customUser, advanceAfterSiteSelect]);

    const backFromCamera = () => {
        setDetectedPerson(null);
        setAttendanceStatus(null);
        if ((route.params as any)?.fromSiteDashboard) {
            navigation.goBack();
            return;
        }
        if (checkoutOnly) {
            navigation.goBack();
            return;
        }
        const shifts = Array.isArray(selectedSiteDoc?.shifts) ? selectedSiteDoc.shifts : [];
        if (shifts.length > 1) {
            setStep('shift');
        } else if (candidateSites.length > 1) {
            setStep('site');
        } else if (uniqueCitiesFromUser(customUser).length > 1) {
            setStep('city');
        } else {
            navigation.goBack();
        }
    };

    const advanceFromCity = () => {
        if (!userId || !region) return;
        if (checkoutOnly) {
            goToCameraStep();
            return;
        }
        const needsCity = uniqueCitiesFromUser(customUser).length > 1;
        if (needsCity && !String(city || '').trim()) {
            showError('City', 'Select a city.');
            return;
        }
        setStep('loading_sites');
    };

    const markPersonAttendance = async (
        person: { emp_id: string; name: string },
        action: 'check_in' | 'check_out',
        lat: number,
        lon: number,
        accuracy?: number
    ) => {
        const response = await faceRecognitionService.markAttendance({
            emp_id: person.emp_id,
            status: 'present',
            action,
            date: workDate,
            latitude: lat,
            longitude: lon,
            location_accuracy: accuracy,
        });

        if (!response.data) {
            throw new Error('Face service did not confirm');
        }

        let existingCheckInTime: number | undefined;
        if (action === 'check_out') {
            try {
                const existingRecords = await attendanceService.list({
                    organizationId: organizationId || undefined,
                    empId: String(person.emp_id),
                    date: workDate,
                    siteId: selectedSiteDoc?._id,
                });
                const rows = Array.isArray(existingRecords.data) ? existingRecords.data : [];
                const sk = normShift(selectedShift?.name);
                const existingRecord =
                    rows.find((r: any) => normShift(r.shiftName) === sk) || rows[0];
                existingCheckInTime = existingRecord?.checkInTime;
            } catch (error) {
                console.error('Error fetching existing record:', error);
            }
        }

        await attendanceService.create({
            empId: person.emp_id,
            name: person.name,
            date: workDate,
            type: action === 'check_out' ? 'logout' : 'staff',
            checkInTime: action === 'check_in' ? Date.now() : existingCheckInTime,
            checkOutTime: action === 'check_out' ? Date.now() : undefined,
            status: 'present',
            latitude: lat,
            longitude: lon,
            locationAccuracy: accuracy,
            region: regions.find((r) => r.regionId === region)?.regionName || region,
            organizationId: organizationId || undefined,
            siteId: selectedSiteDoc?._id,
            siteName: selectedSiteDoc?.name,
            shiftName: selectedShift?.name,
        });
    };

    const resolveDeviceLocation = async (): Promise<{ lat: number; lon: number; accuracy?: number }> => {
        try {
            const loc = await Location.getCurrentPositionAsync({
                accuracy: Accuracy.Balanced,
            });
            return {
                lat: loc.coords.latitude,
                lon: loc.coords.longitude,
                accuracy: loc.coords.accuracy ?? undefined,
            };
        } catch {
            if (location) {
                return {
                    lat: location.coords.latitude,
                    lon: location.coords.longitude,
                    accuracy: location.coords.accuracy ?? undefined,
                };
            }
            throw new Error('Could not get GPS location. Enable location and try again.');
        }
    };

    const handleBatchMark = async (action: 'check_in' | 'check_out') => {
        if (selectedEmpIds.length === 0) {
            showError('Selection', 'Tap people below to select them, then mark attendance.');
            return;
        }
        setLoading(true);
        const failed: string[] = [];
        let ok = 0;
        try {
            const { lat, lon, accuracy } = await resolveDeviceLocation();
            assertWithinSiteRadius(selectedSiteDoc, lat, lon, accuracy, 'mark attendance');

            for (const id of selectedEmpIds) {
                const p = scannedPeople[id];
                if (!p) continue;
                try {
                    await markPersonAttendance(p, action, lat, lon, accuracy);
                    ok++;
                } catch (e: any) {
                    const msg = e?.response?.data?.error || e?.response?.data?.detail || e?.message || 'Failed';
                    failed.push(`${p.name}: ${msg}`);
                }
            }

            if (ok > 0) {
                showSuccess('Done', `${ok} checked ${action === 'check_in' ? 'in' : 'out'}${failed.length ? ` · ${failed.length} skipped` : ''}`);
            }
            if (failed.length > 0 && ok === 0) {
                showError('Attendance', failed.slice(0, 3).join('\n') + (failed.length > 3 ? '\n…' : ''));
            }
            setSelectedEmpIds([]);
            if (ok > 0) {
                setTimeout(() => {
                    if ((route.params as any)?.fromSiteDashboard) {
                        navigation.goBack();
                    } else {
                        navigation.navigate('MainTabs');
                    }
                }, 1200);
            }
        } catch (e: any) {
            showError('Location', e?.message || 'Cannot verify you are at the site.');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAttendance = async (action: 'check_in' | 'check_out') => {
        if (!detectedPerson) return;

        if (checkoutOnly && expectedEmpId && String(detectedPerson.emp_id) !== String(expectedEmpId)) {
            showError('Verification failed', 'Face does not match this attendance record.');
            return;
        }

        setLoading(true);
        try {
            const { lat, lon, accuracy } = await resolveDeviceLocation();
            assertWithinSiteRadius(selectedSiteDoc, lat, lon, accuracy, 'mark attendance');

            await markPersonAttendance(detectedPerson, action, lat, lon, accuracy);

            setTimeout(async () => {
                await checkAttendanceStatus();
            }, 800);

            showSuccess(
                'Success',
                `Successfully ${action === 'check_in' ? 'checked in' : 'checked out'}`
            );
            setTimeout(() => {
                if ((route.params as any)?.fromSiteDashboard) {
                    navigation.goBack();
                } else if (checkoutOnly) {
                    navigation.goBack();
                } else {
                    navigation.navigate('MainTabs');
                }
            }, 1500);
        } catch (error: any) {
            console.error('Mark attendance error:', error);
            const msg =
                error?.message ||
                error?.response?.data?.detail ||
                error?.response?.data?.error ||
                'Failed to mark attendance';
            showError('Attendance', String(msg));
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

    if (step === 'loading_sites') {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <ChevronLeft color="white" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Mark Attendance</Text>
                    <View style={{ width: 44 }} />
                </View>
                <View style={[styles.centerContainer, { paddingHorizontal: 32 }]}>
                    <SkeletonBox height={16} width={180} radius={8} style={{ marginBottom: 20 }} />
                    <SkeletonBox height={12} width={240} radius={6} style={{ marginBottom: 24 }} />
                    <Text style={[styles.text, { fontSize: 15 }]}>Loading sites for your region…</Text>
                </View>
                <View style={{ height: insets.bottom }} />
            </SafeAreaView>
        );
    }

    if (step === 'region') {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <ChevronLeft color="white" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Mark Attendance</Text>
                    <View style={{ width: 44 }} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.sectionTitle}>Select Region</Text>
                    <Text style={styles.sectionSubtitle}>Choose the region for attendance marking</Text>

                    <TouchableOpacity
                        style={styles.regionButton}
                        onPress={() => setShowRegionPicker(true)}
                    >
                        <View style={styles.regionButtonContent}>
                            <Text style={[styles.regionButtonText, !region && styles.regionPlaceholder]}>
                                {region ? regions.find(r => r.regionId === region)?.regionName || 'Select region' : 'Select region'}
                            </Text>
                            <ChevronLeft color="#64748b" size={20} style={{ transform: [{ rotate: '-90deg' }] }} />
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.continueButton, !region && styles.disabled]}
                        onPress={() => {
                            if (region) {
                                setStep('city');
                            }
                        }}
                        disabled={!region}
                    >
                        <Text style={styles.continueButtonText}>Continue to Select City</Text>
                    </TouchableOpacity>
                </ScrollView>

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
                <View style={{ height: insets.bottom }} />
            </SafeAreaView>
        );
    }

    if (step === 'city') {
        const cityOptions = uniqueCitiesFromUser(customUser);
        const mustPickCity = cityOptions.length > 1;
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => {
                            if (customUser?.regionId && !checkoutOnly) navigation.goBack();
                            else setStep('region');
                        }}
                        style={styles.backButton}
                    >
                        <ChevronLeft color="white" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Select City</Text>
                    <View style={{ width: 44 }} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={styles.sectionTitle}>Select City</Text>
                        {!customUser?.regionId ? (
                            <TouchableOpacity onPress={() => setStep('region')}>
                                <Text style={{ color: '#2563eb', fontSize: 12 }}>Change Region</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    <Text style={styles.sectionSubtitle}>Your assigned cities — then we load your sites</Text>

                    <TouchableOpacity
                        style={styles.regionButton}
                        onPress={() => setShowCityPicker(true)}
                    >
                        <View style={styles.regionButtonContent}>
                            <Text style={[styles.regionButtonText, !city && styles.regionPlaceholder]}>
                                {city || 'Select city'}
                            </Text>
                            <ChevronLeft color="#64748b" size={20} style={{ transform: [{ rotate: '-90deg' }] }} />
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.continueButton, (mustPickCity && !city) || loadingSites ? styles.disabled : undefined]}
                        onPress={() => advanceFromCity()}
                        disabled={(mustPickCity && !city) || loadingSites}
                    >
                        {loadingSites ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.continueButtonText}>Continue to site / recognize</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>

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
                                {cityOptions.map((c) => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[styles.regionOption, city === c && styles.regionOptionSelected]}
                                        onPress={() => {
                                            setCity(c);
                                            setShowCityPicker(false);
                                        }}
                                    >
                                        <Text style={[styles.regionOptionText, city === c && styles.regionOptionTextSelected]}>
                                            {c}
                                        </Text>
                                        {city === c && <CheckCircle color="#2563eb" size={20} />}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
                <View style={{ height: insets.bottom }} />
            </SafeAreaView>
        );
    }

    if (step === 'site') {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => {
                            if (uniqueCitiesFromUser(customUser).length > 1) setStep('city');
                            else navigation.goBack();
                        }}
                        style={styles.backButton}
                    >
                        <ChevronLeft color="white" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Select site</Text>
                    <View style={{ width: 44 }} />
                </View>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.sectionTitle}>On-site shift</Text>
                    <Text style={styles.sectionSubtitle}>Choose the site you are reporting attendance for.</Text>
                    <TouchableOpacity style={styles.regionButton} onPress={() => setShowSitePicker(true)}>
                        <View style={styles.regionButtonContent}>
                            <Text style={[styles.regionButtonText, !selectedSiteDoc && styles.regionPlaceholder]}>
                                {selectedSiteDoc?.name || 'Select site'}
                            </Text>
                            <ChevronLeft color="#64748b" size={20} style={{ transform: [{ rotate: '-90deg' }] }} />
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.continueButton, !selectedSiteDoc && styles.disabled]}
                        onPress={() => selectedSiteDoc && advanceAfterSiteSelect(selectedSiteDoc)}
                        disabled={!selectedSiteDoc}
                    >
                        <Text style={styles.continueButtonText}>Continue</Text>
                    </TouchableOpacity>
                </ScrollView>
                <Modal visible={showSitePicker} transparent animationType="slide" onRequestClose={() => setShowSitePicker(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Sites</Text>
                                <TouchableOpacity onPress={() => setShowSitePicker(false)}>
                                    <Text style={styles.modalClose}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView>
                                {candidateSites.map((s: any) => (
                                    <TouchableOpacity
                                        key={s._id}
                                        style={[styles.regionOption, selectedSiteDoc?._id === s._id && styles.regionOptionSelected]}
                                        onPress={() => {
                                            setSelectedSiteDoc(s);
                                            setShowSitePicker(false);
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.regionOptionText,
                                                selectedSiteDoc?._id === s._id && styles.regionOptionTextSelected,
                                            ]}
                                        >
                                            {s.name}
                                        </Text>
                                        {selectedSiteDoc?._id === s._id && <CheckCircle color="#2563eb" size={20} />}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
                <View style={{ height: insets.bottom }} />
            </SafeAreaView>
        );
    }

    if (step === 'shift') {
        const shifts = Array.isArray(selectedSiteDoc?.shifts) ? selectedSiteDoc.shifts : [];
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => {
                            if ((route.params as any)?.fromSiteDashboard) {
                                navigation.goBack();
                                return;
                            }
                            candidateSites.length > 1 ? setStep('site') : setStep('city');
                        }}
                        style={styles.backButton}
                    >
                        <ChevronLeft color="white" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Select shift</Text>
                    <View style={{ width: 44 }} />
                </View>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.sectionTitle}>Shift</Text>
                    <Text style={styles.sectionSubtitle}>{selectedSiteDoc?.name}</Text>
                    <TouchableOpacity style={styles.regionButton} onPress={() => setShowShiftPicker(true)}>
                        <View style={styles.regionButtonContent}>
                            <Text style={[styles.regionButtonText, !selectedShift && styles.regionPlaceholder]}>
                                {selectedShift ? `${selectedShift.name} (${selectedShift.start}–${selectedShift.end})` : 'Select shift'}
                            </Text>
                            <ChevronLeft color="#64748b" size={20} style={{ transform: [{ rotate: '-90deg' }] }} />
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.continueButton, !selectedShift && styles.disabled]}
                        onPress={() => selectedShift && goToCameraStep()}
                        disabled={!selectedShift}
                    >
                        <Text style={styles.continueButtonText}>Open camera</Text>
                    </TouchableOpacity>
                </ScrollView>
                <Modal visible={showShiftPicker} transparent animationType="slide" onRequestClose={() => setShowShiftPicker(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Shifts</Text>
                                <TouchableOpacity onPress={() => setShowShiftPicker(false)}>
                                    <Text style={styles.modalClose}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView>
                                {shifts.map((sh: any, idx: number) => (
                                    <TouchableOpacity
                                        key={`${sh.name}-${idx}`}
                                        style={[styles.regionOption, selectedShift?.name === sh.name && styles.regionOptionSelected]}
                                        onPress={() => {
                                            setSelectedShift(sh);
                                            setShowShiftPicker(false);
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.regionOptionText,
                                                selectedShift?.name === sh.name && styles.regionOptionTextSelected,
                                            ]}
                                        >
                                            {sh.name} · {sh.start}–{sh.end}
                                        </Text>
                                        {selectedShift?.name === sh.name && <CheckCircle color="#2563eb" size={20} />}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
                <View style={{ height: insets.bottom }} />
            </SafeAreaView>
        );
    }

    if (step === 'camera' && !permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centerContainer}>
                    <Text style={styles.text}>Camera permission is required</Text>
                    <TouchableOpacity style={styles.button} onPress={requestPermission}>
                        <Text style={styles.buttonText}>Grant Permission</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, { marginTop: 12, backgroundColor: '#64748b' }]}
                        onPress={() => (customUser?.regionId ? navigation.goBack() : setStep('region'))}
                    >
                        <Text style={styles.buttonText}>Back</Text>
                    </TouchableOpacity>
                </View>
                <View style={{ height: insets.bottom }} />
            </SafeAreaView>
        );
    }

    if (step === 'confirm' && detectedPerson) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <ChevronLeft color="white" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Mark Attendance</Text>
                    <View style={{ width: 44 }} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.detectedCard}>
                        <View style={styles.detectedHeader}>
                            <User color="#2563eb" size={48} />
                            <Text style={styles.detectedTitle}>Confirm Attendance</Text>
                        </View>
                        
                        <View style={styles.detectedInfo}>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Staff Name:</Text>
                                <Text style={styles.infoValue}>{detectedPerson.name}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Employee ID:</Text>
                                <Text style={styles.infoValue}>{detectedPerson.emp_id}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Site:</Text>
                                <Text style={styles.infoValue}>{selectedSiteDoc?.name || 'Manual Entry'}</Text>
                            </View>
                            {selectedShift && (
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Shift:</Text>
                                    <Text style={styles.infoValue}>{selectedShift.name}</Text>
                                </View>
                            )}
                        </View>

                        {checkingStatus ? (
                            <View style={styles.statusChecking}>
                                <ActivityIndicator color="#2563eb" />
                                <Text style={styles.statusCheckingText}>Checking status...</Text>
                            </View>
                        ) : attendanceStatus ? (
                            <View style={styles.attendanceStatus}>
                                {attendanceStatus.fullyDone ? (
                                    <View style={[styles.statusBadge, { backgroundColor: '#f0f9ff', width: '100%', padding: 16, borderRadius: 12 }]}>
                                        <CheckCircle color="#10b981" size={24} />
                                        <Text style={[styles.statusText, { color: '#064e3b' }]}>Work Completed for Today</Text>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={[
                                            styles.actionButton, 
                                            attendanceStatus.checked_in ? styles.checkOutButton : styles.checkInButton,
                                            { width: '100%', height: 60 }
                                        ]}
                                        onPress={() => handleMarkAttendance(attendanceStatus.checked_in ? 'check_out' : 'check_in')}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <Text style={styles.actionButtonText}>
                                                {attendanceStatus.checked_in ? 'CONFIRM CHECK OUT' : 'CONFIRM CHECK IN'}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : null}
                    </View>

                    <TouchableOpacity 
                        style={{ marginTop: 24, padding: 16, alignItems: 'center' }}
                        onPress={() => setStep('site')}
                    >
                        <Text style={{ color: '#2563eb', fontWeight: 'bold' }}>Change Site/Shift</Text>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <>
                <Modal visible={!!pickMatches?.length} transparent animationType="fade" onRequestClose={() => setPickMatches(null)}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { maxHeight: '72%' }]}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Multiple matches</Text>
                                <TouchableOpacity onPress={() => setPickMatches(null)}>
                                    <Text style={styles.modalClose}>Cancel</Text>
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={pickMatches || []}
                                keyExtractor={(item, i) => `${item.emp_id}-${i}`}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.regionOption}
                                        onPress={() => {
                                            setDetectedPerson({
                                                emp_id: item.emp_id,
                                                name: item.name,
                                                match_score: item.match_score,
                                                face_encoding_id: item.face_encoding_id,
                                            });
                                            mergeMatchesIntoScanned([item]);
                                            setPickMatches(null);
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.regionOptionText}>{item.name}</Text>
                                            <Text style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>ID {item.emp_id}</Text>
                                        </View>
                                        <ChevronLeft color="#64748b" size={18} style={{ transform: [{ rotate: '180deg' }] }} />
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    </View>
                </Modal>
                <View style={{ height: insets.bottom }} />
            </>
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
        marginBottom: 8,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 24,
    },
    regionButton: {
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    regionButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    regionButtonText: {
        color: 'white',
        fontSize: 16,
    },
    regionPlaceholder: {
        color: '#64748b',
    },
    continueButton: {
        backgroundColor: '#2563eb',
        padding: 18,
        borderRadius: 16,
        alignItems: 'center',
    },
    disabled: {
        opacity: 0.5,
    },
    continueButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
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
    faceFrame: {
        width: 280,
        height: 280,
        position: 'relative',
    },
    frameCorner: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderColor: '#2563eb',
    },
    topLeft: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
    },
    topRight: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
    },
    instructionText: {
        color: 'white',
        fontSize: 16,
        marginTop: 20,
        textAlign: 'center',
    },
    cameraFooter: {
        paddingBottom: 60,
        alignItems: 'center',
    },
    captureButton: {
        backgroundColor: '#2563eb',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 24,
    },
    liveScanBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    liveScanBtnOn: {
        borderColor: '#34d399',
        backgroundColor: 'rgba(16,185,129,0.15)',
    },
    captureButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    scannedStrip: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        maxHeight: 100,
    },
    scannedStripLabel: {
        color: '#93c5fd',
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    scannedChipsRow: {
        flexDirection: 'row',
        gap: 8,
        paddingRight: 8,
    },
    batchSelectPanel: {
        paddingHorizontal: 12,
        paddingBottom: 6,
        maxHeight: 120,
        backgroundColor: 'rgba(2,6,23,0.55)',
    },
    personChip: {
        position: 'relative',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(15,23,42,0.92)',
        borderWidth: 2,
        borderColor: 'rgba(59,130,246,0.35)',
        maxWidth: 160,
    },
    personChipSelected: {
        borderColor: '#34d399',
        backgroundColor: 'rgba(16,185,129,0.18)',
    },
    chipCheck: { position: 'absolute', top: 6, right: 6 },
    personChipName: { color: '#fff', fontSize: 14, fontWeight: '700', paddingRight: 16 },
    personChipId: { color: '#64748b', fontSize: 11, marginTop: 4, fontWeight: '600' },
    detectedContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    detectedCard: {
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    detectedHeader: {
        alignItems: 'center',
        marginBottom: 20,
    },
    detectedTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        marginTop: 12,
    },
    detectedInfo: {
        marginBottom: 20,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    infoLabel: {
        fontSize: 14,
        color: '#64748b',
    },
    infoValue: {
        fontSize: 14,
        color: 'white',
        fontWeight: '600',
    },
    statusChecking: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    statusCheckingText: {
        color: '#64748b',
        marginTop: 12,
    },
    attendanceStatus: {
        marginTop: 20,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        marginBottom: 16,
    },
    statusText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        gap: 8,
        marginBottom: 12,
    },
    checkInButton: {
        backgroundColor: '#10b981',
    },
    checkOutButton: {
        backgroundColor: '#ef4444',
    },
    actionButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    retryButton: {
        padding: 12,
        alignItems: 'center',
    },
    retryButtonText: {
        color: '#64748b',
        fontSize: 14,
    },
    doneHint: {
        color: '#94a3b8',
        fontSize: 13,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 18,
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
