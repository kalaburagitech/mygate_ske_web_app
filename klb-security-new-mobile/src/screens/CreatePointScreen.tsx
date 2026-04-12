import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, MapPin, QrCode, CheckCircle, RefreshCw, Building2 } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useCustomAuth } from '../context/AuthContext';
import { pointService } from '../services/api';

export default function CreatePointScreen({ navigation, route }: any) {
    const { organizationId } = useCustomAuth();
    const { mode, siteId, siteName, pointId, pointName, qrCode, lat, lng } = route.params || {};

    const [name, setName] = useState(pointName || '');
    const [loading, setLoading] = useState(false);
    const [isDetecting, setIsDetecting] = useState(false);
    const [currentLat, setCurrentLat] = useState(lat || '');
    const [currentLng, setCurrentLng] = useState(lng || '');



    const detectLocation = async () => {
        setIsDetecting(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission denied", "Location access is needed.");
                setIsDetecting(false);
                return;
            }

            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });
            setCurrentLat(loc.coords.latitude.toString());
            setCurrentLng(loc.coords.longitude.toString());
        } catch (error) {
            Alert.alert("Error", "Could not detect location.");
        } finally {
            setIsDetecting(false);
        }
    };

    const handleSubmit = async () => {
        if (!name) {
            Alert.alert("Error", "Please provide a name for this point.");
            return;
        }

        const latN = currentLat.trim() ? parseFloat(String(currentLat)) : NaN;
        const lngN = currentLng.trim() ? parseFloat(String(currentLng)) : NaN;

        setLoading(true);
        try {
            if (pointId) {
                if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
                    Alert.alert(
                        'Location required',
                        'Use “Detect Current Location” or enter valid latitude and longitude to update this point.'
                    );
                    setLoading(false);
                    return;
                }
                await pointService.updatePoint({
                    id: pointId,
                    name,
                    qrCode,
                    latitude: latN,
                    longitude: lngN,
                });
                Alert.alert('Success', 'Point updated successfully.', [
                    {
                        text: 'OK',
                        onPress: () =>
                            navigation.navigate('PatrolSiteDetail', {
                                site: { _id: siteId, name: siteName || 'Site' },
                            }),
                    },
                ]);
            } else {
                if (!organizationId) {
                    Alert.alert('Error', 'Organization is missing. Sign in again or contact support.');
                    setLoading(false);
                    return;
                }
                if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
                    Alert.alert(
                        'GPS required',
                        'Patrol checkpoints need latitude and longitude. Use “Detect Current Location” or enter both values.'
                    );
                    setLoading(false);
                    return;
                }
                const payload: Record<string, unknown> = {
                    siteId: siteId,
                    name,
                    qrCode,
                    organizationId: organizationId,
                    latitude: latN,
                    longitude: lngN,
                };
                await pointService.createPoint(payload);
                const r = 200;
                Alert.alert(
                    'Point added',
                    `"${name.trim()}" is linked to ${siteName || 'this site'} with your phone’s GPS at this spot (not the site centre). Patrol scans must be within about ${Math.round(r)}m of here.`,
                    [
                        {
                            text: 'OK',
                            onPress: () =>
                                navigation.navigate('PatrolSiteDetail', {
                                    site: { _id: siteId, name: siteName || 'Site' },
                                }),
                        },
                    ]
                );
            }
        } catch (error: any) {
            const msg = error?.response?.data?.detail || error?.response?.data?.error || error.message;
            Alert.alert(
                'Could not save point',
                typeof msg === 'string'
                    ? msg
                    : 'Check your connection and that this QR is not already used. Try again.'
            );
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
                <Text style={styles.title}>Configure Point</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.infoCard}>
                    <Text style={styles.infoLabel}>SITE NAME</Text>
                    <View style={styles.qrRow}>
                        <Building2 color="#3b82f6" size={20} />
                        <Text style={styles.qrData}>{siteName || "General Site"}</Text>
                    </View>
                </View>

                <View style={[styles.infoCard, { borderLeftWidth: 4, borderLeftColor: '#3b82f6', opacity: 0.8 }]}>
                    <Text style={styles.infoLabel}>QR CODE DETECTED (READ-ONLY)</Text>
                    <View style={styles.qrRow}>
                        <QrCode color="#64748b" size={20} />
                        <Text style={[styles.qrData, { color: '#64748b' }]}>{qrCode}</Text>
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>POINT NAME</Text>
                    <View style={styles.inputBox}>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g., Gate Water Park"
                            placeholderTextColor="#475569"
                            value={name}
                            onChangeText={setName}
                        />
                    </View>
                </View>

                <View style={styles.locationContainer}>
                    <View style={styles.detectRow}>
                        <Text style={styles.label}>GEO LOCATION</Text>
                        <TouchableOpacity 
                            onPress={detectLocation} 
                            disabled={isDetecting}
                            style={styles.detectBtn}
                        >
                            {isDetecting ? (
                                <ActivityIndicator size="small" color="#3b82f6" />
                            ) : (
                                <>
                                    <RefreshCw color="#3b82f6" size={14} />
                                    <Text style={styles.detectText}>Detect Current Location</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                    
                    <View style={styles.locationCard}>
                        <View style={styles.locRow}>
                            <MapPin color="#22c55e" size={20} />
                            <View>
                                <Text style={styles.locValue}>Lat: {currentLat ? parseFloat(currentLat).toFixed(6) : '---'}</Text>
                                <Text style={styles.locValue}>Lng: {currentLng ? parseFloat(currentLng).toFixed(6) : '---'}</Text>
                            </View>
                        </View>
                        <Text style={styles.locHint}>
                            Your phone’s GPS at this checkpoint (refreshed when you open this screen). Not the site
                            centre. New points always get a 200m radius in the database; change it later under Patrol
                            Points on the web if needed. Patrol scans use that point radius only.
                        </Text>
                    </View>
                </View>

                <TouchableOpacity 
                    style={[styles.saveBtn, loading && styles.disabledBtn]} 
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <CheckCircle color="white" size={20} />
                            <Text style={styles.saveBtnText}>Save Configuration</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 24, gap: 16 },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    title: { fontSize: 24, fontWeight: 'bold', color: 'white' },
    content: { padding: 24, gap: 24 },
    infoCard: { backgroundColor: '#0f172a', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.2)' },
    infoLabel: { fontSize: 10, fontWeight: 'bold', color: '#3b82f6', letterSpacing: 1, marginBottom: 12 },
    qrRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    qrData: { color: 'white', fontSize: 16, fontWeight: '500' },
    inputGroup: { gap: 12 },
    label: { fontSize: 10, fontWeight: 'bold', color: '#64748b', letterSpacing: 1 },
    inputBox: { backgroundColor: '#0f172a', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 16 },
    input: { color: 'white', paddingVertical: 16, fontSize: 16 },
    locationCard: { backgroundColor: '#0f172a', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    locRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    locValue: { color: 'white', fontSize: 13, fontWeight: '500' },
    locHint: { color: '#22c55e', fontSize: 11, fontStyle: 'italic' },
    saveBtn: { backgroundColor: '#2563eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 24, gap: 12, marginTop: 20 },
    saveBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    disabledBtn: { opacity: 0.5 },
    locationContainer: { gap: 8 },
    detectRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    detectBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(59, 130, 246, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    detectText: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold' },
});
