import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, ScrollView, Alert, StyleSheet, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, ChevronRight, CheckCircle2 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { authService } from '../../services/api';

export default function SignUpScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [emailAddress, setEmailAddress] = useState("");
    const [mobileNumber, setMobileNumber] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const onSignUpPress = async () => {
        if (!firstName || !emailAddress || !mobileNumber) {
            Alert.alert("Error", "Please fill in required fields (First Name, Email, Mobile)");
            return;
        }
        setLoading(true);

        try {
            // In the new API-driven flow, registration is usually handled by Admin 
            // or a dedicated signup endpoint. For now, we'll simulate a request.
            Alert.alert(
                "Request Submitted",
                "Your registration request has been sent to the supervisor. You will be cleared for duty once approved.",
                [{ text: "Back to Login", onPress: () => navigation.navigate("SignIn") }]
            );
        } catch (err: any) {
            Alert.alert("Registration Failed", err.message || "An error occurred");
        } finally {
            setLoading(false);
        }
    };


    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 32, paddingVertical: 48, justifyContent: 'center' }}>
                <View style={{ alignItems: 'center', marginBottom: 32 }}>
                    <Image 
                        source={require('../../../assets/images/logo.png')} 
                        style={{ width: 80, height: 80, marginBottom: 16 }}
                        resizeMode="contain"
                    />
                    <Text style={{ color: 'white', fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: 2 }}>KALABURAGI TECH</Text>
                    <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 4, fontWeight: 'bold', letterSpacing: 1 }}>NEW OFFICER REGISTRATION</Text>
                </View>

                <View style={{ gap: 16 }}>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                        <View style={{ flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                            <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1.5, textTransform: 'uppercase' }}>First Name</Text>
                            <TextInput
                                value={firstName}
                                placeholder="John"
                                placeholderTextColor="#475569"
                                onChangeText={setFirstName}
                                style={{ color: 'white', fontSize: 14, height: 32 }}
                            />
                        </View>
                        <View style={{ flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                            <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1.5, textTransform: 'uppercase' }}>Last Name</Text>
                            <TextInput
                                value={lastName}
                                placeholder="Doe"
                                placeholderTextColor="#475569"
                                onChangeText={setLastName}
                                style={{ color: 'white', fontSize: 14, height: 32 }}
                            />
                        </View>
                    </View>

                    <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1.5, textTransform: 'uppercase' }}>Email Address</Text>
                        <TextInput
                            autoCapitalize="none"
                            value={emailAddress}
                            placeholder="operator@security.os"
                            placeholderTextColor="#475569"
                            onChangeText={setEmailAddress}
                            style={{ color: 'white', fontSize: 14, height: 32 }}
                        />
                    </View>

                    <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1.5, textTransform: 'uppercase' }}>Mobile Number</Text>
                        <TextInput
                            value={mobileNumber}
                            placeholder="+1234567890"
                            placeholderTextColor="#475569"
                            onChangeText={setMobileNumber}
                            style={{ color: 'white', fontSize: 14, height: 32 }}
                            keyboardType="phone-pad"
                        />
                    </View>

                    <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1.5, textTransform: 'uppercase' }}>Password</Text>
                        <TextInput
                            value={password}
                            placeholder="••••••••"
                            placeholderTextColor="#475569"
                            secureTextEntry={true}
                            onChangeText={setPassword}
                            style={{ color: 'white', fontSize: 14, height: 32 }}
                        />
                    </View>

                    <TouchableOpacity
                        onPress={onSignUpPress}
                        disabled={loading}
                        style={{ backgroundColor: '#2563eb', padding: 20, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}
                    >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18, marginRight: 8 }}>{loading ? "Processing..." : "Create Account"}</Text>
                        <ChevronRight color="white" size={20} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => navigation.navigate("SignIn")}
                        style={{ marginTop: 24, alignSelf: 'center' }}
                    >
                        <Text style={{ color: '#64748b', fontSize: 14 }}>
                            Already have an account? <Text style={{ color: '#2563eb', fontWeight: 'bold' }}>Sign In</Text>
                        </Text>
                    </TouchableOpacity>
                </View>

                <Text style={{ color: '#64748b', fontSize: 10, textAlign: 'center', marginTop: 48, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>
                    Secure Registration Portal
                </Text>
            </ScrollView>
            <View style={{ height: insets.bottom }} />
        </SafeAreaView>
    );
}
