import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// import { useMutation } from 'convex/react';
// import { api } from '../services/convex';
import { Camera, AlertTriangle, ArrowLeft, Send } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { usePatrolStore } from '../store/usePatrolStore';
import { useCustomAuth } from '../context/AuthContext';
import { uploadImage } from '../services/upload';
import { logService } from '../services/api';

export default function IncidentReport() {
    const navigation = useNavigation<any>();
    const { organizationId } = useCustomAuth();
    const activeSession = usePatrolStore((state) => state.activeSession);

    const [comment, setComment] = useState('');
    const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High'>('Medium');
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    
    // In a full migration, create incident endpoints in api.ts
    // Removed mocked report incident and generateUploadUrl

    const pickImage = async () => {
        let result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.4,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };

    const handleSubmit = async () => {
        if (!comment) {
            Alert.alert("Error", "Please provide incident details");
            return;
        }

        setLoading(true);
        try {
            let storageId = undefined;
            if (image) {
                storageId = await uploadImage(image);
            }

            await logService.createPatrolLog({
                userId: userId as any,
                siteId: activeSession?.siteId as any,
                comment: comment, 
                severity: severity,
                organizationId: organizationId as any,
                imageUrl: storageId,
                type: 'incident',
                notes: comment,
            });
            Alert.alert("Reported", "Incident report submitted successfully.");
            navigation.goBack();
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to submit report");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <ArrowLeft color="white" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Report Incident</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Severity Selection */}
                <Text style={styles.label}>Severity Level</Text>
                <View style={styles.severityContainer}>
                    {(['Low', 'Medium', 'High'] as const).map((s) => (
                        <TouchableOpacity
                            key={s}
                            style={[
                                styles.severityBtn,
                                severity === s && styles.activeSeverity,
                                severity === s && s === 'High' && styles.highActive
                            ]}
                            onPress={() => setSeverity(s)}
                        >
                            <Text style={[
                                styles.severityText,
                                severity === s && styles.activeSeverityText
                            ]}>{s}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Evidence Photo */}
                <Text style={styles.label}>Incident Photo</Text>
                <TouchableOpacity style={styles.imageBox} onPress={pickImage}>
                    {image ? (
                        <Image source={{ uri: image }} style={styles.fullImage} />
                    ) : (
                        <>
                            <Camera color="#64748b" size={40} />
                            <Text style={styles.imagePlaceholder}>Tap to take a photo of the incident</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Details */}
                <Text style={styles.label}>Incident Details</Text>
                <View style={styles.inputBox}>
                    <TextInput
                        style={styles.input}
                        placeholder="Describe what happened..."
                        placeholderTextColor="#475569"
                        multiline
                        numberOfLines={6}
                        value={comment}
                        onChangeText={setComment}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.submitBtn, loading && styles.disabled]}
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <AlertTriangle color="white" size={20} />
                            <Text style={styles.submitText}>SUBMIT URGENT REPORT</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    scrollContent: {
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
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
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
    },
    label: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#94a3b8',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    severityContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
    },
    severityBtn: {
        flex: 1,
        height: 50,
        borderRadius: 12,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#1e293b',
    },
    activeSeverity: {
        backgroundColor: '#2563eb',
        borderColor: '#3b82f6',
    },
    highActive: {
        backgroundColor: '#ef4444',
        borderColor: '#f87171',
    },
    severityText: {
        color: '#64748b',
        fontWeight: 'bold',
    },
    activeSeverityText: {
        color: 'white',
    },
    imageBox: {
        height: 200,
        backgroundColor: '#0f172a',
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#1e293b',
        marginBottom: 32,
        overflow: 'hidden',
    },
    fullImage: {
        width: '100%',
        height: '100%',
    },
    imagePlaceholder: {
        color: '#64748b',
        marginTop: 12,
    },
    inputBox: {
        backgroundColor: '#0f172a',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#1e293b',
        minHeight: 150,
        marginBottom: 32,
    },
    input: {
        color: 'white',
        fontSize: 16,
        textAlignVertical: 'top',
    },
    submitBtn: {
        backgroundColor: '#ef4444',
        height: 64,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    submitText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 1,
    },
    disabled: {
        opacity: 0.6,
    },
});
