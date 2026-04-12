import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// import { useMutation } from 'convex/react';
// import { api } from '../services/convex';
import { usePatrolStore } from '../store/usePatrolStore';
import { Play, ArrowLeft, Shield, MapPin, Clock } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCustomAuth } from '../context/AuthContext';
import { patrolSessionService } from '../services/api';

export default function PatrolStart() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const storeSite = usePatrolStore((state) => state.currentSite);
    const { isVisit, selectedSite } = route.params || {};
    
    // Site from route params (e.g. deep link) or patrol store
    const currentSite = selectedSite || storeSite;
    const { userId, organizationId: authOrgId, customUser } = useCustomAuth();
    const [loading, setLoading] = useState(false);

    if (!currentSite) return null;

    const handleStart = async () => {
        setLoading(true);
        try {
            usePatrolStore.getState().setCurrentSite(currentSite);
            if (isVisit) {
                navigation.navigate('QRScanner', {
                    isVisit: true,
                    siteId: currentSite._id,
                    siteName: currentSite.name,
                });
            } else {
                const guardConvexId = String(customUser?._id || userId || '').trim();
                const siteId = String(currentSite._id || '').trim();
                const orgId = String(currentSite.organizationId || authOrgId || '').trim();
                if (!guardConvexId) {
                    Alert.alert(
                        'Sign-in required',
                        'Your account has no user ID. Sign out and sign in again with OTP so patrol can start.'
                    );
                    setLoading(false);
                    return;
                }
                if (!orgId) {
                    Alert.alert(
                        'Missing organization',
                        'This site has no organization on record. Ask an admin to fix the site, or pick another site.'
                    );
                    setLoading(false);
                    return;
                }
                const { data } = await patrolSessionService.start(guardConvexId, siteId, orgId);
                const sid = data?.sessionId;
                if (!sid) throw new Error('No session id returned');
                usePatrolStore.getState().clearLastScannedPoints();
                usePatrolStore.getState().setSession({
                    id: sid,
                    siteId: currentSite._id,
                    siteName: currentSite.name,
                    startTime: Date.now(),
                    scannedPointIds: [],
                });
                navigation.navigate('QRScanner');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>{isVisit ? "Confirm Visit" : "Confirm Patrol"}</Text>
            </View>

            <View style={styles.content}>
                <View style={styles.heroCard}>
                    <View style={styles.shieldDecoration}>
                        <Shield color="#3b82f6" size={80} />
                    </View>
                    <Text style={styles.readyText}>{isVisit ? "Ready to start visit?" : "Ready to start duty?"}</Text>
                    <Text style={styles.descText}>
                        You are about to begin a {isVisit ? "visiting report" : "patrol session"} at {currentSite.name}.
                    </Text>
                </View>

                <View style={styles.detailsList}>
                    <View style={styles.detailItem}>
                        <MapPin color="#64748b" size={24} />
                        <View>
                            <Text style={styles.detailLabel}>Location</Text>
                            <Text style={styles.detailValue}>{currentSite.name}</Text>
                        </View>
                    </View>
                    <View style={styles.detailItem}>
                        <Clock color="#64748b" size={24} />
                        <View>
                            <Text style={styles.detailLabel}>Type</Text>
                            <Text style={styles.detailValue}>{isVisit ? "Training & Visit Report" : "Standard Patrol Session"}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.startBtn}
                        onPress={handleStart}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <Play color="white" size={24} fill="white" />
                                <Text style={styles.startText}>{isVisit ? "START VISIT NOW" : "START PATROL NOW"}</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    <Text style={styles.disclaimer}>
                        Your GPS location will be tracked during the session.
                    </Text>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 24,
        gap: 16,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
    },
    content: {
        flex: 1,
        padding: 24,
    },
    heroCard: {
        backgroundColor: '#0f172a',
        borderRadius: 32,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        marginBottom: 32,
    },
    shieldDecoration: {
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    readyText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
    },
    descText: {
        fontSize: 16,
        color: '#64748b',
        textAlign: 'center',
        marginTop: 12,
        lineHeight: 24,
    },
    detailsList: {
        gap: 20,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        backgroundColor: '#0f172a',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    detailLabel: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    detailValue: {
        fontSize: 16,
        color: 'white',
        fontWeight: '600',
        marginTop: 2,
    },
    footer: {
        marginTop: 'auto',
    },
    startBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563eb',
        padding: 20,
        borderRadius: 24,
        gap: 12,
    },
    startText: {
        color: 'white',
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 1,
    },
    disclaimer: {
        color: '#475569',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 16,
    },
});
