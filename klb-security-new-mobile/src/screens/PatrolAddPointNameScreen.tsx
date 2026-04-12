import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

/** Step 1 of add QR: enter patrol point name, then scan code on next screen. */
export default function PatrolAddPointNameScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const site = route.params?.site as { _id: string; name: string } | undefined;
    const [name, setName] = useState('');

    if (!site) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.err}>Missing site</Text>
            </SafeAreaView>
        );
    }

    const continueScan = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            Alert.alert('Name required', 'Enter a patrol point name first.');
            return;
        }
        navigation.navigate('QRScanner', {
            mode: 'setup',
            siteId: site._id,
            siteName: site.name,
            pendingPointName: trimmed,
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>New patrol point</Text>
            </View>
            <View style={styles.body}>
                <Text style={styles.siteLabel}>Site</Text>
                <Text style={styles.siteName}>{site.name}</Text>
                <Text style={styles.label}>Patrol point name</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. Main gate"
                    placeholderTextColor="#475569"
                    value={name}
                    onChangeText={setName}
                />
                <Text style={styles.hint}>Next, you will scan the physical QR code to link it.</Text>
                <TouchableOpacity style={styles.btn} onPress={continueScan}>
                    <Text style={styles.btnText}>Continue to scan QR</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    err: { color: '#f87171', padding: 24 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: { fontSize: 20, fontWeight: '800', color: '#fff' },
    body: { paddingHorizontal: 24, gap: 12 },
    siteLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
    siteName: { fontSize: 17, fontWeight: '700', color: '#93c5fd', marginBottom: 8 },
    label: { fontSize: 12, fontWeight: '700', color: '#94a3b8', marginTop: 8 },
    input: {
        backgroundColor: '#0f172a',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: 16,
        color: '#fff',
        fontSize: 16,
    },
    hint: { fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 20 },
    btn: {
        marginTop: 24,
        backgroundColor: '#2563eb',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
