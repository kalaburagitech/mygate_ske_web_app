import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, QrCode, Building2, MapPin, ChevronRight, Search, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { siteService, pointService } from '../services/api';
import { useCustomAuth } from '../context/AuthContext';
import { isAdministrativeRole } from '../utils/roleUtils';
import * as Location from 'expo-location';

/** QR codes and patrol points per site (patrol field tools). Opened from Patrol hub. */
export default function PatrolQRScreen() {
    const navigation = useNavigation<any>();
    const { userId, customUser, organizationId } = useCustomAuth();
    const isAdmin = isAdministrativeRole(customUser);
    const [selectedSiteId, setSelectedSiteId] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isUpdatingSite, setIsUpdatingSite] = useState(false);

    const [sites, setSites] = useState<any[]>([]);
    const [points, setPoints] = useState<any[]>([]);

    React.useEffect(() => {
        if (userId && organizationId) {
            const fetchPromise = isAdmin ? siteService.getAllSites() : siteService.getSitesByUser(userId);

            fetchPromise
                .then((res) => {
                    setSites(res.data || []);
                })
                .catch((err) => {
                    console.error('Error fetching sites:', err);
                    setSites([]);
                });
        }
    }, [userId, organizationId, isAdmin]);

    React.useEffect(() => {
        if (selectedSiteId) {
            pointService
                .getPointsBySite(selectedSiteId)
                .then((res) => setPoints(res.data))
                .catch((err) => console.error('Error fetching points:', err));
        } else {
            setPoints([]);
        }
    }, [selectedSiteId]);

    const updateSiteLoc = async (_data: any) => {
        console.log('Mocked updateSiteLoc');
    };
    const filteredSites = sites?.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleUpdateSiteLocation = async (siteId: string) => {
        setIsUpdatingSite(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Error', 'Location permission is required.');
                setIsUpdatingSite(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

            Alert.alert('Update Site Location', "Set this site's center coordinates to your current position?", [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Update',
                    onPress: async () => {
                        try {
                            await updateSiteLoc({
                                id: siteId as any,
                                latitude: location.coords.latitude,
                                longitude: location.coords.longitude,
                            });
                            Alert.alert('Success', 'Site location updated!');
                        } catch (e) {
                            Alert.alert('Error', 'Failed to update location.');
                        }
                    },
                },
            ]);
        } catch (error) {
            Alert.alert('Error', 'Could not detect location.');
        } finally {
            setIsUpdatingSite(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color="white" size={24} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title}>QR & patrol points</Text>
                    <Text style={styles.subtitle}>Patrol</Text>
                </View>
            </View>

            {!selectedSiteId ? (
                <View style={styles.mainContent}>
                    <View style={styles.searchBar}>
                        <Search color="#64748b" size={20} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Find a site..."
                            placeholderTextColor="#475569"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <X color="#64748b" size={18} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <Text style={styles.sectionTitle}>Select a Site</Text>
                    <FlatList
                        data={filteredSites}
                        keyExtractor={(item) => item._id}
                        contentContainerStyle={styles.siteList}
                        renderItem={({ item: site }) => (
                            <TouchableOpacity style={styles.siteCard} onPress={() => setSelectedSiteId(site._id)}>
                                <View style={styles.siteInfo}>
                                    <Building2 color="#3b82f6" size={24} />
                                    <View>
                                        <Text style={styles.siteName}>{site.name}</Text>
                                        <Text style={styles.orgName}>{site.locationName}</Text>
                                    </View>
                                </View>
                                <ChevronRight color="#1e293b" size={20} />
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>
                                    No sites found matching &quot;{searchQuery}&quot;
                                </Text>
                            </View>
                        }
                    />
                </View>
            ) : (
                <View style={styles.mainContent}>
                    <View style={styles.siteHeaderWrapper}>
                        <TouchableOpacity style={styles.siteHeader} onPress={() => setSelectedSiteId(null)}>
                            <Building2 color="#3b82f6" size={20} />
                            <Text style={styles.selectedSiteName}>
                                {sites?.find((s) => s._id === selectedSiteId)?.name}
                            </Text>
                            <Text style={styles.changeText}>Change Site</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.siteLocationBtn}
                            onPress={() => handleUpdateSiteLocation(selectedSiteId)}
                            disabled={isUpdatingSite}
                        >
                            <MapPin color={isUpdatingSite ? '#64748b' : '#3b82f6'} size={16} />
                            <Text style={styles.siteLocationText}>
                                {isUpdatingSite ? 'Checking...' : 'Update Site GPS'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.pointsHeader}>
                        <Text style={styles.sectionTitle}>Patrol Points</Text>
                        <TouchableOpacity
                            style={styles.addBtn}
                            onPress={() => {
                                const site = sites?.find((s) => s._id === selectedSiteId);
                                if (site) {
                                    navigation.navigate('PatrolAddPointName', { site });
                                }
                            }}
                        >
                            <Plus color="white" size={20} />
                            <Text style={styles.addBtnText}>New Point</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.pointsList}>
                        {points?.map((point) => (
                            <TouchableOpacity
                                key={point._id}
                                style={styles.pointCard}
                                onPress={() =>
                                    navigation.navigate('QRScanner', {
                                        mode: 'setup',
                                        siteId: selectedSiteId,
                                        pointId: point._id,
                                        pointName: point.name,
                                    })
                                }
                            >
                                <View style={styles.pointInfo}>
                                    <View style={styles.qrIconBox}>
                                        <QrCode color="#3b82f6" size={24} />
                                    </View>
                                    <View style={styles.pointDetails}>
                                        <Text style={styles.pointLabel}>{point.name}</Text>
                                        <Text style={styles.pointCode}>
                                            {point.qrCode ? `QR: ${point.qrCode}` : 'Not Configured'}
                                        </Text>
                                    </View>
                                </View>
                                <ChevronRight color="#1e293b" size={20} />
                            </TouchableOpacity>
                        ))}
                        {points?.length === 0 && (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No QR points configured for this site.</Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 24, gap: 16 },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: { fontSize: 20, fontWeight: 'bold', color: 'white' },
    subtitle: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '600' },
    mainContent: { flex: 1, paddingHorizontal: 24 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        gap: 12,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    searchInput: { flex: 1, color: 'white', fontSize: 16 },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 16,
    },
    siteList: { gap: 12 },
    siteCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#0f172a',
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    siteInfo: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    siteName: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    orgName: { color: '#64748b', fontSize: 12, marginTop: 2 },
    selectedSiteName: { color: '#3b82f6', fontSize: 16, fontWeight: 'bold', flex: 1 },
    changeText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
    siteHeaderWrapper: {
        marginBottom: 24,
        gap: 8,
    },
    siteHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        padding: 16,
        borderRadius: 20,
        gap: 12,
    },
    siteLocationBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
        alignSelf: 'flex-start',
        marginLeft: 4,
    },
    siteLocationText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    pointsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2563eb',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        gap: 8,
    },
    addBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
    pointsList: { gap: 12, paddingBottom: 40 },
    pointCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#0f172a',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    pointInfo: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
    qrIconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pointDetails: { flex: 1 },
    pointLabel: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    pointCode: { color: '#64748b', fontSize: 12, marginTop: 2 },
    emptyState: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: '#475569', fontSize: 14, textAlign: 'center' },
});
