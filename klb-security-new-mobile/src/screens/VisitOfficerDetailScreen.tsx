import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Image,
    Modal,
    Pressable,
    ScrollView,
    type ImageStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { ArrowLeft, Clock, MapPin, Building2, Plus, Sun, GraduationCap, Moon, LogOut } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { logService, uploadService } from '../services/api';
import { useCustomAuth } from '../context/AuthContext';
import { showError, showSuccess } from '../utils/toastUtils';
import { visitTypeLabel } from '../utils/visitTypes';

const C = {
    bg: '#020617',
    card: '#0f172a',
    accent: '#2563eb',
    border: 'rgba(255, 255, 255, 0.06)',
    muted: '#64748b',
    white: '#ffffff',
};

const MS_7D = 7 * 24 * 60 * 60 * 1000;

function VisitTypeIcon({ visitType }: { visitType?: string }) {
    if (visitType === 'SiteCheckDay') return <Sun color="#fbbf24" size={14} />;
    if (visitType === 'SiteCheckNight') return <Moon color="#e2e8f0" size={14} />;
    if (visitType === 'Trainer') return <GraduationCap color="#60a5fa" size={14} />;
    return null;
}

function VisitLogImage({ imageId, style, onPress }: { imageId?: string; style: ImageStyle; onPress?: () => void }) {
    const [uri, setUri] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        if (!imageId) {
            setUri(null);
            return;
        }
        uploadService.getImageUrl(imageId).then((u) => {
            if (alive) setUri(u);
        });
        return () => {
            alive = false;
        };
    }, [imageId]);

    if (!uri) return null;
    const Img = <Image source={{ uri }} style={style} />;
    if (onPress) {
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
                {Img}
            </TouchableOpacity>
        );
    }
    return Img;
}

