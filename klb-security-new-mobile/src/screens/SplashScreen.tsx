import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

interface SplashScreenProps {
    onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const logoScale = useRef(new Animated.Value(0.8)).current;
    const [displayText, setDisplayText] = useState('');
    const fullText = "KALABURAGI TECH";
    
    useEffect(() => {
        // 1. Animate Logo
        Animated.parallel([
            Animated.timing(logoOpacity, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
            }),
            Animated.spring(logoScale, {
                toValue: 1,
                friction: 4,
                useNativeDriver: true,
            })
        ]).start();

        // 2. Animate Text Letter by Letter
        let currentText = '';
        let index = 0;
        
        const timer = setInterval(() => {
            if (index < fullText.length) {
                currentText += fullText[index];
                setDisplayText(currentText);
                index++;
            } else {
                clearInterval(timer);
                // 3. Finish and Navigate
                setTimeout(() => {
                    onFinish();
                }, 1500);
            }
        }, 100);

        return () => clearInterval(timer);
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <View style={styles.content}>
                <Animated.View style={[
                    styles.logoContainer, 
                    { opacity: logoOpacity, transform: [{ scale: logoScale }] }
                ]}>
                    <Image 
                        source={require('../../assets/images/logo.png')} 
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </Animated.View>
                
                <View style={styles.textContainer}>
                    <Text style={styles.brandText}>{displayText}</Text>
                    <View style={styles.underline} />
                </View>
                
                <View style={styles.footer}>
                    <Text style={styles.footerText}>SECURE • RELIABLE • TECH</Text>
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
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoContainer: {
        width: 150,
        height: 150,
        marginBottom: 30,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    logo: {
        width: '100%',
        height: '100%',
    },
    textContainer: {
        alignItems: 'center',
    },
    brandText: {
        color: 'white',
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: 4,
    },
    underline: {
        width: 60,
        height: 4,
        backgroundColor: '#3b82f6',
        borderRadius: 2,
        marginTop: 8,
    },
    footer: {
        position: 'absolute',
        bottom: 40,
    },
    footerText: {
        color: '#64748b',
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 2,
    },
});
