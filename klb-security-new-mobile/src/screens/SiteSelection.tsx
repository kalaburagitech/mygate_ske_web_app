import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { siteService, regionService } from '../services/api';
import { Building2, Search, MapPin, ChevronRight, ArrowLeft, CheckCircle } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { usePatrolStore } from '../store/usePatrolStore';
import { useCustomAuth } from '../context/AuthContext';
import { Modal, ScrollView } from 'react-native';
import { isAdministrativeRole } from '../utils/roleUtils';
import { visitTypeLabel } from '../utils/visitTypes';

export default function SiteSelection() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { userId, organizationId, customUser } = useCustomAuth();
    const [sites, setSites] = useState<any[]>([]);
    const [regions, setRegions] = useState<any[]>([]);
    const { lastRegionId, lastCity, setLastSelection } = usePatrolStore();
    
    // Fallback to user profile if store is empty
    const initialRegion = lastRegionId || customUser?.regionId || null;
    const initialCity = lastCity || customUser?.city || null;

    const [selectedRegionId, setSelectedRegionId] = useState<string | null>(initialRegion);
    const [selectedCity, setSelectedCity] = useState<string | null>(initialCity);
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showCityPicker, setShowCityPicker] = useState(false);
    const { isVisit, visitType } = route.params || {};

    /** New visit: city + sites only (region comes from profile / site data). */
    const isVisitFlow =
        Boolean(isVisit) && Boolean(visitType) && String(visitType) !== 'setup';

    const [visitFlowSites, setVisitFlowSites] = useState<any[]>([]);
    const [visitFlowLoading, setVisitFlowLoading] = useState(isVisitFlow);
    const [selectedVisitCity, setSelectedVisitCity] = useState<string | null>(null);
    const [visitSearchQuery, setVisitSearchQuery] = useState('');
    const visitCityInitRef = useRef(false);

    const [step, setStep] = useState<'region' | 'city' | 'site'>(
        initialRegion ? (initialCity ? 'site' : 'city') : 'region'
    );

    // Auth state loads async; if the role changes to admin after first render,
    // reset region/city filters and jump directly to the site list.

    useEffect(() => {
        const fetchRegions = async () => {
            try {
                const response = await regionService.getRegions();
                setRegions(response.data || []);
            } catch (error) {
                console.error("Error fetching regions:", error);
            }
        };
        if (!isVisitFlow) fetchRegions();
    }, [isVisitFlow]);

    useEffect(() => {
        if (!isVisitFlow || !userId) return;
        visitCityInitRef.current = false;
        setVisitFlowLoading(true);
        let cancelled = false;
        (async () => {
            try {
                const adminWide = isAdministrativeRole(customUser) && !customUser?.regionId;
                const response = adminWide
                    ? await siteService.getAllSites()
                    : await siteService.getSitesByUser(
                          userId,
                          customUser?.regionId || undefined,
                          undefined
                      );
                const data = response.data || [];
                if (!cancelled) setVisitFlowSites(data);
            } catch (error) {
                console.error('Error fetching visit sites:', error);
                if (!cancelled) setVisitFlowSites([]);
            } finally {
                if (!cancelled) setVisitFlowLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isVisitFlow, userId, customUser?.regionId, customUser]);

    const visitCities = useMemo(() => {
        const s = new Set<string>();
        visitFlowSites.forEach((x: any) => {
            const c = x?.city?.trim();
            if (c) s.add(c);
        });
        return Array.from(s).sort((a, b) => a.localeCompare(b));
    }, [visitFlowSites]);

    const visitHasUncategorized = useMemo(
        () => visitFlowSites.some((x: any) => !x?.city?.trim()),
        [visitFlowSites]
    );

    useEffect(() => {
        visitCityInitRef.current = false;
        setSelectedVisitCity(null);
    }, [visitType]);

    useEffect(() => {
        if (!isVisitFlow || visitFlowLoading || visitCityInitRef.current) return;
        if (visitCities.length === 0 && !visitHasUncategorized) return;
        visitCityInitRef.current = true;
        const pref = customUser?.city?.trim();
        if (pref && visitCities.includes(pref)) setSelectedVisitCity(pref);
        else if (visitCities.length > 0) setSelectedVisitCity(visitCities[0]);
        else if (visitHasUncategorized) setSelectedVisitCity('__OTHER__');
    }, [isVisitFlow, visitFlowLoading, visitCities, visitHasUncategorized, customUser?.city]);

    const visitFilteredSites = useMemo(() => {
        let list = visitFlowSites;
        if (selectedVisitCity === '__OTHER__') {
            list = list.filter((x: any) => !x?.city?.trim());
        } else if (selectedVisitCity) {
            list = list.filter((x: any) => (x?.city || '').trim() === selectedVisitCity);
        }
        const q = visitSearchQuery.trim().toLowerCase();
        if (!q) return list;
        return list.filter(
            (site: any) =>
                (site.name || '').toLowerCase().includes(q) ||
                (site.locationName || '').toLowerCase().includes(q) ||
                (site.city || '').toLowerCase().includes(q)
        );
    }, [visitFlowSites, selectedVisitCity, visitSearchQuery]);

    React.useEffect(() => {
        if (isVisitFlow || !userId || step !== 'site') return;
        const fetchSites = async () => {
            try {
                const isAdminUser = isAdministrativeRole(customUser);
                const fetchMethod = isAdminUser
                    ? siteService.getAllSites()
                    : siteService.getSitesByUser(userId, selectedRegionId || undefined, selectedCity || undefined);

                const response = await fetchMethod;
                let data = response.data || [];

                if (isAdminUser) {
                    const regionNorm = selectedRegionId ? selectedRegionId.toLowerCase().trim() : null;
                    const cityNorm = selectedCity ? selectedCity.toLowerCase().trim() : null;

                    data = data.filter((site: any) => {
                        const siteRegionNorm = site?.regionId ? String(site.regionId).toLowerCase().trim() : '';
                        const siteCityNorm = site?.city ? String(site.city).toLowerCase().trim() : '';

                        if (regionNorm && siteRegionNorm !== regionNorm) return false;
                        if (cityNorm && siteCityNorm !== cityNorm) return false;
                        return true;
                    });
                }

                setSites(data);
            } catch (error) {
                console.error('Error fetching sites:', error);
            }
        };
        fetchSites();
    }, [userId, customUser, step, selectedRegionId, selectedCity, isVisitFlow]);
    const [searchQuery, setSearchQuery] = useState('');
    const setCurrentSite = usePatrolStore((state) => state.setCurrentSite);

    const filteredSites = sites?.filter(
        (site) =>
            (site.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (site.locationName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectSite = (site: any) => {
        setCurrentSite(site);
        if (visitType === 'setup') {
            navigation.navigate('QRScanner', { 
                mode: 'setup',
                siteId: site._id,
                siteName: site.name,
            });
        } else if (visitType) {
            navigation.navigate('VisitForm', {
                type: visitType,
                siteId: site._id,
                siteName: site.name,
                siteLat: site.latitude,
                siteLng: site.longitude,
                allowedRadius: site.allowedRadius || 100,
                organizationId: customUser?.organizationId,
                isManual: true,
            });
        } else {
            navigation.navigate('PatrolStart', { 
                isVisit: isVisit,
                selectedSite: site 
            });
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.backgroundOrbs} pointerEvents="none">
                <View style={styles.orbA} />
                <View style={styles.orbB} />
            </View>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color="white" size={24} />
                </TouchableOpacity>
                <View>
                    <Text style={styles.title}>
                        {isVisitFlow
                            ? visitTypeLabel(String(visitType))
                            : isVisit
                              ? visitType === 'setup'
                                  ? 'QR Tool Setup'
                                  : `${visitType} Visit`
                              : 'Select Site'}
                    </Text>
                    <Text style={styles.subTitle}>
                        {isVisitFlow
                            ? 'Pick a city, then choose a site in that city'
                            : isVisit
                              ? `Choose a site for ${visitType === 'setup' ? 'QR configuration' : 'inspection'}`
                              : 'Choose a location to start patrol'}
                    </Text>
                </View>
            </View>

            {isVisitFlow ? (
                <>
                    {visitFlowLoading ? (
                        <View style={styles.visitLoading}>
                            <ActivityIndicator color="#3b82f6" size="large" />
                            <Text style={styles.visitLoadingTxt}>Loading sites…</Text>
                        </View>
                    ) : (
                        <View style={{ flex: 1 }}>
                            <View style={styles.visitCitySection}>
                                <Text style={styles.visitCityHeading}>City</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.visitChipRow}
                                >
                                    {visitCities.map((city) => (
                                        <TouchableOpacity
                                            key={city}
                                            style={[
                                                styles.visitChip,
                                                selectedVisitCity === city && styles.visitChipActive,
                                            ]}
                                            onPress={() => setSelectedVisitCity(city)}
                                        >
                                            <Text
                                                style={[
                                                    styles.visitChipTxt,
                                                    selectedVisitCity === city && styles.visitChipTxtActive,
                                                ]}
                                            >
                                                {city}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                    {visitHasUncategorized ? (
                                        <TouchableOpacity
                                            style={[
                                                styles.visitChip,
                                                selectedVisitCity === '__OTHER__' && styles.visitChipActive,
                                            ]}
                                            onPress={() => setSelectedVisitCity('__OTHER__')}
                                        >
                                            <Text
                                                style={[
                                                    styles.visitChipTxt,
                                                    selectedVisitCity === '__OTHER__' && styles.visitChipTxtActive,
                                                ]}
                                            >
                                                Other
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </ScrollView>
                            </View>

                            <View style={styles.searchContainer}>
                                <Search color="#94a3b8" size={18} style={styles.searchIcon} />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search sites"
                                    placeholderTextColor="#64748b"
                                    value={visitSearchQuery}
                                    onChangeText={setVisitSearchQuery}
                                />
                            </View>

                            <FlatList
                                style={{ flex: 1 }}
                                data={visitFilteredSites}
                                keyExtractor={(item) => item._id}
                                contentContainerStyle={styles.listContent}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.siteItem}
                                        onPress={() => handleSelectSite(item)}
                                    >
                                        <View style={styles.iconContainer}>
                                            <Building2 color="#3b82f6" size={22} />
                                        </View>
                                        <View style={styles.info}>
                                            <Text style={styles.siteName}>{item.name}</Text>
                                            <View style={styles.locationRow}>
                                                <MapPin color="#94a3b8" size={14} />
                                                <Text style={styles.location}>
                                                    {(item.city || '—') + (item.locationName ? ` · ${item.locationName}` : '')}
                                                </Text>
                                            </View>
                                        </View>
                                        <ChevronRight color="#334155" size={20} />
                                    </TouchableOpacity>
                                )}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <Text style={styles.emptyText}>
                                            {selectedVisitCity
                                                ? 'No sites for this city'
                                                : 'No sites available'}
                                        </Text>
                                    </View>
                                }
                            />
                        </View>
                    )}
                </>
            ) : step === 'region' ? (
                <View style={{ flex: 1, paddingHorizontal: 24 }}>
                    <Text style={styles.sectionTitle}>Select Region</Text>
                    <TouchableOpacity
                        style={styles.regionSelectorBtn}
                        onPress={() => setShowRegionPicker(true)}
                    >
                        <Text style={[styles.regionBtnText, !selectedRegionId && { color: '#64748b' }]}>
                            {selectedRegionId ? regions.find(r => r.regionId === selectedRegionId)?.regionName : "Choose a region..."}
                        </Text>
                        <ChevronRight color="#64748b" size={20} style={{ transform: [{ rotate: showRegionPicker ? '90deg' : '0deg' }] }} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.continueBtn, !selectedRegionId && { opacity: 0.5 }]}
                        onPress={() => selectedRegionId && setStep('city')}
                        disabled={!selectedRegionId}
                    >
                        <Text style={styles.continueBtnText}>Continue to Select City</Text>
                    </TouchableOpacity>
                </View>
            ) : step === 'city' ? (
                <View style={{ flex: 1, paddingHorizontal: 24 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 }}>
                        <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>Select City</Text>
                        <TouchableOpacity onPress={() => setStep('region')}>
                            <Text style={{ color: '#3b82f6', fontSize: 12 }}>Change Region</Text>
                        </TouchableOpacity>
                    </View>
                    
                    <TouchableOpacity
                        style={styles.regionSelectorBtn}
                        onPress={() => setShowCityPicker(true)}
                    >
                        <Text style={[styles.regionBtnText, !selectedCity && { color: '#64748b' }]}>
                            {selectedCity || "Choose a city..."}
                        </Text>
                        <ChevronRight color="#64748b" size={20} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.continueBtn, !selectedCity && { opacity: 0.5 }]}
                        onPress={() => selectedCity && setStep('site')}
                        disabled={!selectedCity}
                    >
                        <Text style={styles.continueBtnText}>View Sites</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <>
                    <View style={styles.searchContainer}>
                        <Search color="#94a3b8" size={18} style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search by site or location"
                            placeholderTextColor="#64748b"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>

                    <View style={styles.filterSummary}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.filterLabel}>Current Filter</Text>
                            <Text style={styles.filterValue}>
                                {regions.find(r => r.regionId === selectedRegionId)?.regionName || 'All Regions'}
                                {selectedCity ? ` • ${selectedCity}` : ''}
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity onPress={() => setStep('city')}>
                                <Text style={styles.changeFilterText}>City</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setStep('region')}>
                                <Text style={styles.changeFilterText}>Region</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <FlatList
                        data={filteredSites}
                        keyExtractor={(item) => item._id}
                        contentContainerStyle={styles.listContent}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.siteItem}
                                onPress={() => handleSelectSite(item)}
                            >
                                <View style={styles.iconContainer}>
                                    <Building2 color="#3b82f6" size={22} />
                                </View>
                                <View style={styles.info}>
                                    <Text style={styles.siteName}>{item.name}</Text>
                                    <View style={styles.locationRow}>
                                        <MapPin color="#94a3b8" size={14} />
                                        <Text style={styles.location}>{item.locationName}</Text>
                                    </View>
                                    <View style={styles.badgeRow}>
                                        <View style={styles.badge}>
                                            <Text style={styles.badgeText}>Ready</Text>
                                        </View>
                                        <Text style={styles.badgeSub}>Patrol zone active</Text>
                                    </View>
                                </View>
                                <ChevronRight color="#334155" size={20} />
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>No sites found matching your search</Text>
                            </View>
                        }
                    />
                </>
            )}

            {!isVisitFlow ? (
                <>
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
                                <Text style={styles.modalClose}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView>
                            <TouchableOpacity
                                style={[styles.regionOption, !selectedRegionId && styles.regionOptionSelected]}
                                onPress={() => {
                                    setSelectedRegionId(null);
                                    setSelectedCity(null);
                                    setLastSelection(null, null);
                                    setShowRegionPicker(false);
                                }}
                            >
                                <Text style={[styles.regionOptionText, !selectedRegionId && styles.regionOptionTextSelected]}>
                                    All Regions
                                </Text>
                            </TouchableOpacity>
                            {regions.map((r) => (
                                <TouchableOpacity
                                    key={r.regionId}
                                    style={[styles.regionOption, selectedRegionId === r.regionId && styles.regionOptionSelected]}
                                    onPress={() => {
                                        setSelectedRegionId(r.regionId);
                                        setSelectedCity(null); // Reset city when region changes
                                        setLastSelection(r.regionId, null);
                                        setShowRegionPicker(false);
                                    }}
                                >
                                    <Text style={[styles.regionOptionText, selectedRegionId === r.regionId && styles.regionOptionTextSelected]}>
                                        {r.regionName}
                                    </Text>
                                    {selectedRegionId === r.regionId && <CheckCircle color="#2563eb" size={20} />}
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
                                <Text style={styles.modalClose}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView>
                            <TouchableOpacity
                                style={[styles.regionOption, !selectedCity && styles.regionOptionSelected]}
                                onPress={() => {
                                    setSelectedCity(null);
                                    setLastSelection(selectedRegionId, null);
                                    setShowCityPicker(false);
                                }}
                            >
                                <Text style={[styles.regionOptionText, !selectedCity && styles.regionOptionTextSelected]}>
                                    All Cities
                                </Text>
                            </TouchableOpacity>
                            {regions.find(r => r.regionId === selectedRegionId)?.cities?.map((city: string) => (
                                <TouchableOpacity
                                    key={city}
                                    style={[styles.regionOption, selectedCity === city && styles.regionOptionSelected]}
                                    onPress={() => {
                                        setSelectedCity(city);
                                        setLastSelection(selectedRegionId, city);
                                        setShowCityPicker(false);
                                    }}
                                >
                                    <Text style={[styles.regionOptionText, selectedCity === city && styles.regionOptionTextSelected]}>
                                        {city}
                                    </Text>
                                    {selectedCity === city && <CheckCircle color="#2563eb" size={20} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
                </>
            ) : null}
            <View style={{ height: insets.bottom }} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    backgroundOrbs: {
        ...StyleSheet.absoluteFillObject,
        zIndex: -1,
    },
    orbA: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: 'rgba(59, 130, 246, 0.16)',
        top: -120,
        right: -60,
    },
    orbB: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: 'rgba(148, 163, 184, 0.1)',
        bottom: -100,
        left: -40,
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
    subTitle: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 4,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        marginHorizontal: 24,
        paddingHorizontal: 16,
        borderRadius: 18,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        height: 56,
        color: 'white',
        fontSize: 16,
    },
    listContent: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    siteItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        padding: 16,
        borderRadius: 26,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        gap: 16,
    },
    iconContainer: {
        width: 50,
        height: 50,
        borderRadius: 18,
        backgroundColor: 'rgba(59, 130, 246, 0.16)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    info: {
        flex: 1,
    },
    siteName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    location: {
        fontSize: 14,
        color: '#64748b',
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },
    badge: {
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        color: '#10b981',
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    badgeSub: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 20,
        marginTop: 10,
    },
    regionSelectorBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#0f172a',
        padding: 20,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
        marginBottom: 24,
    },
    regionBtnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    continueBtn: {
        backgroundColor: '#3b82f6',
        paddingVertical: 18,
        borderRadius: 18,
        alignItems: 'center',
        shadowColor: "#3b82f6",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    continueBtnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#0f172a',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingBottom: 40,
        maxHeight: '60%',
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
        color: '#3b82f6',
        fontSize: 16,
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
        color: 'white',
        fontSize: 16,
    },
    regionOptionTextSelected: {
        color: '#3b82f6',
        fontWeight: 'bold',
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 64,
    },
    emptyText: {
        color: '#64748b',
        fontSize: 16,
    },
    filterSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        marginHorizontal: 24,
        padding: 16,
        borderRadius: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    filterLabel: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    filterValue: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 2,
    },
    changeFilterText: {
        color: '#3b82f6',
        fontSize: 12,
        fontWeight: 'bold',
    },
    visitLoading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    visitLoadingTxt: { color: '#94a3b8', fontSize: 14 },
    visitCitySection: { paddingHorizontal: 24, marginBottom: 12 },
    visitCityHeading: {
        color: '#64748b',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 10,
        textTransform: 'uppercase',
    },
    visitChipRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
    visitChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    visitChipActive: {
        borderColor: 'rgba(59, 130, 246, 0.5)',
        backgroundColor: 'rgba(59, 130, 246, 0.18)',
    },
    visitChipTxt: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
    visitChipTxtActive: { color: '#fff' },
});
