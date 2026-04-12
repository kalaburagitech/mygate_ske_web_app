import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, Alert, ScrollView, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useCustomAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';
import { showError, showSuccess } from '../../utils/toastUtils';

export default function SignInScreen() {
    const insets = useSafeAreaInsets();
    const { login } = useCustomAuth();
    const navigation = useNavigation<any>();

    const [mobileNumber, setMobileNumber] = useState("");
    const [otp, setOtp] = useState("");
    const [isOtpSent, setIsOtpSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const onSendOtp = async () => {
        if (!mobileNumber || mobileNumber.length !== 10) {
            showError("Invalid number", "Enter your full 10-digit Indian mobile number (after +91).");
            return;
        }
        if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
            showError("Invalid number", "Indian mobile numbers must start with 6, 7, 8, or 9.");
            return;
        }

        setLoading(true);
        try {
            console.log(`[SignIn] Sending OTP to +91 ${mobileNumber}...`);
            const response = await authService.sendOtp(mobileNumber);
            console.log(`[SignIn] Server response:`, response.data);

            if (response.data && response.data.success) {
                setIsOtpSent(true);
                if (response.data.otp) {
                    setOtp(response.data.otp);
                }
                showSuccess(
                    "OTP sent",
                    __DEV__
                        ? "Check the server console for the code, or use the dev hint below if shown."
                        : "Enter the 6-digit code sent to your number."
                );
            } else {
                const msg =
                    response.data?.error ||
                    "Could not send OTP. Please try again.";
                showError("Cannot send OTP", msg);
            }
        } catch (err: any) {
            console.error(err);
            const msg =
                err.response?.data?.error ||
                err.message ||
                "Failed to send OTP. Check your connection and API URL.";
            showError("Request failed", msg);
        } finally {
            setLoading(false);
        }
    };

    const onVerifyOtp = async (codeOverride?: string) => {
        const codeToVerify = codeOverride || otp;
        if (!codeToVerify || codeToVerify.length !== 6) {
            if (!codeOverride) showError("Invalid OTP", "Please enter the 6-digit code.");
            return;
        }

        setLoading(true);
        try {
            console.log(`[SignIn] Verifying OTP for ${mobileNumber} with code: ${codeToVerify}`);
            const response = await authService.verifyOtp(mobileNumber, codeToVerify);
            console.log(`[SignIn] Verification response status:`, response.status);
            console.log(`[SignIn] Verification response data:`, response.data);
            
            if (response.data && response.data.success) {
                await login(response.data.user);
            } else {
                showError("Verification failed", response.data?.error || "Invalid or expired OTP.");
            }
        } catch (err: any) {
            console.error(err);
            showError(
                "Verification failed",
                err.response?.data?.error || err.message || "Could not verify OTP."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 32, justifyContent: 'center' }}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={{ alignItems: 'center', marginBottom: 40 }}>
                            <Image 
                                source={require('../../../assets/images/logo.png')} 
                                style={{ width: 100, height: 100, marginBottom: 20 }}
                                resizeMode="contain"
                            />
                            <Text style={{ color: 'white', fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: 2 }}>KALABURAGI TECH</Text>
                            <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 4, fontWeight: 'bold', letterSpacing: 1 }}>SECURE • RELIABLE • TECH</Text>
                        </View>

                        <View style={{ gap: 20 }}>
                            <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                                <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' }}>Mobile Number (India)</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 16, fontWeight: '700' }}>+91</Text>
                                    </View>
                                    <TextInput
                                        autoCapitalize="none"
                                        keyboardType="phone-pad"
                                        value={mobileNumber}
                                        placeholder="9876543210"
                                        placeholderTextColor="#475569"
                                        maxLength={10}
                                        onChangeText={(text) => {
                                            const formatted = text.replace(/[^0-9]/g, '').slice(0, 10);
                                            setMobileNumber(formatted);
                                        }}
                                        style={{ flex: 1, color: 'white', fontSize: 16, paddingVertical: 12, paddingHorizontal: 0 }}
                                        editable={!isOtpSent && !loading}
                                        selectTextOnFocus={true}
                                    />
                                </View>
                                <Text style={{ color: '#475569', fontSize: 11, marginTop: 8 }}>
                                    +91 is fixed. Enter your 10-digit number (starts with 6–9). Only registered numbers receive an OTP.
                                </Text>
                            </View>

                            {isOtpSent && (
                                <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase' }}>Enter 6-Digit OTP</Text>
                                        {__DEV__ && otp ? (
                                            <Text style={{ color: '#2563eb', fontSize: 10, fontWeight: 'bold' }}>DEV: {otp}</Text>
                                        ) : null}
                                    </View>
                                    <TextInput
                                        value={otp}
                                        placeholder="000000"
                                        placeholderTextColor="#475569"
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        onChangeText={(text) => {
                                            setOtp(text);
                                            if (text.length === 6) {
                                                // Auto-verify when 6 digits are reached
                                                setTimeout(() => onVerifyOtp(text), 100);
                                            }
                                        }}
                                        style={{ color: 'white', fontSize: 24, fontWeight: 'bold', height: 48, paddingHorizontal: 0, letterSpacing: 8 }}
                                        editable={!loading}
                                    />
                                </View>
                            )}

                            <TouchableOpacity
                                onPress={isOtpSent ? () => onVerifyOtp() : onSendOtp}
                                disabled={loading}
                                style={{ backgroundColor: '#2563eb', padding: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}
                            >
                                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18, marginRight: 8 }}>
                                    {loading ? "Processing..." : (isOtpSent ? "Verify OTP" : "Get OTP")}
                                </Text>
                                <ChevronRight color="white" size={20} />
                            </TouchableOpacity>

                            {isOtpSent && (
                                <TouchableOpacity
                                    onPress={() => {
                                        setIsOtpSent(false);
                                        setOtp("");
                                    }}
                                    disabled={loading}
                                    style={{ marginTop: 12, alignSelf: 'center' }}
                                >
                                    <Text style={{ color: 'rgba(37, 99, 235, 0.7)', fontSize: 13, fontWeight: '600' }}>
                                        Change Mobile Number
                                    </Text>
                                </TouchableOpacity>
                            )}


                        </View>

                        <Text style={{ color: '#475569', fontSize: 10, textAlign: 'center', marginTop: 48, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>
                            Authorized Access Only
                        </Text>
                    </ScrollView>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
            <View style={{ height: insets.bottom }} />
        </SafeAreaView>
    );
}