export default function VisitOfficerDetailScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { officerId, officerName } = route.params || {};
    const { customUser } = useCustomAuth();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [checkoutBusyId, setCheckoutBusyId] = useState<string | null>(null);

    const isSelf =
        Boolean(officerId && customUser?._id && String(officerId) === String(customUser._id));

    const load = useCallback(async () => {
        if (!officerId) {
            setLogs([]);
            setLoading(false);
            return;
        }
        try {
            const since = Date.now() - MS_7D;
            const res = await logService.getVisitLogsByUser(officerId, since, 200);
            setLogs(res.data || []);
        } catch (e) {
            console.error(e);
            showError('Visits', 'Could not load visit records.');
            setLogs([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [officerId]);

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    const formatDate = (ts: number) =>
        new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const formatTime = (ts: number) =>
        new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const goVisit = (visitType: string) => {
        setMenuOpen(false);
        navigation.navigate('SiteSelection', { isVisit: true, visitType });
    };

    const openImageById = async (id: string) => {
        const u = await uploadService.getImageUrl(id);
        if (u) setLightbox(u);
    };

    const checkoutVisit = async (logId: string) => {
        if (!customUser?._id) return;
        setCheckoutBusyId(logId);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                showError('Location', 'Allow location to check out.');
                return;
            }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            await logService.visitCheckOut(logId, {
                userId: customUser._id,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
            });
            showSuccess('Checked out', 'Visit closed.');
            await load();
        } catch (e: any) {
            showError('Check-out', e?.response?.data?.error || e?.message || 'Failed');
        } finally {
            setCheckoutBusyId(null);
        }
    };

    const renderItem = ({ item }: { item: any }) => {
        const urlThumbs: string[] = [];
        if (Array.isArray(item.imageUrls)) {
            for (const u of item.imageUrls) {
                if (typeof u === 'string' && u.trim()) urlThumbs.push(u);
            }
        }
        const ids: string[] = [];
        if (Array.isArray(item.imageIds)) {
            for (const x of item.imageIds) {
                if (x && !ids.includes(x)) ids.push(x);
            }
        }
        if (item.imageId && !ids.includes(item.imageId)) ids.push(item.imageId);

        return (
            <View style={styles.card}>
                <View style={styles.cardTop}>
                    <View style={styles.timeTag}>
                        <Clock color={C.muted} size={11} />
                        <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
                    </View>
                    <View style={styles.typeTag}>
                        <VisitTypeIcon visitType={item.visitType} />
                        <Text style={styles.typeText}>{visitTypeLabel(item.visitType)}</Text>
                    </View>
                </View>
                <View style={styles.siteRow}>
                    <Building2 color={C.accent} size={13} />
                    <Text style={styles.siteName} numberOfLines={1}>
                        {item.siteName || 'Site'}
                    </Text>
                </View>
                <View style={styles.rowInOut}>
                    <View style={styles.inOutCol}>
                        <Text style={styles.inOutLbl}>In</Text>
                        <Text style={styles.inOutVal}>{formatTime(item.createdAt)}</Text>
                        {item.distanceFromSiteM != null ? (
                            <Text style={styles.inOutMeta}>~{Number(item.distanceFromSiteM).toFixed(0)} m</Text>
                        ) : null}
                    </View>
                    <View style={styles.inOutCol}>
                        <Text style={styles.inOutLbl}>Out</Text>
                        <Text style={styles.inOutVal}>
                            {item.checkOutAt ? formatTime(item.checkOutAt) : '—'}
                        </Text>
                        {item.checkOutAt ? (
                            <Text style={styles.inOutMeta}>Done</Text>
                        ) : (
                            <Text style={[styles.inOutMeta, { color: '#fb923c' }]}>Open</Text>
                        )}
                    </View>
                </View>
                {item.remark ? (
                    <Text style={styles.remark} numberOfLines={2}>
                        {item.remark}
                    </Text>
                ) : null}
                {item.latitude != null && item.longitude != null ? (
                    <View style={styles.siteRow}>
                        <MapPin color={C.muted} size={12} />
                        <Text style={styles.meta} numberOfLines={1}>
                            {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}
                        </Text>
                    </View>
                ) : null}
                {urlThumbs.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imgRow}>
                        {urlThumbs.map((url, i) => (
                            <TouchableOpacity key={`u-${i}`} onPress={() => setLightbox(url)} activeOpacity={0.9}>
                                <Image source={{ uri: url }} style={styles.thumb} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                ) : ids.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imgRow}>
                        {ids.map((id) => (
                            <VisitLogImage
                                key={id}
                                imageId={id}
                                style={styles.thumb}
                                onPress={() => openImageById(id)}
                            />
                        ))}
                    </ScrollView>
                ) : null}
                {isSelf && !item.checkOutAt ? (
                    <TouchableOpacity
                        style={styles.coBtn}
                        onPress={() => checkoutVisit(String(item._id))}
                        disabled={checkoutBusyId === String(item._id)}
                        activeOpacity={0.88}
                    >
                        {checkoutBusyId === String(item._id) ? (
                            <Text style={styles.coBtnTxt}>…</Text>
                        ) : (
                            <>
                                <LogOut color="#fff" size={16} />
                                <Text style={styles.coBtnTxt}>Check out</Text>
                            </>
                        )}
                    </TouchableOpacity>
                ) : null}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color={C.white} size={24} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>
                        {officerName || 'Officer'}
                    </Text>
                    <Text style={styles.sub}>Last 7 days</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.list} accessibilityLabel="Loading visits">
                    {[0, 1, 2, 3].map((k) => (
                        <View key={k} style={styles.skCard}>
                            <View style={styles.skRow}>
                                <View style={styles.skPill} />
                                <View style={styles.skPillSm} />
                            </View>
                            <View style={styles.skLineMd} />
                            <View style={styles.skRow2}>
                                <View style={styles.skCol} />
                                <View style={styles.skCol} />
                            </View>
                            <View style={styles.skThumbs}>
                                <View style={styles.skThumb} />
                                <View style={styles.skThumb} />
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <FlatList
                    data={logs}
                    keyExtractor={(item) => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                load();
                            }}
                            tintColor={C.accent}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No visits in the last 7 days.</Text>
                        </View>
                    }
                />
            )}

            {isSelf ? (
                <>
                    <TouchableOpacity
                        style={[styles.fab, { bottom: 24 + insets.bottom }]}
                        activeOpacity={0.9}
                        onPress={() => setMenuOpen(true)}
                    >
                        <Plus color="#fff" size={28} />
                    </TouchableOpacity>
                    <Modal visible={menuOpen} transparent animationType="fade">
                        <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)}>
                            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                                <Text style={styles.sheetTitle}>New visit</Text>
                                <TouchableOpacity style={styles.sheetRow} onPress={() => goVisit('SiteCheckDay')}>
                                    <View style={[styles.sheetIcon, { backgroundColor: 'rgba(245,158,11,0.2)' }]}>
                                        <Sun color="#f59e0b" size={22} />
                                    </View>
                                    <View>
                                        <Text style={styles.sheetLbl}>Day visit</Text>
                                        <Text style={styles.sheetSub}>Day shift site check</Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.sheetRow} onPress={() => goVisit('Trainer')}>
                                    <View style={[styles.sheetIcon, { backgroundColor: 'rgba(37,99,235,0.25)' }]}>
                                        <GraduationCap color={C.accent} size={22} />
                                    </View>
                                    <View>
                                        <Text style={styles.sheetLbl}>Trainer</Text>
                                        <Text style={styles.sheetSub}>Training activity</Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.sheetRow} onPress={() => goVisit('SiteCheckNight')}>
                                    <View style={[styles.sheetIcon, { backgroundColor: 'rgba(30,41,59,0.9)' }]}>
                                        <Moon color="#e2e8f0" size={22} />
                                    </View>
                                    <View>
                                        <Text style={styles.sheetLbl}>Night visit</Text>
                                        <Text style={styles.sheetSub}>Night shift audit</Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setMenuOpen(false)}>
                                    <Text style={styles.cancelTxt}>Cancel</Text>
                                </TouchableOpacity>
                            </Pressable>
                        </Pressable>
                    </Modal>
                </>
            ) : null}

            <Modal visible={!!lightbox} transparent animationType="fade">
                <Pressable style={styles.lightboxBg} onPress={() => setLightbox(null)}>
                    {lightbox ? (
                        <Image source={{ uri: lightbox }} style={styles.lightboxImg} resizeMode="contain" />
                    ) : null}
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: C.card,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        gap: 8,
    },
    backBtn: { padding: 8 },
    title: { color: C.white, fontSize: 20, fontWeight: '800' },
    sub: { color: C.muted, fontSize: 12, marginTop: 2 },
    list: { padding: 12, paddingBottom: 120 },
    card: {
        backgroundColor: C.card,
        borderRadius: 12,
        padding: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: C.border,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    timeTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateText: { color: C.muted, fontSize: 11, fontWeight: '600' },
    typeTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(37, 99, 235, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    typeText: { color: C.accent, fontSize: 10, fontWeight: '800' },
    remark: { color: '#e2e8f0', fontSize: 12, fontWeight: '600', marginTop: 6, lineHeight: 17 },
    siteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    siteName: { color: '#94a3b8', fontSize: 13, fontWeight: '700', flex: 1 },
    meta: { color: C.muted, fontSize: 11, flex: 1 },
    rowInOut: {
        flexDirection: 'row',
        marginTop: 8,
        gap: 10,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: C.border,
    },
    inOutCol: { flex: 1 },
    inOutLbl: { color: C.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
    inOutVal: { color: C.white, fontSize: 13, fontWeight: '800', marginTop: 2 },
    inOutMeta: { color: C.muted, fontSize: 10, marginTop: 2 },
    imgRow: { marginTop: 8 },
    thumb: {
        width: 52,
        height: 52,
        borderRadius: 8,
        marginRight: 8,
        backgroundColor: '#1e293b',
    },
    coBtn: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#059669',
        paddingVertical: 10,
        borderRadius: 12,
    },
    coBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    skCard: {
        backgroundColor: C.card,
        borderRadius: 12,
        padding: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: C.border,
    },
    skRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    skPill: { width: 120, height: 12, borderRadius: 6, backgroundColor: 'rgba(148,163,184,0.12)' },
    skPillSm: { width: 72, height: 12, borderRadius: 6, backgroundColor: 'rgba(148,163,184,0.1)' },
    skLineMd: { height: 12, width: '70%', borderRadius: 6, backgroundColor: 'rgba(148,163,184,0.1)', marginBottom: 8 },
    skRow2: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    skCol: { flex: 1, height: 36, borderRadius: 8, backgroundColor: 'rgba(148,163,184,0.08)' },
    skThumbs: { flexDirection: 'row', gap: 8 },
    skThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: 'rgba(148,163,184,0.1)' },
    empty: { padding: 40, alignItems: 'center' },
    emptyText: { color: C.muted, fontSize: 15 },
    fab: {
        position: 'absolute',
        right: 22,
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: C.accent,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: C.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingBottom: 36,
        borderTopWidth: 1,
        borderColor: C.border,
    },
    sheetTitle: { color: C.white, fontSize: 18, fontWeight: '800', marginBottom: 16 },
    sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
    sheetIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sheetLbl: { color: C.white, fontSize: 16, fontWeight: '700' },
    sheetSub: { color: C.muted, fontSize: 12, marginTop: 2 },
    cancelBtn: { marginTop: 12, paddingVertical: 14, alignItems: 'center' },
    cancelTxt: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
    lightboxBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
        justifyContent: 'center',
        padding: 16,
    },
    lightboxImg: { width: '100%', height: '85%' },
});
